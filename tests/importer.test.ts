import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { configPaths } from "../src/config.js";
import { importPair, scanImports } from "../src/importer.js";
import { Ledger } from "../src/ledger.js";
import { makeConfig, sidecarBytes, tempRoot } from "./helpers.js";

describe("importer", () => {
  it("imports a stable pair into the ledger and removes source files", () => {
    const root = tempRoot("mail-bills-import-");
    const config = makeConfig(root);
    fs.mkdirSync(config.intakeUpload.intakeDir, { recursive: true });
    const pdf = path.join(config.intakeUpload.intakeDir, "doc-1.pdf");
    const sidecar = path.join(config.intakeUpload.intakeDir, "doc-1.json");
    fs.writeFileSync(pdf, "%PDF import\n");
    fs.writeFileSync(sidecar, sidecarBytes());

    importPair(config, pdf, sidecar);

    const ledger = new Ledger(configPaths(config).ledgerPath);
    const document = ledger.getDocument("doc-1");
    expect(document).toMatchObject({ batch_id: "batch-1", status: "imported", category: "BILL" });
    expect(fs.existsSync(pdf)).toBe(false);
    expect(fs.existsSync(sidecar)).toBe(false);
    expect(fs.existsSync(document!.local_pdf_path!)).toBe(true);
  });

  it("scans configured upload intake", () => {
    const root = tempRoot("mail-bills-import-");
    const config = makeConfig(root);
    fs.mkdirSync(config.intakeUpload.intakeDir, { recursive: true });
    fs.writeFileSync(path.join(config.intakeUpload.intakeDir, "doc-1.pdf"), "%PDF import\n");
    fs.writeFileSync(path.join(config.intakeUpload.intakeDir, "doc-1.json"), sidecarBytes());

    const summary = scanImports({ config, dryRun: false, stableDelayMs: 0 });

    expect(summary).toMatchObject({ imported: 1, failed: 0, skipped: 0, dryRun: false });
  });

  it("scans upload intake when iCloud intake is disabled", () => {
    const root = tempRoot("mail-bills-import-");
    const config = makeConfig(root);
    config.icloudIntakeDir = undefined;
    config.icloudErrorDir = undefined;
    fs.mkdirSync(config.intakeUpload.intakeDir, { recursive: true });
    fs.writeFileSync(path.join(config.intakeUpload.intakeDir, "doc-1.pdf"), "%PDF import\n");
    fs.writeFileSync(path.join(config.intakeUpload.intakeDir, "doc-1.json"), sidecarBytes());

    const summary = scanImports({ config, dryRun: false, stableDelayMs: 0 });

    expect(summary).toMatchObject({ imported: 1, failed: 0, skipped: 0, dryRun: false });
  });
});
