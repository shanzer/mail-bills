import fs from "node:fs";
import type { DocumentRecord, MailBillsConfig } from "./types.js";
import { CATEGORY_VALUES } from "./types.js";
import { Ledger } from "./ledger.js";
import { REVIEW_DECISIONS, resolveReview } from "./review.js";
import { quarantineDocument } from "./quarantine.js";
import { NotionAdapter } from "./notion.js";
import { uploadPdfToPaperless, type PaperlessUploader } from "./paperless.js";
import { textValue } from "./paths.js";

const DOCUMENT_ACTIONS = new Set([...REVIEW_DECISIONS, "complete", "delete", "update-fields", "actionable", "send-to-paperless"]);
const GENERAL_ARCHIVE_STATUSES = new Set(["Actionable", "Waiting", "Completed", "Archived"]);
const CATEGORY_SET = new Set<string>(CATEGORY_VALUES);

export interface DocumentActionResult {
  documentId: string;
  action: string;
  ok: boolean;
  dryRun: boolean;
  payload: Record<string, unknown>;
  error?: string;
}

export async function applyDocumentAction(input: {
  documentId: string;
  action: string;
  ledger: Ledger;
  config: MailBillsConfig;
  dryRun?: boolean;
  notionAdapter?: NotionAdapter;
  today?: Date;
  dueDate?: string | null;
  clearDueDate?: boolean;
  deleteChoice?: string;
  category?: string | null;
  shortcutLabel?: string | null;
  paperlessUploader?: PaperlessUploader;
}): Promise<DocumentActionResult> {
  const dryRun = Boolean(input.dryRun);
  try {
    if (!DOCUMENT_ACTIONS.has(input.action)) throw new Error(`Unsupported document action: ${input.action}`);
    const document = input.ledger.getDocument(input.documentId);
    if (!document) throw new Error(`Unknown document_id: ${input.documentId}`);
    if (input.action === "update-fields") return updateDocumentFields(document, input, dryRun);
    if (input.action === "actionable") return markActionable(document, input, dryRun);
    if (input.action === "complete") return completeDocument(document, input.ledger, dryRun);
    if (input.action === "delete") return deleteDocument(input, dryRun);
    if (input.action === "send-to-paperless") return await sendToPaperless(document, input, dryRun);
    if (input.action === "archive" && GENERAL_ARCHIVE_STATUSES.has(textValue(document.status))) return archiveDocument(document, input.ledger, dryRun);
    const review = await resolveReview({ ...input, decision: input.action, dryRun });
    return { documentId: input.documentId, action: input.action, ok: true, dryRun, payload: { planned_update: review.plannedUpdate } };
  } catch (error) {
    return { documentId: input.documentId, action: input.action, ok: false, dryRun, payload: {}, error: error instanceof Error ? error.message : String(error) };
  }
}

