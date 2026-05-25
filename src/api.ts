import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { MailBillsConfig } from "./types.js";
import { configPaths } from "./config.js";
import { Ledger } from "./ledger.js";
import { acceptUpload, authorizeUpload, IntakeUploadError } from "./intake.js";
import { ensureUnder, textValue } from "./paths.js";
import { processBatch, processPending } from "./processor.js";
import { applyDocumentAction } from "./actions.js";
import { bootstrapDirectories } from "./bootstrap.js";
import { uiCss, uiHtml, uiJs } from "./ui.js";
import { PipelineScheduler } from "./scheduler.js";
import { buildPairingPayload, ensureConfigToken, svgQr } from "./pairing.js";

export function createApi(config: MailBillsConfig): FastifyInstance {
  const app = Fastify({ logger: fastifyLogger(config), bodyLimit: 50 * 1024 * 1024 });
  app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024, files: 2 } });
  const scheduler = new PipelineScheduler(config, app.log);
  scheduler.start();
  app.addHook("onClose", async () => scheduler.stop());

  app.get("/", async (_request, reply) => reply.type("text/html; charset=utf-8").send(uiHtml));

  app.get("/ui/styles.css", async (_request, reply) => reply.type("text/css; charset=utf-8").send(uiCss));

  app.get("/ui/app.js", async (_request, reply) => reply.type("application/javascript; charset=utf-8").send(uiJs));

  app.get("/health", async () => ({
    ok: true,
    service: "mail-bills",
    uploadPath: "/api/mail-bills/intake",
    ledgerPath: configPaths(config).ledgerPath
  }));

  app.post("/api/mail-bills/intake", async (request, reply) => {
    try {
      authorizeUpload(request.headers.authorization, config);
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
      return reply.code(result.created ? 201 : 200).send({ ok: true, created: result.created, documentId: result.documentId, pdfPath: result.pdfPath, sidecarPath: result.sidecarPath });
    } catch (error) {
      if (error instanceof IntakeUploadError) return reply.code(error.statusCode).send({ ok: false, error: error.message });
      throw error;
    }
  });

  app.post("/api/bootstrap", async (request, reply) => {
    const dryRun = parseBoolean((request.query as any).dryRun);
    return reply.send({ ok: true, dryRun, directories: bootstrapDirectories(config, { dryRun }) });
  });

  app.get("/api/documents", async (request) => {
    const ledger = initializedLedger(config);
    const query = request.query as Record<string, string | undefined>;
    return {
      ok: true,
      documents: ledger.listDocuments({
        status: query.status,
        q: query.q,
        limit: query.limit ? Number(query.limit) : 200,
        offset: query.offset ? Number(query.offset) : 0
      })
    };
  });

  app.get("/api/documents/:documentId", async (request, reply) => {
    const ledger = initializedLedger(config);
    const document = ledger.getDocument((request.params as any).documentId);
    if (!document) return reply.code(404).send({ ok: false, error: "document not found" });
    return { ok: true, document };
  });

  app.get("/api/documents/:documentId/pdf", async (request, reply) => {
    const pdfPath = pdfPathForDocument(config, (request.params as any).documentId);
    return reply.type("application/pdf").send(fs.createReadStream(pdfPath));
  });

  app.post("/api/documents/:documentId/actions", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, any>;
    const ledger = initializedLedger(config);
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
      shortcutLabel: body.shortcutLabel ?? undefined
    });
    return reply.code(result.ok ? 200 : 400).send(result);
  });

  app.post("/api/pipeline/process-pending", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, any>;
    const dryRun = body.dryRun !== false;
    const result = dryRun
      ? await processPending({ config, ledger: initializedLedger(config), dryRun: true, stableDelayMs: Number(body.stableDelayMs ?? 1000) })
      : await scheduler.runNow();
    if (!result) return reply.code(409).send({ ok: false, error: "pipeline is already running", schedule: scheduler.status() });
    return reply.code(result.errors.length ? 207 : 200).send({ ok: result.errors.length === 0, ...result });
  });

  app.post("/api/pipeline/batches/:batchId/process", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, any>;
    const result = await processBatch({
      batchId: (request.params as any).batchId,
      config,
      ledger: initializedLedger(config),
      dryRun: body.dryRun !== false
    });
    return reply.code(result.errors.length ? 207 : 200).send({ ok: result.errors.length === 0, ...result });
  });

  app.get("/api/pipeline/schedule", async () => ({
    ok: true,
    schedule: scheduler.status()
  }));

  app.get("/api/pairing/qr", async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const payload = buildPairingPayload({ config, baseUrl: query.baseUrl });
      return { ok: true, payload, qrSvg: await svgQr(payload) };
    } catch (error) {
      return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/pairing/rotate-token", async (request, reply) => {
    if (!config.configPath) return reply.code(400).send({ ok: false, error: "configPath is required to rotate the intake token" });
    const body = (request.body ?? {}) as Record<string, any>;
    const token = ensureConfigToken(config.configPath, { rotate: true });
    config.intakeUpload.token = token;
    const payload = buildPairingPayload({ config, baseUrl: body.baseUrl });
    return { ok: true, payload, qrSvg: await svgQr(payload) };
  });

  app.get("/api/status", async () => {
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

function initializedLedger(config: MailBillsConfig): Ledger {
  const ledger = new Ledger(configPaths(config).ledgerPath);
  ledger.initialize();
  return ledger;
}

function pdfPathForDocument(config: MailBillsConfig, documentId: string): string {
  const ledger = initializedLedger(config);
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
