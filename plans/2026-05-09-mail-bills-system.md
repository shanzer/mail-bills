# Mail and Bills Handling System

> Drafted as the next operating-system layer after Gmail/calendar automation.

Goal: build a low-friction, low-false-negative system so Mike does not miss bills, deadlines, medical/insurance paperwork, or important physical mail while avoiding a giant new chore-monster wearing a productivity hat.

Principles:
- Capture first, decide later.
- Never rely on memory.
- Separate “needs action” from “keep for records.”
- Make the weekly process short enough that it actually happens.
- Prefer reversible labels/statuses over destructive moves.
- The system should work with ugly real life: unopened envelopes, PDFs, weird portals, insurance nonsense, and avoidance because civilization was a mistake.

## System overview

There are four lanes:

1. Physical mail intake
   - Anything arriving on paper gets captured into a single inbox.
   - Important-looking mail gets scanned or photographed.
   - Envelopes are not sorted into seventeen artisanal piles. One inbox, because we are adults with finite rage.

2. Digital bill/email intake
   - Digital/Gmail bill intake is out of scope for V1.
   - V1 focuses on physical mail only.
   - The design should remain compatible with adding Gmail/digital bills later.
   - When Gmail/digital intake is added, it should follow the same rules as physical mail:
     - high-confidence actionable items create Apple Reminders automatically
     - low-confidence items trigger Discord confirmation questions
     - urgent items create Apple Reminders and send Telegram urgent fallback alerts

3. Action tracker
   - V1 action tracker lives in Apple Reminders, in a new dedicated list.
   - Actionable items should also appear in the Notion `Mail & Bills` database.
   - Notion keeps the full mail/document record, OCR text, metadata, status, and archive/review history.
   - Apple Reminders mirrors actionable tasks for execution.
   - Non-actionable scanned records appear in Notion only and do not become reminders.
   - Every actionable reminder should include enough context to find the source document:
     - source
     - category
     - sender/vendor
     - due date, if any
     - amount, if any
     - next action
     - local PDF/archive reference
   - A local metadata ledger may still be used as implementation glue, but Apple Reminders is the user-facing tracker.

4. Weekly review ritual
   - Weekly review happens Saturday at 10:00 AM America/New_York.
   - Review open items.
   - Pay/schedule bills.
   - Archive records.
   - Escalate medical/insurance nonsense.
   - The weekly review itself is a Discord digest only, not an Apple Reminder. Telegram is reserved for urgent fallback alerts.

## Recommended statuses

Use exactly these statuses at first:

- NEW
  - Captured but not reviewed.

- NEEDS-ACTION
  - Requires Mike to do something.

- WAITING
  - Someone else/vendor/insurance/provider needs to respond.

- SCHEDULED
  - Payment/appointment/callback is scheduled.

- DONE
  - Completed; keep record.

- ARCHIVED
  - No action needed; stored for records.

- JUNK
  - Confirmed junk; no action.

Do not add more statuses until these hurt. Premature taxonomy is how workflows become haunted forests.

- Inbox
- Needs Review
- Actionable
- Waiting
- Completed
- Archived
- Deleted
- Error
- Duplicate

When a linked Apple Reminder is completed, move the Notion record to `Needs Review` with reason `Reminder completed; decide archive/retention`, and record completion metadata. The `Completed` status exists for completed items that do not currently need retention/review action, or if implementation later proves that distinction useful.

## Categories

Initial categories:

- BILL
- HEALTH-INSURANCE
- OTHER-INSURANCE
- SCHOOL-FAMILY
- TAX-LEGAL-GOVERNMENT
- HOME-AUTO
- RECEIPT-RECORD
- SUBSCRIPTION
- UNKNOWN

Notion `Category` should be single-select. Health/medical insurance should be merged into `HEALTH-INSURANCE`; other insurance types remain separate as `OTHER-INSURANCE`.

## Capture process vision

Preferred V1: use an Apple iPhone scan workflow with iCloud Drive as the intake handoff.