async function sendToPaperless(document: DocumentRecord, input: Parameters<typeof applyDocumentAction>[0], dryRun: boolean): Promise<DocumentActionResult> {
  const pdfPath = textValue(document.local_pdf_path);
  if (!pdfPath) throw new Error("document has no local_pdf_path");
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF file is missing: ${pdfPath}`);
  if (dryRun) {
    return {
      documentId: document.document_id,
      action: "send-to-paperless",
      ok: true,
      dryRun: true,
      payload: { uploaded: false, pdf_path: pdfPath }
    };
  }

  const uploader = input.paperlessUploader ?? uploadPdfToPaperless;
  const response = sanitizePaperlessResponse(await uploader(pdfPath));
  input.ledger.appendEvent({
    documentId: document.document_id,
    batchId: document.batch_id,
    eventType: "paperless_uploaded",
    payload: { pdf_path: pdfPath, paperless_response: response }
  });
  return {
    documentId: document.document_id,
    action: "send-to-paperless",
    ok: true,
    dryRun: false,
    payload: { uploaded: true, pdf_path: pdfPath, paperless_response: response }
  };
}

function sanitizePaperlessResponse(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { value: String(value ?? "") };
  const blocked = new Set(["apiKey", "apikey", "token", "authorization", "Authorization"]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !blocked.has(key))
      .map(([key, entry]) => [key, sanitizeResponseValue(entry)])
  );
}

function sanitizeResponseValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return JSON.stringify(value);
}

function completeDocument(document: DocumentRecord, ledger: Ledger, dryRun: boolean): DocumentActionResult {
  const update = { document_id: document.document_id, status: "Completed", review_reason: null };
  if (!dryRun) {
    ledger.upsertDocument(update);
    ledger.appendEvent({ documentId: document.document_id, batchId: document.batch_id, eventType: "document_completed", payload: { update } });
  }
  return { documentId: document.document_id, action: "complete", ok: true, dryRun, payload: { planned_update: update } };
}

function archiveDocument(document: DocumentRecord, ledger: Ledger, dryRun: boolean): DocumentActionResult {
  const update = { document_id: document.document_id, status: "Archived", review_reason: null };
  if (!dryRun) {
    ledger.upsertDocument(update);
    ledger.appendEvent({ documentId: document.document_id, batchId: document.batch_id, eventType: "document_archived", payload: { update } });
  }
  return { documentId: document.document_id, action: "archive", ok: true, dryRun, payload: { planned_update: update } };
}

function updateDocumentFields(document: DocumentRecord, input: Parameters<typeof applyDocumentAction>[0], dryRun: boolean): DocumentActionResult {
  const update: DocumentRecord = { document_id: document.document_id };
  if (input.category !== undefined && input.category !== null) {
    const category = textValue(input.category);
    if (category && !CATEGORY_SET.has(category)) throw new Error(`Unsupported category: ${category}`);
    update.category = category || null;
  }
  if (input.shortcutLabel !== undefined && input.shortcutLabel !== null) {
    update.shortcut_label = textValue(input.shortcutLabel) || null;
  }
  applyDueDateUpdate(update, input.dueDate, Boolean(input.clearDueDate));
  if (Object.keys(update).length === 1) throw new Error("No fields supplied to update");
  if (!dryRun) {
    input.ledger.upsertDocument(update);
    input.ledger.appendEvent({ documentId: document.document_id, batchId: document.batch_id, eventType: "document_fields_updated", payload: { update } });
  }
  return { documentId: document.document_id, action: "update-fields", ok: true, dryRun, payload: { planned_update: update } };
}

function markActionable(document: DocumentRecord, input: Parameters<typeof applyDocumentAction>[0], dryRun: boolean): DocumentActionResult {
  const update = editableFieldsUpdate(document, input);
  update.status = "Actionable";
  update.review_reason = null;
  update.confidence = "high";
  if (!dryRun) {
    input.ledger.upsertDocument(update);
    input.ledger.appendEvent({ documentId: document.document_id, batchId: document.batch_id, eventType: "document_marked_actionable", payload: { update } });
  }
  return { documentId: document.document_id, action: "actionable", ok: true, dryRun, payload: { planned_update: update } };
}

function editableFieldsUpdate(document: DocumentRecord, input: Parameters<typeof applyDocumentAction>[0]): DocumentRecord {
  const update: DocumentRecord = { document_id: document.document_id };
  if (input.category !== undefined && input.category !== null) {
    const category = textValue(input.category);
    if (category && !CATEGORY_SET.has(category)) throw new Error(`Unsupported category: ${category}`);
    update.category = category || null;
  }
  if (input.shortcutLabel !== undefined && input.shortcutLabel !== null) {
    update.shortcut_label = textValue(input.shortcutLabel) || null;
  }
  applyDueDateUpdate(update, input.dueDate, Boolean(input.clearDueDate));
  return update;
}

async function deleteDocument(input: Parameters<typeof applyDocumentAction>[0], dryRun: boolean): Promise<DocumentActionResult> {
  const document = input.ledger.getDocument(input.documentId);
  const choice = input.deleteChoice ?? (textValue(document?.duplicate_of_document_id) || textValue(document?.status) === "Duplicate" ? "Delete duplicate" : "Ignore/delete");
  const result = await quarantineDocument({ documentId: input.documentId, ledger: input.ledger, config: input.config, notionAdapter: input.notionAdapter, choice, today: input.today, dryRun });
  return { documentId: input.documentId, action: "delete", ok: true, dryRun, payload: { choice, planned_update: result.plannedUpdate, quarantined: result.quarantined, permanently_deleted: result.permanentlyDeleted, moved_files: result.movedFiles, events: result.events } };
}

function applyDueDateUpdate(update: DocumentRecord, dueDate?: string | null, clearDueDate = false): void {
  if (dueDate !== undefined && dueDate !== null && !textValue(dueDate)) clearDueDate = true;
  if (clearDueDate) {
    update.due_date = null;
  } else if (dueDate !== undefined && dueDate !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error(`due_date must be YYYY-MM-DD, got ${dueDate}`);
    update.due_date = dueDate;
  }
}
