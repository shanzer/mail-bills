import type { DocumentRecord, MailBillsConfig } from "./types.js";
import { Ledger } from "./ledger.js";
import { scanImports, type ImportSummary } from "./importer.js";
import { processOcrDocument, type OcrResult } from "./ocr.js";
import { classifyMail, type ClassificationResult } from "./classifier.js";
import { detectDuplicates, loadDuplicateSources, type DedupeResult } from "./dedupe.js";
import { configPaths } from "./config.js";
import { textValue } from "./paths.js";

export interface ProcessorServices {
  importScanner: typeof scanImports;
  ocrProcessor: typeof processOcrDocument;
  classifier: typeof classifyMail;
  duplicateSourceLoader: typeof loadDuplicateSources;
  duplicateDetector: typeof detectDuplicates;
}

export interface BatchProcessResult {
  batchId: string;
  processed: number;
  failed: number;
  dryRun: boolean;
  documents: DocumentRecord[];
  errors: Array<{ document_id: string; message: string }>;
}

export interface PendingProcessResult {
  dryRun: boolean;
  importSummary: ImportSummary;
  batches: BatchProcessResult[];
  errors: Array<{ document_id: string; message: string }>;
}

export function defaultProcessorServices(): ProcessorServices {
  return {
    importScanner: scanImports,
    ocrProcessor: processOcrDocument,
    classifier: classifyMail,
    duplicateSourceLoader: loadDuplicateSources,
    duplicateDetector: detectDuplicates
  };
}

export async function processPending(input: {
  config: MailBillsConfig;
  ledger?: Ledger;
  dryRun?: boolean;
  stableDelayMs?: number;
  services?: ProcessorServices;
}): Promise<PendingProcessResult> {
  const dryRun = Boolean(input.dryRun);
  const ledger = input.ledger ?? new Ledger(configPaths(input.config).ledgerPath);
  ledger.initialize();
  const services = input.services ?? defaultProcessorServices();
  const importSummary = services.importScanner({ config: input.config, dryRun, stableDelayMs: input.stableDelayMs ?? 1000 });
  const batches: BatchProcessResult[] = [];
  for (const batchId of pendingBatchIds(ledger)) {
    batches.push(await processBatch({ batchId, config: input.config, ledger, dryRun, services }));
  }
  return { dryRun, importSummary, batches, errors: batches.flatMap((batch) => batch.errors) };
}

export async function processBatch(input: {
  batchId: string;
  config: MailBillsConfig;
  ledger?: Ledger;
  dryRun?: boolean;
  services?: ProcessorServices;
}): Promise<BatchProcessResult> {
  const dryRun = Boolean(input.dryRun);
  const ledger = input.ledger ?? new Ledger(configPaths(input.config).ledgerPath);
  ledger.initialize();
  const services = input.services ?? defaultProcessorServices();
  const plannedDocuments = new Map<string, DocumentRecord>();
  const errors: Array<{ document_id: string; message: string }> = [];
  let processed = 0;

  for (const document of processableDocuments(ledger, input.batchId)) {
    const documentId = textValue(document.document_id);
    try {
      const updated = await processDocument(document, { config: input.config, ledger, dryRun, services });
      processed += 1;
      plannedDocuments.set(documentId, updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ document_id: documentId, message });
      if (dryRun) {
        plannedDocuments.set(documentId, { ...document, status: "Error", error_message: message });
      } else {
        ledger.upsertDocument({ document_id: documentId, status: "Error", error_message: message });
        ledger.appendEvent({ documentId, batchId: document.batch_id, eventType: "processing_error", payload: { message } });
      }
    }
  }

  const documents = dryRun ? documentsForSummary(ledger, input.batchId, plannedDocuments) : ledger.documentsForBatch(input.batchId);
  if (!dryRun) ledger.upsertBatch({ batch_id: input.batchId, status: errors.length ? "processed_with_errors" : "processed" });
  return { batchId: input.batchId, processed, failed: errors.length, dryRun, documents, errors };
}

