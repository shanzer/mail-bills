# Baseline Merge + GitHub Issue Filing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fast-forward `main` to the current security branch, then file every open audit finding as a labeled GitHub issue and record the finding→issue mapping in ISSUES.md.

**Architecture:** Pure git + `gh` CLI operations; no application code changes. Issue bodies are condensed from ISSUES.md (which stays as the detailed reference). Spec: `docs/superpowers/specs/2026-07-02-hardening-launchd-ui-design.md`.

**Tech Stack:** git, GitHub CLI (`gh`, already authenticated as `shanzer`).

## Global Constraints

- Repo: `shanzer/mail-bills` on github.com. Second remote `origin` (slop.local) receives pushes but no issues.
- Issue labels: `severity:high`, `severity:medium`, `severity:low`, `enhancement` (built-in).
- Never include real tokens or absolute `/Users/shanzer/...` data paths in issue bodies.
- All work happens on `main` after the fast-forward (docs-only commit at the end).

---

### Task 1: Fast-forward main and push both remotes

**Files:** none (git only)

- [ ] **Step 1: Verify clean tree and fast-forward eligibility**

Run: `git status --porcelain && git rev-list --left-right --count main...fix/security-audit-critical-fixes`
Expected: empty status; `0	N` (main has 0 unique commits). If main has unique commits, STOP and report — the spec assumes fast-forward.

- [ ] **Step 2: Merge and push**

```bash
git checkout main
git merge --ff-only fix/security-audit-critical-fixes
git push github main
git push origin main
```

Expected: `Fast-forward` in merge output; both pushes succeed. If `origin` (slop.local) is unreachable, continue — report it at the end; github is the tracker of record.

- [ ] **Step 3: Verify**

Run: `git log --oneline -3 main`
Expected: newest commit is the spec/CLAUDE.md commit from the security branch.

### Task 2: Create severity labels

- [ ] **Step 1: Create labels (idempotent)**

```bash
gh label create "severity:high"   --color D93F0B --description "Serious correctness/reliability/security" --force
gh label create "severity:medium" --color E99695 --description "Real but bounded impact" --force
gh label create "severity:low"    --color FBCA04 --description "Quality / hardening" --force
```

- [ ] **Step 2: Verify**

Run: `gh label list | grep severity`
Expected: all three labels listed.

### Task 3: File High-severity issues (6)

For every issue in Tasks 3–6: the title starts with the ISSUES.md finding ID so the mapping stays greppable. Bodies reference ISSUES.md sections for full detail.

- [ ] **Step 1: File H1–H6 + H4**

