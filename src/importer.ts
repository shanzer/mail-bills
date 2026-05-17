import fs from "node:fs";
import path from "node:path";
import type { MailBillsConfig } from "./types.js";
import { configPaths } from "./config.js";
import { Ledger } from "./ledger.js";
import { ensureUnder } from "./paths.js";
import { loadSidecar, SidecarValidationError } from "./sidecar.js";
import { sha256 } from "./intake.js";

const SAFE_ID_RE = /^[A-Za-z0-9._-]+$/;

export class UnsafeImportPathError extends Error {}
export class ImportCollisionError extends Error {}
export class TransientImportError extends Error {}

export interface ImportSummary {
  imported: number;
  failed: number;
  skipped: number;
  dryRun: boolean;
}

export function scanImports(input: {
  config: MailBillsConfig;
  dryRun?: boolean;
  stableDelayMs?: number;
}): ImportSummary {
  const dryRun = Boolean(input.dryRun);
  const stableDelayMs = input.stableDelayMs ?? 1000;
  const paths = configPaths(input.config);
  const sources: Array<[string, string]> = [];
  if (input.config.icloudIntakeDir && input.config.icloudErrorDir) {
    sources.push([input.config.icloudIntakeDir, input.config.icloudErrorDir]);
  }
  sources.push([paths.uploadIntakeDir, paths.uploadErrorDir]);
  const uniqueSources = dedupeSources(sources);
  return uniqueSources.reduce<ImportSummary>(
    (total, [intakeDir, errorDir]) => {
      const summary = scanImportDir(input.config, intakeDir, errorDir, dryRun, stableDelayMs);
      return {
        imported: total.imported + summary.imported,
        failed: total.failed + summary.failed,
        skipped: total.skipped + summary.skipped,
        dryRun
      };
    },
    { imported: 0, failed: 0, skipped: 0, dryRun }
  );
}

function scanImportDir(config: MailBillsConfig, intakeDir: string, errorDir: string, dryRun: boolean, stableDelayMs: number): ImportSummary {
  if (!fs.existsSync(intakeDir)) return { imported: 0, failed: 0, skipped: 0, dryRun };
  let imported = 0;
  let failed = 0;
  let skipped = 0;
  const pdfs = fs.readdirSync(intakeDir).filter((name) => name.endsWith(".pdf")).sort();
  for (const pdfName of pdfs) {
    const pdfPath = path.join(intakeDir, pdfName);
    const sidecarPath = pdfPath.replace(/\.pdf$/i, ".json");
    if (!fs.existsSync(sidecarPath)) {
      skipped += 1;
      continue;
    }
    if (!filesAreStable([pdfPath, sidecarPath], stableDelayMs)) {
      skipped += 1;
      continue;
    }
    try {
      importPair(config, pdfPath, sidecarPath, dryRun);
      imported += 1;
    } catch (error) {
      failed += 1;
      if (!dryRun && (error instanceof SidecarValidationError || error instanceof UnsafeImportPathError || error instanceof ImportCollisionError)) {
        moveToError(errorDir, [pdfPath, sidecarPath]);
      }
    }
  }
  return { imported, failed, skipped, dryRun };
}

