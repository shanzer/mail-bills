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
  "confidence",
  "review_reason",
  "urgency_reasons_json",
  "notion_page_id",
  "retention_decision",
  "quarantined_until",
  "duplicate_of_document_id",
  "deleted_at",
  "error_message"
]);

export class Ledger {
  constructor(readonly filePath: string) {}

  initialize(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const db = this.connect();
    try {
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
          confidence TEXT,
          review_reason TEXT,
          urgency_reasons_json TEXT,
          notion_page_id TEXT,
          retention_decision TEXT,
          quarantined_until TEXT,
          duplicate_of_document_id TEXT,
          deleted_at TEXT,
          error_message TEXT,
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
    } finally {
      db.close();
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
    const db = this.connect();
    try {
      const info = db.prepare(`
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
    } finally {
      db.close();
    }
  }

  private connect(): Database.Database {
    return new Database(this.filePath);
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
    const db = this.connect();
    try {
      db.prepare(`
        INSERT INTO ${table} (${columns.join(", ")})
        VALUES (${placeholders})
        ON CONFLICT(${key}) DO UPDATE SET ${updateClause}
      `).run(cleanEntries.map(([, value]) => normalizeSqlValue(value)));
    } finally {
      db.close();
    }
  }

  private fetchOne<T>(sql: string, ...params: unknown[]): T | undefined {
    const db = this.connect();
    try {
      return db.prepare(sql).get(params) as T | undefined;
    } finally {
      db.close();
    }
  }

  private fetchAll<T>(sql: string, ...params: unknown[]): T[] {
    const db = this.connect();
    try {
      return db.prepare(sql).all(params) as T[];
    } finally {
      db.close();
    }
  }
}

function normalizeSqlValue(value: unknown): unknown {
  if (typeof value === "boolean") return value ? "true" : "false";
  return value;
}