```bash
gh issue create --label "severity:high" --title "H1: Ledger has no transactions; one SQLite connection opened per call" --body "importPair writes batch+document+event in three separate connections with no BEGIN/COMMIT; every Ledger method opens/closes its own connection. Crash between writes leaves inconsistent state; repeated open/fsync/close hurts performance and invites lock contention between API and scheduler.

Fix: long-lived connection on the Ledger instance + transaction(fn) wrapper; wrap importPair and processDocument multi-writes. Details: ISSUES.md H1."

gh issue create --label "severity:high" --title "H2: Pipeline runs are not mutually exclusive across entry points" --body "scheduler.runNow() is guarded, but dry-run process-pending and POST /api/pipeline/batches/:id/process call the processor directly with no guard. Concurrent runs race dedupe, file moves, and double-process documents.

Fix: one in-process mutex over all pipeline entry points; concurrent triggers get 409. Details: ISSUES.md H2."

gh issue create --label "severity:high" --title "H3: Pairing baseUrl is unvalidated -> intake token exfiltration via QR" --body "GET /api/pairing/qr?baseUrl=... and POST /api/pairing/rotate-token accept any string; the QR payload embeds the live intake token and points the iPhone at that URL. An attacker-supplied baseUrl redirects uploads (PDF + bearer token) to a hostile host.

Fix: allow only http/https with loopback/RFC1918/.local/single-label/Tailscale-CGNAT hosts. Details: ISSUES.md H3."

gh issue create --label "severity:high" --title "H4: No rate limiting on failed auth attempts (intake + admin)" --body "Bearer compares are now constant-time, but nothing throttles failed attempts, allowing online brute force of the shared tokens.

Fix: in-memory per-IP failed-auth backoff on the intake route and the admin preHandler; 429 while blocked. Details: ISSUES.md H4 (remaining gap)."

gh issue create --label "severity:high" --title "H5: CSRF on state-changing routes in loopback-no-token mode" --body "With api.admin_token unset, loopback requests pass with no auth. A malicious page open on the Mac can POST simple multipart/JSON-less forms (import-pdf, actions, pipeline) to 127.0.0.1 — multipart skips CORS preflight and forms cannot be blocked by the missing-token check because loopback is trusted.

Fix: reject non-GET admin requests whose Origin header does not match the request Host (absent Origin = CLI, allowed). Details: ISSUES.md H5."

gh issue create --label "severity:high" --title "H6: SQLite has no indexes and no schema-version story for the legacy ledger" --body "initialize() only does CREATE TABLE IF NOT EXISTS + blind ALTER TABLE try/catch. documentsByStatus/documentsForBatch/ORDER BY due_date are full scans; there is no versioned migration path for the Python-era ledger.

Fix: indexes on documents(status), documents(batch_id), documents(due_date); PRAGMA user_version-gated migrations. Details: ISSUES.md H6."
```

- [ ] **Step 2: Verify**

Run: `gh issue list --label "severity:high" --json number,title --jq '.[] | "\(.number) \(.title)"'`
Expected: 6 issues, titles starting H1–H6.

### Task 4: File Medium-severity issues (10)

- [ ] **Step 1: File M1–M5, M8–M12**

```bash
gh issue create --label "severity:medium" --title "M1: limit/offset parsed with Number() can inject NaN into SQL" --body "GET /api/documents parses ?limit/?offset with Number(); '?limit=abc' binds NaN into LIMIT with undefined behavior, and there is no upper bound.

Fix: Number.parseInt, clamp limit to [1,500], offset to >=0, fall back to defaults on NaN. Details: ISSUES.md M1."

gh issue create --label "severity:medium" --title "M2: bodyLimit (50MB) contradicts multipart fileSize/files limits" --body "Multipart allows two 50MB files but the whole request is capped at 50MB, so legitimate near-cap uploads fail.

Fix: bodyLimit >= sum of per-file caps. Details: ISSUES.md M2."

gh issue create --label "severity:medium" --title "M3: Dedupe reloads all source documents once per processed document (quadratic)" --body "processDocument calls loadDuplicateSources per document (5 status scans each). O(N*M) per batch.

Fix: load sources once per batch, append each processed doc to the in-memory set. Details: ISSUES.md M3."

gh issue create --label "severity:medium" --title "M4: Hardcoded /Users/buckaroo defaults and sibling-dir config path" --body "DEFAULT_ROOT in src/config.ts is /Users/buckaroo/.hermes/projects/mail-bills; config.example.yaml uses buckaroo paths; cli.ts and the npm start script default to ../mail-bills/config.yaml — a sibling-directory leftover from the Python repo that silently depends on cwd.

Fix: DEFAULT_ROOT ~/data/mail-bills; default --config ./config.yaml; fix example + docs. Details: ISSUES.md M4 (remaining) + spec WS1."

gh issue create --label "severity:medium" --title "M5: Due-date/amount extraction false positives; no range validation" --body "The bare 'Month DD, YYYY' regex matches any date in the OCR text; the numeric path emits impossible dates like 2026-13-35; amount falls back to the first \$ in the document.

Fix: require due/pay keyword adjacency, validate month/day ranges via real-date round-trip. Details: ISSUES.md M5."

gh issue create --label "severity:medium" --title "M8: Intake endpoint does not validate PDF magic bytes" --body "Phone intake accepts any bytes as 'pdf'; malformed payloads flow into pdf-parse/Vision later.

Fix: %PDF header check (within first 1024 bytes) in acceptUpload, 400 on mismatch. Details: ISSUES.md M8."

gh issue create --label "severity:medium" --title "M9: TOCTOU in acceptUpload collision handling" --body "existsSync-then-write-then-rename is not atomic; two concurrent uploads of the same documentId can both pass the check and the second rename clobbers the first. Collision compare also reads both files fully into memory.

Fix: exclusive-create ('wx') for .part files; size-compare before content-compare. Details: ISSUES.md M9."

gh issue create --label "severity:medium" --title "M10: Absolute filesystem paths leak in API responses" --body "Intake and import-pdf responses include pdfPath/sidecarPath server paths.

Fix: return documentId/batchId/created only. Details: ISSUES.md M10."

gh issue create --label "severity:medium" --title "M11: Document list has no real pagination" --body "UI fetches limit=500 and renders everything; the API returns no total, so paging is impossible.

Fix: countDocuments() + total/limit/offset in the response; the UI control lands with the UI redesign PR. Details: ISSUES.md M11."

gh issue create --label "severity:medium" --title "M12: quarantined_until purge never runs — quarantine is never emptied" --body "Quarantine sets a 7-day quarantined_until but nothing ever deletes expired quarantined files or finalizes the ledger rows.

Fix: purge step in the scheduler + purge-quarantine CLI command (dry-run capable, ensureUnder-guarded deletes). Details: ISSUES.md M12."
```

