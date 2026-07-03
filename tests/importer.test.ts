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
    ledger.close();
  });

  it("scans configured upload intake", async () => {
    const root = tempRoot("mail-bills-import-");
    const config = makeConfig(root);
    fs.mkdirSync(config.intakeUpload.intakeDir, { recursive: true });
    fs.writeFileSync(path.join(config.intakeUpload.intakeDir, "doc-1.pdf"), "%PDF import\n");
    fs.writeFileSync(path.join(config.intakeUpload.intakeDir, "doc-1.json"), sidecarBytes());

    const summary = await scanImports({ config, dryRun: false, stableDelayMs: 0 });

    expect(summary).toMatchObject({ imported: 1, failed: 0, skipped: 0, dryRun: false });
  });

  it("scans upload intake when iCloud intake is disabled", async () => {
    const root = tempRoot("mail-bills-import-");
    const config = makeConfig(root);
    config.icloudIntakeDir = undefined;
    config.icloudErrorDir = undefined;
    fs.mkdirSync(config.intakeUpload.intakeDir, { recursive: true });
    fs.writeFileSync(path.join(config.intakeUpload.intakeDir, "doc-1.pdf"), "%PDF import\n");
    fs.writeFileSync(path.join(config.intakeUpload.intakeDir, "doc-1.json"), sidecarBytes());

    const summary = await scanImports({ config, dryRun: false, stableDelayMs: 0 });

    expect(summary).toMatchObject({ imported: 1, failed: 0, skipped: 0, dryRun: false });
  });

  it("writes through a provided shared ledger", () => {
    const root = tempRoot("mail-bills-import-");
    const config = makeConfig(root);
    fs.mkdirSync(config.intakeUpload.intakeDir, { recursive: true });
    const pdf = path.join(config.intakeUpload.intakeDir, "doc-1.pdf");
    const sidecar = path.join(config.intakeUpload.intakeDir, "doc-1.json");
    fs.writeFileSync(pdf, "%PDF import\n");
    fs.writeFileSync(sidecar, sidecarBytes());

    const sharedLedger = new Ledger(configPaths(config).ledgerPath);
    sharedLedger.initialize();
    try {
      importPair(config, pdf, sidecar, false, sharedLedger);

      const document = sharedLedger.getDocument("doc-1");
      expect(document).toMatchObject({ batch_id: "batch-1", status: "imported", category: "BILL" });
      expect(sharedLedger.getBatch("batch-1")).toBeDefined();
    } finally {
      sharedLedger.close();
    }
  });

  it("rolls back batch and document when the event write fails", () => {
    const root = tempRoot("mail-bills-import-");
    const config = makeConfig(root);
    fs.mkdirSync(config.intakeUpload.intakeDir, { recursive: true });
    const pdf = path.join(config.intakeUpload.intakeDir, "doc-1.pdf");
    const sidecar = path.join(config.intakeUpload.intakeDir, "doc-1.json");
    fs.writeFileSync(pdf, "%PDF import\n");
    fs.writeFileSync(sidecar, sidecarBytes());

    const sharedLedger = new Ledger(configPaths(config).ledgerPath);
    sharedLedger.initialize();
    // Sabotage appendEvent so the transaction is forced to roll back.
    (sharedLedger as unknown as Record<string, unknown>)["appendEvent"] = () => {
      throw new Error("event write failed");
    };
    try {
      expect(() => importPair(config, pdf, sidecar, false, sharedLedger)).toThrow("event write failed");

      // Transaction must have rolled back — neither row should exist.
      expect(sharedLedger.getBatch("batch-1")).toBeUndefined();
      expect(sharedLedger.getDocument("doc-1")).toBeUndefined();

      // Source files must still exist — the post-transaction unlink was never reached.
      expect(fs.existsSync(pdf)).toBe(true);
      expect(fs.existsSync(sidecar)).toBe(true);
    } finally {
      sharedLedger.close();
    }
  });
});
