import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/api.js";
import { configPaths } from "../src/config.js";
import { scanImports } from "../src/importer.js";
import { Ledger } from "../src/ledger.js";
import { makeConfig, multipartBody, sidecarBytes, tempRoot } from "./helpers.js";

describe("REST API", () => {
  it("exposes health", async () => {
    const app = createApi(makeConfig(tempRoot("mail-bills-api-")));
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, service: "mail-bills" });
    await app.close();
  });

  it("uses the configured API log level", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-"));
    config.logging.level = "debug";
    const app = createApi(config);

    expect(app.log.level).toBe("debug");

    await app.close();
  });

  it("serves the functional UI assets", async () => {
    const app = createApi(makeConfig(tempRoot("mail-bills-api-")));
    const html = await app.inject({ method: "GET", url: "/" });
    const js = await app.inject({ method: "GET", url: "/ui/app.js" });

    expect(html.statusCode).toBe(200);
    expect(html.headers["content-type"]).toContain("text/html");
    expect(html.body).toContain("Mail Bills");
    expect(html.body).toContain("/ui/app.js");
    expect(html.body).toContain("Send to Paperless");
    expect(html.body).toContain("Import PDF");
    expect(html.body).toContain("importPdfForm");
    expect(html.body).toContain("importPdfFile");
    expect(js.statusCode).toBe(200);
    expect(js.body).toContain("/api/documents?limit=500");
    expect(js.body).toContain("/api/pipeline/process-pending");
    expect(js.body).toContain("send-to-paperless");
    expect(js.body).toContain("/api/documents/import-pdf");
    expect(js.body).toContain("FormData");
    await app.close();
  });

  it("requires bearer token and accepts multipart intake upload", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-"));
    const app = createApi(config);
    const multipart = multipartBody({
      pdf: ["doc-1.pdf", Buffer.from("%PDF upload\n"), "application/pdf"],
      sidecar: ["doc-1.json", sidecarBytes(), "application/json"]
    });

    const unauthorized = await app.inject({
      method: "POST",
      url: "/api/mail-bills/intake",
      headers: { authorization: "Bearer wrong", "content-type": multipart.contentType },
      payload: multipart.body
    });
    const accepted = await app.inject({
      method: "POST",
      url: "/api/mail-bills/intake",
      headers: { authorization: "Bearer secret-token", "content-type": multipart.contentType },
      payload: multipart.body
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toMatchObject({ ok: true, documentId: "doc-1", created: true });
    expect(fs.existsSync(path.join(config.intakeUpload.intakeDir, "doc-1.pdf"))).toBe(true);
    await app.close();
  });

  it("queues a browser PDF import as an upload-intake PDF and sidecar", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-"));
    const app = createApi(config);
    const multipart = multipartBrowserImport({
      pdf: ["statement.pdf", Buffer.from("%PDF browser\n"), "application/pdf"],
      fields: { category: "BILL", label: "Bill", note: "Imported from desktop" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/documents/import-pdf",
      headers: { "content-type": multipart.contentType },
      payload: multipart.body
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({ ok: true, created: true, source: "browser_ui" });
    expect(body.documentId).toMatch(/^ui-/);
    expect(body.batchId).toMatch(/^browser-/);
    expect(fs.existsSync(body.pdfPath)).toBe(true);
    expect(fs.existsSync(body.sidecarPath)).toBe(true);
    const sidecar = JSON.parse(fs.readFileSync(body.sidecarPath, "utf8"));
    expect(sidecar).toMatchObject({
      documentId: body.documentId,
      batchId: body.batchId,
      category: "BILL",
      label: "Bill",
      note: "Imported from desktop",
      source: "browser_ui"
    });
    expect(sidecar.capturedAt).toEqual(expect.any(String));
    await app.close();
  });

  it("rejects browser PDF import without a PDF", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-"));
    const app = createApi(config);
    const multipart = multipartBrowserImport({ fields: { category: "BILL" } });

    const response = await app.inject({
      method: "POST",
      url: "/api/documents/import-pdf",
      headers: { "content-type": multipart.contentType },
      payload: multipart.body
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ ok: false, error: "pdf is required" });
    await app.close();
  });

  it("rejects browser PDF import with an unsupported category", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-"));
    const app = createApi(config);
    const multipart = multipartBrowserImport({
      pdf: ["statement.pdf", Buffer.from("%PDF browser\n"), "application/pdf"],
      fields: { category: "BANANA" }
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/documents/import-pdf",
      headers: { "content-type": multipart.contentType },
      payload: multipart.body
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("category");
    await app.close();
  });

  it("imports a browser PDF upload through the normal upload-intake scanner", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-"));
    const app = createApi(config);
    const multipart = multipartBrowserImport({
      pdf: ["statement.pdf", Buffer.from("%PDF browser\n"), "application/pdf"],
      fields: { category: "RECEIPT-RECORD", label: "Receipt Record" }
    });
    const upload = await app.inject({
      method: "POST",
      url: "/api/documents/import-pdf",
      headers: { "content-type": multipart.contentType },
      payload: multipart.body
    });
    const documentId = upload.json().documentId;

    const summary = scanImports({ config, dryRun: false, stableDelayMs: 0 });
    const ledger = new Ledger(configPaths(config).ledgerPath);

    expect(summary).toMatchObject({ imported: 1, failed: 0, skipped: 0, dryRun: false });
    expect(ledger.getDocument(documentId)).toMatchObject({
      document_id: documentId,
      status: "imported",
      category: "RECEIPT-RECORD",
      shortcut_label: "Receipt Record"
    });
    await app.close();
  });

  it("applies archive actions through the API", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-"));
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    ledger.upsertBatch({ batch_id: "batch-1", status: "imported", item_count: 1 });
    ledger.upsertDocument({
      document_id: "doc-action-1",
      batch_id: "batch-1",
      status: "Needs Review",
      review_reason: "Label conflict"
    });
    const app = createApi(config);

    const response = await app.inject({
      method: "POST",
      url: "/api/documents/doc-action-1/actions",
      payload: { action: "archive", dryRun: false }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, action: "archive", dryRun: false });
    expect(ledger.getDocument("doc-action-1")).toMatchObject({
      status: "Archived",
      review_reason: null
    });
    await app.close();
  });

  it("updates editable category and label fields through the API", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-"));
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    ledger.upsertBatch({ batch_id: "batch-1", status: "imported", item_count: 1 });
    ledger.upsertDocument({
      document_id: "doc-fields-1",
      batch_id: "batch-1",
      status: "Needs Review",
      category: "UNKNOWN",
      shortcut_label: "Unknown"
    });
    const app = createApi(config);

    const response = await app.inject({
      method: "POST",
      url: "/api/documents/doc-fields-1/actions",
      payload: { action: "update-fields", dryRun: false, category: "TAX-LEGAL-GOVERNMENT", shortcutLabel: "Tax", dueDate: "2026-06-01" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, action: "update-fields", dryRun: false });
    expect(ledger.getDocument("doc-fields-1")).toMatchObject({
      category: "TAX-LEGAL-GOVERNMENT",
      shortcut_label: "Tax",
      due_date: "2026-06-01"
    });
    await app.close();
  });

  it("marks a reviewed document actionable with edited fields", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-"));
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    ledger.upsertBatch({ batch_id: "batch-1", status: "imported", item_count: 1 });
    ledger.upsertDocument({
      document_id: "doc-actionable-1",
      batch_id: "batch-1",
      status: "Needs Review",
      category: "UNKNOWN",
      shortcut_label: "Unknown",
      review_reason: "missing due date"
    });
    const app = createApi(config);

    const response = await app.inject({
      method: "POST",
      url: "/api/documents/doc-actionable-1/actions",
      payload: { action: "actionable", dryRun: false, category: "BILL", shortcutLabel: "Bill", dueDate: "2026-06-15" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, action: "actionable", dryRun: false });
    expect(ledger.getDocument("doc-actionable-1")).toMatchObject({
      status: "Actionable",
      category: "BILL",
      shortcut_label: "Bill",
      due_date: "2026-06-15",
      review_reason: null,
      confidence: "high"
    });
    await app.close();
  });

  it("returns iPhone pairing QR data and can rotate the intake token", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-"));
    const app = createApi(config);

    const qr = await app.inject({ method: "GET", url: "/api/pairing/qr?baseUrl=http%3A%2F%2Fyoyodyne%3A8765" });
    const rotated = await app.inject({
      method: "POST",
      url: "/api/pairing/rotate-token",
      payload: { baseUrl: "http://yoyodyne:8765" }
    });

    expect(qr.statusCode).toBe(200);
    expect(qr.json()).toMatchObject({ ok: true, payload: { endpoint: "http://yoyodyne:8765/api/mail-bills/intake" } });
    expect(qr.json().qrSvg).toContain("<svg");
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().payload.token).not.toBe("secret-token");
    expect(config.intakeUpload.token).toBe(rotated.json().payload.token);
    await app.close();
  });

  it("runs live process-pending without notification service configuration", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-"));
    const app = createApi(config);

    const response = await app.inject({
      method: "POST",
      url: "/api/pipeline/process-pending",
      payload: { dryRun: false, stableDelayMs: 0 }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, dryRun: false, batches: [] });
    await app.close();
  });
});

function multipartBrowserImport(input: {
  pdf?: [string, Buffer, string];
  fields?: Record<string, string>;
}): { body: Buffer; contentType: string } {
  const boundary = "mail-bills-browser-import-boundary";
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(input.fields ?? {})) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(value));
    chunks.push(Buffer.from("\r\n"));
  }
  if (input.pdf) {
    const [filename, payload, contentType] = input.pdf;
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="pdf"; filename="${filename}"\r\n`));
    chunks.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
    chunks.push(payload);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
