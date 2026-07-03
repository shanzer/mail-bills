# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TypeScript/Node (ESM) REST service and CLI for the Mail Bills physical-mail
processing pipeline. It is a rewrite of an earlier Python project and
deliberately preserves that project's **SQLite ledger schema** so the live
ledger at `../mail-bills/data/ledger.sqlite` stays readable by both. The key
architectural shift from the Python version: workflow logic lives in importable
modules and HTTP endpoints instead of UI code shelling out to command-line tools.

## Commands

```bash
npm run check        # tsc --noEmit type check (fast, no build)
npm test             # vitest run (whole suite)
npm run build        # tsc -> dist/  (REQUIRED before start / mail-bills)
npx vitest run tests/processor.test.ts   # single test file
npx vitest run -t "duplicate"            # tests matching a name

npm run start -- --host 0.0.0.0 --port 8765 [--log-level debug]
npm run mail-bills -- <command> ...      # CLI, see src/cli.ts printHelp()
```

`start` and `mail-bills` execute compiled `dist/src/cli.js`, so **`npm run build`
after every source change** or you will run stale code. `check` and `test` run
against `.ts` directly and do not need a build.

CLI commands (all take `--config <path>`, default `./config.yaml`):
`api`, `bootstrap`, `import`, `process-pending`, `process-batch <id>`,
`review list|resolve`, `action <docId> --action <a>`, `backfill-summaries`,
`pairing`. Most mutating commands accept `--dry-run`.

## Pipeline architecture

Documents flow through discrete, individually-testable modules. `processor.ts`
orchestrates them; do not fold their logic back into the orchestrator.

```
intake.ts    accept phone upload -> durable PDF+JSON sidecar pair (no processing)
importer.ts  scan upload/iCloud intake dirs -> ledger rows (status "imported")
ocr.ts       extract embedded PDF text; Vision fallback; optional model summary
classifier.ts  deterministic category/vendor/amount/due-date + urgency
dedupe.ts    conservative duplicate detection against prior docs
review.ts / actions.ts / quarantine.ts   review resolution + reversible actions
scheduler.ts periodic in-process process-pending runs
```

`processDocument` (processor.ts) is the canonical per-document sequence: OCR ->
classify -> upsert -> dedupe -> event. Status progresses roughly
`imported -> Inbox/Needs Review -> actionable/archived/complete/deleted`.

### Key invariants
- **Dry-run is real backpressure.** Every mutating path threads a `dryRun` flag
  that must produce the same computed result without writing the ledger or
  filesystem. When adding pipeline steps, honor it.
- **Ledger schema compatibility.** `ledger.ts` writes only columns in the
  `DOCUMENT_COLUMNS`/`BATCH_COLUMNS` allowlists; new columns need an additive
  `ALTER TABLE ... ADD COLUMN` migration in `initialize()` (see the loop that
  guards against pre-existing columns). Never rename/drop existing columns.
- **Injectable side effects.** OCR, classifier, dedupe, importer are passed into
  the processor via `ProcessorServices` so tests can substitute them. Keep new
  external effects (reminders, messaging, model calls) injectable, not hardcoded.
- **`textValue()` / `optionalText()` (paths.ts)** normalize nullable ledger
  fields; use them rather than raw truthiness on DB values.

## Auth model (two separate tokens)

- `POST /api/mail-bills/intake` — phone upload only, guarded by
  `intake_upload.token`.
- Every other `/api/*` route — guarded by `api.admin_token` via the
  `requireAdmin` preHandler. **If `admin_token` is unset, those routes are
  reachable only from loopback (127.0.0.1); remote callers get 401.** This keeps
  a token-less local install usable from the Mac without exposing management over
  the LAN.
- Both tokens are checked with `timingSafeBearerMatch` (constant-time). Preserve
  that when touching auth; do not compare tokens with `===`.

The browser UI (`ui.ts`) is served as embedded HTML/CSS/JS string constants and
calls the REST endpoints directly. It is large — edit the relevant string block,
don't rewrite the file.

## Conventions

- Strict TS, ESM. **Relative imports use `.js` extensions** (NodeNext) even
  though sources are `.ts` — match this.
- `camelCase` for TS symbols; `snake_case` only where mirroring the SQLite schema
  or an external payload contract (sidecar JSON, ledger rows).
- Tests (`tests/*.test.ts`, Vitest) must use temp dirs via `tests/helpers.ts` and
  must never touch `../mail-bills/data/ledger.sqlite` or live intake folders.
- Path safety: writes into intake/ledger dirs go through `ensureUnder()` and
  `safeSegment()` — reuse them for any new user-controlled path.

## Vision OCR helper

Vision fallback (`ocr.vision_fallback_enabled`) shells out to a compiled,
macOS-specific Swift binary at `dist/utils/vision_ocr` (override with
`ocr.vision_helper_path`). It is not built by `bootstrap` or `build`; compile per
machine:

```bash
mkdir -p dist/utils
swiftc utils/vision_ocr.swift -o dist/utils/vision_ocr -framework AppKit -framework PDFKit -framework Vision
```

## Reference docs

`README.md` (full REST route list, pairing flow, logging), `AGENTS.md` (repo
guidelines), `DESIGN.md`, `ISSUES.md`. iOS scanner app lives in
`ios/MailBillsScan`.
