import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import * as QRCode from "qrcode";
import type { MailBillsConfig } from "./types.js";
import { readYaml } from "./config.js";

export const PAIRING_PATH = "/api/mail-bills/intake";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export interface PairingPayload {
  endpoint: string;
  token: string;
  authHeader: string;
  warnings: string[];
}

export function generateToken(byteCount = 32): string {
  return crypto.randomBytes(byteCount).toString("base64url");
}

export function buildPairingPayload(input: {
  config: MailBillsConfig;
  baseUrl?: string;
  token?: string;
}): PairingPayload {
  const token = input.token ?? input.config.intakeUpload.token;
  if (!token) throw new Error("No intake upload token configured. Use --write-token to generate and save one.");
  const endpoint = endpointFor(input.config, input.baseUrl);
  return {
    endpoint,
    token,
    authHeader: authorizationHeader(token),
    warnings: warningsForEndpoint(endpoint)
  };
}

export function pairingPayloadJson(payload: PairingPayload): string {
  return JSON.stringify(payload, Object.keys(payload).sort(), 2);
}

export async function terminalQr(payload: PairingPayload): Promise<string> {
  return QRCode.toString(pairingPayloadJson(payload), {
    type: "terminal",
    small: true,
    errorCorrectionLevel: "M",
    margin: 1
  });
}

export async function svgQr(payload: PairingPayload): Promise<string> {
  return QRCode.toString(pairingPayloadJson(payload), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320
  });
}

export async function writeQrPng(payload: PairingPayload, outputPath: string): Promise<string> {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  await QRCode.toFile(resolved, pairingPayloadJson(payload), {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512
  });
  return resolved;
}

export function ensureConfigToken(configPath: string, options: { rotate?: boolean } = {}): string {
  const resolved = path.resolve(configPath);
  const raw = readYaml(resolved);
  const upload = raw.intake_upload ?? {};
  raw.intake_upload = upload;
  const existing = typeof upload.token === "string" && upload.token.trim() ? upload.token : undefined;
  if (existing && !options.rotate) return existing;
  const token = generateToken();
  upload.token = token;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, YAML.stringify(raw, { sortMapEntries: false }));
  return token;
}

export async function postSampleUpload(payload: PairingPayload): Promise<{ status: number; body: string }> {
  const documentId = `pairing-test-${crypto.randomBytes(6).toString("hex")}`;
  const sidecar = {
    batchId: "pairing-test",
    documentId,
    capturedAt: new Date().toISOString(),
    label: "Unknown",
    category: "UNKNOWN",
    note: "Mac-side pairing upload test",
    source: "pairing_test"
  };
  const { body, contentType } = multipartBody({
    pdf: [`${documentId}.pdf`, Buffer.from("%PDF-1.4\n% Mail Bills pairing test\n"), "application/pdf"],
    sidecar: [`${documentId}.json`, Buffer.from(JSON.stringify(sidecar)), "application/json"]
  });
  const response = await fetch(payload.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorizationHeader(payload.token),
      "Content-Type": contentType,
      "Content-Length": String(body.length)
    },
    body: new Uint8Array(body)
  });
  return { status: response.status, body: await response.text() };
}

export function authorizationHeader(token: string): string {
  const trimmed = token.trim();
  return trimmed.toLowerCase().startsWith("bearer ") ? trimmed : `Bearer ${trimmed}`;
}

export function multipartBody(parts: Record<string, [string, Buffer, string]>): { body: Buffer; contentType: string } {
  const boundary = `MailBillsPairingBoundary${crypto.randomBytes(16).toString("hex")}`;
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

function endpointFor(config: MailBillsConfig, baseUrl?: string): string {
  if (baseUrl) return `${baseUrl.replace(/\/+$/, "")}${PAIRING_PATH}`;
  let host = config.intakeUpload.host;
  if (host.includes(":") && !host.startsWith("[")) host = `[${host}]`;
  return `http://${host}:${config.intakeUpload.port}${PAIRING_PATH}`;
}

function warningsForEndpoint(endpoint: string): string[] {
  const hostPort = endpoint.split("//", 2).at(1)?.split("/", 1).at(0) ?? "";
  const host = hostPort.replace(/^\[/, "").replace(/\].*$/, "").split(":").at(0) ?? "";
  if (LOOPBACK_HOSTS.has(host)) {
    return [
      "Endpoint uses a loopback host. That works on the Mac only; use the Mac LAN IP, .local hostname, or Tailscale address for the iPhone."
    ];
  }
  return [];
}
