# High + Medium Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all High and Medium audit findings (H1–H6, M1–M5, M8–M12) with tests, on branch `fix/high-medium-findings`, landing as one PR that closes the corresponding GitHub issues.

**Architecture:** Point fixes to the existing pipeline modules; two new modules (`src/rate-limit.ts`, `src/purge.ts`). The `Ledger` gains a long-lived connection + transactions; the scheduler becomes the single pipeline mutex; auth gains rate limiting and origin checks. No behavior changes outside the findings.

**Tech Stack:** TypeScript strict ESM (NodeNext — relative imports use `.js`), Fastify 5, better-sqlite3, Vitest. Tests use temp dirs via `tests/helpers.ts`; never touch `../mail-bills/data/ledger.sqlite`.

## Global Constraints

- Node >= 22. `npm run check` (tsc --noEmit) and `npm test` (vitest run) must pass after every task.
- Every commit that fixes a finding references its GitHub issue: look up the issue number for the finding ID (H1, M3, …) in the **GitHub issue mapping** table in `ISSUES.md` and append `\n\nFixes #<N>` to the commit message.
- `snake_case` only where mirroring the SQLite schema or external payloads; `camelCase` everywhere else.
- Match existing file style: two-space indent, explicit interfaces for results.
- Do not modify `dist/` by hand. Do not log or echo tokens.

---

### Task 0: Branch

- [ ] **Step 1:**

```bash
git checkout main && git pull github main && git checkout -b fix/high-medium-findings
```

### Task 1: H1 — Ledger long-lived connection + transactions

**Files:**
- Modify: `src/ledger.ts` (connection lifecycle), `src/importer.ts` (shared ledger + transaction), `src/processor.ts` (close owned ledgers), `src/api.ts` (one shared ledger per app)
- Test: `tests/ledger.test.ts`, `tests/importer.test.ts`

**Interfaces:**
- Produces: `Ledger.transaction<T>(fn: () => T): T`, `Ledger.close(): void`. `importPair(config, pdfPath, sidecarPath, dryRun?, sharedLedger?: Ledger)`. Later tasks assume one `Ledger` instance per `createApi` app named `ledger`.

- [ ] **Step 1: Write failing tests** (append to `tests/ledger.test.ts`):

```ts
import path from "node:path";
import { tempRoot } from "./helpers.js";

describe("ledger transactions", () => {
  it("rolls back all writes when the transaction callback throws", () => {
    const ledger = new Ledger(path.join(tempRoot("ledger-tx-"), "ledger.sqlite"));
    ledger.initialize();
    expect(() =>
      ledger.transaction(() => {
        ledger.upsertBatch({ batch_id: "b1", status: "imported" });
        ledger.upsertDocument({ document_id: "d1", batch_id: "b1", status: "imported" });
        throw new Error("boom");
      })
    ).toThrow("boom");
    expect(ledger.getBatch("b1")).toBeUndefined();
    expect(ledger.getDocument("d1")).toBeUndefined();
    ledger.close();
  });

  it("commits when the transaction callback returns", () => {
    const ledger = new Ledger(path.join(tempRoot("ledger-tx-"), "ledger.sqlite"));
    ledger.initialize();
    ledger.transaction(() => {
      ledger.upsertBatch({ batch_id: "b1", status: "imported" });
    });
    expect(ledger.getBatch("b1")?.status).toBe("imported");
    ledger.close();
  });
});
```

Adjust imports at the top of the file to include `path`/`tempRoot` if absent (the file already imports `Ledger`).

- [ ] **Step 2: Run** `npx vitest run tests/ledger.test.ts` — Expected: FAIL, `ledger.transaction is not a function`.

- [ ] **Step 3: Implement.** In `src/ledger.ts`, replace the private `connect()` and every `const db = this.connect(); try { ... } finally { db.close(); }` pattern:

```ts
export class Ledger {
  private db?: Database.Database;

  constructor(readonly filePath: string) {}

  /** Lazily opened, long-lived connection. Call close() when done with the instance. */
  private connection(): Database.Database {
    if (!this.db) {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      this.db = new Database(this.filePath);
    }
    return this.db;
  }

  close(): void {
    this.db?.close();
    this.db = undefined;
  }

  /** Run fn atomically. better-sqlite3 nests via savepoints, so nested calls are safe. */
  transaction<T>(fn: () => T): T {
    return this.connection().transaction(fn)();
  }
```

Then update the method bodies:
- `initialize()`: `const db = this.connection();` — drop the `try/finally` + `close()`.
- `appendEvent()`: `const db = this.connection();` — drop `try/finally`.
- `upsert()`: `this.connection().prepare(...)` — drop `try/finally`.
- `fetchOne`/`fetchAll`: `return this.connection().prepare(sql).get(params) ...` — drop `try/finally`.

- [ ] **Step 4: Share the ledger in the importer.** In `src/importer.ts`:

```ts
export async function scanImports(input: { ... }): Promise<ImportSummary> {
  ...
  const ledger = new Ledger(configPaths(input.config).ledgerPath);
  if (!dryRun) ledger.initialize();
  try {
    for (const [intakeDir, errorDir] of uniqueSources) {
      const summary = await scanImportDir(input.config, intakeDir, errorDir, dryRun, stableDelayMs, ledger);
      ...
    }
  } finally {
    ledger.close();
  }
  return totals;
}
```

Thread `ledger: Ledger` through `scanImportDir(...)` into `importPair`. New `importPair` signature (keep it exported and backward-compatible for direct callers/tests):

```ts
export function importPair(config: MailBillsConfig, pdfPath: string, sidecarPath: string, dryRun = false, sharedLedger?: Ledger): void {
```

Inside, replace the ledger block with an owned-or-shared transactional write:

```ts
  const ledger = sharedLedger ?? new Ledger(paths.ledgerPath);
  if (!sharedLedger) ledger.initialize();
  try {
    const importedAt = new Date().toISOString();
    ledger.transaction(() => {
      ledger.upsertBatch({ /* unchanged fields */ });
      ledger.upsertDocument({ /* unchanged fields */ });
      ledger.appendEvent({ /* unchanged fields */ });
    });
  } finally {
    if (!sharedLedger) ledger.close();
  }
  fs.unlinkSync(pdfPath);
  fs.unlinkSync(sidecarPath);
```

- [ ] **Step 5: Close owned ledgers in the processor.** In `src/processor.ts`, in both `processPending` and `processBatch`:

```ts
  const ownLedger = !input.ledger;
  const ledger = input.ledger ?? new Ledger(configPaths(input.config).ledgerPath);
  ledger.initialize();
  try {
    ... existing body ...
  } finally {
    if (ownLedger) ledger.close();
  }
```

- [ ] **Step 6: One shared ledger per app.** In `src/api.ts` `createApi`, right after the scheduler is constructed:

```ts
  const ledger = new Ledger(configPaths(config).ledgerPath);
  ledger.initialize();
  app.addHook("onClose", async () => {
    scheduler.stop();
    ledger.close();
  });
```

(Replace the existing `onClose` hook.) Then replace every `initializedLedger(config)` call in route handlers with `ledger`, change `pdfPathForDocument(config, documentId)` to `pdfPathForDocument(config, ledger, documentId)` (drop its internal `initializedLedger` call), and delete the now-unused `initializedLedger` helper.