Confirmed decisions:

- Capture happens from Mike's iPhone.
- Generate an importable Apple Shortcut if feasible, rather than relying only on manual build instructions.
- Use one PDF per mail item.
- Each PDF may contain multiple pages for that same document.
- Do not combine multiple mail items into one batch PDF.
- iCloud Drive is acceptable as the temporary intake folder between iPhone and this Mac.
- The iCloud intake folder is a temporary drop zone, not permanent storage.
- Proposed architecture change confirmed: Notion should be used for OCR text, metadata, inbox/archive status, and review views, with one `Mail & Bills` database. Do not store or attach PDFs in Notion; original PDFs remain local on the Mac.
- Capture should include a quick optional friendly label after each scan. Friendly labels map to Notion single-select categories:
  - Bill -> `BILL`
  - Health / Medical / Insurance -> `HEALTH-INSURANCE`
  - Other Insurance -> `OTHER-INSURANCE`
  - School / Family -> `SCHOOL-FAMILY`
  - Tax / Legal / Government -> `TAX-LEGAL-GOVERNMENT`
  - Home / Auto -> `HOME-AUTO`
  - Receipt / Record -> `RECEIPT-RECORD`
  - Subscription / Membership -> `SUBSCRIPTION`
  - Other / Unknown -> `UNKNOWN`
- Home/auto insurance should be categorized as `HOME-AUTO`, not `OTHER-INSURANCE`.
- Health/medical insurance receipts should be categorized as `HEALTH-INSURANCE`, not `RECEIPT-RECORD`.
- `BILL` is reserved for non-medical/non-insurance bills. Medical/doctor/health bills map to `HEALTH-INSURANCE`; home/auto insurance bills map to `HOME-AUTO`.
- `OTHER-INSURANCE` is for non-health insurance that does not fit home/auto.
- If OCR/classification clearly disagrees with the Shortcut label, ask before overriding the label/category. Label conflict prompts should use these choices: `Keep my label`, `Use detected category`, `Create reminder anyway`, `Needs review`. Label conflict prompts count against the maximum of 5 Discord questions per batch. `Needs review` creates/updates a Notion item with status `Needs Review`, due at the next weekly review, with no Apple Reminder. `Create reminder anyway` keeps Mike's original Shortcut label/category. Label conflicts block automatic Apple Reminder creation until Mike answers, even if the item otherwise appears urgent.
- The label may be skipped.
- Capture should also allow an optional free-text note after scanning.
- Shortcut should loop for bulk processing: scan one mail item, optionally label/note it, save it, then show a menu with `Scan next mail item` and `Finish batch` until Mike finishes.
- Each mail-processing session should create a batch ID, shared by all PDFs/metadata files captured during that session, so processing summaries can report by batch and imports can be debugged sanely.
- When Mike finishes a batch, the Shortcut should show a local iPhone confirmation and send a Discord message saying the mail batch is ready for processing.
- Mac-side import should run as a frequent watcher / frequent poller against the iCloud intake folder.
- Batch summaries should include the batch ID.
- For implementation, use one PDF plus one sidecar JSON metadata file per mail item. Avoid encoding notes in filenames because punctuation, long text, and weird characters become a tiny filesystem goblin festival.
- After successful local import of both the PDF and sidecar JSON, delete the temporary iCloud copies unless the item is moved to an error folder because import failed.
- Do not decide whether to keep the original PDF during scan; decide later during review.
- Permanent original-PDF retention is local-Mac-only for V1, not iCloud Drive.
- Default retention policy is keep local original PDFs; delete only when explicitly discarded. A later scheduled cleanup job may remove eligible items after 30 days, but should not be enabled until rules are approved.
- Retained PDFs should be organized by year/month/category.
- OCR text and extracted metadata are stored in Notion for searchable/reviewable records. Original PDFs remain local only; do not upload/attach PDFs to Notion.
- Sensitive categories use the same storage layout for V1; restricted/encrypted/special handling can be designed later.
- Discord is the primary notification/review surface for Mail & Bills. Use one dedicated Discord channel for V1: `#mail-bills`. Telegram is urgent fallback only.
- After Mac-side import/OCR/classification, always send a structured Discord summary for the batch so Mike knows the system ran. The batch summary should include sections for Batch ID, Counts, Apple Reminders Created, Needs Review, and Errors. It should emphasize counts and created Apple Reminders, plus targeted questions/errors when present.
- Urgent triggers should create Apple Reminders when not blocked by review/conflict rules and send short Telegram pointer alerts only, not full item summaries. The Telegram alert should say to check Discord/Notion, include only minimal metadata: vendor and due date when available, and not name the Discord channel. Discord `#mail-bills` urgent messages should not mention Mike by default and should use no special urgent formatting: no mention, no `URGENT:` prefix, no special emoji. Mentions are disabled for V1 unless explicitly enabled later. Urgent triggers include: due date within 14 days, any detected amount due, medical/insurance deadlines, school/family deadlines, tax/legal/government notices, or language such as final notice, past due, urgent, action required, deadline, cancellation, lapse, denial, appeal, collections, or similar.
- Open decision: whether every scanned mail item becomes a tracker item, or only actionable/uncertain scans become tracker items while record-only scans are archived with metadata.
- iMessage/BlueBubbles can be considered later for conversation/replies, but is not the V1 intake path.

