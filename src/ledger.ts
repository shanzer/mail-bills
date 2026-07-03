import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { BatchRecord, DocumentRecord } from "./types.js";

const BATCH_COLUMNS = new Set([
  "batch_id",
  "created_at",
  "source",
  "status",
  "item_count"
]);

const DOCUMENT_COLUMNS = new Set([
  "document_id",
  "batch_id",
  "source_pdf_path",
  "local_pdf_path",
  "sidecar_path",
  "sha256",
  "created_at",
  "imported_at",
  "status",
  "category",
  "shortcut_label",
  "detected_category",
  "vendor",
  "amount",
  "due_date",
  "ocr_text",
  "ocr_summary",
  "ocr_summary_json",
  "notes",
  "confidence",
  "review_reason",
  "urgency_reasons_json",
  "retention_decision",
  "quarantined_until",
  "duplicate_of_document_id",
  "deleted_at",
  "error_message"
]);

export class Ledger {
  private db?: Database.Database;

  constructor(readonly filePath: string) {}

  /** Lazily opened, long-lived connection. Call close() when done with the instance. */
  private connection(): Database.Database {
    if (!this.db) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.db = new Database(this.filePath);
    }
    return this.db;
  }

  close(): void {
    this.db?.close();
    this.db = undefined;
  }

  /** Run fn atomically. better-sqlite3 nests via savepoints, so nested calls are safe. */
  transaction<T>(fn: () => T): T {
    return this.connection().transaction(fn)();
  }

  initialize(): void {
    const db = this.connection();
    db.exec(`
      CREATE TABLE IF NOT EXISTS batches (
        batch_id TEXT PRIMARY KEY,
        created_at TEXT,
        source TEXT DEFAULT 'iphone_shortcut',
        status TEXT,
        item_count INTEGER
      );

      CREATE TABLE IF NOT EXISTS documents (
        document_id TEXT PRIMARY KEY,
        batch_id TEXT,
        source_pdf_path TEXT,
        local_pdf_path TEXT,
        sidecar_path TEXT,
        sha256 TEXT,
        created_at TEXT,
        imported_at TEXT,
        status TEXT,
        category TEXT,
        shortcut_label TEXT,
        detected_category TEXT,
        vendor TEXT,
        amount TEXT,
        due_date TEXT,
        ocr_text TEXT,
        ocr_summary TEXT,
        ocr_summary_json TEXT,
        confidence TEXT,
        review_reason TEXT,
        urgency_reasons_json TEXT,
        retention_decision TEXT,
        quarantined_until TEXT,
        duplicate_of_document_id TEXT,
        deleted_at TEXT,
        error_message TEXT,
        notes TEXT,
        FOREIGN KEY(batch_id) REFERENCES batches(batch_id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT,
        batch_id TEXT,
        event_type TEXT NOT NULL,
        event_at TEXT NOT NULL,
        payload_json TEXT
      );
    `);
    // Migrate existing databases that predate added columns.
    for (const col of ["ocr_summary_json TEXT", "notes TEXT"]) {
      try { db.exec(`ALTER TABLE documents ADD COLUMN ${col}`); } catch { /* already exists */ }
    }
  }

  upsertBatch(values: BatchRecord): void {
    this.upsert("batches", "batch_id", BATCH_COLUMNS, values as unknown as Record<string, unknown>);
  }

  upsertDocument(values: DocumentRecord): void {
    this.upsert("documents", "document_id", DOCUMENT_COLUMNS, values as unknown as Record<string, unknown>);
  }

  getBatch(batchId: string): BatchRecord | undefined {
    return this.fetchOne<BatchRecord>("SELECT * FROM batches WHERE batch_id = ?", batchId);
  }

  getDocument(documentId: string): DocumentRecord | undefined {
    return this.fetchOne<DocumentRecord>("SELECT * FROM documents WHERE document_id = ?", documentId);
  }

  documentsForBatch(batchId: string): DocumentRecord[] {
    return this.fetchAll<DocumentRecord>("SELECT * FROM documents WHERE batch_id = ? ORDER BY document_id", batchId);
  }

  documentsByStatus(status: string): DocumentRecord[] {
    return this.fetchAll<DocumentRecord>("SELECT * FROM documents WHERE status = ? ORDER BY document_id", status);
  }

  documentsNeedingSummary(): DocumentRecord[] {
    return this.fetchAll<DocumentRecord>(
      "SELECT * FROM documents WHERE ocr_text IS NOT NULL AND ocr_text != '' AND (ocr_summary_json IS NULL OR ocr_summary_json = '') ORDER BY document_id"
    );
  }

  listDocuments(options: { status?: string; q?: string; limit?: number; offset?: number } = {}): DocumentRecord[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (options.status) {
      clauses.push("status = ?");
      params.push(options.status);
    }
    if (options.q) {
      clauses.push("(document_id LIKE ? OR batch_id LIKE ? OR vendor LIKE ?)");
      const query = `%${options.q}%`;
      params.push(query, query, query);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(options.limit ?? 200, options.offset ?? 0);
    return this.fetchAll<DocumentRecord>(
      `SELECT * FROM documents ${where} ORDER BY due_date IS NULL, due_date, document_id LIMIT ? OFFSET ?`,
      ...params
    );
  }

  appendEvent(input: {
    documentId?: string | null;
    batchId?: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
  }): number {
    const info = this.connection().prepare(`
      INSERT INTO events (document_id, batch_id, event_type, event_at, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      input.documentId ?? null,
      input.batchId ?? null,
      input.eventType,
      new Date().toISOString(),
      JSON.stringify(input.payload ?? {})
    );
    return Number(info.lastInsertRowid);
  }

  private upsert(table: string, key: string, allowedColumns: Set<string>, values: Record<string, unknown>): void {
    if (!(key in values) || values[key] === undefined || values[key] === null || values[key] === "") {
      throw new Error(`${key} is required`);
    }
    const cleanEntries = Object.entries(values).filter(([column, value]) => allowedColumns.has(column) && value !== undefined);
    if (!cleanEntries.length) throw new Error("no valid columns supplied");
    const columns = cleanEntries.map(([column]) => column);
    const placeholders = columns.map(() => "?").join(", ");
    const updateColumns = columns.filter((column) => column !== key);
    const updateClause = (updateColumns.length ? updateColumns : [key])
      .map((column) => `${column} = excluded.${column}`)
      .join(", ");
    this.connection().prepare(`
      INSERT INTO ${table} (${columns.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT(${key}) DO UPDATE SET ${updateClause}
    `).run(cleanEntries.map(([, value]) => normalizeSqlValue(value)));
  }

  private fetchOne<T>(sql: string, ...params: unknown[]): T | undefined {
    return this.connection().prepare(sql).get(params) as T | undefined;
  }

  private fetchAll<T>(sql: string, ...params: unknown[]): T[] {
    return this.connection().prepare(sql).all(params) as T[];
  }
}

function normalizeSqlValue(value: unknown): unknown {
  if (typeof value === "boolean") return value ? "true" : "false";
  return value;
}
