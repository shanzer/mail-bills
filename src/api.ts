import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { CATEGORY_VALUES, type MailBillsConfig } from "./types.js";
import { configPaths } from "./config.js";
import { Ledger } from "./ledger.js";
import { acceptUpload, authorizeUpload, IntakeUploadError, timingSafeBearerMatch } from "./intake.js";
import { ensureUnder, textValue } from "./paths.js";
import { processBatch, processPending } from "./processor.js";
import { applyDocumentAction } from "./actions.js";
import { bootstrapDirectories } from "./bootstrap.js";
import { uiAssets } from "./ui.js";
import { PipelineScheduler } from "./scheduler.js";
import { buildPairingPayload, ensureConfigToken, svgQr, validatePairingBaseUrl } from "./pairing.js";
import { FailedAuthLimiter } from "./rate-limit.js";

/** Per-file multipart cap; the whole-request cap must fit both files + form overhead. */
export const UPLOAD_FILE_LIMIT = 50 * 1024 * 1024;
export const UPLOAD_BODY_LIMIT = 2 * UPLOAD_FILE_LIMIT + 5 * 1024 * 1024;

export function createApi(config: MailBillsConfig): FastifyInstance {
  const app = Fastify({ logger: fastifyLogger(config), bodyLimit: UPLOAD_BODY_LIMIT });
  app.register(multipart, { limits: { fileSize: UPLOAD_FILE_LIMIT, files: 2 } });
  const scheduler = new PipelineScheduler(config, app.log);
  scheduler.start();
  app.decorate("pipelineScheduler", scheduler);
  const ledger = new Ledger(configPaths(config).ledgerPath);
  ledger.initialize();
  app.addHook("onClose", async () => {
    scheduler.stop();
    ledger.close();
  });

  const intakeLimiter = new FailedAuthLimiter();
  const adminLimiter = new FailedAuthLimiter();

  const ui = uiAssets();
  app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(ui.html));

  app.get("/ui/styles.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(ui.css));

  app.get("/ui/app.js", async (_request, reply) => reply.type("application/javascript; charset=utf-8").send(ui.js));

  app.get("/health", async () => ({
    ok: true,
    service: "mail-bills",
    uploadPath: "/api/mail-bills/intake",
    ledgerPath: configPaths(config).ledgerPath
  }));

  app.post("/api/mail-bills/intake", async (request, reply) => {
    if (intakeLimiter.isBlocked(request.ip)) {
      return reply.code(429).send({ ok: false, error: "too many failed auth attempts; try again later" });
    }
    try {
      authorizeUpload(request.headers.authorization, config);
      intakeLimiter.recordSuccess(request.ip);
      const parts = request.parts();
      let pdfBytes: Buffer | undefined;
      let sidecarBytes: Buffer | undefined;
      for await (const part of parts) {
        if (part.type !== "file") continue;
        const bytes = await part.toBuffer();
        if (part.fieldname === "pdf") pdfBytes = bytes;
        if (part.fieldname === "sidecar") sidecarBytes = bytes;
      }
      const result = acceptUpload({ pdfBytes: pdfBytes ?? Buffer.alloc(0), sidecarBytes: sidecarBytes ?? Buffer.alloc(0), config });
      return reply.code(result.created ? 201 : 200).send({ ok: true, created: result.created, documentId: result.documentId });
    } catch (error) {
      if (error instanceof IntakeUploadError) {
        if (error.statusCode === 401) intakeLimiter.recordFailure(request.ip);
        return reply.code(error.statusCode).send({ ok: false, error: error.message });
      }
      throw error;
    }
  });

  app.post("/api/documents/import-pdf", { preHandler: requireAdmin(config, adminLimiter) }, async (request, reply) => {
    try {
      const parts = request.parts();
      let pdfBytes: Buffer | undefined;
      let pdfFilename: string | undefined;
      let pdfMimetype: string | undefined;
      const fields: Record<string, unknown> = {};
      for await (const part of parts) {
        if (part.type === "file") {
          if (part.fieldname !== "pdf") continue;
          pdfFilename = part.filename;
          pdfMimetype = part.mimetype;
          pdfBytes = await part.toBuffer();
        } else {
          fields[part.fieldname] = part.value;
        }
      }
      if (!pdfBytes?.length) throw new IntakeUploadError("pdf is required");
      if (!isPdfUpload(pdfFilename, pdfMimetype)) throw new IntakeUploadError("pdf must be an application/pdf file");
      const category = validateBrowserImportCategory(fields.category);
      const label = trimText(fields.label, 100) ?? category;
      const note = trimText(fields.note, 500);
      const { sidecar, sidecarBytes } = browserImportSidecar({ category, label, note });
      const result = acceptUpload({ pdfBytes, sidecarBytes, config });
      return reply.code(result.created ? 201 : 200).send({
        ok: true,
        created: result.created,
        source: "browser_ui",
        batchId: sidecar.batchId,
        documentId: result.documentId
      });
    } catch (error) {
      if (error instanceof IntakeUploadError) return reply.code(error.statusCode).send({ ok: false, error: error.message });
      throw error;
    }
  });

  app.post("/api/bootstrap", { preHandler: requireAdmin(config, adminLimiter) }, async (request, reply) => {
    const dryRun = parseBoolean((request.query as any).dryRun);
    return reply.send({ ok: true, dryRun, directories: bootstrapDirectories(config, { dryRun }) });
  });

  app.get("/api/documents", { preHandler: requireAdmin(config, adminLimiter) }, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const limit = clampInt(query.limit, { min: 1, max: 500, fallback: 200 });
    const offset = clampInt(query.offset, { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
    return {
      ok: true,
      documents: ledger.listDocuments({
        status: query.status,
        q: query.q,
        limit,
        offset
      }),
      total: ledger.countDocuments({ status: query.status, q: query.q }),
      limit,
      offset
    };
  });

  app.get("/api/documents/:documentId", { preHandler: requireAdmin(config, adminLimiter) }, async (request, reply) => {
    const document = ledger.getDocument((request.params as any).documentId);
    if (!document) return reply.code(404).send({ ok: false, error: "document not found" });
    return { ok: true, document };
  });

  app.get("/api/documents/:documentId/pdf", { preHandler: requireAdmin(config, adminLimiter) }, async (request, reply) => {
    const pdfPath = pdfPathForDocument(config, ledger, (request.params as any).documentId);
    return reply.type("application/pdf").send(fs.createReadStream(pdfPath));
  });

  app.post("/api/documents/:documentId/actions", { preHandler: requireAdmin(config, adminLimiter) }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, any>;
    const result = await applyDocumentAction({
      documentId: (request.params as any).documentId,
      action: String(body.action ?? ""),
      ledger,
      config,
      dryRun: parseBoolean(body.dryRun),
      dueDate: body.dueDate ?? undefined,
      clearDueDate: parseBoolean(body.clearDueDate),
      deleteChoice: body.deleteChoice,
      category: body.category ?? undefined,
      shortcutLabel: body.shortcutLabel ?? undefined,
      vendor: body.vendor ?? undefined,
      notes: body.notes ?? undefined
    });
    return reply.code(result.ok ? 200 : 400).send(result);
  });

  app.post("/api/pipeline/process-pending", { preHandler: requireAdmin(config, adminLimiter) }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, any>;
    const dryRun = body.dryRun !== false;
    let result;
    try {
      result = dryRun
        ? await scheduler.runExclusive(() => processPending({ config, ledger, dryRun: true, stableDelayMs: Number(body.stableDelayMs ?? 1000) }))
        : await scheduler.runNow();
    } catch (error) {
      return reply.code(500).send({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        schedule: scheduler.status()
      });
    }
    if (!result) return reply.code(409).send({ ok: false, error: "pipeline is already running", schedule: scheduler.status() });
    return reply.code(result.errors.length ? 207 : 200).send({ ok: result.errors.length === 0, ...result });
  });

  app.post("/api/pipeline/batches/:batchId/process", { preHandler: requireAdmin(config, adminLimiter) }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, any>;
    const result = await scheduler.runExclusive(() =>
      processBatch({ batchId: (request.params as any).batchId, config, ledger, dryRun: body.dryRun !== false })
    );
    if (!result) return reply.code(409).send({ ok: false, error: "pipeline is already running", schedule: scheduler.status() });
    return reply.code(result.errors.length ? 207 : 200).send({ ok: result.errors.length === 0, ...result });
  });

  app.get("/api/pipeline/schedule", { preHandler: requireAdmin(config, adminLimiter) }, async () => ({
    ok: true,
    schedule: scheduler.status()
  }));

  app.get("/api/pairing/qr", { preHandler: requireAdmin(config, adminLimiter) }, async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const payload = buildPairingPayload({ config, baseUrl: query.baseUrl });
      return { ok: true, payload, qrSvg: await svgQr(payload) };
    } catch (error) {
      return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/pairing/rotate-token", { preHandler: requireAdmin(config, adminLimiter) }, async (request, reply) => {
    if (!config.configPath) return reply.code(400).send({ ok: false, error: "configPath is required to rotate the intake token" });
    const body = (request.body ?? {}) as Record<string, any>;
    try {
      if (body.baseUrl) validatePairingBaseUrl(String(body.baseUrl));
      const token = ensureConfigToken(config.configPath, { rotate: true });
      config.intakeUpload.token = token;
      const payload = buildPairingPayload({ config, baseUrl: body.baseUrl });
      return { ok: true, payload, qrSvg: await svgQr(payload) };
    } catch (error) {
      return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/status", { preHandler: requireAdmin(config, adminLimiter) }, async () => {
    const paths = configPaths(config);
    return {
      ok: true,
      receiver: {
        host: config.intakeUpload.host,
        port: config.intakeUpload.port,
        tokenConfigured: Boolean(config.intakeUpload.token)
      },
      uploadIntake: countPairs(paths.uploadIntakeDir),
      importablePairs: countPairs(config.icloudIntakeDir) + countPairs(paths.uploadIntakeDir),
      ledgerExists: fs.existsSync(paths.ledgerPath),
      pipelineSchedule: scheduler.status(),
      paths
    };
  });

  return app;
}

