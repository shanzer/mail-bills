# Code Review — `mail-bills`

In-depth review of the TypeScript/Node REST service (`src/`) and the Vision OCR helper (`utils/vision_ocr.swift`).
Findings are grouped by severity. Line numbers reference the current source.

Severity legend: **Critical** (exploitable / data-loss / process-crash), **High** (serious correctness/reliability/security), **Medium** (real but bounded), **Low** (quality / hardening).

## Status — resolved in the critical-fixes pass

- **C1** ✅ Resolved — all non-intake `/api/*` routes now require admin auth (`api.admin_token`); loopback-only when unset.
- **C2** ✅ Resolved — Notion integration removed entirely; delete/quarantine works without it.
- **C3** ✅ Resolved — `scanImports` is async (no busy-wait); `runVisionOcr`/`summarizeWithModel` use async `execFile` with timeouts.
- **C4** ✅ Resolved — scheduled/`runOnStartup` runs `.catch()` rejections; API `runNow` failure returns a clean 500.
- **H4** ✅ Partially — bearer compares (intake + admin) are now constant-time; per-IP rate limiting still not implemented.
- **M6** ✅ Resolved — `pdf-parse` parser is destroyed in a `finally`.
- **M7** ✅ Resolved — Vision helper has a 60s timeout; non-JSON stdout falls back instead of throwing.
- **L8 / L9** ✅ Moot — Notion adapter (`src/notion.ts`) and its `loadEnvFile` side effect were removed.
- **Notion removal** also dropped `notionDatabaseName` (config/type), `notion_page_id` (ledger column/type), and the `notion.ts` env-file path.

Remaining: H1-H3, H5-H6, M1-M5, M8-M12, L1-L7, L10-L14, plus the H4 rate-limiting gap and the test-coverage section.

---

## Critical

### C1 — Management & pipeline endpoints have no authentication; server binds `0.0.0.0`
**Files:** `src/api.ts:38-206`, `src/config.ts:40` (default host), `config.yaml:13`.

Only `POST /api/mail-bills/intake` checks the bearer token (`authorizeUpload`, `src/intake.ts:82`). Every other endpoint — `GET /api/documents` (lists vendor, amount, due date — financial PII), `GET /api/documents/:id/pdf` (streams the PDF), `POST /api/documents/:id/actions` (archive/complete/delete/send-to-paperless), `POST /api/documents/import-pdf`, `POST /api/bootstrap`, `POST /api/pipeline/process-pending`, `POST /api/pipeline/batches/:id/process`, `GET /api/pairing/qr`, `POST /api/pairing/rotate-token` — is completely unauthenticated. The config defaults `intake_upload.host: 0.0.0.0`, so the whole surface is reachable by anyone on the LAN.

**Impact:** Anyone on the network can read all mail documents and PDFs, delete/archive them, rotate the intake token (denial of service for the phone), point the pairing QR at an attacker URL, or run the pipeline.

**Fix:** Require a shared admin bearer token (or loopback-only binding) on every non-intake route. At minimum default `host` to `127.0.0.1` and require opt-in for `0.0.0.0`. Add a Fastify `preHandler` that validates an admin token with a constant-time compare, and apply it to all `/api/*` routes except intake (which keeps its own token). Consider per-action authorization (e.g. destructive actions need a second confirm token).

---

### C2 — `delete` / quarantine fails entirely when Notion is not configured
**Files:** `src/quarantine.ts:60-62`, `src/actions.ts:166-171`.

`quarantineDocument` unconditionally constructs a `NotionAdapter` and calls `notion.upsertDocument(tombstone, { dryRun: false })`. With no `NOTION_TOKEN`/`NOTION_MAIL_BILLS_DATABASE_ID`, `upsertDocument` returns `{ ok: false, action: "setup_required" }`, and the code throws `new Error(result.message)`. The `delete` action therefore returns `ok: false` and the document is *not* quarantined — the file move and ledger update are skipped because the throw happens after `ledger.upsertDocument`? No: the Notion call is **after** `ledger.upsertDocument` and the file moves, so the DB row is updated and files are moved, but the action reports failure and the caller sees an error. This is inconsistent and breaks delete for any user without Notion (the documented happy path — `README.md` calls Notion "optional").

