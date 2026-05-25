import { loadConfig } from "./config.js";
import { bootstrapDirectories } from "./bootstrap.js";
import { scanImports } from "./importer.js";
import { Ledger } from "./ledger.js";
import { configPaths } from "./config.js";
import { processBatch, processPending } from "./processor.js";
import { startApi } from "./api.js";
import { needsReviewDocuments, resolveReview } from "./review.js";
import { applyDocumentAction } from "./actions.js";
import { buildPairingPayload, ensureConfigToken, pairingPayloadJson, postSampleUpload, terminalQr, writeQrPng } from "./pairing.js";

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const configPath = option(rest, "--config") ?? "../mail-bills/config.yaml";
  const config = loadConfig(configPath);

  if (!command || command === "help") {
    printHelp();
    return 0;
  }
  if (command === "api") {
    if (option(rest, "--host")) config.intakeUpload.host = option(rest, "--host")!;
    if (option(rest, "--port")) config.intakeUpload.port = Number(option(rest, "--port"));
    if (option(rest, "--log-level")) config.logging.level = option(rest, "--log-level") as typeof config.logging.level;
    const { url } = await startApi(config);
    console.log(`Mail Bills API listening at ${url}`);
    return await new Promise(() => undefined);
  }
  if (command === "pairing") {
    const token = rest.includes("--write-token") || rest.includes("--rotate-token")
      ? ensureConfigToken(configPath, { rotate: rest.includes("--rotate-token") })
      : undefined;
    const refreshedConfig = token ? loadConfig(configPath) : config;
    const payload = buildPairingPayload({ config: refreshedConfig, baseUrl: option(rest, "--base-url"), token });
    console.log(pairingPayloadJson(payload));
    if (rest.includes("--qr")) {
      console.log();
      console.log(await terminalQr(payload));
    }
    const qrPng = option(rest, "--qr-png");
    if (qrPng) {
      const outputPath = await writeQrPng(payload, qrPng);
      console.log(`QR PNG: ${outputPath}`);
    }
    if (rest.includes("--test-upload")) {
      const result = await postSampleUpload(payload);
      console.log(`Test upload HTTP ${result.status}: ${result.body}`);
      return result.status >= 200 && result.status < 300 ? 0 : 1;
    }
    return 0;
  }
  if (command === "bootstrap") {
    const dryRun = rest.includes("--dry-run");
    for (const directory of bootstrapDirectories(config, { dryRun })) {
      console.log(`${dryRun ? "would create/check" : "created/checked"}: ${directory}`);
    }
    return 0;
  }
  if (command === "import") {
    const result = scanImports({ config, dryRun: rest.includes("--dry-run"), stableDelayMs: Number(option(rest, "--stable-delay-ms") ?? 1000) });
    console.log(`Import scan (${result.dryRun ? "dry-run" : "run"}): imported=${result.imported} failed=${result.failed} skipped=${result.skipped}`);
    return result.failed ? 1 : 0;
  }
  if (command === "process-pending") {
    const result = await processPending({ config, dryRun: rest.includes("--dry-run"), stableDelayMs: Number(option(rest, "--stable-delay-ms") ?? 1000) });
    const processed = result.batches.reduce((total, batch) => total + batch.processed, 0);
    console.log(`Processor process-pending (${result.dryRun ? "dry-run" : "run"}): batches=${result.batches.length} documents=${processed} errors=${result.errors.length}`);
    return result.errors.length ? 1 : 0;
  }
  if (command === "process-batch") {
    const batchId = rest.find((arg) => !arg.startsWith("--"));
    if (!batchId) throw new Error("batch id is required");
    const result = await processBatch({ batchId, config, dryRun: rest.includes("--dry-run") });
    console.log(`Processor process-batch (${result.dryRun ? "dry-run" : "run"}): batch_id=${result.batchId} processed=${result.processed} errors=${result.errors.length}`);
    return result.errors.length ? 1 : 0;
  }
  if (command === "review") {
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    if (rest[0] === "list") {
      const docs = needsReviewDocuments(ledger);
      if (!docs.length) console.log("No documents need review.");
      for (const document of docs) console.log(`${document.document_id} - ${document.vendor ?? "Unknown vendor"} - ${document.review_reason ?? "review required"}`);
      return 0;
    }
    if (rest[0] === "resolve") {
      const documentId = rest[1];
      const decision = option(rest, "--decision");
      if (!documentId || !decision) throw new Error("review resolve requires document id and --decision");
      const result = await resolveReview({ documentId, decision, ledger, config, dryRun: rest.includes("--dry-run"), dueDate: option(rest, "--due-date") });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
  }
  if (command === "action") {
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    const documentId = rest[0];
    const action = option(rest, "--action");
    if (!documentId || !action) throw new Error("action requires document id and --action");
    const result = await applyDocumentAction({ documentId, action, ledger, config, dryRun: rest.includes("--dry-run"), dueDate: option(rest, "--due-date") });
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  throw new Error(`unknown command: ${command}`);
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function printHelp(): void {
  console.log(`Usage: npm run mail-bills -- <command> [options]

Commands:
  api --config <path> [--host <host>] [--port <port>] [--log-level <silent|fatal|error|warn|info|debug|trace>]
  bootstrap [--dry-run]
  import [--dry-run] [--stable-delay-ms <ms>]
  process-pending [--dry-run]
  process-batch <batchId> [--dry-run]
  review list
  review resolve <documentId> --decision <decision>
  action <documentId> --action <action>
  pairing [--write-token|--rotate-token] [--base-url <url>] [--qr] [--qr-png <path>] [--test-upload]
`);
}

main(process.argv.slice(2)).then((code) => {
  if (Number.isFinite(code)) process.exitCode = code;
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