export async function startApi(config: MailBillsConfig): Promise<{ app: FastifyInstance; url: string }> {
  const app = createApi(config);
  app.log.info({
    host: config.intakeUpload.host,
    port: config.intakeUpload.port,
    configPath: config.configPath,
    rootDir: config.rootDir,
    ledgerPath: configPaths(config).ledgerPath
  }, "starting Mail Bills API");
  const address = await app.listen({ host: config.intakeUpload.host, port: config.intakeUpload.port });
  app.log.info({ address }, "Mail Bills API listening");
  return { app, url: address };
}

function fastifyLogger(config: MailBillsConfig): false | { level: string } {
  return config.logging.level === "silent" ? false : { level: config.logging.level };
}

function pdfPathForDocument(config: MailBillsConfig, ledger: Ledger, documentId: string): string {
  const document = ledger.getDocument(documentId);
  if (!document) throw Object.assign(new Error("document not found"), { statusCode: 404 });
  const rawPath = textValue(document.local_pdf_path);
  if (!rawPath) throw Object.assign(new Error("document has no local_pdf_path"), { statusCode: 404 });
  const candidate = path.isAbsolute(rawPath) ? rawPath : path.join(config.rootDir, rawPath);
  const resolved = ensureUnder(config.rootDir, candidate);
  if (!fs.existsSync(resolved)) throw Object.assign(new Error("PDF file is missing"), { statusCode: 404 });
  return resolved;
}