**Fix:** Make Notion sync best-effort in quarantine: if `missingWritePrerequisites()` is non-empty, skip the tombstone upsert (or log a warning) and still return success. Gate the Notion call behind a config flag / env check the way `review.ts:39` gates on `input.syncNotion`.

---

### C3 — Synchronous blocking calls freeze the API event loop
**Files:** `src/importer.ts:156-164` (busy-wait), `src/ocr.ts:110-123` (`runVisionOcr`), `src/ocr.ts:142-161` (`summarizeWithModel`).

`filesAreStable` burns CPU in `while (Date.now() < end) {}` for `stableDelayMs` (default 1000 ms) **per import pair**, fully synchronous. `runVisionOcr` and `summarizeWithModel` use `execFileSync` (no `await`, no event-loop yield). These run inside the same process that serves the Fastify API and the scheduler. A pipeline run over N pairs blocks the event loop for ~N seconds (importer) plus up to 120 s per document (ollama model summary) with no timeout on the Vision helper.

**Impact:** The HTTP server becomes wholly unresponsive (health checks, UI, intake uploads all stall) during every scheduled/manual pipeline run. On Node 22 a long-enough stall can trip keepalive/load-balancer timeouts.

**Fix:** Make the import scanner `async` and replace the busy-wait with `await new Promise(r => setTimeout(r, delayMs))`. Replace `execFileSync` with `execFile` (promisified) + `AbortSignal.timeout(...)`. Run pipeline work off the request path (it already is, via the scheduler) but never synchronously block the loop.

---

### C4 — Scheduler failure becomes an unhandled rejection that can crash the server
**Files:** `src/scheduler.ts:51-57, 80-108`.

`runNow()` rethrows from its `catch` block. Callers invoke it as `void this.runNow()` (`scheduler.ts:53, 56`) — the returned promise is never `.catch()`-ed. If `processPending` rejects (e.g. `scanImports` throws on an fs error, or a future bug), Node 22's default `--unhandled-rejections=throw` terminates the process. A single bad document won't reject (per-doc errors are caught in `processBatch`), but any error in the import scanner or ledger bootstrap will.

**Fix:** In `start()`, wrap: `void this.runNow().catch((err) => this.logger?.error({ error: String(err) }, "pipeline run failed"));` — or have `runNow` swallow/log and never rethrow, since it already records `lastError`.

---

## High

### H1 — No transactional writes; one DB connection opened and closed per call
**Files:** `src/ledger.ts:171-215` (`connect`/`upsert`/`fetchOne`/`fetchAll`/`appendEvent`), `src/importer.ts:105-135`.

Every ledger method opens a **new** `better-sqlite3` connection and closes it. `importPair` writes the batch row, the document row, and the event in three separate connections with no `BEGIN`/`COMMIT`. A crash between them leaves a batch with a document but no import event, or a batch row with `item_count` from a stale readdir. `processDocument` also performs many separate upserts.

**Impact:** Non-atomic multi-step state changes; performance is poor (repeated open/fsync/close); higher lock-contention risk when the API and scheduler both write.

**Fix:** Hold one long-lived connection (or a small pool) on the `Ledger` instance and expose a `transaction(fn)` wrapper. Wrap `importPair`'s batch+document+event writes in a single transaction.

### H2 — Pipeline runs are not mutually exclusive across entry points
**Files:** `src/api.ts:146-165`, `src/scheduler.ts:80`, `src/processor.ts`.

