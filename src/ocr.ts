import { execFile, type ExecFileException } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";
import type { OcrConfig } from "./types.js";
import { Ledger } from "./ledger.js";

const VISION_HELPER_TIMEOUT_MS = 60_000;
const OLLAMA_TIMEOUT_MS = 120_000;

interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Promise wrapper around `execFile` that always resolves to `{ stdout, stderr }`.
 * We avoid `util.promisify` so the result shape is stable and easy to mock —
 * Node's built-in `execFile[Symbol.promisify.custom]` is only present on the
 * real function, not on test doubles.
 */
function runExecFile(file: string, args: string[], options: { encoding: string; timeout: number; maxBuffer: number }): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error: ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => {
      if (error) reject(error);
      else resolve({ stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

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
  visionOcrRunner?: (pdfPath: string, ocrConfig: OcrConfig) => string | Promise<string>;
}): Promise<OcrResult> {
  const bytes = fs.readFileSync(input.pdfPath);
  const parser = new PDFParse({ data: bytes });
  let parsed: { text?: string; total?: number };
  try {
    parsed = await parser.getText();
  } finally {
    await parser.destroy();
  }
  let text = normalizeText(parsed.text ?? "");
  let pageCount = Number(parsed.total ?? 0);
  let extractionMethod: "embedded" | "vision" = "embedded";
  let needsFallback = text.length < input.ocrConfig.lowTextThreshold;

  if (needsFallback && input.ocrConfig.visionFallbackEnabled) {
    const runner = input.visionOcrRunner ?? runVisionOcr;
    const visionText = normalizeText(await runner(input.pdfPath, input.ocrConfig));
    if (visionText.length > text.length) {
      text = visionText;
      extractionMethod = "vision";
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
    reviewReason: fallbackReviewReason(input.ocrConfig, needsFallback, extractionMethod),
    summary: modelSummaryEnabled ? await summarizeWithModel(text, input.ocrConfig) : summarize(text),
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

export async function runVisionOcr(pdfPath: string, ocrConfig: OcrConfig): Promise<string> {
  const helperPath = ocrConfig.visionHelperPath ?? defaultVisionHelperPath();
  let stdout: string;
  try {
    const result = await runExecFile(helperPath, [pdfPath], {
      encoding: "utf8",
      timeout: VISION_HELPER_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024
    });
    stdout = result.stdout;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EACCES") {
      throw new Error(`Vision OCR helper is not executable: ${helperPath}. Compile utils/vision_ocr.swift to dist/utils/vision_ocr or remove ocr.vision_helper_path to use the default helper path.`);
    }
    throw error;
  }
  try {
    const payload = JSON.parse(stdout) as { text?: string };
    return String(payload.text ?? "");
  } catch {
    return "";
  }
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean).join("\n").trim();
}

function fallbackReviewReason(ocrConfig: OcrConfig, needsFallback: boolean, extractionMethod: "embedded" | "vision"): string | undefined {
  if (!needsFallback) return undefined;
  if (extractionMethod === "vision") return "low text after Vision OCR fallback";
  if (ocrConfig.modelFallbackEnabled) return `needs OCR/model fallback: ${ocrConfig.modelProvider}/${ocrConfig.modelName}`;
  return "needs OCR/model fallback (disabled)";
}

function summarize(text: string): string {
  if (!text) return "No embedded text extracted; OCR/model fallback needed.";
  const collapsed = text.split(/\s+/).join(" ");
  return collapsed.length <= SUMMARY_MAX_CHARS ? collapsed : `${collapsed.slice(0, SUMMARY_MAX_CHARS - 1).trimEnd()}...`;
}

async function summarizeWithModel(text: string, ocrConfig: OcrConfig): Promise<string> {
  if (ocrConfig.modelProvider !== "ollama") return summarize(text);
  try {
    const prompt = [
      "Summarize this physical mail OCR text for a bill-processing review UI.",
      "Return one concise paragraph. Include sender, action required, amount, due date, and uncertainty when present.",
      "",
      text.slice(0, 12000)
    ].join("\n");
    const result = await runExecFile("ollama", ["run", ocrConfig.modelName, prompt], {
      encoding: "utf8",
      timeout: OLLAMA_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024
    });
    const summary = normalizeText(result.stdout);
    return summary ? summary.slice(0, SUMMARY_MAX_CHARS) : summarize(text);
  } catch {
    return summarize(text);
  }
}