function countPairs(directory: string | undefined): number {
  if (!directory) return 0;
  try {
    if (!fs.existsSync(directory)) return 0;
    return fs.readdirSync(directory).filter((name) => name.endsWith(".pdf") && fs.existsSync(path.join(directory, name.replace(/\.pdf$/i, ".json")))).length;
  } catch {
    return 0;
  }
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null) return false;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function validateBrowserImportCategory(value: unknown): string {
  const category = trimText(value) ?? "UNKNOWN";
  if (!CATEGORY_VALUES.includes(category as any)) {
    throw new IntakeUploadError(`category must be one of ${CATEGORY_VALUES.join(", ")}`);
  }
  return category;
}

function browserImportSidecar(input: { category: string; label?: string; note?: string }): { sidecar: Record<string, unknown>; sidecarBytes: Buffer } {
  const now = new Date();
  const sidecar: Record<string, unknown> = {
    batchId: browserBatchId(now),
    documentId: browserDocumentId(now),
    capturedAt: now.toISOString(),
    label: input.label ?? input.category,
    category: input.category,
    source: "browser_ui"
  };
  if (input.note) sidecar.note = input.note;
  return { sidecar, sidecarBytes: Buffer.from(JSON.stringify(sidecar)) };
}

function browserBatchId(date: Date): string {
  return `browser-${compactTimestamp(date).slice(0, 15)}`;
}

