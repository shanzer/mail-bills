import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MailBillsConfig } from "./types.js";
import { ensureUnder, optionalText } from "./paths.js";
import { loadSidecar, SidecarValidationError } from "./sidecar.js";

const SAFE_ID_RE = /^[A-Za-z0-9._-]+$/;

export class IntakeUploadError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
  }
}

export class UploadCollisionError extends IntakeUploadError {
  constructor(message: string) {
    super(message, 409);
  }
}

export interface UploadResult {
  documentId: string;
  pdfPath: string;
  sidecarPath: string;
  created: boolean;
}

export function acceptUpload(input: {
  pdfBytes: Buffer;
  sidecarBytes: Buffer;
  config: MailBillsConfig;
}): UploadResult {
  if (!input.pdfBytes.length) throw new IntakeUploadError("pdf is required");
  if (!input.sidecarBytes.length) throw new IntakeUploadError("sidecar is required");

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(input.sidecarBytes.toString("utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new IntakeUploadError("sidecar must be valid UTF-8 JSON");
  }

  const documentId = optionalText(raw.documentId);
  if (!documentId) throw new IntakeUploadError("documentId is required");
  safeSegment(documentId, "documentId");

  const intakeDir = input.config.intakeUpload.intakeDir;
  fs.mkdirSync(intakeDir, { recursive: true });
  const pdfPath = ensureUnder(intakeDir, path.join(intakeDir, `${documentId}.pdf`));
  const sidecarPath = ensureUnder(intakeDir, path.join(intakeDir, `${documentId}.json`));

  if (fs.existsSync(pdfPath) || fs.existsSync(sidecarPath)) {
    if (
      fs.existsSync(pdfPath) &&
      fs.existsSync(sidecarPath) &&
      Buffer.compare(fs.readFileSync(pdfPath), input.pdfBytes) === 0 &&
      Buffer.compare(fs.readFileSync(sidecarPath), input.sidecarBytes) === 0
    ) {
      return { documentId, pdfPath, sidecarPath, created: false };
    }
    throw new UploadCollisionError(`upload already exists with different content: ${documentId}`);
  }

  const pdfPart = path.join(intakeDir, `${documentId}.pdf.part`);
  const sidecarPart = path.join(intakeDir, `${documentId}.json.part`);
  try {
    writeDurable(pdfPart, input.pdfBytes);
    writeDurable(sidecarPart, input.sidecarBytes);
    loadSidecar(sidecarPart);
    fs.renameSync(pdfPart, pdfPath);
    fs.renameSync(sidecarPart, sidecarPath);
  } catch (error) {
    cleanup(pdfPart, sidecarPart);
    if (error instanceof SidecarValidationError) throw new IntakeUploadError(error.message);
    throw error;
  }

  return { documentId, pdfPath, sidecarPath, created: true };
}

export function authorizeUpload(header: string | undefined, config: MailBillsConfig): void {
  if (!config.intakeUpload.token) throw new IntakeUploadError("intake upload token is not configured", 401);
  if (header !== `Bearer ${config.intakeUpload.token}`) throw new IntakeUploadError("invalid intake upload token", 401);
}

function safeSegment(value: string, fieldName: string): void {
  if (value === "." || value === ".." || value.includes("/") || value.includes("\\") || !SAFE_ID_RE.test(value)) {
    throw new IntakeUploadError(`${fieldName} is not a safe path segment`);
  }
}

function writeDurable(filePath: string, bytes: Buffer): void {
  const fd = fs.openSync(filePath, "w");
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
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

export function sha256(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}