Flow:

1. Mike opens the physical mail.
2. For each mail item that might matter, Mike runs an iPhone scan workflow.
3. The workflow creates one multi-page PDF for that mail item.
4. The workflow saves the PDF into a dedicated iCloud Drive intake folder.
5. A Mac-side processor watches or periodically scans the intake folder.
6. Buckaroo copies/saves the original PDF into the local raw inbox.
7. Import and OCR/classification may be split into separate implementation steps if that is cleaner. Preferred implementation: frequent import first, then OCR/classification in a separate processor that can retry and fail independently.
8. The extracted text is classified into a category/status.
9. A proposed action item is created when actionable.
10. If confidence is low, Buckaroo asks a short confirmation question instead of guessing.
11. Failed imports/OCR errors are moved to an error folder and summarized later rather than immediately interrupting Mike. Error summaries should appear in the batch summary and again in the weekly review if unresolved.

Preferred folders:

- `/Users/buckaroo/.hermes/projects/mail-bills/inbox/` — raw captured photos/PDFs
- `/Users/buckaroo/.hermes/projects/mail-bills/processed/` — OCR text + normalized metadata
- `/Users/buckaroo/.hermes/projects/mail-bills/archive/` — completed/archived files
- `/Users/buckaroo/.hermes/projects/mail-bills/items.json` — action tracker

OCR approach:

- PDFs with real text: use PyMuPDF-style extraction.
- Photos/scanned PDFs: use OCR.
- A configurable vision/LLM model is allowed for difficult scans when local extraction is insufficient.
- Do not use a model for every document unless later approved; V1 model use is fallback/difficult-scan assistance.
- Never treat OCR/model output as authoritative for amounts/due dates when confidence is low; mark for review.

Classifier output:

- category
- sender/vendor
- likely due date
- likely amount
- whether payment is required
- whether it is medical/insurance paperwork
- confidence
- recommended next action

Important rule: the system should create a review item, not silently decide that a bill is paid/not paid. The robot may read the mail; it does not get a debit card and a sense of adventure.

## Physical mail workflow

Daily / whenever mail comes in:

1. Put all mail in one physical tray: “Mail Inbox.”
2. Immediately throw away obvious junk before scanning.
3. Anything that might be important stays in the tray.

Twice weekly quick scan, 10 minutes:

1. Open everything in the tray.
2. For each item:
   - If junk: recycle/shred.
   - If record only: scan/photo, mark ARCHIVED.
   - If actionable: scan/photo, create action item.
