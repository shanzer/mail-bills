# Mail Bills: Hardening, launchd Deployment, and UI Redesign

**Date:** 2026-07-02
**Status:** Approved
**Branch plan:** sequential PRs off `main` (see Git Flow)

## Goals

1. Triage and file every open code-audit finding as a GitHub issue; fix all
   High and Medium findings with tests.
2. Ship a native macOS boot-service deployment (launchd). Docker was
   evaluated and rejected for this pass (see Decisions).
3. Redesign the web UI using the DESIGN.md brand system, adapted for a
   dense document-desk layout, matching the iOS app's branding.
4. Merge everything back to `main`, each workstream tested and green.

## Key Decisions (with rationale)

| Decision | Choice | Why |
|---|---|---|
| Fix scope | High + Medium fixed; Lows filed as issues only | Bounds an already large effort; every real security/correctness hole closes |
| Issue tracker | GitHub (`shanzer/mail-bills`) via `gh` | Best tooling; issues close from commit messages |
| Deployment | launchd, **no Docker** | Docker on macOS = Linux VM: loses Vision OCR (the *primary* OCR path — iPhone PDFs are image-only, `PDFBuilder.swift` embeds no text layer), loses `ollama` CLI, risks SQLite-over-VirtioFS corruption, can't rematerialize evicted iCloud files. launchd `KeepAlive`+`RunAtLoad` provides boot/restart natively with zero loss |
| UI design | DESIGN.md brand, adapted for data UI | Consistency with iOS app; strict spec (860px cap, 16px/1.7 body) fights a review-table layout |
| Git flow | Sequential PRs per workstream | Reviewable, bisectable, issues auto-close |

## Workstream 0 — Baseline

Fast-forward `main` to `fix/security-audit-critical-fixes` (4 commits ahead,
no divergence). Push `main` to both remotes (`github`, `origin`/slop.local).
All workstream branches cut from `main`.

## Workstream 1 — Audit + Issue Filing

Fresh audit pass (focus: path/config inconsistencies not in ISSUES.md), then
file GitHub issues with `severity:high|medium|low` labels.

**New findings (beyond ISSUES.md):**
- CLI default config path is `../mail-bills/config.yaml` (sibling-dir
  leftover from the Python project); should default to `./config.yaml`.
  `package.json` `start` script bakes in the same sibling path.
- `DEFAULT_ROOT` in `src/config.ts` hardcodes `/Users/buckaroo/...`.
- `config.example.yaml` uses buckaroo paths.

**From ISSUES.md:**
- To fix in WS2: H1, H2, H3, H5, H6, H4-remainder (rate limiting),
  M1, M2, M3, M4-remainder, M5, M8, M9, M10, M11, M12.
- Filed only: L1–L7, L10–L14, and the dedupe-perf note L13.

**Enhancement issue:** iOS app runs `VNRecognizeTextRequest` at scan time and
embeds a text layer in the PDF (or OCR text in the sidecar), removing the
server-side OCR dependency entirely. Long-term path to portable deployment.

## Workstream 2 — High + Medium Fixes (one PR)

Each fix lands with a test; commit messages reference `Fixes #N`.

- **H1 — transactions:** `Ledger` holds one long-lived `better-sqlite3`
  connection; add `transaction(fn)` wrapper. `importPair`'s
  batch+document+event writes and `processDocument`'s multi-upsert become
  atomic. Also removes per-call open/close overhead.
- **H2 — pipeline mutex:** one in-process mutex covers scheduler runs, live
  runs, dry runs, and per-batch runs. Concurrent triggers → `409`.
- **H3 — baseUrl validation:** http/https only; host must be loopback,
  RFC1918, `.local`, or Tailscale CGNAT (100.64/10). Applies to
  `GET /api/pairing/qr` and `POST /api/pairing/rotate-token`.
- **H4 remainder — rate limiting:** in-memory per-IP failed-auth backoff on
  intake and admin-guarded routes.