function browserDocumentId(date: Date): string {
  return `ui-${compactTimestamp(date)}-${crypto.randomBytes(4).toString("hex")}`;
}

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/\D/g, "").slice(0, 14);
}

function trimText(value: unknown, maxLength?: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return maxLength === undefined ? text : text.slice(0, maxLength);
}

function isPdfUpload(filename?: string, mimetype?: string): boolean {
  return Boolean(filename?.toLowerCase().endsWith(".pdf") && mimetype === "application/pdf");
}

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function isLoopback(ip: string | undefined): boolean {
  return Boolean(ip && LOOPBACK_IPS.has(ip));
}

/**
 * Browser CSRF guard: forms/fetch always send Origin on cross-origin POSTs.
 * Requests without an Origin header (curl, CLI) pass — they are not CSRF-able.
 */
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Authorization decision for management endpoints. Pure for testability.
 *
 * - If an admin token is configured, the request must present a constant-time
 *   matching `Bearer <token>`.
 * - With no admin token configured, only loopback callers are allowed; remote
 *   (LAN) callers are rejected so a token-less install is not wide open.
 */
export function authorizeAdmin(input: { header?: string; ip: string | undefined; adminToken?: string }): { ok: true } | { ok: false; statusCode: number; error: string } {
  const { header, ip, adminToken } = input;
  if (adminToken) {
    return timingSafeBearerMatch(header, adminToken)
      ? { ok: true }
      : { ok: false, statusCode: 401, error: "invalid admin token" };
  }
  if (isLoopback(ip)) return { ok: true };
  return { ok: false, statusCode: 401, error: "admin token not configured; set api.admin_token to allow remote access" };
}

function clampInt(value: unknown, options: { min: number; max: number; fallback: number }): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed)) return options.fallback;
  return Math.min(Math.max(parsed, options.min), options.max);
}

function requireAdmin(config: MailBillsConfig, limiter: FailedAuthLimiter) {
  return async (
    request: { method: string; headers: { authorization?: string; origin?: string; host?: string }; ip?: string },
    reply: { code(c: number): { send(body: unknown): void }; send(body: unknown): void }
  ) => {
    const ip = request.ip ?? "";
    if (limiter.isBlocked(ip)) {
      reply.code(429).send({ ok: false, error: "too many failed auth attempts; try again later" });
      return;
    }
    if (request.method !== "GET" && !isSameOrigin(request.headers.origin, request.headers.host)) {
      reply.code(403).send({ ok: false, error: "cross-origin request rejected" });
      return;
    }
    const decision = authorizeAdmin({ header: request.headers.authorization, ip: request.ip, adminToken: config.api?.adminToken });
    if (!decision.ok) {
      limiter.recordFailure(ip);
      reply.code(decision.statusCode).send({ ok: false, error: decision.error });
      return;
    }
    limiter.recordSuccess(ip);
  };
}
