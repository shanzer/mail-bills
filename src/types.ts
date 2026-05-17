export const CATEGORY_VALUES = [
  "BILL",
  "HEALTH-INSURANCE",
  "OTHER-INSURANCE",
  "SCHOOL-FAMILY",
  "TAX-LEGAL-GOVERNMENT",
  "HOME-AUTO",
  "RECEIPT-RECORD",
  "SUBSCRIPTION",
  "UNKNOWN"
] as const;

export type Category = (typeof CATEGORY_VALUES)[number];

export const STATUS_VALUES = [
  "imported",
  "Inbox",
  "Needs Review",
  "Actionable",
  "Waiting",
  "Completed",
  "Archived",
  "Deleted",
  "Error",
  "Duplicate"
] as const;

export type DocumentStatus = (typeof STATUS_VALUES)[number] | string;

export interface OcrConfig {
  localFirst: boolean;
  visionFallbackEnabled: boolean;
  visionHelperPath?: string;
  modelFallbackEnabled: boolean;
  modelProvider: string;
  modelName: string;
  lowTextThreshold: number;
}

export interface MailBillsConfig {
  configPath?: string;
  rootDir: string;
  icloudIntakeDir?: string;
  icloudErrorDir?: string;
  notionDatabaseName: string;
  pipelineSchedule: {
    enabled: boolean;
    intervalMinutes: number;
    runOnStartup: boolean;
    stableDelayMs: number;
  };
  intakeUpload: {
    intakeDir: string;
    errorDir: string;
    token?: string;
    host: string;
    port: number;
  };
  ocr: OcrConfig;
}

export interface BatchRecord {
  batch_id: string;
  created_at?: string | null;
  source?: string | null;
  status?: string | null;
  item_count?: number | null;
}

export interface DocumentRecord {
  document_id: string;
  batch_id?: string | null;
  source_pdf_path?: string | null;
  local_pdf_path?: string | null;
  sidecar_path?: string | null;
  sha256?: string | null;
  created_at?: string | null;
  imported_at?: string | null;
  status?: DocumentStatus | null;
  category?: string | null;
  shortcut_label?: string | null;
  detected_category?: string | null;
  vendor?: string | null;
  amount?: string | null;
  due_date?: string | null;
  ocr_text?: string | null;
  ocr_summary?: string | null;
  confidence?: string | null;
  review_reason?: string | null;
  urgency_reasons_json?: string | null;
  notion_page_id?: string | null;
  retention_decision?: string | null;
  quarantined_until?: string | null;
  duplicate_of_document_id?: string | null;
  deleted_at?: string | null;
  error_message?: string | null;
  duplicate_candidates?: string[] | null;
  metadata?: Record<string, unknown> | null;
  summary?: string | null;
  deletion_reason?: string | null;
}

export interface EventRecord {
  id?: number;
  document_id?: string | null;
  batch_id?: string | null;
  event_type: string;
  event_at?: string;
  payload_json?: string;
}