3. After scanning, put physical originals into one temporary folder: “Processed Mail — Hold.”
4. Periodically shred/recycle items from the hold folder unless they are tax/legal/government, medical-critical, insurance-critical, warranty/receipt records, or otherwise worth retaining physically.
5. Exact physical hold duration is an open decision.

## Digital bills/email workflow

Out of scope for V1. V1 is physical mail only.

Future Gmail/digital intake should feed the same `Mail & Bills` Apple Reminders list and follow the same rules as physical mail:

- High-confidence actionable items create Apple Reminders automatically.
- Low-confidence actionable items trigger short Discord confirmation questions.
- Urgent items create Apple Reminders and send Telegram urgent fallback alerts.
- Non-actionable items should not be auto-archived without asking; ask before archiving.
- Mike will toss obvious junk before scanning, so V1 does not need to scan/process obvious junk mail.

Potential future Gmail labels:

- 🟡 NEEDS-ATTENTION
- 🔴 URGENT-ACTION
- 💰 EXPENSE-TRACK
- 🧠 TRIAGE-REVIEW
- 🧾 BILL-REVIEW
- 🏥 MEDICAL-INSURANCE
- 🧾 TAX-LEGAL-GOV
- 🧩 SUBSCRIPTION-REVIEW


## Action tracker

V1 user-facing tracker: Apple Reminders, in a new dedicated list named `Mail & Bills`.

Only actionable items become reminders. Non-actionable scanned records are archived locally with metadata and do not become reminders.

High-confidence actionable items should automatically create Apple Reminders. Low-confidence items should trigger a short multiple-choice Discord confirmation question instead of creating a reminder blindly.

High-confidence non-actionable items should still ask before archiving; do not auto-archive scanned items without confirmation.

Non-actionable items suggested for archive should stay in Notion `Needs Review` until Mike explicitly approves archiving. Do not move them to `Archived` automatically.

Limit Discord confirmation-question spam to a maximum of 5 questions per batch. Additional unresolved confirmations should become Notion `Needs Review` items due at the next weekly review and be carried into the weekly digest.

Low-confidence triggers include: OCR/classifier explicitly unsure, missing sender/vendor, missing due date on something that looks like a bill, missing amount on something that looks like a bill, category conflict between the Shortcut label and OCR/classifier result, or similar ambiguity.

Discord confirmation questions should be short multiple-choice prompts, not open-ended essays unless the situation genuinely requires it. Standard choices:

- Create reminder
- Archive only
- Mark urgent
- Ignore/delete

If Mike chooses `Ignore/delete` or `Delete duplicate`, delete the active local PDF and associated metadata immediately from normal storage, but use the safe deletion policy: move deleted files to a local trash/quarantine area for at least 7 days, then ask in the weekly Discord review before permanent deletion. Keep a minimal Notion tombstone record with status `Deleted`. The prompt text should make this destructive action explicit.

Deleted Notion records should be hidden from normal views and visible only in a dedicated `Deleted` view.

Deleted tombstone records should keep minimal audit info only, such as title/category/source, deleted date, batch ID, deletion reason/choice, and document ID. Avoid retaining full OCR text in the tombstone unless later approved.

If Mike chooses `Archive only`, keep the local PDF by default.

Completed Apple Reminders should automatically update the matching Notion record if technically feasible. The exact target status depends on item state and should be finalized during implementation, but completion should not require manual double-entry. Completion should not silently delete or change retained PDFs. During the weekly Discord review, ask what to do with PDFs/metadata for completed reminders when cleanup/retention decisions are needed.

Urgent items should both create an Apple Reminder and send a Telegram urgent fallback alert.

Actionable items with a clear extracted due date should use that due date. Actionable items with no clear due date should be due at the next weekly review after processing.

A local metadata ledger may still exist as implementation glue for deduplication, document paths, OCR/classification results, and audit history. But Mike's actual to-do surface is Apple Reminders.

