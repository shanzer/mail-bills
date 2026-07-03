import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { authorizeAdmin, createApi, isSameOrigin, UPLOAD_BODY_LIMIT, UPLOAD_FILE_LIMIT } from "../src/api.js";
import { configPaths } from "../src/config.js";
import { scanImports } from "../src/importer.js";
import { Ledger } from "../src/ledger.js";
import { PipelineScheduler } from "../src/scheduler.js";
import { makeConfig, multipartBody, sidecarBytes, tempRoot } from "./helpers.js";

describe("upload limits", () => {
  it("allows a whole-request body at least as large as the sum of file caps", async () => {
    const { UPLOAD_BODY_LIMIT, UPLOAD_FILE_LIMIT } = await import("../src/api.js");
    expect(UPLOAD_BODY_LIMIT).toBeGreaterThanOrEqual(2 * UPLOAD_FILE_LIMIT);
  });
});

describe("admin authorization", () => {
  it("allows loopback callers when no admin token is configured", () => {
    expect(authorizeAdmin({ ip: "127.0.0.1", adminToken: undefined }).ok).toBe(true);
    expect(authorizeAdmin({ ip: "::1", adminToken: undefined }).ok).toBe(true);
  });

  it("rejects non-loopback callers when no admin token is configured", () => {
    const decision = authorizeAdmin({ ip: "192.168.1.5", adminToken: undefined });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.statusCode).toBe(401);
  });

  it("requires a constant-time matching bearer token when configured", () => {
    const token = "admin-secret";
    expect(authorizeAdmin({ header: `Bearer ${token}`, ip: "10.0.0.1", adminToken: token }).ok).toBe(true);
    expect(authorizeAdmin({ header: "Bearer wrong", ip: "10.0.0.1", adminToken: token }).ok).toBe(false);
    expect(authorizeAdmin({ header: undefined, ip: "10.0.0.1", adminToken: token }).ok).toBe(false);
    expect(authorizeAdmin({ header: "Beareradmin-secret", ip: "10.0.0.1", adminToken: token }).ok).toBe(false);
  });

  it("guards management endpoints when an admin token is configured", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-auth-"));
    config.api = { adminToken: "admin-secret" };
    const app = createApi(config);

    const noToken = await app.inject({ method: "GET", url: "/api/status" });
    expect(noToken.statusCode).toBe(401);

    const wrongToken = await app.inject({ method: "GET", url: "/api/status", headers: { authorization: "Bearer wrong" } });
    expect(wrongToken.statusCode).toBe(401);

    const ok = await app.inject({ method: "GET", url: "/api/status", headers: { authorization: "Bearer admin-secret" } });
    expect(ok.statusCode).toBe(200);
    await app.close();
  });

  it("rate limits repeated failed admin auth", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-admin-rate-"));
    config.api = { adminToken: "admin-secret" };
    const app = createApi(config);
    for (let i = 0; i < 5; i += 1) {
      expect((await app.inject({ method: "GET", url: "/api/status", headers: { authorization: "Bearer wrong" } })).statusCode).toBe(401);
    }
    expect((await app.inject({ method: "GET", url: "/api/status", headers: { authorization: "Bearer wrong" } })).statusCode).toBe(429);
    // Blocked even with the correct token.
    expect((await app.inject({ method: "GET", url: "/api/status", headers: { authorization: "Bearer admin-secret" } })).statusCode).toBe(429);
    await app.close();
  });

  it("still serves health and the intake endpoint without the admin token", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-auth-"));
    config.api = { adminToken: "admin-secret" };
    const app = createApi(config);

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    const multipart = multipartBody({
      pdf: ["doc-1.pdf", Buffer.from("%PDF upload\n"), "application/pdf"],
      sidecar: ["doc-1.json", sidecarBytes(), "application/json"]
    });
    const intake = await app.inject({
      method: "POST",
      url: "/api/mail-bills/intake",
      headers: { authorization: "Bearer secret-token", "content-type": multipart.contentType },
      payload: multipart.body
    });
    expect(intake.statusCode).toBe(201);
    await app.close();
  });
});