- [ ] **Step 7: Run** `npm run check && npm test` — Expected: PASS (fix any test that constructed `Ledger` and relied on implicit close; add `ledger.close()` where vitest complains about open handles).

- [ ] **Step 8: Commit** — `git add -A && git commit -m "Hold one SQLite connection per Ledger and write import records transactionally"` + `Fixes #<H1>` per Global Constraints.

### Task 2: H6 — Indexes + schema versioning

**Files:** Modify: `src/ledger.ts`. Test: `tests/ledger.test.ts`.

**Interfaces:** Produces `SCHEMA_VERSION = 2` (exported const) and indexes `idx_documents_status`, `idx_documents_batch_id`, `idx_documents_due_date`.

- [ ] **Step 1: Failing test** (append to `tests/ledger.test.ts`):

```ts
import Database from "better-sqlite3";
import { SCHEMA_VERSION } from "../src/ledger.js";

describe("ledger schema migration", () => {
  it("creates indexes and stamps user_version", () => {
    const filePath = path.join(tempRoot("ledger-schema-"), "ledger.sqlite");
    const ledger = new Ledger(filePath);
    ledger.initialize();
    ledger.close();
    const db = new Database(filePath, { readonly: true });
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_documents_%'").all() as Array<{ name: string }>;
    const version = Number(db.pragma("user_version", { simple: true }));
    db.close();
    expect(indexes.map((row) => row.name).sort()).toEqual(["idx_documents_batch_id", "idx_documents_due_date", "idx_documents_status"]);
    expect(version).toBe(SCHEMA_VERSION);
  });

  it("upgrades a legacy ledger missing later columns", () => {
    const filePath = path.join(tempRoot("ledger-legacy-"), "ledger.sqlite");
    const legacy = new Database(filePath);
    legacy.exec("CREATE TABLE documents (document_id TEXT PRIMARY KEY, batch_id TEXT, status TEXT); CREATE TABLE batches (batch_id TEXT PRIMARY KEY, status TEXT); CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, event_at TEXT NOT NULL)");
    legacy.close();
    const ledger = new Ledger(filePath);
    ledger.initialize();
    ledger.upsertDocument({ document_id: "d1", status: "imported", notes: "migrated", ocr_summary_json: "{}" });
    expect(ledger.getDocument("d1")?.notes).toBe("migrated");
    ledger.close();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/ledger.test.ts` — Expected: FAIL (`SCHEMA_VERSION` not exported; legacy upsert throws on missing columns).

- [ ] **Step 3: Implement.** In `src/ledger.ts` add `export const SCHEMA_VERSION = 2;` and replace the migration block at the end of `initialize()`:

```ts
    const version = Number(db.pragma("user_version", { simple: true }));
    if (version < SCHEMA_VERSION) {
      // Additive migrations for ledgers created by older schemas (incl. the Python era).
      for (const col of [
        "ocr_summary_json TEXT",
        "notes TEXT",
        "ocr_text TEXT",
        "ocr_summary TEXT",
        "confidence TEXT",
        "review_reason TEXT",
        "urgency_reasons_json TEXT",
        "retention_decision TEXT",
        "quarantined_until TEXT",
        "duplicate_of_document_id TEXT",
        "deleted_at TEXT",
        "error_message TEXT"
      ]) {
        try { db.exec(`ALTER TABLE documents ADD COLUMN ${col}`); } catch { /* column exists */ }
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
        CREATE INDEX IF NOT EXISTS idx_documents_batch_id ON documents(batch_id);
        CREATE INDEX IF NOT EXISTS idx_documents_due_date ON documents(due_date);
      `);
      db.pragma(`user_version = ${SCHEMA_VERSION}`);
    }
```

Note: the legacy-table test above lacks `due_date`; the index creation on a missing column throws — so ALSO add `"due_date TEXT"`, `"category TEXT"`, `"shortcut_label TEXT"`, `"detected_category TEXT"`, `"vendor TEXT"`, `"amount TEXT"`, `"source_pdf_path TEXT"`, `"local_pdf_path TEXT"`, `"sidecar_path TEXT"`, `"sha256 TEXT"`, `"created_at TEXT"`, `"imported_at TEXT"` to the additive list (full parity with `DOCUMENT_COLUMNS` minus the primary key and `batch_id`/`status`).

- [ ] **Step 4: Run** `npx vitest run tests/ledger.test.ts` then `npm run check && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `"Add ledger indexes and user_version-gated schema migrations"` + `Fixes #<H6>`.

### Task 3: M3 — Load dedupe sources once per batch

**Files:** Modify: `src/processor.ts`. Test: `tests/processor.test.ts`.

**Interfaces:** `processDocument` (private) gains `duplicateSources: DocumentRecord[]` in its input; each processed document is appended to that array so later documents in the batch still see earlier ones.

- [ ] **Step 1: Failing test** (append to `tests/processor.test.ts`, matching its existing service-stub style):

```ts
it("loads duplicate sources once per batch, not once per document", async () => {
  const root = tempRoot("mail-bills-proc-dedupe-");
  const config = makeConfig(root);
  const ledger = new Ledger(configPaths(config).ledgerPath);
  ledger.initialize();
  ledger.upsertBatch({ batch_id: "b1", status: "imported" });
  for (const id of ["d1", "d2", "d3"]) {
    ledger.upsertDocument({ document_id: id, batch_id: "b1", status: "imported", local_pdf_path: "/dev/null" });
  }
  let loaderCalls = 0;
  const services: ProcessorServices = {
    importScanner: async () => ({ imported: 0, failed: 0, skipped: 0, dryRun: true }),
    ocrProcessor: async ({ documentId }) => ({
      pdfPath: "x", text: `text ${documentId}`, pageCount: 1, confidence: "high", needsFallback: false,
      summary: "s", modelSummaryEnabled: false, extractionMethod: "embedded" as const
    }),
    classifier: () => ({
      category: "BILL", detectedCategory: "BILL", status: "Actionable", actionRequired: true,
      confidence: "high", urgencyReasons: [], recommendedNextAction: "x", summary: "s", vendor: "V"
    }),
    duplicateSourceLoader: (l) => { loaderCalls += 1; return loadDuplicateSources(l); },
    duplicateDetector: detectDuplicates
  };
  const result = await processBatch({ batchId: "b1", config, ledger, dryRun: true, services });
  expect(result.processed).toBe(3);
  expect(loaderCalls).toBe(1);
  ledger.close();
});
```

Add any missing imports (`ProcessorServices`, `processBatch`, `loadDuplicateSources`, `detectDuplicates`, `configPaths`, `Ledger`, helpers).

- [ ] **Step 2: Run** `npx vitest run tests/processor.test.ts` — Expected: FAIL, `loaderCalls` is 3.

- [ ] **Step 3: Implement.** In `processBatch`, before the loop:

```ts
  const duplicateSources = services.duplicateSourceLoader(ledger);
```

Pass it into `processDocument` and append after success:

```ts
      const updated = await processDocument(document, { config: input.config, ledger, dryRun, services, duplicateSources });
      processed += 1;
      plannedDocuments.set(documentId, updated);
      duplicateSources.push(updated);
```

`processDocument` input type gains `duplicateSources: DocumentRecord[]`; replace its loader call:

```ts
  const duplicateResult = input.services.duplicateDetector(current, input.duplicateSources);
```

- [ ] **Step 4: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `"Load duplicate-detection sources once per batch"` + `Fixes #<M3>`.

### Task 4: H2 — Single pipeline mutex

**Files:** Modify: `src/scheduler.ts`, `src/api.ts`. Test: create `tests/scheduler.test.ts`, extend `tests/api.test.ts`.

**Interfaces:** Produces `PipelineScheduler.runExclusive<T>(fn: () => Promise<T>): Promise<T | undefined>` (undefined = already running). All pipeline HTTP routes go through it.

- [ ] **Step 1: Failing test** — create `tests/scheduler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PipelineScheduler } from "../src/scheduler.js";
import { makeConfig, tempRoot } from "./helpers.js";

describe("pipeline mutex", () => {
  it("rejects a second entrant while the first holds the lock", async () => {
    const scheduler = new PipelineScheduler(makeConfig(tempRoot("mail-bills-sched-")));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = scheduler.runExclusive(async () => { await gate; return "first"; });
    expect(await scheduler.runExclusive(async () => "second")).toBeUndefined();
    expect(scheduler.status().running).toBe(true);
    release();
    expect(await first).toBe("first");
    expect(scheduler.status().running).toBe(false);
  });

  it("releases the lock when the callback throws", async () => {
    const scheduler = new PipelineScheduler(makeConfig(tempRoot("mail-bills-sched-")));
    await expect(scheduler.runExclusive(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await scheduler.runExclusive(async () => "ok")).toBe("ok");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/scheduler.test.ts` — Expected: FAIL, `runExclusive is not a function`.

- [ ] **Step 3: Implement.** In `PipelineScheduler`:

```ts
  /**
   * Single mutex for every pipeline entry point (scheduled, live, dry-run,
   * per-batch). Returns undefined when a run is already in progress.
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (this.running) return undefined;
    this.running = true;
    try {
      return await fn();
    } finally {
      this.running = false;
    }
  }

  async runNow(): Promise<PendingProcessResult | undefined> {
    return this.runExclusive(async () => {
      this.lastStartedAt = new Date().toISOString();
      this.lastError = undefined;
      this.logger?.info({ startedAt: this.lastStartedAt }, "pipeline run started");
      try {
        const result = await processPending({
          config: this.config,
          dryRun: false,
          stableDelayMs: this.config.pipelineSchedule.stableDelayMs
        });
        this.lastResult = result;
        this.lastOk = result.errors.length === 0;
        this.logger?.info({ batches: result.batches.length, errors: result.errors.length }, "pipeline run finished");
        return result;
      } catch (error) {
        this.lastOk = false;
        this.lastError = error instanceof Error ? error.message : String(error);
        this.logger?.error({ error: this.lastError }, "pipeline run failed");
        throw error;
      } finally {
        this.lastFinishedAt = new Date().toISOString();
      }
    });
  }
```

(Delete the old `running = true/false` management from `runNow`.)

- [ ] **Step 4: Route the unguarded entry points through the mutex.** In `src/api.ts`:
- `POST /api/pipeline/process-pending` dry-run branch: `await scheduler.runExclusive(() => processPending({ config, ledger, dryRun: true, stableDelayMs: Number(body.stableDelayMs ?? 1000) }))` (the existing `if (!result) → 409` now covers both branches).
- `POST /api/pipeline/batches/:batchId/process`:

```ts
    const result = await scheduler.runExclusive(() =>
      processBatch({ batchId: (request.params as any).batchId, config, ledger, dryRun: body.dryRun !== false })
    );
    if (!result) return reply.code(409).send({ ok: false, error: "pipeline is already running", schedule: scheduler.status() });
    return reply.code(result.errors.length ? 207 : 200).send({ ok: result.errors.length === 0, ...result });
```

- [ ] **Step 5: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 6: Commit** — `"Serialize all pipeline entry points behind one mutex"` + `Fixes #<H2>`.

### Task 5: M1 — Clamp limit/offset

**Files:** Modify: `src/api.ts`. Test: `tests/api.test.ts`.

**Interfaces:** Produces `clampInt(value, { min, max, fallback })` (module-private).

- [ ] **Step 1: Failing test** (append inside the `describe("REST API")` block):

```ts
it("clamps non-numeric and out-of-range limit/offset instead of 500ing", async () => {
  const config = makeConfig(tempRoot("mail-bills-api-clamp-"));
  const app = createApi(config);
  const ledger = new Ledger(configPaths(config).ledgerPath);
  ledger.initialize();
  for (const id of ["d1", "d2", "d3"]) ledger.upsertDocument({ document_id: id, status: "Inbox" });
  ledger.close();

  const nan = await app.inject({ method: "GET", url: "/api/documents?limit=abc&offset=xyz" });
  expect(nan.statusCode).toBe(200);
  expect(nan.json().documents).toHaveLength(3);

  const clamped = await app.inject({ method: "GET", url: "/api/documents?limit=-5" });
  expect(clamped.statusCode).toBe(200);
  expect(clamped.json().documents).toHaveLength(1); // clamped to min 1

  const paged = await app.inject({ method: "GET", url: "/api/documents?limit=2&offset=2" });
  expect(paged.json().documents).toHaveLength(1);
  await app.close();
});
```

- [ ] **Step 2: Run** `npx vitest run tests/api.test.ts -t "clamps"` — Expected: FAIL (NaN case 500s or returns wrong counts).

- [ ] **Step 3: Implement** in `src/api.ts`:

```ts
function clampInt(value: unknown, options: { min: number; max: number; fallback: number }): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed)) return options.fallback;
  return Math.min(Math.max(parsed, options.min), options.max);
}
```

Documents route:

```ts
      documents: ledger.listDocuments({
        status: query.status,
        q: query.q,
        limit: clampInt(query.limit, { min: 1, max: 500, fallback: 200 }),
        offset: clampInt(query.offset, { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 })
      })
```

- [ ] **Step 4: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `"Clamp documents limit/offset query params"` + `Fixes #<M1>`.

### Task 6: M2 — Align body and multipart limits

**Files:** Modify: `src/api.ts`. Test: `tests/api.test.ts`.

**Interfaces:** Produces exported consts `UPLOAD_FILE_LIMIT`, `UPLOAD_BODY_LIMIT`.

- [ ] **Step 1: Failing test:**

```ts
it("allows a whole-request body at least as large as the sum of file caps", async () => {
  const { UPLOAD_BODY_LIMIT, UPLOAD_FILE_LIMIT } = await import("../src/api.js");
  expect(UPLOAD_BODY_LIMIT).toBeGreaterThanOrEqual(2 * UPLOAD_FILE_LIMIT);
});
```

- [ ] **Step 2: Run** — Expected: FAIL (consts not exported).

- [ ] **Step 3: Implement** in `src/api.ts`:

```ts
/** Per-file multipart cap; the whole-request cap must fit both files + form overhead. */
export const UPLOAD_FILE_LIMIT = 50 * 1024 * 1024;
export const UPLOAD_BODY_LIMIT = 2 * UPLOAD_FILE_LIMIT + 5 * 1024 * 1024;
```

```ts
  const app = Fastify({ logger: fastifyLogger(config), bodyLimit: UPLOAD_BODY_LIMIT });
  app.register(multipart, { limits: { fileSize: UPLOAD_FILE_LIMIT, files: 2 } });
```

