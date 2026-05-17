import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CATEGORY_VALUES, type Category } from "./types.js";
import { optionalText } from "./paths.js";

export interface Sidecar {
  batchId: string;
  documentId: string;
  capturedAt: string;
  label?: string;
  category: Category;
  note?: string;
  source: string;
}

export class SidecarValidationError extends Error {}

const friendlyLabelToCategory: Record<string, Category> = {
  Bill: "BILL",
  "Health Insurance": "HEALTH-INSURANCE",
  Medical: "HEALTH-INSURANCE",
  "Health Medical Insurance": "HEALTH-INSURANCE",
  "Health / Medical / Insurance": "HEALTH-INSURANCE",
  "Other Insurance": "OTHER-INSURANCE",
  "School Family": "SCHOOL-FAMILY",
  "School / Family": "SCHOOL-FAMILY",
  "Tax Legal Government": "TAX-LEGAL-GOVERNMENT",
  "Tax / Legal / Government": "TAX-LEGAL-GOVERNMENT",
  "Home Auto": "HOME-AUTO",
  "Home / Auto": "HOME-AUTO",
  "Receipt Record": "RECEIPT-RECORD",
  "Receipt / Record": "RECEIPT-RECORD",
  Subscription: "SUBSCRIPTION",
  "Subscription / Membership": "SUBSCRIPTION",
  Unknown: "UNKNOWN",
  Other: "UNKNOWN",
  "Other / Unknown": "UNKNOWN"
};

export function mapFriendlyLabel(label?: string): Category {
  if (!label) return "UNKNOWN";
  const cleaned = label.replaceAll("/", " ").replaceAll("-", " ").split(/\s+/).filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  return friendlyLabelToCategory[label] ?? friendlyLabelToCategory[cleaned] ?? "UNKNOWN";
}

export function loadSidecar(filePath: string): Sidecar {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new SidecarValidationError(`invalid JSON in sidecar: ${filePath}`, { cause: error });
  }
  const batchId = requireText(raw, "batchId");
  const capturedAt = requireText(raw, "capturedAt");
  const label = optionalText(raw.label);
  const category = optionalText(raw.category) ?? mapFriendlyLabel(label);
  if (!CATEGORY_VALUES.includes(category as Category)) {
    throw new SidecarValidationError(`category must be one of ${CATEGORY_VALUES.join(", ")}`);
  }
  return {
    batchId,
    documentId: optionalText(raw.documentId) ?? generateDocumentId(batchId, filePath, raw),
    capturedAt,
    label,
    category: category as Category,
    note: optionalText(raw.note),
    source: optionalText(raw.source) ?? "iphone_shortcut"
  };
}

function requireText(raw: Record<string, unknown>, key: string): string {
  const value = optionalText(raw[key]);
  if (!value) throw new SidecarValidationError(`${key} is required`);
  return value;
}

function generateDocumentId(batchId: string, filePath: string, raw: Record<string, unknown>): string {
  const digest = crypto.createHash("sha256").update(JSON.stringify(raw) + path.basename(filePath)).digest("hex").slice(0, 12);
  return `${batchId}-${digest}`;
}