Reminder content should be concise but traceable:

- title: clean next-action title with no source/category prefix, e.g. `Pay Verizon bill` or `Review Aetna EOB`
- due date: extracted due date when available
- notes/body:
  - category
  - source = physical mail
  - amount, if any
  - due date, if any
  - summary
  - both short document ID and full local PDF path
  - confidence / needs-review flags
  - batch ID

Implementation note: use `remindctl` for Reminders integration.

Suggested local metadata shape:

```json
{
  "id": "mail-2026-05-09-aetna-eob",
  "createdAt": "2026-05-09T00:00:00-04:00",
  "source": "physical-mail | gmail | portal | manual",
  "category": "BILL | MEDICAL | INSURANCE | SCHOOL-FAMILY | TAX-LEGAL-GOVERNMENT | HOME-AUTO | RECEIPT-RECORD | SUBSCRIPTION | UNKNOWN",
  "sender": "Aetna",
  "summary": "Explanation of Benefits available",
  "amount": null,
  "dueDate": null,
  "actionable": true,
  "reminderList": "Mail & Bills",
  "reminderId": "apple-reminders-id-if-created",
  "nextAction": "Review EOB and confirm no payment due",
  "pdfPath": "/Users/buckaroo/.hermes/projects/mail-bills/archive/2026/05/INSURANCE/...pdf",
  "notes": []
}
```

## Duplicate detection

The importer/processor should detect duplicates in the inbox before creating reminders or archive records.

Duplicate detection should compare new scans against existing pending/actionable items and archived records. It should catch exact duplicates and likely-similar rescans.

Signals to use:

- file hash for exact duplicate PDFs
- OCR text similarity for same/similar scans
- sender/vendor match
- due date match
- amount match
- Shortcut label/category match
- batch/date proximity

If a new scan matches an existing pending item, do not create a second Apple Reminder automatically. Instead, ask a short Discord confirmation question or attach the new PDF/metadata as an alternate scan for the existing item, depending on confidence. `Attach to existing item` keeps both PDFs as alternate scans.

Standard possible-duplicate Discord choices for pending/actionable matches:

- Attach to existing item
- Create separate reminder
- Archive duplicate
- Delete duplicate

If a new scan matches an archived record, use a different prompt:

- Keep both
- Replace archived copy
- Delete new duplicate
- Create reminder anyway

If Mike chooses `Replace archived copy`, ask whether to delete the old archived PDF immediately or move it to a replaced/backup folder.

If similarity is high but not exact, flag as `possible_duplicate` and include both item references in the Discord summary.

## Weekly review script

Output should be short:

Mail/Bills Review

Due soon:
- date — vendor — amount — next action

Needs action:
- vendor — next action

Waiting:
- vendor — waiting on whom/since when

- New/unreviewed / Needs Review: count + top 5, prioritized urgent first then due soonest

Archived records:
- counts only; do not list every non-actionable archived record unless there are questions/errors/duplicates

Completed this week awaiting retention decision:
- vendor — completed date — current PDF/metadata retention state — keep/archive/delete prompt when needed

Quarantined deletion candidates:
- counts only; ask before permanent deletion after at least 7 days in quarantine; if Mike does not answer, keep quarantined and ask again next weekly review

Physical paper-original cleanup is intentionally separate from the weekly Discord digest; do not include routine reminders to clear/shred the physical “Processed Mail — Hold” folder.

Suggested order:
1. Pay/schedule true bills.
2. Handle medical/insurance deadlines.
3. Respond to school/family logistics.
4. Archive records.
5. Ignore/recycle junk with prejudice.

## Implementation plan

### Task 1: Create local mail/bills ledger

Files:
- Create: `~/.hermes/integrations/google-tools/data/mail-bills-items.json`
- Create: `~/.hermes/integrations/google-tools/lib/mail-bills/schema.mjs`
- Create: `~/.hermes/integrations/google-tools/lib/mail-bills/store.mjs`

