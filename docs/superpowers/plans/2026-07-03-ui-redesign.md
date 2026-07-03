# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 56KB `src/ui.ts` string monolith into real asset files served from disk, restyle the web UI with the adapted Foobar brand system, and add pagination. Closes GitHub issue #31 and finishes the UI half of #15.

**Architecture:** `src/ui/index.html`, `src/ui/app.css`, `src/ui/app.js` are the source of truth; `src/ui.ts` shrinks to a cached loader that resolves the asset dir relative to its own module (works from `src/` under vitest and `dist/src/` at runtime); the build copies assets into `dist/src/ui/`. The redesign changes markup and CSS; `app.js` logic is preserved except where markup hooks change and where the new pager lands.

**Tech Stack:** Vanilla HTML/CSS/JS (no frameworks, no web fonts — brand mandates system stacks), TypeScript loader, Vitest.

## Global Constraints

- Route contract unchanged: `GET /` (html), `GET /ui/styles.css`, `GET /ui/app.js`.
- All existing functional behaviors must survive: document list with status filter + search, document detail (fields, summary, OCR text, PDF link), review actions (update-fields / actionable / archive / complete / delete / purge / send-to-paperless), pipeline run + dry-run with summary display, import-PDF form, pairing QR, admin-token prompt on 401 (localStorage), purge for deleted docs.
- No inline `<script>`/`<style>` beyond the existing pattern; no external CDN resources.
- `npm run check` + `npm test` green after every task; commits reference `Refs #31` (final commit `Closes #31`).
- Branch: `feat/ui-redesign` off `main`.

## Design contract (adapted Foobar brand — binding for Task 2)

Tokens (CSS custom properties on `:root`):
- `--charcoal:#1B2535; --charcoal-mid:#243040; --slate:#334E68; --amber:#E09B2D; --amber-dark:#C07818; --amber-light:#F5C46A; --forest:#2A7A5E; --forest-light:#3A9A76; --linen:#F5F1EB; --linen-dark:#EDE8E0; --linen-border:#DDD9D0; --mid-gray:#6B7A8D; --light-on-dark:#A8BDD0; --body-text:#2C3E50;`
- Radii: 4px buttons/inputs, 6px cards, 8px large cards only. **No pill buttons. No box shadows** — elevation via color (charcoal above linen), hairlines `rgba(255,255,255,0.06)` on dark / `--linen-border` on light.

Type roles:
- Display (page title only): Georgia serif, 400, ~28px.
- Body/UI: system sans stack, 14px base for app UI; table rows 13px.
- Mono (wordmark, document ids, amounts, technical values): Courier New.
- Section labels: 10px/600/2.5px tracking/uppercase, `--amber-dark`, bottom rule `--linen-border`.

Layout:
- Sticky charcoal top nav, 56–64px: wordmark `{ mail-bills }` left — Courier 600, linen text, **amber brackets with thin spaces** (`{&thinsp;mail-bills&thinsp;}`); right side: pipeline status chip + "Run pipeline" as the nav CTA (amber fill, charcoal text, 13px/600, 4px radius).
- App shell max-width 1360px, linen background; two-pane: document table left (~minmax) + detail pane right (~420–520px); detail pane prose measure caps near 860px equivalents.
- Single amber primary action per view; secondary buttons are outline/slate.

Status chips (6px radius, 11px/600, uppercase):
- `Actionable` → amber-dark fill tint; `Needs Review` → amber outline + amber-dark text; `Inbox`/`imported` → slate tint; `Completed`/`Archived` → forest tint (forest = success ONLY); `Deleted`/`Duplicate`/quarantined → mid-gray; `Error` → charcoal fill, linen text (no red — palette has none).
- Overdue due-dates: amber-dark bold, never red.

Voice: no fear copy; empty states are calm ("Nothing needs review."). Buttons use verbs ("Archive", "Run pipeline").

---

### Task 1: Extract assets + loader (mechanical)

**Files:** Create `src/ui/index.html`, `src/ui/app.css`, `src/ui/app.js` (verbatim extraction of the current `uiHtml`/`uiCss`/`uiJs` template-literal contents). Rewrite `src/ui.ts` as loader. Modify `src/api.ts` (use loader), `package.json` (build copies assets). Test: `tests/ui.test.ts`.

