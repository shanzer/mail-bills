import fs from "node:fs";
import type { DocumentRecord, MailBillsConfig } from "./types.js";
import { Ledger } from "./ledger.js";
import { configPaths } from "./config.js";
import { ensureUnder, textValue } from "./paths.js";

export interface PurgeResult {
  dryRun: boolean;
  purged: Array<{ documentId: string; removedFiles: string[] }>;
  errors: Array<{ document_id: string; message: string }>;
}

/**
 * Permanently delete quarantined files whose quarantined_until has passed and
 * mark the ledger row Purged. Only paths inside the quarantine directory are
 * ever unlinked; anything else recorded on the row is left untouched.
 *
 * Mirrors the manual `purgeDocument` in actions.ts: nulls local_pdf_path and
 * sidecar_path on the ledger row after deletion. Distinguishes itself from the
 * manual action by including `source: "scheduled"` in the event payload.
 */
export function purgeExpiredQuarantine(input: {
  ledger: Ledger;
  config: MailBillsConfig;
  today?: Date;
  dryRun?: boolean;
}): PurgeResult {
  const dryRun = Boolean(input.dryRun);
  const todayIso = (input.today ?? new Date()).toISOString().slice(0, 10);
  const quarantineDir = configPaths(input.config).quarantineDir;
  const result: PurgeResult = { dryRun, purged: [], errors: [] };
  const expired = input.ledger.documentsByStatus("Deleted").filter((document) =>
    textValue(document.retention_decision) === "Quarantined" &&
    Boolean(textValue(document.quarantined_until)) &&
    (textValue(document.quarantined_until) as string) < todayIso
  );
  for (const document of expired) {
    const documentId = textValue(document.document_id);
    try {
      const removedFiles = removeQuarantinedFiles(document, quarantineDir, dryRun);
      if (!dryRun) {
        input.ledger.upsertDocument({
          document_id: documentId,
          retention_decision: "Purged",
          local_pdf_path: null,
          sidecar_path: null
        });
        input.ledger.appendEvent({
          documentId,
          batchId: document.batch_id,
          eventType: "purged",
          payload: {
            source: "scheduled",
            removed_files: removedFiles,
            quarantined_until: document.quarantined_until
          }
        });
      }
      result.purged.push({ documentId, removedFiles });
    } catch (error) {
      result.errors.push({ document_id: documentId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

function removeQuarantinedFiles(document: DocumentRecord, quarantineDir: string, dryRun: boolean): string[] {
  const removed: string[] = [];
  for (const field of ["local_pdf_path", "sidecar_path"] as const) {
    const candidate = textValue(document[field]);
    if (!candidate) continue;
    let resolved: string;
    try {
      resolved = ensureUnder(quarantineDir, candidate);
    } catch {
      continue; // path was never moved under quarantine; do not touch it
    }
    if (!fs.existsSync(resolved)) continue;
    if (!dryRun) fs.unlinkSync(resolved);
    removed.push(resolved);
  }
  return removed;
}
