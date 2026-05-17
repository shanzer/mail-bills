import fs from "node:fs";
import path from "node:path";
import type { DocumentRecord, MailBillsConfig } from "./types.js";
import { Ledger } from "./ledger.js";
import { configPaths } from "./config.js";
import { NotionAdapter } from "./notion.js";
import { textValue } from "./paths.js";

const DELETE_CHOICES = new Set(["Ignore/delete", "Delete duplicate"]);

export interface QuarantineResult {
  documentId: string;
  dryRun: boolean;
  quarantined: boolean;
  permanentlyDeleted: boolean;
  plannedUpdate: DocumentRecord;
  movedFiles: Array<[string, string]>;
  events: Array<Record<string, unknown>>;
}

export async function quarantineDocument(input: {
  documentId: string;
  ledger: Ledger;
  config: MailBillsConfig;
  notionAdapter?: NotionAdapter;
  choice: string;
  today?: Date;
  dryRun?: boolean;
}): Promise<QuarantineResult> {
  if (!DELETE_CHOICES.has(input.choice)) throw new Error(`Unsupported quarantine choice: ${input.choice}`);
  const document = input.ledger.getDocument(input.documentId);
  if (!document) throw new Error(`Unknown document_id: ${input.documentId}`);
  const current = input.today ?? new Date();
  const todayIso = current.toISOString().slice(0, 10);
  const quarantinedUntil = maxIsoDate(textValue(document.quarantined_until), addDays(current, 7).toISOString().slice(0, 10));
  const plannedMoves = plannedMovesFor(document, input.config, todayIso);
  const update: DocumentRecord = {
    document_id: input.documentId,
    status: "Deleted",
    retention_decision: "Quarantined",
    quarantined_until: quarantinedUntil,
    deleted_at: todayIso,
    review_reason: input.choice
  };
  for (const [field, , destination] of plannedMoves) {
    (update as any)[field] = destination;
  }
  if (input.dryRun) return { documentId: input.documentId, dryRun: true, quarantined: false, permanentlyDeleted: false, plannedUpdate: update, movedFiles: plannedMoves.map(([, source, destination]) => [source, destination]), events: [] };

  const movedFiles: Array<[string, string]> = [];
  for (const [, source, destination] of plannedMoves) {
    if (!fs.existsSync(source)) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(source, destination);
    movedFiles.push([source, destination]);
  }
  input.ledger.upsertDocument(update);
  const eventPayload = { choice: input.choice, quarantined_until: quarantinedUntil, moved_files: movedFiles, permanently_deleted: false };
  input.ledger.appendEvent({ documentId: input.documentId, batchId: document.batch_id, eventType: "quarantined", payload: eventPayload });
  const notion = input.notionAdapter ?? new NotionAdapter(input.config);
  const result = await notion.upsertDocument(tombstone(document, update, input.choice), { dryRun: false });
  if (!result.ok) throw new Error(result.message || "Notion tombstone upsert failed");
  return { documentId: input.documentId, dryRun: false, quarantined: true, permanentlyDeleted: false, plannedUpdate: update, movedFiles, events: [{ event_type: "quarantined", payload: eventPayload }] };
}

function plannedMovesFor(document: DocumentRecord, config: MailBillsConfig, todayIso: string): Array<[keyof DocumentRecord, string, string]> {
  const targetDir = path.join(configPaths(config).quarantineDir, todayIso, textValue(document.document_id, "unknown"));
  const moves: Array<[keyof DocumentRecord, string, string]> = [];
  for (const field of ["local_pdf_path", "sidecar_path"] as Array<keyof DocumentRecord>) {
    const source = textValue(document[field]);
    if (!source) continue;
    moves.push([field, source, uniqueDestination(path.join(targetDir, path.basename(source)))]);
  }
  return moves;
}

function tombstone(document: DocumentRecord, update: DocumentRecord, choice: string): DocumentRecord {
  return {
    document_id: update.document_id,
    status: "Deleted",
    category: textValue(document.category),
    vendor: textValue(document.vendor),
    summary: textValue(document.ocr_summary),
    batch_id: textValue(document.batch_id),
    local_pdf_path: textValue(update.local_pdf_path, textValue(document.local_pdf_path)),
    retention_decision: "Quarantined",
    quarantined_until: textValue(update.quarantined_until),
    deleted_at: textValue(update.deleted_at),
    deletion_reason: choice,
    metadata: {
      batch_id: textValue(document.batch_id),
      deleted_at: textValue(update.deleted_at),
      deletion_reason: choice,
      source_status: textValue(document.status),
      duplicate_of_document_id: textValue(document.duplicate_of_document_id)
    }
  };
}

function uniqueDestination(destination: string): string {
  if (!fs.existsSync(destination)) return destination;
  const parsed = path.parse(destination);
  for (let counter = 2; ; counter += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}

function maxIsoDate(left: string, right: string): string {
  return left && left > right ? left : right;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
