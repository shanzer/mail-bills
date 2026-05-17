import type { DocumentRecord } from "./types.js";
import { textValue } from "./paths.js";

export interface DuplicateMatch {
  documentId: string;
  sourceStatus?: string | null;
  duplicateType: "exact" | "possible";
  score: number;
  signals: string[];
}

export interface DedupeResult {
  hasPossibleDuplicates: boolean;
  recommendedStatus?: string | null;
  reviewReason?: string | null;
  matches: DuplicateMatch[];
}

const DUPLICATE_SOURCE_STATUSES = new Set(["Inbox", "Needs Review", "Actionable", "Waiting", "Archived"]);
const EXCLUDED_SOURCE_STATUSES = new Set(["Deleted", "Duplicate", "Error"]);
const DUPLICATE_SOURCE_STATUS_ORDER = ["Actionable", "Archived", "Inbox", "Needs Review", "Waiting"];
const REVIEW_REASON = "possible duplicate";

export function loadDuplicateSources(ledger: { documentsByStatus(status: string): DocumentRecord[] }): DocumentRecord[] {
  return DUPLICATE_SOURCE_STATUS_ORDER.flatMap((status) => ledger.documentsByStatus(status));
}

export function detectDuplicates(newDocument: DocumentRecord, existingDocuments: Iterable<DocumentRecord>): DedupeResult {
  const matches = [...existingDocuments]
    .filter((existing) => isDuplicateSource(newDocument, existing))
    .map((existing) => matchDocument(newDocument, existing))
    .filter((match): match is DuplicateMatch => match !== undefined)
    .sort((left, right) => Number(left.duplicateType !== "exact") - Number(right.duplicateType !== "exact") || right.score - left.score || left.documentId.localeCompare(right.documentId));

  if (!matches.length) {
    return {
      hasPossibleDuplicates: false,
      recommendedStatus: textValue(newDocument.status),
      matches: []
    };
  }

  return {
    hasPossibleDuplicates: true,
    recommendedStatus: "Needs Review",
    reviewReason: REVIEW_REASON,
    matches
  };
}

function isDuplicateSource(newDocument: DocumentRecord, existingDocument: DocumentRecord): boolean {
  if (textValue(newDocument.document_id) === textValue(existingDocument.document_id)) return false;
  const status = textValue(existingDocument.status);
  if (EXCLUDED_SOURCE_STATUSES.has(status)) return false;
  return DUPLICATE_SOURCE_STATUSES.has(status);
}

function matchDocument(newDocument: DocumentRecord, existingDocument: DocumentRecord): DuplicateMatch | undefined {
  const existingId = textValue(existingDocument.document_id);
  if (!existingId) return undefined;
  const newSha = textValue(newDocument.sha256);
  const existingSha = textValue(existingDocument.sha256);
  if (newSha && existingSha && newSha === existingSha) {
    return {
      documentId: existingId,
      sourceStatus: existingDocument.status,
      duplicateType: "exact",
      score: 1,
      signals: ["exact SHA-256"]
    };
  }

  const signals: string[] = [];
  const textSimilarity = ocrSimilarity(newDocument, existingDocument);
  if (textSimilarity >= 0.72) signals.push("OCR text similarity");
  if (sameStringField(newDocument, existingDocument, "vendor")) signals.push("vendor");
  if (sameStringField(newDocument, existingDocument, "due_date")) signals.push("due date");
  if (sameStringField(newDocument, existingDocument, "amount")) signals.push("amount");
  if (sameStringField(newDocument, existingDocument, "category") || sameStringField(newDocument, existingDocument, "detected_category")) signals.push("category");
  if (withinProximity(newDocument, existingDocument)) signals.push("batch/date proximity");

  const score = scoreSignals(signals, textSimilarity);
  if (isPossibleDuplicate(signals, score)) {
    return {
      documentId: existingId,
      sourceStatus: existingDocument.status,
      duplicateType: "possible",
      score: Math.round(score * 1000) / 1000,
      signals
    };
  }
  return undefined;
}

function isPossibleDuplicate(signals: string[], score: number): boolean {
  const required = ["vendor", "due date", "amount", "category"];
  if (required.every((signal) => signals.includes(signal))) return true;
  return signals.includes("OCR text similarity") && score >= 0.78 && signals.length >= 3;
}

function scoreSignals(signals: string[], textSimilarity: number): number {
  const weights: Record<string, number> = {
    "OCR text similarity": 0.35 * textSimilarity,
    vendor: 0.18,
    "due date": 0.16,
    amount: 0.16,
    category: 0.08,
    "batch/date proximity": 0.07
  };
  return Math.min(signals.reduce((total, signal) => total + (weights[signal] ?? 0), 0), 1);
}

function ocrSimilarity(left: DocumentRecord, right: DocumentRecord): number {
  const leftText = normalizeText(textValue(left.ocr_text));
  const rightText = normalizeText(textValue(right.ocr_text));
  if (!leftText || !rightText) return 0;
  return diceCoefficient(leftText, rightText);
}

function normalizeText(text: string): string {
  return (text.toLowerCase().match(/[a-z0-9.]+/g) ?? []).join(" ");
}

function sameStringField(left: DocumentRecord, right: DocumentRecord, fieldName: keyof DocumentRecord): boolean {
  const leftValue = textValue(left[fieldName]).toLowerCase();
  const rightValue = textValue(right[fieldName]).toLowerCase();
  return Boolean(leftValue && rightValue && leftValue === rightValue);
}

function withinProximity(left: DocumentRecord, right: DocumentRecord): boolean {
  if (textValue(left.batch_id) && textValue(left.batch_id) === textValue(right.batch_id)) return true;
  const leftDate = parseDateTime(left.created_at ?? left.imported_at);
  const rightDate = parseDateTime(right.created_at ?? right.imported_at);
  if (!leftDate || !rightDate) return false;
  return Math.abs(leftDate.getTime() - rightDate.getTime()) <= 7 * 24 * 60 * 60 * 1000;
}

function parseDateTime(value: unknown): Date | undefined {
  const text = textValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function diceCoefficient(left: string, right: string): number {
  if (left === right) return 1;
  const leftTokens = new Set(left.split(/\s+/).filter(Boolean));
  const rightTokens = new Set(right.split(/\s+/).filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return (2 * overlap) / (leftTokens.size + rightTokens.size);
}