export function importPair(config: MailBillsConfig, pdfPath: string, sidecarPath: string, dryRun = false): void {
  const sidecar = loadSidecar(sidecarPath);
  const batchSegment = safeSegment(sidecar.batchId, "batchId");
  const documentSegment = safeSegment(sidecar.documentId, "documentId");
  const sourceSha = sha256(pdfPath);
  const sourceSidecarSha = sha256(sidecarPath);
  const paths = configPaths(config);
  const localDir = path.join(paths.importedIntakeDir, batchSegment);
  const localPdfPath = path.join(localDir, `${documentSegment}.pdf`);
  const localSidecarPath = path.join(localDir, `${documentSegment}.json`);
  if (dryRun) return;

  ensureUnder(paths.importedIntakeDir, localPdfPath);
  ensureUnder(paths.importedIntakeDir, localSidecarPath);
  checkDestinationCollision(localPdfPath, localSidecarPath, sourceSha, sourceSidecarSha);
  fs.mkdirSync(localDir, { recursive: true });
  fs.copyFileSync(pdfPath, localPdfPath);
  fs.copyFileSync(sidecarPath, localSidecarPath);

  if (sha256(localPdfPath) !== sourceSha || sha256(localSidecarPath) !== sourceSidecarSha) {
    cleanup(localPdfPath, localSidecarPath);
    throw new TransientImportError(`copied file hash mismatch for ${pdfPath}`);
  }

  const ledger = new Ledger(paths.ledgerPath);
  ledger.initialize();
  const importedAt = new Date().toISOString();
  ledger.upsertBatch({
    batch_id: sidecar.batchId,
    created_at: sidecar.capturedAt,
    source: sidecar.source,
    status: "imported",
    item_count: fs.readdirSync(localDir).filter((name) => name.endsWith(".pdf")).length
  });
  ledger.upsertDocument({
    document_id: sidecar.documentId,
    batch_id: sidecar.batchId,
    source_pdf_path: pdfPath,
    local_pdf_path: localPdfPath,
    sidecar_path: localSidecarPath,
    sha256: sourceSha,
    created_at: sidecar.capturedAt,
    imported_at: importedAt,
    status: "imported",
    category: sidecar.category,
    shortcut_label: sidecar.label,
    retention_decision: "Undecided"
  });
  ledger.appendEvent({
    documentId: sidecar.documentId,
    batchId: sidecar.batchId,
    eventType: "imported",
    payload: { source_pdf_path: pdfPath, local_pdf_path: localPdfPath, sidecar_path: localSidecarPath, sha256: sourceSha }
  });
  fs.unlinkSync(pdfPath);
  fs.unlinkSync(sidecarPath);
}

function safeSegment(value: string, fieldName: string): string {
  if (!value || value === "." || value === ".." || value.includes("/") || value.includes("\\") || !SAFE_ID_RE.test(value)) {
    throw new UnsafeImportPathError(`${fieldName} is not a safe path segment`);
  }
  return value;
}

function checkDestinationCollision(localPdfPath: string, localSidecarPath: string, sourceSha: string, sourceSidecarSha: string): void {
  const pdfExists = fs.existsSync(localPdfPath);
  const sidecarExists = fs.existsSync(localSidecarPath);
  if (!pdfExists && !sidecarExists) return;
  if (!(pdfExists && sidecarExists)) throw new ImportCollisionError(`partial existing import at ${path.dirname(localPdfPath)}`);
  if (sha256(localPdfPath) !== sourceSha || sha256(localSidecarPath) !== sourceSidecarSha) {
    throw new ImportCollisionError(`existing import differs for ${path.basename(localPdfPath, ".pdf")}`);
  }
}

function filesAreStable(paths: string[], delayMs: number): boolean {
  const before = paths.map(signature);
  if (delayMs > 0) {
    const end = Date.now() + delayMs;
    while (Date.now() < end) {}
  }
  const after = paths.map(signature);
  return JSON.stringify(before) === JSON.stringify(after);
}

function signature(filePath: string): [number, number] | undefined {
  try {
    const stat = fs.statSync(filePath);
    return [stat.size, stat.mtimeMs];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function moveToError(errorDir: string, paths: string[]): void {
  fs.mkdirSync(errorDir, { recursive: true });
  for (const source of paths) {
    if (!fs.existsSync(source)) continue;
    fs.renameSync(source, uniqueDestination(path.join(errorDir, path.basename(source))));
  }
}

function uniqueDestination(destination: string): string {
  if (!fs.existsSync(destination)) return destination;
  const parsed = path.parse(destination);
  for (let counter = 1; ; counter += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${counter}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}

function cleanup(...paths: string[]): void {
  for (const filePath of paths) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function dedupeSources(sources: Array<[string, string]>): Array<[string, string]> {
  const seen = new Set<string>();
  return sources.filter(([intake]) => {
    const resolved = path.resolve(intake);
    if (seen.has(resolved)) return false;
    seen.add(resolved);
    return true;
  });
}
