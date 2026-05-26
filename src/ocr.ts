import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";
import type { OcrConfig } from "./types.js";
import { Ledger } from "./ledger.js";

export interface OcrResult {
  pdfPath: string;
  text: string;
  pageCount: number;
  confidence: string;
  needsFallback: boolean;
  reviewReason?: string;
  summary: string;
  modelSummaryEnabled: boolean;
  modelProvider?: string;
  modelName?: string;
  extractionMethod: "embedded" | "vision";
}

const SUMMARY_MAX_CHARS = 500;

export async function extractPdfText(input: {
  pdfPath: string;
  ocrConfig: OcrConfig;
  visionOcrRunner?: (pdfPath: string, ocrConfig: OcrConfig) => string;
}): Promise<OcrResult> {
  const bytes = fs.readFileSync(input.pdfPath);
  const parser = new PDFParse({ data: bytes });
  const parsed = await parser.getText();
  await parser.destroy();
  let text = normalizeText(parsed.text ?? "");
  let pageCount = Number(parsed.total ?? 0);
  let extractionMethod: "embedded" | "vision" = "embedded";
  let visionError: string | undefined;
  let needsFallback = text.length < input.ocrConfig.lowTextThreshold;

  if (needsFallback && input.ocrConfig.visionFallbackEnabled) {
    try {
      const runner = input.visionOcrRunner ?? runVisionOcr;
      const visionText = normalizeText(runner(input.pdfPath, input.ocrConfig));
      if (visionText.length > text.length) {
        text = visionText;
        extractionMethod = "vision";
      }
    } catch (error) {
      visionError = error instanceof Error ? error.message : String(error);
    }
    needsFallback = text.length < input.ocrConfig.lowTextThreshold;
  }

  const confidence = needsFallback ? "low" : "high";
  const modelSummaryEnabled = Boolean(input.ocrConfig.modelFallbackEnabled && text);
  return {
    pdfPath: input.pdfPath,
    text,
    pageCount,
    confidence,
    needsFallback,
    reviewReason: fallbackReviewReason(input.ocrConfig, needsFallback, extractionMethod, visionError),
    summary: modelSummaryEnabled ? summarizeWithModel(text, input.ocrConfig) : summarize(text),
    modelSummaryEnabled,
    modelProvider: input.ocrConfig.modelProvider,
    modelName: input.ocrConfig.modelName,
    extractionMethod
  };
}

export async function processOcrDocument(input: {
  documentId: string;
  ledger: Ledger;
  ocrConfig: OcrConfig;
  dryRun?: boolean;
}): Promise<OcrResult> {
  const document = input.ledger.getDocument(input.documentId);
  if (!document) throw new Error(`document not found: ${input.documentId}`);
  if (!document.local_pdf_path) throw new Error(`document has no local_pdf_path: ${input.documentId}`);
  const result = await extractPdfText({ pdfPath: document.local_pdf_path, ocrConfig: input.ocrConfig });
  if (!input.dryRun) {
    input.ledger.upsertDocument({
      document_id: input.documentId,
      ocr_text: result.text,
      ocr_summary: result.summary,
      confidence: result.confidence,
      review_reason: result.reviewReason,
      status: result.needsFallback ? "Needs Review" : document.status ?? "imported"
    });
    input.ledger.appendEvent({
      documentId: input.documentId,
      batchId: document.batch_id,
      eventType: "ocr_extracted",
      payload: {
        page_count: result.pageCount,
        text_length: result.text.length,
        confidence: result.confidence,
        needs_fallback: result.needsFallback
      }
    });
  }
  return result;
}

export function defaultVisionHelperPath(): string {
  const modulePath = fileURLToPath(import.meta.url);
  const moduleDir = path.dirname(modulePath);
  const parentDir = path.dirname(moduleDir);
  const distDir = path.basename(moduleDir) === "src" && path.basename(parentDir) === "dist"
    ? parentDir
    : path.join(parentDir, "dist");
  return path.join(distDir, "utils", "vision_ocr");
}

export function runVisionOcr(pdfPath: string, ocrConfig: OcrConfig): string {
  const helperPath = ocrConfig.visionHelperPath ?? defaultVisionHelperPath();
  const stdout = execFileSync(helperPath, [pdfPath], { encoding: "utf8" });
  const payload = JSON.parse(stdout) as { text?: string };
  return String(payload.text ?? "");
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean).join("\n").trim();
}

function fallbackReviewReason(ocrConfig: OcrConfig, needsFallback: boolean, extractionMethod: "embedded" | "vision", visionError?: string): string | undefined {
  if (!needsFallback) return undefined;
  if (visionError) return `Vision OCR fallback failed: ${visionError}`;
  if (extractionMethod === "vision") return "low text after Vision OCR fallback";
  if (ocrConfig.modelFallbackEnabled) return `needs OCR/model fallback: ${ocrConfig.modelProvider}/${ocrConfig.modelName}`;
  return "needs OCR/model fallback (disabled)";
}

function summarize(text: string): string {
  if (!text) return "No embedded text extracted; OCR/model fallback needed.";
  const collapsed = text.split(/\s+/).join(" ");
  return collapsed.length <= SUMMARY_MAX_CHARS ? collapsed : `${collapsed.slice(0, SUMMARY_MAX_CHARS - 1).trimEnd()}...`;
}

function summarizeWithModel(text: string, ocrConfig: OcrConfig): string {
  if (ocrConfig.modelProvider !== "ollama") return summarize(text);
  try {
    const prompt = [
      "Summarize this physical mail OCR text for a bill-processing review UI.",
      "Return one concise paragraph. Include sender, action required, amount, due date, and uncertainty when present.",
      "",
      text.slice(0, 12000)
    ].join("\n");
    const stdout = execFileSync("ollama", ["run", ocrConfig.modelName, prompt], {
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 2
    });
    const summary = normalizeText(stdout);
    return summary ? summary.slice(0, SUMMARY_MAX_CHARS) : summarize(text);
  } catch {
    return summarize(text);
  }
}