async function processDocument(
  document: DocumentRecord,
  input: { config: MailBillsConfig; ledger: Ledger; dryRun: boolean; services: ProcessorServices }
): Promise<DocumentRecord> {
  const documentId = textValue(document.document_id);
  const ocrResult = await input.services.ocrProcessor({ documentId, ledger: input.ledger, ocrConfig: input.config.ocr, dryRun: input.dryRun });
  const classification = input.services.classifier(ocrResult.text, { shortcutLabel: document.shortcut_label ?? document.category });
  let current = { ...document, ...documentUpdate(document, ocrResult, classification) };
  if (!input.dryRun) {
    input.ledger.upsertDocument(current);
    current = input.ledger.getDocument(documentId) ?? current;
  }
  const duplicateResult = input.services.duplicateDetector(current, input.services.duplicateSourceLoader(input.ledger));
  const duplicateUpdate = duplicateDocumentUpdate(documentId, duplicateResult);
  if (duplicateUpdate) {
    current = { ...current, ...duplicateUpdate };
    if (!input.dryRun) {
      input.ledger.upsertDocument(duplicateUpdate);
      current = input.ledger.getDocument(documentId) ?? current;
    }
  }
  if (!input.dryRun) {
    input.ledger.appendEvent({ documentId, batchId: document.batch_id, eventType: "processed", payload: { dry_run: input.dryRun, status: current.status } });
  }
  return current;
}

function documentUpdate(document: DocumentRecord, ocrResult: OcrResult, classification: ClassificationResult): DocumentRecord {
  const reviewReason = textValue(ocrResult.reviewReason) || textValue(classification.reviewReason);
  let status = textValue(classification.status, "Needs Review");
  if (ocrResult.reviewReason) status = "Needs Review";
  const existingCategory = textValue(document.category);
  const category = existingCategory === "UNKNOWN" || !existingCategory
    ? textValue(classification.detectedCategory, textValue(classification.category))
    : textValue(classification.category);
  return {
    document_id: document.document_id,
    ocr_text: ocrResult.text,
    ocr_summary: ocrResult.summary,
    confidence: ocrResult.reviewReason ? "low" : textValue(classification.confidence, textValue(ocrResult.confidence, "low")),
    review_reason: reviewReason || null,
    status,
    category,
    detected_category: textValue(classification.detectedCategory),
    vendor: textValue(classification.vendor),
    amount: textValue(classification.amount),
    due_date: textValue(classification.dueDate),
    urgency_reasons_json: JSON.stringify(classification.urgencyReasons)
  };
}

function duplicateDocumentUpdate(documentId: string, duplicateResult: DedupeResult): DocumentRecord | undefined {
  if (!duplicateResult.hasPossibleDuplicates) return undefined;
  const first = duplicateResult.matches[0];
  return {
    document_id: documentId,
    status: textValue(duplicateResult.recommendedStatus, "Needs Review"),
    review_reason: textValue(duplicateResult.reviewReason, "possible duplicate"),
    duplicate_of_document_id: first?.documentId
  };
}

function processableDocuments(ledger: Ledger, batchId: string): DocumentRecord[] {
  return ledger.documentsForBatch(batchId).filter((document) => ["imported", "Inbox", "Needs Review"].includes(textValue(document.status)));
}

function pendingBatchIds(ledger: Ledger): string[] {
  const ids = new Set<string>();
  for (const status of ["imported", "Inbox"]) {
    for (const document of ledger.documentsByStatus(status)) {
      if (textValue(document.batch_id)) ids.add(textValue(document.batch_id));
    }
  }
  return [...ids].sort();
}

function documentsForSummary(ledger: Ledger, batchId: string, overlays: Map<string, DocumentRecord>): DocumentRecord[] {
  const documents = new Map(ledger.documentsForBatch(batchId).map((document) => [document.document_id, document]));
  for (const [documentId, overlay] of overlays) {
    if (textValue(overlay.batch_id) === batchId || documents.has(documentId)) {
      documents.set(documentId, { ...(documents.get(documentId) ?? { document_id: documentId }), ...overlay });
    }
  }
  return [...documents.values()].sort((left, right) => left.document_id.localeCompare(right.document_id));
}
