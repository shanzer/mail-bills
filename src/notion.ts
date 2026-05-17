import fs from "node:fs";
import type { DocumentRecord, MailBillsConfig } from "./types.js";
import { textValue } from "./paths.js";

const NOTION_VERSION = "2022-06-28";
const DEFAULT_ENV_PATH = "/Users/buckaroo/.hermes/.env";

export interface NotionSetupSpec {
  title: string;
  properties: Record<string, unknown>;
  notes: string[];
}

export interface ValidationResult {
  ok: boolean;
  dryRun: boolean;
  message: string;
  databaseId?: string;
  setupSpec?: NotionSetupSpec;
}

export interface UpsertResult {
  ok: boolean;
  dryRun: boolean;
  action: string;
  documentId: string;
  message: string;
  pageId?: string;
  payload?: Record<string, unknown>;
  setupSpec?: NotionSetupSpec;
}

export class NotionApiError extends Error {}

export class NotionAdapter {
  token?: string;
  databaseId?: string;
  parentPageId?: string;

  constructor(readonly config: MailBillsConfig, options: { token?: string; databaseId?: string; parentPageId?: string } = {}) {
    loadEnvFile();
    this.token = options.token ?? process.env.NOTION_TOKEN;
    this.databaseId = options.databaseId ?? process.env.NOTION_MAIL_BILLS_DATABASE_ID;
    this.parentPageId = options.parentPageId ?? process.env.NOTION_MAIL_BILLS_PARENT_PAGE_ID;
  }

  async validate(options: { dryRun: boolean }): Promise<ValidationResult> {
    const setupSpec = buildSetupSpec(this.config.notionDatabaseName);
    if (options.dryRun) {
      return { ok: true, dryRun: true, message: "Dry run: generated Mail Bills Notion database setup spec; no Notion calls made.", setupSpec };
    }
    const missing = this.missingWritePrerequisites();
    if (missing.length) {
      return { ok: false, dryRun: false, message: `Setup required before Notion validation: missing ${missing.join(", ")}.`, setupSpec };
    }
    const database = await this.request("GET", `/databases/${this.databaseId}`);
    const properties = (database.properties ?? {}) as Record<string, unknown>;
    const missingProperties = Object.keys(setupSpec.properties).filter((name) => !(name in properties));
    if (missingProperties.length) {
      return { ok: false, dryRun: false, message: `Notion database exists but is missing properties: ${missingProperties.join(", ")}.`, databaseId: this.databaseId, setupSpec };
    }
    return { ok: true, dryRun: false, message: "Notion Mail Bills database is reachable and has required properties.", databaseId: this.databaseId, setupSpec };
  }

  async upsertDocument(document: DocumentRecord, options: { dryRun: boolean }): Promise<UpsertResult> {
    const documentId = requireText(document.document_id, "document_id");
    const setupSpec = buildSetupSpec(this.config.notionDatabaseName);
    const payload = buildUpsertPayload(document, this.databaseId ?? "DRY_RUN_DATABASE_ID");
    if (options.dryRun) {
      return { ok: true, dryRun: true, action: "would_upsert", documentId, message: "Dry run: generated Notion upsert payload; no Notion calls made.", payload, setupSpec };
    }
    const missing = this.missingWritePrerequisites();
    if (missing.length) {
      return { ok: false, dryRun: false, action: "setup_required", documentId, message: `Setup required before Notion write: missing ${missing.join(", ")}.`, payload, setupSpec };
    }
    const page = await this.findPageByDocumentId(documentId);
    if (page) {
      const updatePayload = { properties: (payload as any).properties };
      const response = await this.request("PATCH", `/pages/${page.id}`, updatePayload);
      return { ok: true, dryRun: false, action: "updated", documentId, pageId: String(response.id ?? page.id), message: "Updated existing Notion page by Document ID.", payload: updatePayload, setupSpec };
    }
    const response = await this.request("POST", "/pages", payload);
    return { ok: true, dryRun: false, action: "created", documentId, pageId: String(response.id), message: "Created Notion page for Document ID.", payload, setupSpec };
  }

  private async findPageByDocumentId(documentId: string): Promise<any | undefined> {
    const query = { filter: { property: "Document ID", title: { equals: documentId } }, page_size: 1 };
    const response = await this.request("POST", `/databases/${this.databaseId}/query`, query);
    return Array.isArray(response.results) ? response.results[0] : undefined;
  }

  private missingWritePrerequisites(): string[] {
    const missing: string[] = [];
    if (!this.token) missing.push("NOTION_TOKEN");
    if (!this.databaseId) missing.push("NOTION_MAIL_BILLS_DATABASE_ID");
    return missing;
  }

