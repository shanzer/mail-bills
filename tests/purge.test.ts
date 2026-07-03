import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Ledger } from "../src/ledger.js";
import { configPaths } from "../src/config.js";
import { purgeExpiredQuarantine } from "../src/purge.js";
import { makeConfig, tempRoot } from "./helpers.js";

function seedQuarantined(root: string, until: string) {
  const config = makeConfig(root);
  const quarantineDir = configPaths(config).quarantineDir;
  const pdfPath = path.join(quarantineDir, "2026-06-01", "doc-q", "doc-q.pdf");
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  fs.writeFileSync(pdfPath, "%PDF quarantined");
  const ledger = new Ledger(configPaths(config).ledgerPath);
  ledger.initialize();
  ledger.upsertDocument({
    document_id: "doc-q", status: "Deleted", retention_decision: "Quarantined",
    quarantined_until: until, local_pdf_path: pdfPath
  });
  return { config, ledger, pdfPath };
}

describe("quarantine purge", () => {
  it("deletes files and finalizes the ledger for expired quarantines", () => {
    const { config, ledger, pdfPath } = seedQuarantined(tempRoot("purge-"), "2026-06-08");
    const result = purgeExpiredQuarantine({ ledger, config, today: new Date("2026-07-01") });
    expect(result.purged).toHaveLength(1);
    expect(fs.existsSync(pdfPath)).toBe(false);
    expect(ledger.getDocument("doc-q")?.retention_decision).toBe("Purged");
    ledger.close();
  });

  it("nulls path columns on the ledger row after deletion", () => {
    const { config, ledger } = seedQuarantined(tempRoot("purge-null-paths-"), "2026-06-08");
    purgeExpiredQuarantine({ ledger, config, today: new Date("2026-07-01") });
    const doc = ledger.getDocument("doc-q");
    expect(doc?.local_pdf_path ?? null).toBeNull();
    expect(doc?.sidecar_path ?? null).toBeNull();
    ledger.close();
  });

  it("leaves unexpired quarantines alone", () => {
    const { config, ledger, pdfPath } = seedQuarantined(tempRoot("purge-"), "2099-01-01");
    const result = purgeExpiredQuarantine({ ledger, config, today: new Date("2026-07-01") });
    expect(result.purged).toHaveLength(0);
    expect(fs.existsSync(pdfPath)).toBe(true);
    ledger.close();
  });

  it("dry-run reports but does not delete or update", () => {
    const { config, ledger, pdfPath } = seedQuarantined(tempRoot("purge-"), "2026-06-08");
    const result = purgeExpiredQuarantine({ ledger, config, today: new Date("2026-07-01"), dryRun: true });
    expect(result.purged).toHaveLength(1);
    expect(fs.existsSync(pdfPath)).toBe(true);
    expect(ledger.getDocument("doc-q")?.retention_decision).toBe("Quarantined");
    ledger.close();
  });

  it("never deletes files outside the quarantine directory", () => {
    const root = tempRoot("purge-escape-");
    const config = makeConfig(root);
    const outsidePath = path.join(root, "important.pdf");
    fs.writeFileSync(outsidePath, "%PDF do not delete");
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    ledger.upsertDocument({
      document_id: "doc-esc", status: "Deleted", retention_decision: "Quarantined",
      quarantined_until: "2026-06-08", local_pdf_path: outsidePath
    });
    const result = purgeExpiredQuarantine({ ledger, config, today: new Date("2026-07-01") });
    // File outside quarantine dir must remain untouched.
    expect(fs.existsSync(outsidePath)).toBe(true);
    // Ledger row must NOT be finalized — retention_decision and path columns intact.
    expect(ledger.getDocument("doc-esc")?.retention_decision).toBe("Quarantined");
    expect(ledger.getDocument("doc-esc")?.local_pdf_path).toBeTruthy();
    // Error recorded for the escaped path; doc-esc must not appear in purged.
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.document_id).toBe("doc-esc");
    expect(result.purged.find((p) => p.documentId === "doc-esc")).toBeUndefined();
    ledger.close();
  });

  it("skips docs with non-ISO quarantined_until and purges docs with ISO timestamp prefix", () => {
    const root = tempRoot("purge-date-fmt-");
    const config = makeConfig(root);
    const quarantineDir = configPaths(config).quarantineDir;
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();

    // "garbage" value — must be skipped entirely (no purge, no error).
    ledger.upsertDocument({
      document_id: "doc-garbage", status: "Deleted", retention_decision: "Quarantined",
      quarantined_until: "garbage"
    });

    // Full ISO 8601 timestamp — slice(0,10) gives "2026-06-08" which is < today, so must purge.
    const pdfPath = path.join(quarantineDir, "2026-06-08", "doc-ts", "doc-ts.pdf");
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    fs.writeFileSync(pdfPath, "%PDF quarantined");
    ledger.upsertDocument({
      document_id: "doc-ts", status: "Deleted", retention_decision: "Quarantined",
      quarantined_until: "2026-06-08T00:00:00.000Z", local_pdf_path: pdfPath
    });

    const result = purgeExpiredQuarantine({ ledger, config, today: new Date("2026-07-01") });

    // "garbage" skipped — still quarantined, absent from both purged and errors.
    expect(ledger.getDocument("doc-garbage")?.retention_decision).toBe("Quarantined");
    expect(result.purged.find((p) => p.documentId === "doc-garbage")).toBeUndefined();
    expect(result.errors.find((e) => e.document_id === "doc-garbage")).toBeUndefined();

    // Full timestamp accepted — file deleted, row finalized as Purged.
    expect(fs.existsSync(pdfPath)).toBe(false);
    expect(ledger.getDocument("doc-ts")?.retention_decision).toBe("Purged");
    expect(result.purged.find((p) => p.documentId === "doc-ts")).toBeDefined();

    ledger.close();
  });
});