- [ ] **Step 4: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `"Align request body limit with multipart file caps"` + `Fixes #<M2>`.

### Task 7: M10 — Drop filesystem paths from API responses

**Files:** Modify: `src/api.ts`, `src/ui.ts` (only if it reads the removed fields). Test: `tests/api.test.ts`.

- [ ] **Step 1: Failing test:**

```ts
it("does not leak filesystem paths in upload responses", async () => {
  const config = makeConfig(tempRoot("mail-bills-api-paths-"));
  const app = createApi(config);
  const multipart = multipartBody({
    pdf: ["doc-1.pdf", Buffer.from("%PDF upload\n"), "application/pdf"],
    sidecar: ["doc-1.json", sidecarBytes(), "application/json"]
  });
  const intake = await app.inject({
    method: "POST",
    url: "/api/mail-bills/intake",
    headers: { authorization: "Bearer secret-token", "content-type": multipart.contentType },
    payload: multipart.body
  });
  expect(intake.statusCode).toBe(201);
  expect(intake.json()).not.toHaveProperty("pdfPath");
  expect(intake.json()).not.toHaveProperty("sidecarPath");
  await app.close();
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement.** Intake route response becomes:

```ts
      return reply.code(result.created ? 201 : 200).send({ ok: true, created: result.created, documentId: result.documentId });
```

`import-pdf` route response drops `pdfPath`/`sidecarPath` (keep `batchId`, `documentId`, `source`, `created`). Then `grep -n "pdfPath\|sidecarPath" src/ui.ts` — if the UI JS reads those response fields, delete that usage (they were display-only). Update any existing tests in `tests/api.test.ts`/`tests/intake.test.ts` that assert the removed response fields (the `UploadResult` return type of `acceptUpload` keeps its paths — only HTTP responses change).

- [ ] **Step 4: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `"Stop echoing server filesystem paths in upload responses"` + `Fixes #<M10>`.

### Task 8: H5 — Same-origin check on state-changing admin routes

**Files:** Modify: `src/api.ts`. Test: `tests/api.test.ts`.

**Interfaces:** Produces `isSameOrigin(origin: string | undefined, host: string | undefined): boolean` (exported for tests).

- [ ] **Step 1: Failing tests:**

```ts
describe("CSRF origin checks", () => {
  it("rejects cross-origin state-changing requests in loopback-no-token mode", async () => {
    const app = createApi(makeConfig(tempRoot("mail-bills-api-csrf-")));
    const response = await app.inject({
      method: "POST",
      url: "/api/bootstrap",
      headers: { origin: "http://evil.example" }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("allows same-origin posts and origin-less CLI posts", async () => {
    const app = createApi(makeConfig(tempRoot("mail-bills-api-csrf-")));
    const sameOrigin = await app.inject({ method: "POST", url: "/api/bootstrap", headers: { origin: "http://localhost:80" } });
    expect(sameOrigin.statusCode).toBe(200);
    const noOrigin = await app.inject({ method: "POST", url: "/api/bootstrap" });
    expect(noOrigin.statusCode).toBe(200);
    await app.close();
  });

  it("does not block cross-origin GETs", async () => {
    const app = createApi(makeConfig(tempRoot("mail-bills-api-csrf-")));
    const response = await app.inject({ method: "GET", url: "/api/status", headers: { origin: "http://evil.example" } });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
```

(light-my-request injects use host `localhost:80` by default, hence the same-origin value.)

- [ ] **Step 2: Run** — Expected: FAIL (403 cases return 200).

- [ ] **Step 3: Implement** in `src/api.ts`:

```ts
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
```

Extend `requireAdmin`'s handler (add `method` and the extra headers to its request type):

```ts
function requireAdmin(config: MailBillsConfig) {
  return async (
    request: { method: string; headers: { authorization?: string; origin?: string; host?: string }; ip?: string },
    reply: { code(c: number): { send(body: unknown): void }; send(body: unknown): void }
  ) => {
    if (request.method !== "GET" && !isSameOrigin(request.headers.origin, request.headers.host)) {
      reply.code(403).send({ ok: false, error: "cross-origin request rejected" });
      return;
    }
    const decision = authorizeAdmin({ header: request.headers.authorization, ip: request.ip, adminToken: config.api?.adminToken });
    if (!decision.ok) reply.code(decision.statusCode).send({ ok: false, error: decision.error });
  };
}
```

- [ ] **Step 4: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `"Reject cross-origin state-changing admin requests"` + `Fixes #<H5>`.

### Task 9: H4 — Failed-auth rate limiting

**Files:** Create: `src/rate-limit.ts`. Modify: `src/api.ts`. Test: create `tests/rate-limit.test.ts`, extend `tests/api.test.ts`.

**Interfaces:** Produces `FailedAuthLimiter` with `isBlocked(ip): boolean`, `recordFailure(ip): void`, `recordSuccess(ip): void`; options `{ maxFailures?, windowMs?, blockMs?, maxEntries?, now?: () => number }` (defaults 5 / 60s / 5min / 10000 / Date.now).

- [ ] **Step 1: Failing unit tests** — create `tests/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FailedAuthLimiter } from "../src/rate-limit.js";

describe("FailedAuthLimiter", () => {
  it("blocks after maxFailures within the window and unblocks after blockMs", () => {
    let clock = 0;
    const limiter = new FailedAuthLimiter({ maxFailures: 3, windowMs: 1000, blockMs: 5000, now: () => clock });
    for (let i = 0; i < 3; i += 1) limiter.recordFailure("1.2.3.4");
    expect(limiter.isBlocked("1.2.3.4")).toBe(true);
    expect(limiter.isBlocked("5.6.7.8")).toBe(false);
    clock = 5001;
    expect(limiter.isBlocked("1.2.3.4")).toBe(false);
  });

  it("resets the failure count when the window expires", () => {
    let clock = 0;
    const limiter = new FailedAuthLimiter({ maxFailures: 3, windowMs: 1000, blockMs: 5000, now: () => clock });
    limiter.recordFailure("ip");
    limiter.recordFailure("ip");
    clock = 2000;
    limiter.recordFailure("ip");
    expect(limiter.isBlocked("ip")).toBe(false);
  });

  it("clears an IP on success", () => {
    const limiter = new FailedAuthLimiter({ maxFailures: 2 });
    limiter.recordFailure("ip");
    limiter.recordSuccess("ip");
    limiter.recordFailure("ip");
    expect(limiter.isBlocked("ip")).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/rate-limit.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — create `src/rate-limit.ts`:

```ts
export interface FailedAuthLimiterOptions {
  maxFailures?: number;
  windowMs?: number;
  blockMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface Entry {
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

/**
 * In-memory per-IP failed-auth backoff. After maxFailures failures inside
 * windowMs, the IP is blocked for blockMs. Success clears the IP. The map is
 * pruned (and, at worst, cleared — fail open, never OOM) at maxEntries.
 */
export class FailedAuthLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly blockMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: FailedAuthLimiterOptions = {}) {
    this.maxFailures = options.maxFailures ?? 5;
    this.windowMs = options.windowMs ?? 60_000;
    this.blockMs = options.blockMs ?? 5 * 60_000;
    this.maxEntries = options.maxEntries ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  isBlocked(ip: string): boolean {
    const entry = this.entries.get(ip);
    if (!entry?.blockedUntil) return false;
    if (entry.blockedUntil <= this.now()) {
      this.entries.delete(ip);
      return false;
    }
    return true;
  }

