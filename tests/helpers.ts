import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { MailBillsConfig } from "../src/types.js";

export function tempRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function makeConfig(root: string, token = "secret-token"): MailBillsConfig {
  return {
    configPath: path.join(root, "config.yaml"),
    rootDir: root,
    icloudIntakeDir: path.join(root, "icloud", "Intake"),
    icloudErrorDir: path.join(root, "icloud", "Error"),
    notionDatabaseName: "Mail Bills Test",
    logging: {
      level: "silent"
    },
    pipelineSchedule: {
      enabled: false,
      intervalMinutes: 180,
      runOnStartup: false,
      stableDelayMs: 1000
    },
    intakeUpload: {
      intakeDir: path.join(root, "intake", "uploaded"),
      errorDir: path.join(root, "intake", "upload-error"),
      token,
      host: "127.0.0.1",
      port: 0
    },
    ocr: {
      localFirst: true,
      visionFallbackEnabled: false,
      modelFallbackEnabled: false,
      modelProvider: "configurable",
      modelName: "configurable",
      lowTextThreshold: 40
    }
  };
}

export function sidecarBytes(documentId = "doc-1"): Buffer {
  return Buffer.from(JSON.stringify({
    batchId: "batch-1",
    documentId,
    capturedAt: "2026-05-14T09:30:00-04:00",
    label: "Bill",
    category: "BILL",
    source: "iphone_app"
  }));
}

export function multipartBody(parts: Record<string, [string, Buffer, string]>): { body: Buffer; contentType: string } {
  const boundary = "mail-bills-test-boundary";
  const chunks: Buffer[] = [];
  for (const [name, [filename, payload, contentType]] of Object.entries(parts)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n`));
    chunks.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
    chunks.push(payload);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
