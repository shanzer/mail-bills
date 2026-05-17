import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { expandUser, optionalText, ownerHomeFromConfigPath } from "./paths.js";
import type { MailBillsConfig } from "./types.js";

const DEFAULT_ROOT = "/Users/buckaroo/.hermes/projects/mail-bills";
type RawConfig = Record<string, any>;

export function loadConfig(configPath = path.resolve("config.yaml")): MailBillsConfig {
  const resolvedConfigPath = path.resolve(configPath);
  const raw = readYaml(resolvedConfigPath);
  const ownerHome = ownerHomeFromConfigPath(resolvedConfigPath);
  const rootDir = expandUser(raw.root_dir ?? DEFAULT_ROOT, ownerHome);
  const upload = raw.intake_upload ?? {};
  const ocr = raw.ocr ?? {};
  const pipelineSchedule = raw.pipeline_schedule ?? {};

  return {
    configPath: resolvedConfigPath,
    rootDir,
    icloudIntakeDir: optionalPath(raw.icloud_intake_dir, ownerHome),
    icloudErrorDir: optionalPath(raw.icloud_error_dir, ownerHome),
    notionDatabaseName: raw.notion_database_name ?? "Mail & Bills",
    pipelineSchedule: {
      enabled: Boolean(pipelineSchedule.enabled ?? true),
      intervalMinutes: Number(pipelineSchedule.interval_minutes ?? 180),
      runOnStartup: Boolean(pipelineSchedule.run_on_startup ?? false),
      stableDelayMs: Number(pipelineSchedule.stable_delay_ms ?? 1000)
    },
    intakeUpload: {
      intakeDir: expandUser(upload.intake_dir ?? path.join(rootDir, "intake", "uploaded"), ownerHome),
      errorDir: expandUser(upload.error_dir ?? path.join(rootDir, "intake", "upload-error"), ownerHome),
      token: stringOrUndefined(upload.token),
      host: String(upload.host ?? "127.0.0.1"),
      port: Number(upload.port ?? 8765)
    },
    ocr: {
      localFirst: Boolean(ocr.local_first ?? true),
      visionFallbackEnabled: Boolean(ocr.vision_fallback_enabled ?? false),
      visionHelperPath: ocr.vision_helper_path ? expandUser(String(ocr.vision_helper_path), ownerHome) : undefined,
      modelFallbackEnabled: Boolean(ocr.model_fallback_enabled ?? false),
      modelProvider: String(ocr.model_provider ?? "configurable"),
      modelName: String(ocr.model_name ?? "configurable"),
      lowTextThreshold: Number(ocr.low_text_threshold ?? 40)
    }
  };
}

export function configPaths(config: MailBillsConfig) {
  return {
    dataDir: path.join(config.rootDir, "data"),
    ledgerPath: path.join(config.rootDir, "data", "ledger.sqlite"),
    rawIntakeDir: path.join(config.rootDir, "intake", "raw"),
    importedIntakeDir: path.join(config.rootDir, "intake", "imported"),
    processingDir: path.join(config.rootDir, "intake", "processing"),
    errorDir: path.join(config.rootDir, "intake", "error"),
    archiveDir: path.join(config.rootDir, "archive"),
    quarantineDir: path.join(config.rootDir, "quarantine"),
    logsDir: path.join(config.rootDir, "logs"),
    batchesDir: path.join(config.rootDir, "data", "batches"),
    uploadIntakeDir: config.intakeUpload.intakeDir,
    uploadErrorDir: config.intakeUpload.errorDir
  };
}

export function readYaml(filePath: string): RawConfig {
  if (!fs.existsSync(filePath)) return {};
  return (YAML.parse(fs.readFileSync(filePath, "utf8")) ?? {}) as RawConfig;
}

function stringOrUndefined(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function optionalPath(value: unknown, home: string): string | undefined {
  const text = optionalText(value);
  return text ? expandUser(text, home) : undefined;
}