describe("CSRF origin checks", () => {
  it("isSameOrigin correctly compares origins and hosts", () => {
    expect(isSameOrigin("http://localhost:80", "localhost")).toBe(true);
    expect(isSameOrigin("http://evil.example", "localhost")).toBe(false);
    expect(isSameOrigin(undefined, "localhost")).toBe(true);
    expect(isSameOrigin("http://evil.example", undefined)).toBe(false);
    expect(isSameOrigin("null", "localhost")).toBe(false); // sandboxed-iframe Origin: null
    expect(isSameOrigin("not-a-url", "localhost")).toBe(false);
  });

  it("rejects cross-origin state-changing requests in loopback-no-token mode", async () => {
    const app = createApi(makeConfig(tempRoot("mail-bills-api-csrf-")));
    const response = await app.inject({
      method: "POST",
      url: "/api/bootstrap",
      headers: { origin: "http://evil.example", host: "localhost" }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("allows same-origin posts and origin-less CLI posts", async () => {
    const app = createApi(makeConfig(tempRoot("mail-bills-api-csrf-")));
    const sameOrigin = await app.inject({ method: "POST", url: "/api/bootstrap", headers: { origin: "http://localhost:80", host: "localhost" } });
    expect(sameOrigin.statusCode).toBe(200);
    const noOrigin = await app.inject({ method: "POST", url: "/api/bootstrap" });
    expect(noOrigin.statusCode).toBe(200);
    await app.close();
  });

  it("does not block cross-origin GETs", async () => {
    const app = createApi(makeConfig(tempRoot("mail-bills-api-csrf-")));
    const response = await app.inject({ method: "GET", url: "/api/status", headers: { origin: "http://evil.example", host: "localhost" } });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

describe("REST API", () => {
  it("does not leak filesystem paths in upload responses", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-paths-"));
    const app = createApi(config);
    const multipart = multipartBody({
      pdf: ["doc-1.pdf", Buffer.from("%PDF upload\n"), "application/pdf"],
      sidecar: ["doc-1.json", sidecarBytes(), "application/json"]
    });
    const intake = await app.inject({
      method: "POST",
      url: "/api/mail-bills/intake",
      headers: { authorization: "Bearer secret-token", "content-type": multipart.contentType },
      payload: multipart.body
    });
    expect(intake.statusCode).toBe(201);
    expect(intake.json()).not.toHaveProperty("pdfPath");
    expect(intake.json()).not.toHaveProperty("sidecarPath");
    await app.close();
  });

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
    const pdfPath = path.join(config.intakeUpload.intakeDir, `${body.documentId}.pdf`);
    const sidecarPath = path.join(config.intakeUpload.intakeDir, `${body.documentId}.json`);
    expect(fs.existsSync(pdfPath)).toBe(true);
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
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

    const summary = await scanImports({ config, dryRun: false, stableDelayMs: 0 });
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

  it("returns 409 from pipeline routes while a run is in progress", async () => {
    const app = createApi(makeConfig(tempRoot("mail-bills-api-mutex-")));
    const scheduler = (app as unknown as { pipelineScheduler: PipelineScheduler }).pipelineScheduler;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const held = scheduler.runExclusive(async () => { await gate; return "held"; });

    const pending = await app.inject({ method: "POST", url: "/api/pipeline/process-pending", payload: { dryRun: true } });
    expect(pending.statusCode).toBe(409);
    expect(pending.json().schedule).toBeDefined();

    const batch = await app.inject({ method: "POST", url: "/api/pipeline/batches/b1/process", payload: { dryRun: true } });
    expect(batch.statusCode).toBe(409);
    expect(batch.json().schedule).toBeDefined();

    release();
    expect(await held).toBe("held");
    await app.close();
  });

  it("clamps non-numeric and out-of-range limit/offset instead of 500ing", async () => {
    const config = makeConfig(tempRoot("mail-bills-api-clamp-"));
    const app = createApi(config);
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    for (const id of ["d1", "d2", "d3"]) ledger.upsertDocument({ document_id: id, status: "Inbox" });
    ledger.close();

    const nan = await app.inject({ method: "GET", url: "/api/documents?limit=abc&offset=xyz" });
    expect(nan.statusCode).toBe(200);
    expect(nan.json().documents).toHaveLength(3);

    const clamped = await app.inject({ method: "GET", url: "/api/documents?limit=-5" });
    expect(clamped.statusCode).toBe(200);
    expect(clamped.json().documents).toHaveLength(1); // clamped to min 1

    const paged = await app.inject({ method: "GET", url: "/api/documents?limit=2&offset=2" });
    expect(paged.json().documents).toHaveLength(1);
    await app.close();
  });
});

it("rate limits repeated failed intake auth", async () => {
  const app = createApi(makeConfig(tempRoot("mail-bills-api-rate-")));
  const multipart = multipartBody({
    pdf: ["doc-1.pdf", Buffer.from("%PDF upload\n"), "application/pdf"],
    sidecar: ["doc-1.json", sidecarBytes(), "application/json"]
  });
  const attempt = (auth: string) => app.inject({
    method: "POST", url: "/api/mail-bills/intake",
    headers: { authorization: auth, "content-type": multipart.contentType },
    payload: multipart.body
  });
  for (let i = 0; i < 5; i += 1) expect((await attempt("Bearer wrong")).statusCode).toBe(401);
  expect((await attempt("Bearer wrong")).statusCode).toBe(429);
  expect((await attempt("Bearer secret-token")).statusCode).toBe(429); // blocked even with the right token
  await app.close();
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
