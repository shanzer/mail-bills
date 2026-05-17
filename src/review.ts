import type { DocumentRecord, MailBillsConfig } from "./types.js";
import { Ledger } from "./ledger.js";
import { NotionAdapter } from "./notion.js";
import { textValue } from "./paths.js";

export const REVIEW_DECISIONS = new Set(["archive"]);

export interface ReviewResolutionResult {
  documentId: string;
  decision: string;
  dryRun: boolean;
  plannedUpdate: DocumentRecord;
  notionSynced: boolean;
}

export function needsReviewDocuments(ledger: Ledger): DocumentRecord[] {
  return ledger.documentsByStatus("Needs Review");
}

export async function resolveReview(input: {
  documentId: string;
  decision: string;
  ledger: Ledger;
  config: MailBillsConfig;
  dryRun?: boolean;
  syncNotion?: boolean;
  notionAdapter?: NotionAdapter;
  dueDate?: string | null;
  clearDueDate?: boolean;
}): Promise<ReviewResolutionResult> {
  if (!REVIEW_DECISIONS.has(input.decision)) throw new Error(`Unsupported review decision: ${input.decision}`);
  const document = input.ledger.getDocument(input.documentId);
  if (!document) throw new Error(`Unknown document_id: ${input.documentId}`);
  const update = decisionUpdate(document, input.decision, input.dueDate, Boolean(input.clearDueDate));
  if (input.dryRun) return { documentId: input.documentId, decision: input.decision, dryRun: true, plannedUpdate: update, notionSynced: false };
  input.ledger.upsertDocument(update);
  input.ledger.appendEvent({ documentId: input.documentId, batchId: document.batch_id, eventType: "review_resolved", payload: { decision: input.decision, update } });
  let notionSynced = false;
  if (input.syncNotion) {
    const adapter = input.notionAdapter ?? new NotionAdapter(input.config);
    const result = await adapter.upsertDocument(input.ledger.getDocument(input.documentId) ?? { ...document, ...update }, { dryRun: false });
    if (!result.ok) throw new Error(result.message || "Notion review sync failed");
    notionSynced = true;
  }
  return { documentId: input.documentId, decision: input.decision, dryRun: false, plannedUpdate: update, notionSynced };
}

function decisionUpdate(document: DocumentRecord, decision: string, dueDate?: string | null, clearDueDate = false): DocumentRecord {
  if (decision === "archive") {
    const update: DocumentRecord = { document_id: document.document_id, status: "Archived", review_reason: null, confidence: "high" };
    applyDueDateOverride(update, dueDate, clearDueDate);
    return update;
  }
  const category = textValue(document.category);
  const update: DocumentRecord = { document_id: document.document_id, status: "Actionable", category: category || null, review_reason: null, confidence: "high" };
  applyDueDateOverride(update, dueDate, clearDueDate);
  return update;
}

function applyDueDateOverride(update: DocumentRecord, dueDate?: string | null, clearDueDate = false): void {
  if (dueDate !== undefined && dueDate !== null && !textValue(dueDate)) clearDueDate = true;
  if (clearDueDate) {
    update.due_date = null;
  } else if (dueDate !== undefined && dueDate !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error(`due_date must be YYYY-MM-DD, got ${dueDate}`);
    update.due_date = dueDate;
  }
}