  private async request(method: string, apiPath: string, payload?: unknown): Promise<any> {
    if (!this.token) throw new NotionApiError("NOTION_TOKEN is required for Notion API calls");
    const response = await fetch(`https://api.notion.com/v1${apiPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json"
      },
      body: payload === undefined ? undefined : JSON.stringify(payload)
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) throw new NotionApiError(`Notion API ${method} ${apiPath} failed: ${response.status} ${text}`);
    return body;
  }
}

export function buildSetupSpec(databaseName: string): NotionSetupSpec {
  return {
    title: databaseName,
    properties: {
      "Document ID": { title: {} },
      Status: { select: { options: selectOptions(["Inbox", "Needs Review", "Actionable", "Waiting", "Completed", "Archived", "Deleted", "Error", "Duplicate"]) } },
      Summary: { rich_text: {} },
      "OCR Text": { rich_text: {} },
      Metadata: { rich_text: {} },
      "Local PDF Path": { rich_text: {} },
      Vendor: { rich_text: {} },
      Amount: { rich_text: {} },
      "Due Date": { date: {} },
      Category: { select: { options: selectOptions(["BILL", "HEALTH-INSURANCE", "OTHER-INSURANCE", "SCHOOL-FAMILY", "TAX-LEGAL-GOVERNMENT", "HOME-AUTO", "RECEIPT-RECORD", "SUBSCRIPTION", "UNKNOWN"]) } },
      "Review Reason": { rich_text: {} },
      "Duplicate Candidates": { rich_text: {} },
      "Retention Decision": { select: { options: selectOptions(["Undecided", "Keep", "Archive", "Quarantined", "Delete Approved"]) } },
      "Quarantined Until": { date: {} },
      "Deleted At": { date: {} },
      "Deletion Reason": { rich_text: {} }
    },
    notes: [
      "Store local PDF paths as text/reference only.",
      "Do not add Notion Files properties, page children, or upload/attach PDFs.",
      "Use Document ID as the idempotency key for upserts."
    ]
  };
}

export function buildUpsertPayload(document: DocumentRecord, databaseId: string): Record<string, unknown> {
  const documentId = requireText(document.document_id, "document_id");
  const properties: Record<string, unknown> = {
    "Document ID": title(documentId),
    Status: select(textValue(document.status, "Inbox")),
    Summary: richText(textValue(document.ocr_summary ?? document.summary)),
    "OCR Text": richText(textValue(document.ocr_text)),
    Metadata: richText(metadataText(document)),
    "Local PDF Path": richText(textValue(document.local_pdf_path)),
    Vendor: richText(textValue(document.vendor)),
    Amount: richText(textValue(document.amount)),
    "Review Reason": richText(textValue(document.review_reason)),
    "Duplicate Candidates": richText(duplicateCandidatesText(document.duplicate_candidates))
  };
  const category = textValue(document.detected_category ?? document.category);
  if (category) properties.Category = select(category);
  if (textValue(document.retention_decision)) properties["Retention Decision"] = select(textValue(document.retention_decision));
  if (textValue(document.quarantined_until)) properties["Quarantined Until"] = { date: { start: textValue(document.quarantined_until) } };
  if (textValue(document.deleted_at)) properties["Deleted At"] = { date: { start: textValue(document.deleted_at) } };
  if (textValue(document.deletion_reason)) properties["Deletion Reason"] = richText(textValue(document.deletion_reason));
  if ("due_date" in document) properties["Due Date"] = textValue(document.due_date) ? { date: { start: textValue(document.due_date) } } : { date: null };
  return { parent: { database_id: databaseId }, properties };
}

export function loadEnvFile(filePath = DEFAULT_ENV_PATH): void {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const trimmedKey = key.trim();
    if (!trimmedKey || process.env[trimmedKey]) continue;
    process.env[trimmedKey] = rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

function selectOptions(names: string[]): Array<{ name: string }> {
  return names.map((name) => ({ name }));
}

function title(text: string): Record<string, unknown> {
  return { title: [{ text: { content: notionText(text) } }] };
}

function select(name: string): Record<string, unknown> {
  return { select: { name } };
}

function richText(text: string): Record<string, unknown> {
  return text ? { rich_text: [{ text: { content: notionText(text) } }] } : { rich_text: [] };
}

function notionText(text: string): string {
  return text.slice(0, 2000);
}

function requireText(value: unknown, key: string): string {
  const text = textValue(value);
  if (!text) throw new Error(`${key} is required`);
  return text;
}

function metadataText(document: DocumentRecord): string {
  if (document.metadata) return JSON.stringify(document.metadata);
  const keys: Array<keyof DocumentRecord> = ["batch_id", "sha256", "source_pdf_path", "sidecar_path", "confidence", "urgency_reasons_json"];
  const metadata = Object.fromEntries(keys.filter((key) => document[key] !== undefined && document[key] !== null).map((key) => [key, document[key]]));
  return Object.keys(metadata).length ? JSON.stringify(metadata) : "";
}

function duplicateCandidatesText(value: unknown): string {
  if (!value) return "";
  return Array.isArray(value) ? value.map(String).join(", ") : String(value);
}
