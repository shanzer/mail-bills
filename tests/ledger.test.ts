import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Ledger, SCHEMA_VERSION } from "../src/ledger.js";
import { tempRoot } from "./helpers.js";

describe("ledger", () => {
  it("creates the Python-compatible schema and upserts rows", () => {
    const dir = tempRoot("mail-bills-ledger-");
    const ledger = new Ledger(path.join(dir, "data", "ledger.sqlite"));

    ledger.initialize();
    ledger.upsertBatch({ batch_id: "batch-1", status: "imported", item_count: 1 });
    ledger.upsertDocument({ document_id: "doc-1", batch_id: "batch-1", status: "imported", vendor: "Dominion Energy" });
    ledger.upsertDocument({ document_id: "doc-1", status: "Actionable", amount: "61.20" });

    expect(ledger.getBatch("batch-1")?.status).toBe("imported");
    expect(ledger.getDocument("doc-1")).toMatchObject({ status: "Actionable", vendor: "Dominion Energy", amount: "61.20" });
    expect(ledger.documentsForBatch("batch-1")).toHaveLength(1);
    expect(ledger.appendEvent({ documentId: "doc-1", batchId: "batch-1", eventType: "processed" })).toBe(1);
    ledger.close();
  });
});

describe("ledger transactions", () => {
  it("rolls back all writes when the transaction callback throws", () => {
    const ledger = new Ledger(path.join(tempRoot("ledger-tx-"), "ledger.sqlite"));
    ledger.initialize();
    expect(() =>
      ledger.transaction(() => {
        ledger.upsertBatch({ batch_id: "b1", status: "imported" });
        ledger.upsertDocument({ document_id: "d1", batch_id: "b1", status: "imported" });
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(ledger.getBatch("b1")).toBeUndefined();
    expect(ledger.getDocument("d1")).toBeUndefined();
    ledger.close();
  });

  it("commits when the transaction callback returns", () => {
    const ledger = new Ledger(path.join(tempRoot("ledger-tx-"), "ledger.sqlite"));
    ledger.initialize();
    ledger.transaction(() => {
      ledger.upsertBatch({ batch_id: "b1", status: "imported" });
    });
    expect(ledger.getBatch("b1")?.status).toBe("imported");
    ledger.close();
  });
});

describe("ledger schema migration", () => {
  it("creates indexes and stamps user_version", () => {
    const filePath = path.join(tempRoot("ledger-schema-"), "ledger.sqlite");
    const ledger = new Ledger(filePath);
    ledger.initialize();
    ledger.close();
    const db = new Database(filePath, { readonly: true });
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_documents_%'").all() as Array<{ name: string }>;
    const version = Number(db.pragma("user_version", { simple: true }));
    db.close();
    expect(indexes.map((row) => row.name).sort()).toEqual(["idx_documents_batch_id", "idx_documents_due_date", "idx_documents_status"]);
    expect(version).toBe(SCHEMA_VERSION);
  });

  it("upgrades a legacy ledger missing later columns", () => {
    const filePath = path.join(tempRoot("ledger-legacy-"), "ledger.sqlite");
    const legacy = new Database(filePath);
    legacy.exec("CREATE TABLE documents (document_id TEXT PRIMARY KEY, batch_id TEXT, status TEXT); CREATE TABLE batches (batch_id TEXT PRIMARY KEY, status TEXT); CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, event_at TEXT NOT NULL)");
    legacy.close();
    const ledger = new Ledger(filePath);
    ledger.initialize();
    ledger.upsertDocument({ document_id: "d1", status: "imported", notes: "migrated", ocr_summary_json: "{}" });
    expect(ledger.getDocument("d1")?.notes).toBe("migrated");
    const eventId = ledger.appendEvent({ documentId: "d1", eventType: "migrated_event" });
    expect(eventId).toBeGreaterThan(0);
    ledger.close();
  });
});

describe("ledger document counting", () => {
  it("counts documents with the same filters as listDocuments", () => {
    const ledger = new Ledger(path.join(tempRoot("ledger-count-"), "ledger.sqlite"));
    ledger.initialize();
    ledger.upsertDocument({ document_id: "a1", status: "Inbox", vendor: "GEICO" });
    ledger.upsertDocument({ document_id: "a2", status: "Inbox", vendor: "Aetna" });
    ledger.upsertDocument({ document_id: "a3", status: "Archived", vendor: "GEICO" });
    expect(ledger.countDocuments()).toBe(3);
    expect(ledger.countDocuments({ status: "Inbox" })).toBe(2);
    expect(ledger.countDocuments({ q: "GEICO" })).toBe(2);
    ledger.close();
  });
});
