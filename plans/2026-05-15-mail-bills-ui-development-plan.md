# Mail Bills UI Development Plan

Current date: 2026-05-15

## Goal

Build a local Mail Bills web UI for the existing physical-mail pipeline.

The UI should make the current workflow visible and operable:

```text
iPhone scan/upload
  -> Mac intake/import
  -> OCR/classification/dedupe
  -> Notion/Reminders/Discord/Telegram
  -> human review / retention decisions
```

The mockup source of truth is:

```text
/Users/buckaroo/.hermes/projects/mail-bills/mockups/mail-bills-process.html
```

## Product Direction

Use workflow states as the primary navigation:

- Inbox
- Overdue
- Needs Review
- Actionable
- Waiting
- Completed
- Archived
- Errors

`Overdue` is a computed smart view, not a stored status. It should show active documents in `Actionable`, `Needs Review`, or `Waiting` whose due date is before today.

`Urgent` should also remain metadata/filtering, not a stored status. Urgency comes from `urgency_reasons_json`.

## Recommended Technical Shape

Use the existing Python codebase as the backend instead of introducing a separate app stack.

Recommended V1:

- Python local web server
- server-rendered HTML templates
- Tailwind CSS
- minimal JavaScript for tabs/filtering/refresh
- direct use of existing `mail_bills` modules and SQLite ledger

Good implementation options:

1. FastAPI + Jinja templates
2. Flask + Jinja templates

Recommendation: FastAPI, because it gives clean route structure and room for JSON endpoints without much ceremony.

## Proposed File Layout

```text
scripts/mail_bills/ui/
  __init__.py
  app.py
  view_models.py
  actions.py
  templates/
    base.html
    console.html
    review.html
    board.html
    status.html
  static/
    app.css
    app.js

scripts/tests/test_ui_view_models.py
scripts/tests/test_ui_actions.py
```

The static mockup can remain in `mockups/` as the design reference.

## Development Phases

### Phase 1: Read-only UI shell

Objective: render the real ledger in the approved layout without mutating anything.

Build:

- Local web app entrypoint, likely:

  ```bash
  uv run python -m mail_bills.ui.app --config /Users/buckaroo/.hermes/projects/mail-bills/config.yaml
  ```

- Console route with left rail views.
- Work list backed by SQLite ledger.
- Computed views:
  - `Overdue`
  - `Due Soon`
  - `Urgent`
- Board route using current statuses.
- Status route showing receiver/pipeline health placeholders first.

Tests:

- View-model tests for status counts.
- Overdue excludes archived/completed/deleted/error/duplicate records.
- Overdue includes active records with past due dates.

### Phase 2: Review detail page

Objective: make Needs Review usable from the browser.

Build:

- Review list.
- Document detail view.
- Embedded PDF preview.
- Open original PDF action.
- Detected fields panel.
- OCR summary panel.
- Actions section below the document area.

PDF viewing requirements:

- Render the selected document's local PDF directly in the review page.
- Use a backend route like `/documents/{document_id}/pdf` instead of exposing arbitrary filesystem paths.
- Resolve the PDF path from the ledger, not from user-provided query parameters.
- Verify the resolved PDF path is under the configured Mail Bills root before serving it.
- Add an `Open PDF` button that opens the same route in a new browser tab.
- If the PDF is missing, show a clear missing-file state with the document ID and stored path.
- Do not upload PDFs to Notion or copy them into web static assets.

Wire existing decisions:

- Use detected category
- Keep label
- Create reminder anyway
- Archive
- Delete through quarantine flow

Needed backend addition:

- Add explicit `Completed` action support.
- Decide whether `Completed` lives in `review.py`, a new general document action module, or both.

Tests:

- Review action maps to the same update payload as the CLI.
- Delete action uses quarantine path, not direct destructive delete.
- Completed does not delete or archive the local PDF.
- PDF route serves only the ledger-linked PDF for that document.
- PDF route rejects missing documents and paths outside the configured root.

### Phase 3: Pipeline controls

Objective: let the header buttons invoke known commands safely.

Buttons:

- Run Dry Check
- Run Pipeline

Implementation guidance:

- Start with dry-run only.
- Add live pipeline button behind a confirmation step.
- Capture command output into a run record or UI log panel.
- Prevent overlapping runs by respecting the existing lock.

Commands:

```bash
uv run python -m mail_bills.processor process-pending --dry-run --stable-delay 0
/Users/buckaroo/.hermes/projects/mail-bills/bin/run-pipeline.bash
```

Tests:

- Dry-run action calls processor in dry-run mode.
- Live action requires explicit confirmation.
- Existing lock state blocks duplicate live runs.

### Phase 4: Real status page

Objective: replace placeholders with useful operational checks.

Show:

- Receiver health.
- Upload intake count.
- Importable pair count.
- Last pipeline run.
- Current pipeline lock state.
- Recent errors.
- Notion validation status.
- Reminder adapter dry-run status if cheap enough.

Tests:

- Health model handles missing logs/config gracefully.
- Secret values are never rendered.

### Phase 5: Polish and hardening

Objective: make the app comfortable for repeated household use.

Add:

- Search by vendor/document ID/batch.
- Category filter.
- Urgent filter.
- Due date sorting.
- Empty states.
- Loading/disabled states for actions.
- Confirmation modals for destructive or live operations.

Security/safety:

- Bind to localhost by default.
- Do not expose upload tokens or full secret config.
- Treat local PDF paths carefully.
- Keep delete/quarantine behavior reversible.

## UI Mapping

### Left rail

Order:

1. Inbox
2. Overdue
3. Needs Review
4. Actionable
5. Waiting
6. Completed
7. Archived
8. Errors

### Board columns

Use workflow columns, not smart-view columns:

- Inbox
- Needs Review
- Actionable
- Waiting
- Completed

Show `Overdue` and `Urgent` as badges on cards.

### Review actions

Primary action should depend on review reason:

- Label conflict: `Use Category`
- Missing due date: due date input + `Create Reminder`
- Possible duplicate: duplicate-specific actions

Always available:

- Archive
- Complete
- Delete

`Delete` must mean quarantine, not permanent deletion.

## Backend Gaps To Close

1. `Completed` action support
   - Current taxonomy supports `Completed`.
   - Weekly review already has `Completed Awaiting Retention`.
   - Current review resolver does not expose a complete/mark-completed action.

2. General document actions
   - Today, review actions are centered on `Needs Review`.
   - UI will need actions that apply to `Actionable`, `Waiting`, and `Completed` records too.

3. Read models
   - Add reusable query/view-model helpers instead of scattering UI-specific filtering in templates.

4. PDF serving route
   - UI needs a document PDF endpoint that looks up `local_pdf_path` by `document_id`.
   - The route must guard against path traversal and stale/missing local files.
   - The review page should embed this route in an `<iframe>` or `<object>` and also provide an open-in-new-tab action.

5. Pipeline run records
   - Current scripts print output.
   - UI should eventually show last run status/output without scraping terminal history.

## First Implementation Slice

Build Phase 1 only:

- FastAPI app skeleton.
- Base template using the approved Tailwind design.
- Console work list backed by ledger.
- Left rail counts.
- Computed `Overdue` view.
- Read-only board.
- Tests for view models.

Then immediately follow with the PDF-serving portion of Phase 2 before adding mutation actions. The review page is not useful unless the original scan is visible inside the UI.

This creates a real UI foundation without wiring mutation or command execution too early.