Acceptance criteria:
- Can create/update/list items.
- IDs are stable and deterministic enough to avoid duplicates.
- Store is plain JSON for now.

### Task 2: Add CLI for manual capture

Files:
- Create: `~/.hermes/integrations/google-tools/cli/mail-bills-add.mjs`
- Modify: `~/.hermes/integrations/google-tools/package.json`

Commands:
- `npm run mail-bills:add -- --category=BILL --sender="Verizon" --summary="May bill" --due=2026-05-28 --amount=123.45`
- `npm run mail-bills:list`

Acceptance criteria:
- Mike/Buckaroo can manually add a physical-mail item after scanning/photo.
- List command groups by status and due date.

### Task 3: Add Gmail candidate collector

Files:
- Create: `~/.hermes/integrations/google-tools/cli/mail-bills-from-gmail.mjs`

Behavior:
- Query Gmail labels likely to include bills/paperwork:
  - 💰 EXPENSE-TRACK
  - 🟡 NEEDS-ATTENTION
  - 🔴 URGENT-ACTION
  - future: 🧾 BILL-REVIEW, 🏥 MEDICAL-INSURANCE
- Create NEW candidate items if not already captured.
- No notifications unless errors or urgent/due soon.

Acceptance criteria:
- Dry-run mode shows candidates.
- Apply mode creates ledger entries.
- Duplicate avoidance works by Gmail message ID.

### Task 4: Add weekly review output

Files:
- Create: `~/.hermes/integrations/google-tools/cli/mail-bills-review.mjs`

Behavior:
- Print terse weekly review:
  - due soon
  - needs action
  - waiting
  - new/unreviewed
- Include item IDs so updates are easy.

Acceptance criteria:
- Output is useful in Discord.
- Silent if no open items? Maybe no — weekly review should still report “nothing open,” because that is the one acceptable form of robot smugness.

### Task 5: Add update commands

Files:
- Create: `~/.hermes/integrations/google-tools/cli/mail-bills-update.mjs`

Commands:
- `npm run mail-bills:update -- --id=... --status=DONE --note="Paid"`
- `npm run mail-bills:update -- --id=... --due=2026-06-01`

Acceptance criteria:
- Status and notes update cleanly.
- History is preserved in notes.

### Task 6: Schedule automation

Cron candidates:

- Gmail bill/mail candidate collection:
  - `30 8-20 * * *`
  - quiet unless errors

- Weekly review:
  - Saturday 10:00 AM America/New_York
  - deliver to Discord only, with Telegram urgent fallback handled separately
  - do not create an Apple Reminder for the weekly review itself

- Optional physical mail reminder:
  - Tue/Thu/Sun evening
  - “Clear the mail tray / scan anything actionable.”

Do not schedule these until Mike approves the cadence.

## Open decisions for Mike

1. Where should the action tracker live long-term?
   - local JSON/Markdown first
   - Notion database
   - Apple Reminders
   - hybrid

2. Preferred weekly review time?
   - Sunday evening
   - Monday morning
   - other

3. Physical mail capture method?
   - iPhone photo into a folder
   - scan to PDF
   - Apple Notes
   - Notion upload

4. How aggressive should bill detection be?
   - conservative: only obvious bills
   - moderate: bills + medical/insurance + financial notices
   - broad: anything that might become paperwork

## Recommendation

Start with Notion + local PDFs + Apple Reminders, with Discord as the primary review surface and Telegram as urgent fallback.

Why:
- Notion gives one searchable inbox/archive with statuses and views
- local PDFs keep raw documents reliable and out of Notion
- Apple Reminders stays the actual task surface
- Discord gives a clean operations channel without polluting personal Telegram
- Telegram stays useful as the urgent poke-Mike-now fallback

First real-world version should be boring:
- capture items
- show weekly review
- let Mike/Buckaroo update status
- avoid duplicates
- no auto-payment
- no destructive actions

Boring that works beats elegant that becomes another pile.