`/api/pipeline/process-pending` with `dryRun:false` goes through `scheduler.runNow()` (guarded by `this.running`). But `dryRun:true` calls `processPending` directly with **no** guard, and `POST /api/pipeline/batches/:batchId/process` calls `processBatch` with no guard at all. A dry-run and a live run, or two batch runs, can execute concurrently against the same ledger and intake files.

**Impact:** Duplicate detection races (a doc is imported and classified while its own duplicate scan runs), file move/rename races in `importPair`, and double-processing of the same document.

**Fix:** Centralize all pipeline entry points behind a single mutex (extend `PipelineScheduler` to guard dry runs and per-batch runs too), or use a file/DB lock. Return 409 when a run is already in progress for all trigger paths.

### H3 — Pairing `baseUrl` is unvalidated → token/PDF exfiltration and open redirect
**Files:** `src/pairing.ts:24-38, 134-139`, `src/api.ts:172-189`.

`buildPairingPayload` embeds `baseUrl` verbatim into `endpoint` and the QR payload contains the live intake `token` and `authHeader`. `GET /api/pairing/qr?baseUrl=http://evil.example` and `POST /api/pairing/rotate-token { baseUrl }` accept any string with no scheme/host allowlist. Combined with C1 (no auth), anyone on the LAN can generate a QR that directs the iPhone to POST uploads (PDF + bearer token) to an attacker-controlled host.

**Fix:** Validate `baseUrl` to `http`/`https` with an explicit allowlist (loopback, LAN IP, `.local`, Tailscale) or restrict to the request's own `Host`/origin by default. Never echo the raw token into a payload whose endpoint wasn't validated.

### H4 — Bearer token compared with `!==` (non-constant-time) and no rate limiting
**Files:** `src/intake.ts:84`, `src/api.ts:40`.

`authorizeUpload` does `header !== \`Bearer ${token}\`` — a timing-sensitive string comparison. There is also no throttling on failed auth attempts, allowing online brute force / timing probing of the shared token.

**Fix:** Use `crypto.timingSafeEqual` on equal-length buffers (return false on length mismatch without comparing). Add a simple in-memory rate limiter on the intake endpoint (e.g. per-IP failed-attempt backoff).

### H5 — CSRF on the multipart browser-import endpoint
**Files:** `src/api.ts:58-95`, `src/ui.ts:1247-1263`.

`POST /api/documents/import-pdf` accepts `multipart/form-data` (a "simple" request that skips CORS preflight) and has no auth/CSRF token. A malicious page visited by anyone whose browser can reach the API (LAN or same machine) can submit a cross-site multipart form and queue arbitrary PDFs into the intake folder. JSON endpoints are partially protected by the `application/json` preflight, but this one is not.

**Fix:** Require an authenticated session/admin token (see C1) or a CSRF token / `Origin` check on all state-changing endpoints. Multipart does not get a free pass from CORS.

### H6 — SQLite has no indexes and no migration story for the "compatible" legacy ledger
**Files:** `src/ledger.ts:50-97`.

`initialize()` only does `CREATE TABLE IF NOT EXISTS` — no `CREATE INDEX`, no `ALTER TABLE` for columns added since the Python schema. `documentsByStatus`, `documentsForBatch`, and the `ORDER BY due_date` scan are full-table scans. The README claims the existing `../mail-bills/data/ledger.sqlite` "remains compatible," but any column this code writes that the old schema lacks will throw on upsert with no migration path.

**Fix:** Add indexes on `documents(status)`, `documents(batch_id)`, `documents(due_date)`. Add a migration step (versioned schema + `ALTER TABLE ... ADD COLUMN` for new fields, or a pragma check) so an old ledger is upgraded rather than broken.

---

## Medium

### M1 — `limit`/`offset` parsed with `Number()` can inject `NaN`
**File:** `src/api.ts:107-112`.

