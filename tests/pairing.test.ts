import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import {
  PairingBaseUrlError,
  authorizationHeader,
  buildPairingPayload,
  ensureConfigToken,
  generateToken,
  multipartBody,
  pairingPayloadJson,
  terminalQr,
  validatePairingBaseUrl,
  writeQrPng
} from "../src/pairing.js";
import { tempRoot } from "./helpers.js";

describe("pairing", () => {
  it("generates long URL-safe random tokens", () => {
    const first = generateToken();
    const second = generateToken();

    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(first).not.toBe(second);
    expect(first).not.toContain("/");
    expect(first).not.toContain("+");
  });

  it("builds pairing payload and warns for loopback URLs", () => {
    const root = tempRoot("mail-bills-pairing-");
    const config = loadConfig(writeConfig(root, ["intake_upload:", "  host: 127.0.0.1", "  port: 8765", "  token: test-token"]));

    const payload = buildPairingPayload({ config });

    expect(payload.endpoint).toBe("http://127.0.0.1:8765/api/mail-bills/intake");
    expect(payload.authHeader).toBe("Bearer test-token");
    expect(payload.warnings[0]).toContain("loopback");
  });

  it("uses phone-reachable base URL without loopback warning", () => {
    const root = tempRoot("mail-bills-pairing-");
    const config = loadConfig(writeConfig(root, ["intake_upload:", "  token: test-token"]));

    const payload = buildPairingPayload({ config, baseUrl: "http://yoyodyne:8765/" });

    expect(payload.endpoint).toBe("http://yoyodyne:8765/api/mail-bills/intake");
    expect(payload.warnings).toEqual([]);
  });

  it("writes and reuses or rotates config tokens", () => {
    const root = tempRoot("mail-bills-pairing-");
    const configPath = writeConfig(root, ["intake_upload:", "  host: 0.0.0.0"]);

    const token = ensureConfigToken(configPath);
    const reused = ensureConfigToken(configPath);
    const rotated = ensureConfigToken(configPath, { rotate: true });

    expect(reused).toBe(token);
    expect(rotated).not.toBe(token);
    expect(loadConfig(configPath).intakeUpload.token).toBe(rotated);
  });

  it("renders terminal and PNG QR codes", async () => {
    const root = tempRoot("mail-bills-pairing-");
    const config = loadConfig(writeConfig(root, ["intake_upload:", "  token: test-token"]));
    const payload = buildPairingPayload({ config, baseUrl: "http://yoyodyne:8765" });
    const qrPath = path.join(root, "pairing.png");

    const terminal = await terminalQr(payload);
    const output = await writeQrPng(payload, qrPath);

    expect(JSON.parse(pairingPayloadJson(payload)).endpoint).toBe("http://yoyodyne:8765/api/mail-bills/intake");
    expect(terminal.length).toBeGreaterThan(20);
    expect(output).toBe(qrPath);
    expect(fs.readFileSync(qrPath).subarray(0, 8)).toEqual(Buffer.from("\x89PNG\r\n\x1a\n", "binary"));
  });

  it("normalizes auth headers and builds multipart bodies", () => {
    expect(authorizationHeader("abc")).toBe("Bearer abc");
    expect(authorizationHeader("Bearer abc")).toBe("Bearer abc");

    const { body, contentType } = multipartBody({ pdf: ["doc.pdf", Buffer.from("pdf"), "application/pdf"] });
    expect(contentType).toContain("multipart/form-data");
    expect(body.toString()).toContain('name="pdf"; filename="doc.pdf"');
  });
});

describe("pairing baseUrl validation", () => {
  it.each([
    "http://yoyodyne:8765",
    "http://192.168.1.10:8765",
    "http://10.0.0.5",
    "http://172.20.1.9:8080",
    "http://100.101.102.103:8765",
    "http://mac-mini.local:8765",
    "https://host.tailnet.ts.net",
    "http://127.0.0.1:8765",
    "http://[::1]:8765",
    "http://[fd12:3456::1]:8765"
  ])("accepts private/LAN endpoint %s", (url) => {
    expect(validatePairingBaseUrl(url)).toBe(url);
  });

  it.each([
    "http://evil.example.com",
    "https://attacker.io:8765",
    "http://8.8.8.8",
    "http://172.32.0.1",
    "ftp://192.168.1.1",
    "javascript:alert(1)",
    "not a url",
    "http://fd.example.com",
    "http://fdsomething.example.com",
    "http://fc.somenet.org:8765"
  ])("rejects public/invalid endpoint %s", (url) => {
    expect(() => validatePairingBaseUrl(url)).toThrow(PairingBaseUrlError);
  });
});

function writeConfig(root: string, lines: string[]): string {
  const configPath = path.join(root, "config.yaml");
  fs.writeFileSync(configPath, [`root_dir: ${root}`, ...lines].join("\n"));
  return configPath;
}