- [ ] **Step 2: Verify**

Run: `gh issue list --label "severity:medium" --json number --jq 'length'`
Expected: `10`.

### Task 5: File Low-severity issues (12)

- [ ] **Step 1: File L1–L7, L10–L14**

```bash
gh issue create --label "severity:low" --title "L1: DocumentStatus typed as union | string, defeating the union" --body "src/types.ts:28 collapses the status union to string; comparisons are unchecked. Details: ISSUES.md L1."
gh issue create --label "severity:low" --title "L2: Duplicated safeSegment/SAFE_ID_RE and divergent uniqueDestination counters" --body "intake.ts and importer.ts each define safeSegment; importer counter starts at 1, quarantine at 2. Consolidate in paths.ts. Details: ISSUES.md L2."
gh issue create --label "severity:low" --title "L3: Dead config paths / bootstrap directories" --body "processingDir, archiveDir, logsDir, batchesDir, errorDir are created by bootstrap but never used. Wire in or remove. Details: ISSUES.md L3."
gh issue create --label "severity:low" --title "L4: cli --log-level not validated against LOG_LEVELS" --body "Invalid level is cast into config and Fastify rejects at logger init. Reuse loggingLevel(). Details: ISSUES.md L4."
gh issue create --label "severity:low" --title "L5: cli flag parsing consumes the next token even if it is a flag" --body "--config --dry-run sets config to '--dry-run'. Check next token does not start with --. Details: ISSUES.md L5."
gh issue create --label "severity:low" --title "L6: Status string casing is inconsistent and fragile" --body "Statuses mix 'imported'/'Inbox'/'Needs Review'; exact-string filters silently drop documents on typos. Centralize on STATUS_VALUES. Details: ISSUES.md L6."
gh issue create --label "severity:low" --title "L7: send-to-paperless does not ensureUnder local_pdf_path" --body "actions.ts uses a raw DB path without the ensureUnder guard the PDF route applies. Details: ISSUES.md L7."
gh issue create --label "severity:low" --title "L10: paperless-cli script path fragile and unvalidated" --body "Assumes a sibling repo at fixed depth; absence only surfaces at action time. Validate at startup/dry-run. Details: ISSUES.md L10."
gh issue create --label "severity:low" --title "L11: server.log in the working tree" --body "Untracked but present; logs are a token-leak vector. Scrub/rotate; ensure log output lives outside the repo. Details: ISSUES.md L11."
gh issue create --label "severity:low" --title "L12: dryRun body parsing is safe-by-default but unintuitive" --body "Anything but literal false is dry-run; dryRun:'false' runs dry. Use parseBoolean consistently or document. Details: ISSUES.md L12."
gh issue create --label "severity:low" --title "L13: diceCoefficient runs over unbounded OCR text in the dedupe hot path" --body "Token sets built from full OCR text per pair. Consider hashing/truncation. Details: ISSUES.md L13."
gh issue create --label "severity:low" --title "L14: Swift Vision helper signals errors via OCR_ERROR: line prefix" --body "Error detection by overloading the recognized-lines array misclassifies real lines starting with the prefix. Capture the error separately. Details: ISSUES.md L14."
```