- **H5 — CSRF:** `Origin` check on state-changing routes. Matters
  specifically in loopback-no-token mode (a malicious page on the Mac could
  otherwise CSRF the API; Authorization-header mode is already cross-site
  safe because forms can't set that header).
- **H6 — indexes + schema versioning:** indexes on `documents(status)`,
  `documents(batch_id)`, `documents(due_date)`; `PRAGMA user_version`
  versioning wrapping the existing additive `ALTER TABLE` migrations.
- **M1:** `Number.parseInt` + clamp `limit` to `[1, 500]`, `offset` to
  `>= 0`; defaults on NaN.
- **M2:** align `bodyLimit` with multipart limits (bodyLimit ≥ sum of file
  caps).
- **M3:** load dedupe sources once per batch (pass into `processDocument`),
  not once per document.
- **M4 remainder:** portable `DEFAULT_ROOT` (derive from `$HOME` or make
  relative); fix `config.example.yaml`; fix CLI default config path and
  `package.json` start script (`./config.yaml`).
- **M5:** due-date extraction requires keyword adjacency (no bare-date
  match); validate month ≤ 12 / day ≤ 31; prefer labeled amounts over
  first-`$` fallback.
- **M8:** `%PDF` magic-byte check in `acceptUpload`.
- **M9:** `fs.openSync(path, "wx")` exclusive create for `.part` files
  (TOCTOU); cap collision-compare size.
- **M10:** drop absolute filesystem paths from API responses (return
  `documentId`/`created` only); update tests.
- **M11:** server-side pagination (total count + `limit`/`offset` honored);
  UI control ships in WS4.
- **M12:** quarantine purge — scheduler task + CLI command that permanently
  deletes files past `quarantined_until` and updates the ledger.

**Security tests added:** auth bypass attempts, CSRF origin rejection, rate
limit backoff, path traversal, TOCTOU collision, invalid query params,
invalid baseUrl, magic-byte rejection.

## Workstream 3 — launchd Service (one PR)

`deploy/` directory:
- `com.mail-bills.api.plist` template: `RunAtLoad`, `KeepAlive`,
  `StandardOutPath`/`StandardErrorPath` to `~/Library/Logs/mail-bills/`,
  `WorkingDirectory` = repo, absolute node path resolved at install.
- `install.sh`: validates config exists, runs `npm run build`, resolves
  node path, renders plist, `launchctl bootstrap gui/$UID`.
- `uninstall.sh`: `launchctl bootout`, leaves data intact.
- Log rotation via a `newsyslog.d` config installed by `install.sh`.
- README deployment section.

## Workstream 4 — UI Redesign (one PR)

**Structural:** split the 56KB `src/ui.ts` string monolith into real files —
`src/ui/index.html`, `src/ui/app.css`, `src/ui/app.js` — copied to
`dist/ui/` at build (npm script) and served from disk. Route API unchanged
(`GET /`, `GET /ui/styles.css`, `GET /ui/app.js`).

**Visual (adapted Foobar brand):**
- Charcoal (#1B2535) sticky nav, `{ mail-bills }` Courier wordmark with
  amber brackets and thin-space padding.
- Linen (#F5F1EB) surfaces; flat elevation (color, not shadow); 4/6/8px
  radii; no pill buttons.
- Wide app shell (~1360px); 860px reading measure inside the detail pane
  only.
- Table density 13–14px; body type roles per DESIGN.md elsewhere.
- Georgia serif for the page title only.
- Status chips: forest = complete/archived, amber-dark = Needs Review,
  slate = inbox/imported, mid-gray = deleted/quarantined.
- One amber primary action per view.

**Functional:** pagination controls (WS2 server paging), review-queue-first
layout, pipeline summary panel, styled admin-token prompt (replaces the
bare `prompt()`/first-401 flow visually; same localStorage mechanism).

**Verification:** Chrome screenshots of the running service against the
design before merge.

## Testing Gate (every PR)

- `npm run check` and `npm test` green.
- WS2: the security test list above.
- Final end-to-end smoke on a temp data dir: boot API → intake upload →
  pipeline run → document visible and actionable in UI.

## Out of Scope

- Low findings (filed as issues only).
- iOS OCR embedding (filed as enhancement issue).
- Docker/Linux deployment (revisit when/if the service leaves the Mac).
- Paperless/reminders integration changes.
