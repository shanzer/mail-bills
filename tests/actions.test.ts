import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { applyDocumentAction } from "../src/actions.js";
import { configPaths } from "../src/config.js";
import { Ledger } from "../src/ledger.js";
import { makeConfig, tempRoot } from "./helpers.js";

function seededDocument() {
  const root = tempRoot("mail-bills-actions-");
  const config = makeConfig(root);
  const ledger = new Ledger(configPaths(config).ledgerPath);
  ledger.initialize();
  ledger.upsertBatch({ batch_id: "batch-1", status: "imported", item_count: 1 });
  const pdfPath = path.join(root, "archive", "2026", "05", "doc-paperless-1.pdf");
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  fs.writeFileSync(pdfPath, "%PDF-1.4\n%%EOF\n", "utf8");
  ledger.upsertDocument({
    document_id: "doc-paperless-1",
    batch_id: "batch-1",
    status: "Archived",
    local_pdf_path: pdfPath
  });
  return { config, ledger, pdfPath };
}

function events(config: ReturnType<typeof makeConfig>): Array<{ event_type: string; payload_json: string | null }> {
  const db = new Database(configPaths(config).ledgerPath);
  try {
    return db.prepare("SELECT event_type, payload_json FROM events ORDER BY id").all() as Array<{ event_type: string; payload_json: string | null }>;
  } finally {
    db.close();
  }
}

describe("document actions", () => {
  it("dry-runs send-to-paperless without calling the uploader", async () => {
    const { config, ledger, pdfPath } = seededDocument();
    const uploader = vi.fn();

    const result = await applyDocumentAction({
      documentId: "doc-paperless-1",
      action: "send-to-paperless",
      ledger,
      config,
      dryRun: true,
      paperlessUploader: uploader
    });

    expect(result).toMatchObject({
      documentId: "doc-paperless-1",
      action: "send-to-paperless",
      ok: true,
      dryRun: true,
      payload: { uploaded: false, pdf_path: pdfPath }
    });
    expect(uploader).not.toHaveBeenCalled();
  });

  it("fails send-to-paperless when the ledger has no local PDF path", async () => {
    const { config, ledger } = seededDocument();
    ledger.upsertDocument({ document_id: "doc-paperless-1", local_pdf_path: null });

    const result = await applyDocumentAction({
      documentId: "doc-paperless-1",
      action: "send-to-paperless",
      ledger,
      config,
      paperlessUploader: vi.fn()
    });

    expect(result).toMatchObject({
      ok: false,
      action: "send-to-paperless",
      error: "document has no local_pdf_path"
    });
  });

  it("fails send-to-paperless when the local PDF is missing", async () => {
    const { config, ledger, pdfPath } = seededDocument();
    fs.unlinkSync(pdfPath);

    const result = await applyDocumentAction({
      documentId: "doc-paperless-1",
      action: "send-to-paperless",
      ledger,
      config,
      paperlessUploader: vi.fn()
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("PDF file is missing");
  });

  it("uploads to Paperless, records an event, and keeps the local PDF", async () => {
    const { config, ledger, pdfPath } = seededDocument();
    const uploader = vi.fn(async () => ({ task_id: "task-123", document_id: 456, token: "secret" }));

    const result = await applyDocumentAction({
      documentId: "doc-paperless-1",
      action: "send-to-paperless",
      ledger,
      config,
      paperlessUploader: uploader
    });

    expect(result).toMatchObject({
      ok: true,
      action: "send-to-paperless",
      dryRun: false,
      payload: {
        uploaded: true,
        pdf_path: pdfPath,
        paperless_response: { task_id: "task-123", document_id: 456 }
      }
    });
    expect(JSON.stringify(result.payload)).not.toContain("secret");
    expect(uploader).toHaveBeenCalledOnce();
    expect(uploader).toHaveBeenCalledWith(pdfPath);
    expect(fs.existsSync(pdfPath)).toBe(true);
    expect(events(config)).toMatchObject([{ event_type: "paperless_uploaded" }]);
  });
});