  recordFailure(ip: string): void {
    const now = this.now();
    if (this.entries.size >= this.maxEntries && !this.entries.has(ip)) this.prune(now);
    const entry = this.entries.get(ip);
    if (!entry || now - entry.windowStart > this.windowMs) {
      this.entries.set(ip, { count: 1, windowStart: now });
      return;
    }
    entry.count += 1;
    if (entry.count >= this.maxFailures) entry.blockedUntil = now + this.blockMs;
  }

  recordSuccess(ip: string): void {
    this.entries.delete(ip);
  }

  private prune(now: number): void {
    for (const [ip, entry] of this.entries) {
      const expired = entry.blockedUntil ? entry.blockedUntil <= now : now - entry.windowStart > this.windowMs;
      if (expired) this.entries.delete(ip);
    }
    if (this.entries.size >= this.maxEntries) this.entries.clear();
  }
}
```

- [ ] **Step 4: Wire into the API.** In `createApi`: `const intakeLimiter = new FailedAuthLimiter();` and `const adminLimiter = new FailedAuthLimiter();`. Intake route, at the top of the handler:

```ts
      if (intakeLimiter.isBlocked(request.ip)) {
        return reply.code(429).send({ ok: false, error: "too many failed auth attempts; try again later" });
      }
```

after `authorizeUpload(...)` succeeds add `intakeLimiter.recordSuccess(request.ip);`, and in the `IntakeUploadError` catch branch:

```ts
      if (error instanceof IntakeUploadError) {
        if (error.statusCode === 401) intakeLimiter.recordFailure(request.ip);
        return reply.code(error.statusCode).send({ ok: false, error: error.message });
      }
```

`requireAdmin` becomes `requireAdmin(config, adminLimiter)` (update all route registrations):

```ts
function requireAdmin(config: MailBillsConfig, limiter: FailedAuthLimiter) {
  return async (request, reply) => {           // keep the widened types from Task 8
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
```

- [ ] **Step 5: API-level test** (append to `tests/api.test.ts`):

```ts
it("rate limits repeated failed intake auth", async () => {
  const app = createApi(makeConfig(tempRoot("mail-bills-api-rate-")));
  const multipart = multipartBody({
    pdf: ["doc-1.pdf", Buffer.from("%PDF upload\n"), "application/pdf"],
    sidecar: ["doc-1.json", sidecarBytes(), "application/json"]
  });
  const attempt = (auth: string) => app.inject({
    method: "POST", url: "/api/mail-bills/intake",
    headers: { authorization: auth, "content-type": multipart.contentType },
    payload: multipart.body
  });
  for (let i = 0; i < 5; i += 1) expect((await attempt("Bearer wrong")).statusCode).toBe(401);
  expect((await attempt("Bearer wrong")).statusCode).toBe(429);
  expect((await attempt("Bearer secret-token")).statusCode).toBe(429); // blocked even with the right token
  await app.close();
});
```

- [ ] **Step 6: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 7: Commit** — `"Add per-IP failed-auth rate limiting to intake and admin routes"` + `Fixes #<H4>`.

### Task 10: H3 — Validate pairing baseUrl

**Files:** Modify: `src/pairing.ts`, `src/api.ts`. Test: `tests/pairing.test.ts`.

**Interfaces:** Produces `validatePairingBaseUrl(baseUrl: string): string` and `class PairingBaseUrlError extends Error` (both exported). `buildPairingPayload` validates any provided `baseUrl`.

- [ ] **Step 1: Failing tests** (append to `tests/pairing.test.ts`):

```ts
import { PairingBaseUrlError, validatePairingBaseUrl } from "../src/pairing.js";

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
    "http://[::1]:8765"
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
    "not a url"
  ])("rejects public/invalid endpoint %s", (url) => {
    expect(() => validatePairingBaseUrl(url)).toThrow(PairingBaseUrlError);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/pairing.test.ts` — Expected: FAIL (exports missing).

- [ ] **Step 3: Implement** in `src/pairing.ts`:

```ts
const PRIVATE_HOST_SUFFIXES = [".local", ".lan", ".home", ".internal", ".ts.net"];

export class PairingBaseUrlError extends Error {}

/**
 * The pairing payload embeds the live intake token, so the endpoint host must
 * be somewhere we trust: loopback, RFC1918, CGNAT (Tailscale), link-local,
 * mDNS/.local-style suffixes, or a single-label LAN hostname. Public FQDNs and
 * public IPs are rejected to prevent QR-directed token exfiltration.
 */
export function validatePairingBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new PairingBaseUrlError(`baseUrl is not a valid URL: ${baseUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PairingBaseUrlError(`baseUrl must be http or https, got ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!isPrivateHost(host)) {
    throw new PairingBaseUrlError(`baseUrl host is not a loopback/LAN/private host: ${host}`);
  }
  return baseUrl;
}

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host === "::1") return true;
  if (!host.includes(".") && !host.includes(":")) return true; // single-label LAN name, e.g. yoyodyne
  if (PRIVATE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  return isPrivateIp(host);
}

function isPrivateIp(host: string): boolean {
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) return false;
    const [a, b] = octets;
    if (a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (Tailscale)
    if (a === 169 && b === 254) return true; // link-local
    return false;
  }
  return host.startsWith("fe80:") || host.startsWith("fd") || host.startsWith("fc"); // IPv6 link-local/ULA
}
```

In `buildPairingPayload`, validate before use:

```ts
  const baseUrl = input.baseUrl ? validatePairingBaseUrl(input.baseUrl) : undefined;
  const endpoint = endpointFor(input.config, baseUrl);
```

- [ ] **Step 4: API surface.** `GET /api/pairing/qr` already catches errors → 400. Wrap `POST /api/pairing/rotate-token`'s payload build in the same try/catch shape so a bad `baseUrl` is a 400, not a 500 — **and rotate only after validation** so an invalid request cannot burn the current token:

```ts
    try {
      if (body.baseUrl) validatePairingBaseUrl(String(body.baseUrl));
      const token = ensureConfigToken(config.configPath, { rotate: true });
      config.intakeUpload.token = token;
      const payload = buildPairingPayload({ config, baseUrl: body.baseUrl });
      return { ok: true, payload, qrSvg: await svgQr(payload) };
    } catch (error) {
      return reply.code(400).send({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
```

- [ ] **Step 5: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 6: Commit** — `"Validate pairing baseUrl against private/LAN hosts"` + `Fixes #<H3>`.

### Task 11: M8 — PDF magic-byte check

**Files:** Modify: `src/intake.ts`. Test: `tests/intake.test.ts`.

- [ ] **Step 1: Failing test** (append to `tests/intake.test.ts`):

```ts
it("rejects uploads whose pdf bytes lack a %PDF header", () => {
  const config = makeConfig(tempRoot("mail-bills-intake-magic-"));
  expect(() => acceptUpload({ pdfBytes: Buffer.from("GIF89a not a pdf"), sidecarBytes: sidecarBytes("doc-magic"), config }))
    .toThrow(/%PDF/);
});
```

- [ ] **Step 2: Run** — Expected: FAIL (upload accepted).

- [ ] **Step 3: Implement.** In `acceptUpload`, after the emptiness checks:

```ts
const PDF_MAGIC = Buffer.from("%PDF");
```
(module scope) and:

```ts
  // The %PDF header must appear near the start (spec allows leading junk up to 1024 bytes).
  if (!input.pdfBytes.subarray(0, 1024).includes(PDF_MAGIC)) {
    throw new IntakeUploadError("pdf must be a PDF (missing %PDF header)");
  }
```

If any existing test uploads non-`%PDF` bytes as a valid pdf, prefix its fixture with `%PDF ` — the helpers already use `Buffer.from("%PDF upload\n")`.

- [ ] **Step 4: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `"Require %PDF magic bytes on intake uploads"` + `Fixes #<M8>`.

### Task 12: M9 — TOCTOU-safe upload writes

**Files:** Modify: `src/intake.ts`. Test: `tests/intake.test.ts`.

- [ ] **Step 1: Failing test:**

```ts
it("fails fast without clobbering when a concurrent upload owns the .part file", () => {
  const config = makeConfig(tempRoot("mail-bills-intake-race-"));
  fs.mkdirSync(config.intakeUpload.intakeDir, { recursive: true });
  const partPath = path.join(config.intakeUpload.intakeDir, "doc-race.pdf.part");
  fs.writeFileSync(partPath, "other writer");
  expect(() => acceptUpload({ pdfBytes: Buffer.from("%PDF mine"), sidecarBytes: sidecarBytes("doc-race"), config }))
    .toThrow(UploadCollisionError);
  expect(fs.readFileSync(partPath, "utf8")).toBe("other writer"); // the other writer's file survives
});
```

Add `UploadCollisionError`, `fs`, `path` to the test file imports as needed.

- [ ] **Step 2: Run** — Expected: FAIL (either clobbers or wrong error type).

- [ ] **Step 3: Implement.** In `src/intake.ts`, make `writeDurable` exclusive:

```ts
function writeDurable(filePath: string, bytes: Buffer): void {
  // "wx" = exclusive create: a concurrent upload of the same documentId fails
  // fast with EEXIST instead of silently overwriting the other writer's .part.
  const fd = fs.openSync(filePath, "wx");
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
```

Track only self-created files for cleanup and map EEXIST to a 409:

```ts
  const created: string[] = [];
  try {
    writeDurable(pdfPart, input.pdfBytes);
    created.push(pdfPart);
    writeDurable(sidecarPart, input.sidecarBytes);
    created.push(sidecarPart);
    loadSidecar(sidecarPart);
    fs.renameSync(pdfPart, pdfPath);
    fs.renameSync(sidecarPart, sidecarPath);
  } catch (error) {
    cleanup(...created); // never delete the other writer's .part files
    if (error instanceof SidecarValidationError) throw new IntakeUploadError(error.message);
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new UploadCollisionError(`upload already in progress: ${documentId}`);
    }
    throw error;
  }
```

Cap the idempotent-retry comparison with a size check first:

```ts
function sameContent(filePath: string, bytes: Buffer): boolean {
  if (fs.statSync(filePath).size !== bytes.length) return false;
  return Buffer.compare(fs.readFileSync(filePath), bytes) === 0;
}
```

and use it in the existing exists-collision block in place of the two inline `Buffer.compare(fs.readFileSync(...))` calls.

- [ ] **Step 4: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `"Use exclusive-create .part writes to close the upload TOCTOU race"` + `Fixes #<M9>`.

### Task 13: M5 — Due-date validation and keyword adjacency

**Files:** Modify: `src/classifier.ts`. Test: `tests/classifier.test.ts`.

- [ ] **Step 1: Failing tests:**

```ts
describe("due date extraction", () => {
  it("rejects impossible calendar dates", () => {
    const result = classifyMail("GEICO bill. Amount due $50. Payment due 13/45/2026.");
    expect(result.dueDate).toBeUndefined();
  });

  it("rejects a real-looking but invalid day-of-month", () => {
    const result = classifyMail("GEICO bill. Amount due $50. Due date: 02/30/2026.");
    expect(result.dueDate).toBeUndefined();
  });

  it("ignores dates that are not adjacent to a due/pay keyword", () => {
    const result = classifyMail("GEICO statement period January 5, 2026 through February 4, 2026. Amount due $50.");
    expect(result.dueDate).toBeUndefined();
  });

  it("still extracts keyword-adjacent dates", () => {
    expect(classifyMail("GEICO bill amount due $50, payment due by June 15, 2026").dueDate).toBe("2026-06-15");
    expect(classifyMail("GEICO bill amount due $50. Due date: 06/15/2026").dueDate).toBe("2026-06-15");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/classifier.test.ts` — Expected: FAIL (impossible dates emitted; bare dates matched).

- [ ] **Step 3: Implement.** Replace `isoDate` and `extractDueDate`:

```ts
function isoDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Round-trip guard: Date.UTC(2026, 1, 30) rolls over to March — reject rollovers.
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return undefined;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function extractDueDate(text: string): string | undefined {
  const numeric = text.match(/\b(?:due date|due|payment due|pay by|renew by)\D{0,20}(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i);
  const numericDate = numeric ? isoDate(Number(numeric[3]), Number(numeric[1]), Number(numeric[2])) : undefined;
  if (numericDate) return numericDate;
  const monthNames = Object.keys(MONTHS).join("|");
  const named = text.match(new RegExp(`\\b(?:due date|due|payment due by|payment due|pay by|renew by)\\D{0,20}(${monthNames})\\s+(\\d{1,2}),\\s*(\\d{4})\\b`, "i"));
  return named ? isoDate(Number(named[3]), MONTHS[named[1].toLowerCase()], Number(named[2])) : undefined;
}
```

(The `bare` fallback match is deleted — that is the point.) If an existing classifier test relied on a bare, keyword-less date, update its fixture to include a due keyword.

- [ ] **Step 4: Run** `npm run check && npm test` — Expected: PASS. Watch `tests/processor.test.ts`/`tests/api.test.ts` fixtures for bare-date reliance.
- [ ] **Step 5: Commit** — `"Validate extracted due dates and require due-keyword adjacency"` + `Fixes #<M5>`.

### Task 14: M4 — Portable defaults and config paths

**Files:** Modify: `src/config.ts`, `src/cli.ts`, `package.json`, `config.example.yaml`, `README.md`, `AGENTS.md`, `CLAUDE.md`. Test: `tests/config.test.ts`.

- [ ] **Step 1: Failing test** (append to `tests/config.test.ts`):

```ts
it("defaults root_dir under the invoking user's home, not a hardcoded user", () => {
  const config = loadConfig(path.join(tempRoot("mail-bills-config-"), "missing.yaml"));
  expect(config.rootDir).not.toContain("buckaroo");
  expect(config.rootDir).toContain("data/mail-bills");
});
```

- [ ] **Step 2: Run** — Expected: FAIL (`buckaroo` present).

- [ ] **Step 3: Implement.**
- `src/config.ts`: `const DEFAULT_ROOT = "~/data/mail-bills";` (`expandUser` already expands `~` against the owner home).
- `src/cli.ts`: `const configPath = option(rest, "--config") ?? "config.yaml";`
- `package.json`: `"start": "dotenv -e .env -- node dist/src/cli.js api --config config.yaml"`.
- `config.example.yaml`: replace every `/Users/buckaroo/.hermes/projects/mail-bills` with `~/data/mail-bills`.
- Docs: update the `--config ../mail-bills/config.yaml` examples in `README.md`, `AGENTS.md`, and the CLAUDE.md "Commands" section to `--config config.yaml`, and remove the CLAUDE.md line calling the sibling path the default.

- [ ] **Step 4: Run** `npm run check && npm test && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** — `"Make default paths portable; default --config to ./config.yaml"` + `Fixes #<M4>`.

### Task 15: M11 — Server-side pagination

**Files:** Modify: `src/ledger.ts`, `src/api.ts`. Test: `tests/ledger.test.ts`, `tests/api.test.ts`.

**Interfaces:** Produces `Ledger.countDocuments(options?: { status?: string; q?: string }): number`; `GET /api/documents` response gains `total`, `limit`, `offset`. (WS4's UI pager consumes these.)

- [ ] **Step 1: Failing tests:**

`tests/ledger.test.ts`:

```ts
it("counts documents with the same filters as listDocuments", () => {
  const ledger = new Ledger(path.join(tempRoot("ledger-count-"), "ledger.sqlite"));
  ledger.initialize();
  ledger.upsertDocument({ document_id: "a1", status: "Inbox", vendor: "GEICO" });
  ledger.upsertDocument({ document_id: "a2", status: "Inbox", vendor: "Aetna" });
  ledger.upsertDocument({ document_id: "a3", status: "Archived", vendor: "GEICO" });
  expect(ledger.countDocuments()).toBe(3);
  expect(ledger.countDocuments({ status: "Inbox" })).toBe(2);
  expect(ledger.countDocuments({ q: "GEICO" })).toBe(2);
  ledger.close();
});
```

`tests/api.test.ts`:

```ts
it("returns total/limit/offset for pagination", async () => {
  const config = makeConfig(tempRoot("mail-bills-api-page-"));
  const app = createApi(config);
  const ledger = new Ledger(configPaths(config).ledgerPath);
  ledger.initialize();
  for (let i = 0; i < 5; i += 1) ledger.upsertDocument({ document_id: `p${i}`, status: "Inbox" });
  ledger.close();
  const response = await app.inject({ method: "GET", url: "/api/documents?limit=2&offset=0" });
  const body = response.json();
  expect(body.documents).toHaveLength(2);
  expect(body.total).toBe(5);
  expect(body.limit).toBe(2);
  expect(body.offset).toBe(0);
  await app.close();
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement.** In `src/ledger.ts`, extract the shared filter builder and add the count:

```ts
  private documentFilters(options: { status?: string; q?: string }): { where: string; params: unknown[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (options.status) {
      clauses.push("status = ?");
      params.push(options.status);
    }
    if (options.q) {
      clauses.push("(document_id LIKE ? OR batch_id LIKE ? OR vendor LIKE ?)");
      const query = `%${options.q}%`;
      params.push(query, query, query);
    }
    return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
  }

  countDocuments(options: { status?: string; q?: string } = {}): number {
    const { where, params } = this.documentFilters(options);
    const row = this.fetchOne<{ count: number }>(`SELECT COUNT(*) AS count FROM documents ${where}`, ...params);
    return Number(row?.count ?? 0);
  }
```

Rewrite `listDocuments` to use `documentFilters` (same SELECT/ORDER BY/LIMIT/OFFSET as today). In `src/api.ts`, the documents route:

```ts
    const limit = clampInt(query.limit, { min: 1, max: 500, fallback: 200 });
    const offset = clampInt(query.offset, { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
    return {
      ok: true,
      documents: ledger.listDocuments({ status: query.status, q: query.q, limit, offset }),
      total: ledger.countDocuments({ status: query.status, q: query.q }),
      limit,
      offset
    };
```

- [ ] **Step 4: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `"Add document count and pagination metadata to the documents API"` + `Fixes #<M11>`.

### Task 16: M12 — Quarantine purge

**Files:** Create: `src/purge.ts`. Modify: `src/scheduler.ts`, `src/cli.ts`. Test: create `tests/purge.test.ts`.

**Interfaces:** Produces `purgeExpiredQuarantine(input: { ledger: Ledger; config: MailBillsConfig; today?: Date; dryRun?: boolean }): PurgeResult` with `PurgeResult = { dryRun: boolean; purged: Array<{ documentId: string; removedFiles: string[] }>; errors: Array<{ document_id: string; message: string }> }`. CLI command `purge-quarantine [--dry-run]`.

- [ ] **Step 1: Failing tests** — create `tests/purge.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Ledger } from "../src/ledger.js";
import { configPaths } from "../src/config.js";
import { purgeExpiredQuarantine } from "../src/purge.js";
import { makeConfig, tempRoot } from "./helpers.js";

function seedQuarantined(root: string, until: string) {
  const config = makeConfig(root);
  const quarantineDir = configPaths(config).quarantineDir;
  const pdfPath = path.join(quarantineDir, "2026-06-01", "doc-q", "doc-q.pdf");
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  fs.writeFileSync(pdfPath, "%PDF quarantined");
  const ledger = new Ledger(configPaths(config).ledgerPath);
  ledger.initialize();
  ledger.upsertDocument({
    document_id: "doc-q", status: "Deleted", retention_decision: "Quarantined",
    quarantined_until: until, local_pdf_path: pdfPath
  });
  return { config, ledger, pdfPath };
}

describe("quarantine purge", () => {
  it("deletes files and finalizes the ledger for expired quarantines", () => {
    const { config, ledger, pdfPath } = seedQuarantined(tempRoot("purge-"), "2026-06-08");
    const result = purgeExpiredQuarantine({ ledger, config, today: new Date("2026-07-01") });
    expect(result.purged).toHaveLength(1);
    expect(fs.existsSync(pdfPath)).toBe(false);
    expect(ledger.getDocument("doc-q")?.retention_decision).toBe("Purged");
    ledger.close();
  });

  it("leaves unexpired quarantines alone", () => {
    const { config, ledger, pdfPath } = seedQuarantined(tempRoot("purge-"), "2099-01-01");
    const result = purgeExpiredQuarantine({ ledger, config, today: new Date("2026-07-01") });
    expect(result.purged).toHaveLength(0);
    expect(fs.existsSync(pdfPath)).toBe(true);
    ledger.close();
  });

  it("dry-run reports but does not delete or update", () => {
    const { config, ledger, pdfPath } = seedQuarantined(tempRoot("purge-"), "2026-06-08");
    const result = purgeExpiredQuarantine({ ledger, config, today: new Date("2026-07-01"), dryRun: true });
    expect(result.purged).toHaveLength(1);
    expect(fs.existsSync(pdfPath)).toBe(true);
    expect(ledger.getDocument("doc-q")?.retention_decision).toBe("Quarantined");
    ledger.close();
  });

  it("never deletes files outside the quarantine directory", () => {
    const root = tempRoot("purge-escape-");
    const config = makeConfig(root);
    const outsidePath = path.join(root, "important.pdf");
    fs.writeFileSync(outsidePath, "%PDF do not delete");
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    ledger.upsertDocument({
      document_id: "doc-esc", status: "Deleted", retention_decision: "Quarantined",
      quarantined_until: "2026-06-08", local_pdf_path: outsidePath
    });
    const result = purgeExpiredQuarantine({ ledger, config, today: new Date("2026-07-01") });
    expect(fs.existsSync(outsidePath)).toBe(true);
    expect(result.purged[0]?.removedFiles ?? []).toHaveLength(0);
    ledger.close();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/purge.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — create `src/purge.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type { DocumentRecord, MailBillsConfig } from "./types.js";
import { Ledger } from "./ledger.js";
import { configPaths } from "./config.js";
import { ensureUnder, textValue } from "./paths.js";

export interface PurgeResult {
  dryRun: boolean;
  purged: Array<{ documentId: string; removedFiles: string[] }>;
  errors: Array<{ document_id: string; message: string }>;
}

/**
 * Permanently delete quarantined files whose quarantined_until has passed and
 * mark the ledger row Purged. Only paths inside the quarantine directory are
 * ever unlinked; anything else recorded on the row is left untouched.
 */
export function purgeExpiredQuarantine(input: {
  ledger: Ledger;
  config: MailBillsConfig;
  today?: Date;
  dryRun?: boolean;
}): PurgeResult {
  const dryRun = Boolean(input.dryRun);
  const todayIso = (input.today ?? new Date()).toISOString().slice(0, 10);
  const quarantineDir = configPaths(input.config).quarantineDir;
  const result: PurgeResult = { dryRun, purged: [], errors: [] };
  const expired = input.ledger.documentsByStatus("Deleted").filter((document) =>
    textValue(document.retention_decision) === "Quarantined" &&
    Boolean(textValue(document.quarantined_until)) &&
    textValue(document.quarantined_until) < todayIso
  );
  for (const document of expired) {
    const documentId = textValue(document.document_id);
    try {
      const removedFiles = removeQuarantinedFiles(document, quarantineDir, dryRun);
      if (!dryRun) {
        input.ledger.upsertDocument({ document_id: documentId, retention_decision: "Purged" });
        input.ledger.appendEvent({
          documentId,
          batchId: document.batch_id,
          eventType: "purged",
          payload: { removed_files: removedFiles, quarantined_until: document.quarantined_until }
        });
      }
      result.purged.push({ documentId, removedFiles });
    } catch (error) {
      result.errors.push({ document_id: documentId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

function removeQuarantinedFiles(document: DocumentRecord, quarantineDir: string, dryRun: boolean): string[] {
  const removed: string[] = [];
  for (const field of ["local_pdf_path", "sidecar_path"] as const) {
    const candidate = textValue(document[field]);
    if (!candidate) continue;
    let resolved: string;
    try {
      resolved = ensureUnder(quarantineDir, candidate);
    } catch {
      continue; // path was never moved under quarantine; do not touch it
    }
    if (!fs.existsSync(resolved)) continue;
    if (!dryRun) fs.unlinkSync(resolved);
    removed.push(resolved);
  }
  return removed;
}
```

(`path` is imported for symmetry with the module style; drop it if `tsc` flags it unused.)

- [ ] **Step 4: Scheduler + CLI wiring.** In `src/scheduler.ts` `runNow`, after the `processPending` result is captured (inside the success path, before `return result;`):

```ts
        try {
          const ledger = new Ledger(configPaths(this.config).ledgerPath);
          ledger.initialize();
          try {
            const purge = purgeExpiredQuarantine({ ledger, config: this.config });
            if (purge.purged.length || purge.errors.length) {
              this.logger?.info({ purged: purge.purged.length, errors: purge.errors.length }, "quarantine purge finished");
            }
          } finally {
            ledger.close();
          }
        } catch (error) {
          this.logger?.error({ error: error instanceof Error ? error.message : String(error) }, "quarantine purge failed");
        }
```

with imports `import { Ledger } from "./ledger.js"; import { configPaths } from "./config.js"; import { purgeExpiredQuarantine } from "./purge.js";`. In `src/cli.ts` add before the final `throw`:

```ts
  if (command === "purge-quarantine") {
    const ledger = new Ledger(configPaths(config).ledgerPath);
    ledger.initialize();
    try {
      const result = purgeExpiredQuarantine({ ledger, config, dryRun: rest.includes("--dry-run") });
      console.log(JSON.stringify(result, null, 2));
      return result.errors.length ? 1 : 0;
    } finally {
      ledger.close();
    }
  }
```

plus `import { purgeExpiredQuarantine } from "./purge.js";` and a `purge-quarantine [--dry-run]` line in `printHelp()`.

- [ ] **Step 5: Run** `npm run check && npm test` — Expected: PASS.
- [ ] **Step 6: Commit** — `"Purge expired quarantined documents from the scheduler and CLI"` + `Fixes #<M12>`.

### Task 17: Final verification + PR

- [ ] **Step 1: Full gate**

```bash
npm run check && npm test && npm run build
```

Expected: all green.

- [ ] **Step 2: End-to-end smoke** (temp dir; never the live data root):

```bash
SMOKE=$(mktemp -d)
cat > "$SMOKE/config.yaml" <<EOF
root_dir: $SMOKE/data
intake_upload:
  host: 127.0.0.1
  port: 8790
  token: smoke-token
pipeline_schedule:
  enabled: false
logging:
  level: warn
EOF
node dist/src/cli.js api --config "$SMOKE/config.yaml" & SMOKE_PID=$!
sleep 1
printf '%%PDF-1.4 smoke bill from GEICO amount due $50 due date: 08/01/2026' > "$SMOKE/doc.pdf"
printf '{"batchId":"smoke-1","documentId":"smoke-doc-1","capturedAt":"2026-07-02T12:00:00Z","label":"Bill","category":"BILL","source":"iphone_app"}' > "$SMOKE/doc.json"
curl -sf -X POST http://127.0.0.1:8790/api/mail-bills/intake -H "Authorization: Bearer smoke-token" -F pdf=@"$SMOKE/doc.pdf" -F sidecar=@"$SMOKE/doc.json"
curl -sf -X POST http://127.0.0.1:8790/api/pipeline/process-pending -H 'Content-Type: application/json' -d '{"dryRun":false,"stableDelayMs":0}'
curl -sf "http://127.0.0.1:8790/api/documents?q=smoke-doc-1" | grep -q smoke-doc-1 && echo "SMOKE OK"
kill $SMOKE_PID
```

Expected: `SMOKE OK`.

- [ ] **Step 3: PR**

```bash
git push -u github fix/high-medium-findings
gh pr create --title "Fix all High and Medium audit findings" --body "<summary of the 16 fixes, one line each, with Fixes #N list for every issue>"
```

Report the PR URL, confirm CI/tests, then merge with `gh pr merge --merge --delete-branch` and `git checkout main && git pull github main && git push origin main`.

---

## Self-review notes (already applied)

- Task ordering keeps single-file churn adjacent (ledger: 1→2; api: 4–9) to minimize merge friction between sub-agent tasks.
- Task 2's additive-column list must reach parity with `DOCUMENT_COLUMNS` — the legacy test enforces it.
- Rate limiting (Task 9) builds on the `requireAdmin` shape produced by Task 8; if executed out of order, reconcile the preHandler signature manually.
