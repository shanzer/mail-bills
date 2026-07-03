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
    expect(fs.existsSync(outsidePath)).toBe(true);
    expect(result.purged[0]?.removedFiles ?? []).toHaveLength(0);
    ledger.close();
  });
});