`Number(query.limit)` with no radix/validation: `?limit=abc` → `NaN`. The bound parameter becomes `NaN`; SQLite/better-sqlite3 behavior on `LIMIT NaN` is undefined and may throw, producing a 500. There is also no upper bound (UI hardcodes 500; a client can request millions).

**Fix:** Parse with `Number.parseInt`, clamp to `[0, 500]`, and fall back to the default on `NaN`.

### M2 — `bodyLimit` (50 MB) contradicts the multipart `fileSize`/`files` limits
**File:** `src/api.ts:19-20`.

`bodyLimit: 50*1024*1024` caps the whole request at 50 MB, but the multipart registration allows two 50 MB files (`fileSize: 50MB, files: 2`). A legitimate 2-file upload near the per-file cap is rejected by the lower body limit. Each `part.toBuffer()` also buffers the full file in memory; concurrent uploads can balloon RAM.

**Fix:** Align the limits (e.g. bodyLimit ≥ sum of file limits) and/or stream uploads to a temp file via `part.file` instead of `toBuffer()`.

### M3 — Dedupe reloads all source documents once per processed document (quadratic)
**Files:** `src/processor.ts:116`, `src/dedupe.ts:24-26`.

`processDocument` calls `duplicateSourceLoader(input.ledger)` for every document, and `loadDuplicateSources` issues 5 separate `documentsByStatus` scans (each opening/closing the DB). For a batch of N documents over a ledger of M rows this is O(N·M) plus N×5 connection opens.

**Fix:** Load the duplicate source set once per `processBatch` (or per `processPending`) and pass it in, rather than per document.

### M4 — Hardcoded `buckaroo` paths make Notion/defaults non-portable
**Files:** `src/notion.ts:6` (`DEFAULT_ENV_PATH = "/Users/buckaroo/.hermes/.env"`), `src/config.ts:7` (`DEFAULT_ROOT`).

`NotionAdapter` always calls `loadEnvFile("/Users/buckaroo/.hermes/.env")` — on any other machine this path doesn't exist, so Notion silently no-ops (and, per C2, then breaks delete). `DEFAULT_ROOT` is likewise a specific user's home. `config.example.yaml` also uses the buckaroo path.

**Fix:** Derive the env path from `process.env.HOME` / a config field (or `XDG_CONFIG_HOME`), and make `DEFAULT_ROOT` a relative fallback (`./data/mail-bills`) so the example isn't machine-specific.

### M5 — Due-date / amount extraction has false positives and no range validation
**Files:** `src/classifier.ts:163-188`.

`extractDueDate`'s `bare` regex grabs any `Month DD, YYYY` anywhere in the OCR text (could be a statement period, not the due date), and the numeric path assumes `MM/DD/YYYY` with no `month ≤ 12` / `day ≤ 31` check — `isoDate` will happily emit `2026-13-35`. `extractAmount` falls back to the *first* `$` amount in the whole document, which may be an unrelated line item. These flow into the ledger and the UI's overdue highlighting.

**Fix:** Require the date to be adjacent to a due/pay keyword (drop the bare match, or weight it lower), and validate ranges (reject or clamp impossible month/day). Prefer labeled amount patterns and only fall back to the first amount when no labeled total is found.

### M6 — `pdf-parse` parser not destroyed on throw (resource leak)
**File:** `src/ocr.ts:30-34`.

`extractPdfText` does `const parser = new PDFParse(...); const parsed = await parser.getText(); await parser.destroy();`. If `getText()` rejects, `destroy()` is never called.

**Fix:** Wrap in `try { ... } finally { await parser.destroy(); }`.

### M7 — Vision OCR helper has no timeout; `JSON.parse` of its stdout is unguarded
**File:** `src/ocr.ts:110-123`.

`execFileSync(helperPath, [pdfPath], { encoding: "utf8" })` has no `timeout` — a hung helper blocks the loop indefinitely (compounds C3). `JSON.parse(stdout)` is not in a try/catch, so non-JSON output (e.g. a warning printed to stdout) surfaces as a raw `SyntaxError` rather than a friendly message.