**Interfaces:** Produces `uiAssets(): { html: string; css: string; js: string }` (cached) from `src/ui.ts`, replacing the `uiHtml/uiCss/uiJs` string exports.

- [ ] Extract the three template-literal bodies to the three files EXACTLY (unescape any `\``/`\${` escapes the TS literals required).
- [ ] Rewrite `src/ui.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface UiAssets {
  html: string;
  css: string;
  js: string;
}

let cache: UiAssets | undefined;

/** Load the embedded UI from src/ui (vitest) or dist/src/ui (compiled). */
export function uiAssets(): UiAssets {
  if (!cache) {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui");
    cache = {
      html: fs.readFileSync(path.join(dir, "index.html"), "utf8"),
      css: fs.readFileSync(path.join(dir, "app.css"), "utf8"),
      js: fs.readFileSync(path.join(dir, "app.js"), "utf8")
    };
  }
  return cache;
}
```

- [ ] `src/api.ts`: replace `import { uiCss, uiHtml, uiJs }` with `import { uiAssets }`; in `createApi`, `const ui = uiAssets();` and serve `ui.html/ui.css/ui.js`.
- [ ] `package.json`: `"build": "tsc -p tsconfig.json && mkdir -p dist/src/ui && cp src/ui/index.html src/ui/app.css src/ui/app.js dist/src/ui/"`.
- [ ] Gate: `npm run check && npm test && npm run build && ls dist/src/ui/` (3 files). Existing ui/api tests must pass UNMODIFIED (served bytes identical). Commit `"Split embedded UI into real asset files served from disk"` + `Refs #31`.

### Task 2: Brand restyle (design)

**Files:** Rewrite `src/ui/index.html` + `src/ui/app.css`; touch `src/ui/app.js` only for markup hooks (keep all fetch/action logic, function names, endpoint paths). Test: `tests/ui.test.ts`, `tests/api.test.ts`.

- [ ] Implement the Design contract above in full: nav + wordmark, linen shell, two-pane layout, chips, type roles, token variables, empty states, styled admin-token dialog (same localStorage mechanism — replace `prompt()` only if it is trivial to do so with a `<dialog>`; otherwise style around it).
- [ ] Table: 13px rows, columns Vendor / Amount (mono, right-aligned) / Due date / Status chip / Category; row hover linen-dark; selected row 3px amber left border (echoes brand tagline cards).
- [ ] Detail pane: section labels per brand; document id + sha in mono; action buttons with one amber primary ("Mark actionable" or contextual), others outline slate; forest ONLY on complete/archive confirmations.
- [ ] Update test assertions that check for served markup strings (`tests/api.test.ts` "serves the functional UI assets", `tests/ui.test.ts`) to match new markup while preserving their intent (must still assert import form, app.js reference, action wiring exist).
- [ ] Gate: `npm run check && npm test`. Commit `"Restyle web UI with the mail-bills brand system"` + `Refs #31`.

### Task 3: Pagination control

**Files:** `src/ui/app.js`, `src/ui/index.html`, `src/ui/app.css`. Test: `tests/ui.test.ts` or `tests/api.test.ts` served-content assertions.

- [ ] Replace the hardcoded `limit=500` fetch with `limit=100` + `offset` state; render `Showing X–Y of TOTAL` (from the M11 `total`) with Prev/Next buttons (outline style, disabled at bounds); filter/search changes reset offset to 0.
- [ ] Update the stale `expect(js.body).toContain("/api/documents?limit=500")` assertion accordingly.
- [ ] Gate: `npm run check && npm test`. Commit `"Add pagination controls to the document table"` + `Closes #31`.

### Task 4: Live verification (controller-run)

- [ ] Boot the API on a temp config with seeded documents spanning all statuses.
- [ ] Chrome: load `/`, screenshot list + detail + review flow + pipeline run + pagination; verify against the design contract; iterate on visual misses.
- [ ] Full gate + PR → merge → push both remotes → rerun `./deploy/install.sh` so the launchd service serves the new UI; send screenshots to the user.