- [ ] **Step 2: Verify**

Run: `gh issue list --label "severity:low" --json number --jq 'length'`
Expected: `12`.

### Task 6: File enhancement issues (3)

- [ ] **Step 1: File the three workstream/enhancement issues**

```bash
gh issue create --label "enhancement" --title "iOS: run text recognition at scan time and embed OCR text" --body "PDFBuilder.swift renders image-only PDFs, so server-side Vision OCR is the primary extraction path for every phone scan, blocking portable (non-macOS) deployment.

Proposal: run VNRecognizeTextRequest on-device after VNDocumentCameraScan and either embed a PDF text layer or ship ocrText in the sidecar JSON; server prefers sidecar/embedded text and skips local OCR when present. Eliminates the macOS-only OCR dependency (see spec: docs/superpowers/specs/2026-07-02-hardening-launchd-ui-design.md)."

gh issue create --label "enhancement" --title "Ship launchd boot-service deployment" --body "deploy/ directory with a plist template (RunAtLoad, KeepAlive, logs under ~/Library/Logs/mail-bills/), install.sh / uninstall.sh using launchctl bootstrap gui/\$UID, newsyslog.d rotation, README section. Docker was evaluated and rejected for the macOS host (loses Vision OCR + ollama CLI, SQLite-over-VirtioFS risk, iCloud eviction). Spec: WS3."

gh issue create --label "enhancement" --title "UI redesign: split ui.ts monolith and apply brand design system" --body "Split the 56KB src/ui.ts string constants into real src/ui/ files served from dist; restyle per DESIGN.md adapted for a dense document desk (charcoal nav + { mail-bills } wordmark, linen surfaces, status chips, wide shell with 860px reading measure, pagination using the M11 API). Spec: WS4."
```

- [ ] **Step 2: Verify**

Run: `gh issue list --label enhancement --json number --jq 'length'`
Expected: `3`.

### Task 7: Record the mapping in ISSUES.md and commit

- [ ] **Step 1: Generate the mapping**

Run: `gh issue list --limit 40 --state open --json number,title --jq 'sort_by(.number) | .[] | "| #\(.number) | \(.title) |"'`

- [ ] **Step 2: Edit ISSUES.md**

Insert after the "## Status — resolved in the critical-fixes pass" section:

```markdown
## GitHub issue mapping (filed 2026-07-02)

All remaining findings below are tracked as GitHub issues. Fix commits must
reference the issue (`Fixes #N`). Mapping:

| Issue | Title |
|---|---|
<rows from Step 1 output>
```

- [ ] **Step 3: Commit to main and push**

```bash
git add ISSUES.md
git commit -m "Record GitHub issue mapping for open audit findings"
git push github main && git push origin main
```

---

## Execution notes

- Tasks 3–6 are `gh` calls: run them from the repo root so `gh` infers the repo.
- If any `gh issue create` fails midway, re-run only the missing ones (check with `gh issue list`); titles are unique so duplicates are easy to spot.