**Fix:** Add `timeout` and `maxBuffer`; wrap the parse; on failure, return a low-confidence empty-text result with a clear `reviewReason`.

### M8 — Intake endpoint does not validate that `pdf` is actually a PDF
**File:** `src/intake.ts:29-50`, `src/api.ts:38-56`.

`import-pdf` checks `isPdfUpload` (filename + mimetype), but the phone intake endpoint accepts any bytes as `pdf` with no magic-byte check. Malformed/binary payloads are later handed to `pdf-parse`/Vision.

**Fix:** Add a `%PDF` magic-byte check in `acceptUpload` (or the intake route), returning 400 on mismatch.

### M9 — TOCTOU in `acceptUpload` collision handling
**File:** `src/intake.ts:53-63`.

The exists-check then `.part` write then `rename` is not atomic across concurrent uploads of the same `documentId`: two requests can both pass the `existsSync` check and the second `renameSync` clobbers the first. The content-compare path also reads both files into memory (up to 50 MB each) on every collision.

**Fix:** Use `fs.openSync(path, "wx")` (exclusive create) for the `.part` files so a concurrent writer fails fast with `EEXIST`, then compare/rename. Cap comparison size.

### M10 — Full filesystem paths returned in API responses
**Files:** `src/api.ts:51, 82-90`.

Intake and import-pdf responses include `pdfPath`/`sidecarPath` (absolute server paths). This leaks the on-disk layout to the (currently unauthenticated) client.

**Fix:** Return only `documentId`/`batchId`/`created`; drop raw paths from the response (tests that assert on them can be updated to read from the ledger).

### M11 — UI loads at most 500 documents with no pagination
**Files:** `src/ui.ts:1049`, `src/api.ts:107-113`.

`loadDocuments` fetches `/api/documents?limit=500` and renders everything into the DOM at once. Larger ledgers silently truncate and render slowly.

**Fix:** Add server-side pagination and a "load more"/page control in the UI; don't hardcode 500.

### M12 — `quarantined_until` / permanent-deletion purge is never run
**Files:** `src/quarantine.ts:35, 48, 63`, `src/scheduler.ts`.

Quarantine sets a 7-day `quarantined_until` and `permanentlyDeleted` is always `false`, but nothing ever purges expired quarantined documents. The README implies eventual deletion; the implementation only ever quarantines.

**Fix:** Add a scheduled purge task (or a CLI command) that, after `quarantined_until` passes, permanently deletes the moved files and updates the ledger.

---

## Low

### L1 — `DocumentStatus` is typed as `union | string`, defeating the union
**File:** `src/types.ts:28`. `DocumentStatus = (typeof STATUS_VALUES)[number] | string` collapses to `string`; status comparisons are unchecked at compile time. Either drop `| string` and cast at the boundary, or keep an explicit `string` alias and document it.

### L2 — Duplicate `safeSegment` / `SAFE_ID_RE` and divergent `uniqueDestination` counters
**Files:** `src/intake.ts:8,87` vs `src/importer.ts:10,139`; `src/importer.ts:184` (counter starts at 1) vs `src/quarantine.ts:103` (starts at 2). Consolidate path-segment validation and collision-naming into `paths.ts`.

### L3 — Dead config paths / bootstrap directories
`configPaths` exposes `processingDir`, `archiveDir`, `logsDir`, `batchesDir`, `errorDir` that no application code reads or writes (only `bootstrapDirectories` creates them). Either wire them in or remove them to avoid confusion.

### L4 — `cli.ts` `--log-level` is not validated against `LOG_LEVELS`
**File:** `src/cli.ts:24`. An invalid level is cast directly into `config.logging.level`; Fastify will reject it at logger init. Reuse `loggingLevel` from `config.ts`.

### L5 — `cli.ts` flag parsing consumes the next token even if it's a flag
**File:** `src/cli.ts:108-111`. `--config --dry-run` would set `config = "--dry-run"`. Check that the next token doesn't start with `--`.

### L6 — Status string casing is inconsistent and fragile
Statuses mix lowercase (`imported`) and capitalized (`Inbox`, `Needs Review`). `processableDocuments` (`src/processor.ts:167`) and `ocr.ts:83` rely on exact strings. A single typo silently drops documents from processing. Centralize the literal set (it already exists in `types.ts:STATUS_VALUES` — but that value is the source of truth that isn't used for comparisons).

### L7 — `send-to-paperless` doesn't re-check `local_pdf_path` is under `rootDir`
**File:** `src/actions.ts:57-60`. It `fs.existsSync(pdfPath)` on a raw DB value without `ensureUnder`. Low risk (DB write access implies deeper compromise) but inconsistent with the PDF-streaming route's `ensureUnder` guard.

### L8 — Notion `request` JSON.parse of error body is unguarded and echoes full response text
**File:** `src/notion.ts:99-114`. Non-JSON 5xx bodies throw `SyntaxError` instead of `NotionApiError`, and the error message embeds the raw response (could include internal Notion detail). Wrap the parse and keep the message bounded.

### L9 — `loadEnvFile` is a surprising constructor side effect that mutates `process.env`
**File:** `src/notion.ts:41-45`. Constructing a `NotionAdapter` (including in dry-run paths and tests) re-reads and mutates global env. Move env loading to an explicit `init()` or the CLI bootstrap.

### L10 — `paperless-cli` script path is fragile and unvalidated
**File:** `src/paperless.ts:26-37`. `paperlessUploadScriptPath` assumes a sibling `paperless-cli` repo at a specific relative depth and `maxBuffer` is only 1 MB. If the script is absent the failure only surfaces at action time. Validate presence at startup or in dry-run.

### L11 — `server.log` exists in the working tree
A 19 KB `server.log` is present at repo root. It's gitignored and untracked, but logs are a common place for tokens/paths to leak. Confirm it's not committed and scrub/rotate it.

### L12 — `body.dryRun !== false` defaults are correct but unintuitive
**Files:** `src/api.ts:148,162`. Anything other than literal boolean `false` is treated as dry-run — `dryRun: "false"` runs dry. Safe-by-default, but document it or use `parseBoolean` consistently.

### L13 — `diceCoefficient` / OCR similarity run over unbounded OCR text
**File:** `src/dedupe.ts:113-155`. Token sets are built from full OCR text for every pair. Fine for now, but combined with M3 this is the hot path; consider hashing/truncating OCR text for dedupe.

### L14 — Swift helper: error detection via `OCR_ERROR:` prefix is fragile
**File:** `utils/vision_ocr.swift:42-60`. An OCR error is signaled by appending `"OCR_ERROR: ..."` to the recognized-lines array and then checking the first line. If the request succeeds but a recognized line starts with `OCR_ERROR:` it's misclassified, and the error path returns before any real results are collected. Use a separate `var error: Error?` captured by the completion handler instead of overloading the lines array.

---

## Test-coverage gaps (per project testing policy)
- `tests/ui.test.ts` (12 lines), `tests/intake.test.ts` (27), `tests/ledger.test.ts` (22), `tests/sidecar.test.ts` (32), `tests/classifier.test.ts` (32) are minimal.
- No tests for: unauthenticated endpoint access (C1), delete-without-Notion (C2), concurrent pipeline runs (H2), invalid `limit`/`baseUrl` (M1/H3), TOCTOU upload collision (M9), invalid due-date/amount extraction (M5), or quarantine purge/expiry (M12).
- No security tests per the repo's own standards: auth bypass, CSRF, timing-safe token, path traversal beyond the happy path, secret leakage in responses/logs.

**Fix:** Add tests for each High/Critical finding above before treating this codebase as production-ready.