export const uiHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mail Bills Desk</title>
    <link rel="stylesheet" href="/ui/styles.css" />
  </head>
  <body>
    <header class="app-header">
      <a class="wordmark" href="#console" data-view-link="console" aria-label="Mail Bills">
        <span>{&thinsp;</span>mail-bills<span>&thinsp;}</span>
        <small>desk</small>
      </a>
      <nav class="top-nav" aria-label="Primary">
        <a href="#console" data-view-link="console">Console</a>
        <a href="#review" data-view-link="review">Review</a>
        <a href="#board" data-view-link="board">Board</a>
        <a href="#status" data-view-link="status">Status</a>
      </nav>
      <div class="header-actions">
        <button class="button button-quiet" type="button" data-run-pipeline="dry"><span data-icon="shield-check"></span>Dry Check</button>
        <button class="button button-primary" type="button" data-run-pipeline="live"><span data-icon="play"></span>Run Pipeline</button>
      </div>
    </header>

    <main class="shell">
      <section class="page-title">
        <div>
          <p class="section-label">Local V1 Physical Mail</p>
          <h1>Mail Bills</h1>
        </div>
        <div class="segmented" role="tablist" aria-label="Views">
          <button type="button" data-view-tab="console">Console</button>
          <button type="button" data-view-tab="review">Review</button>
          <button type="button" data-view-tab="board">Board</button>
          <button type="button" data-view-tab="status">Status</button>
        </div>
      </section>

      <section class="view is-active" id="view-console" aria-label="Console">
        <aside class="sidebar">
          <p class="section-label">Views</p>
          <div class="filter-list" id="statusFilters"></div>
        </aside>
        <section class="work-panel">
          <div class="panel-header">
            <div>
              <p class="section-label">Work List</p>
              <h2 id="workListTitle">Inbox</h2>
            </div>
            <div class="toolbar">
              <label class="search">
                <span data-icon="search"></span>
                <input id="documentSearch" type="search" placeholder="Search vendor, batch, id" />
              </label>
              <button class="button button-primary" type="button" data-run-pipeline="live"><span data-icon="play"></span>Run Pipeline</button>
              <button class="icon-button" type="button" id="refreshDocuments" aria-label="Refresh list"><span data-icon="refresh-cw"></span></button>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>Category</th>
                  <th>Due</th>
                  <th>Reason</th>
                  <th>Batch</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="documentRows"></tbody>
            </table>
          </div>
          <div class="empty-state" id="documentsEmpty">No documents match this view.</div>
        </section>
      </section>

      <section class="view" id="view-review" aria-label="Review">
        <aside class="review-list">
          <div class="panel-header compact">
            <div>
              <p class="section-label">Needs Review</p>
              <h2 id="reviewCount">0 documents</h2>
            </div>
          </div>
          <div id="reviewItems" class="stack-list"></div>
        </aside>
        <section class="review-detail">
          <div class="panel-header">
            <div>
              <p class="section-label">Document</p>
              <h2 id="reviewTitle">Select a document</h2>
            </div>
            <div class="toolbar">
              <button class="button button-quiet" type="button" id="openPdf"><span data-icon="external-link"></span>Open PDF Viewer</button>
            </div>
          </div>
          <div class="review-grid">
            <div class="pdf-stage" id="pdfStage">
              <div class="paper-placeholder">
                <div></div>
                <p>Select a document, then open it in the browser PDF viewer for zooming and scrolling.</p>
              </div>
            </div>
            <div class="inspector">
              <article class="info-block">
                <p class="section-label">Detected Fields</p>
                <dl id="fieldList"></dl>
              </article>
              <article class="info-block">
                <p class="section-label">Editable Fields</p>
                <div class="field-editor">
                  <label>Category<select id="categorySelect"></select></label>
                  <label>Label<input id="shortcutLabel" type="text" /></label>
                </div>
              </article>
              <article class="info-block">
                <p class="section-label">Due Date</p>
                <div class="due-editor">
                  <input id="dueDate" type="date" />
                  <label><input id="clearDueDate" type="checkbox" /> Clear</label>
                </div>
              </article>
            </div>
          </div>
          <div class="action-bar">
            <p class="section-label">Actions</p>
            <div class="action-grid">
              <button class="button button-primary" type="button" data-doc-action="update-fields"><span data-icon="check-circle-2"></span>Save Fields</button>
              <button class="button button-primary" type="button" data-doc-action="actionable"><span data-icon="play"></span>Send to Actionable</button>
              <button class="button button-secondary" type="button" data-doc-action="archive"><span data-icon="archive"></span>Archive</button>
              <button class="button button-secondary" type="button" data-doc-action="complete"><span data-icon="circle-check"></span>Complete</button>
              <button class="button button-danger" type="button" data-doc-action="delete"><span data-icon="trash-2"></span>Delete</button>
            </div>
          </div>
        </section>
      </section>

      <section class="view" id="view-board" aria-label="Board">
        <section class="work-panel full-width">
          <div class="panel-header">
            <div>
              <p class="section-label">Kanban</p>
              <h2>Batch Board</h2>
            </div>
            <button class="button button-primary" type="button" data-run-pipeline="live"><span data-icon="play"></span>Run Pipeline</button>
          </div>
          <div class="board" id="boardColumns"></div>
        </section>
      </section>

      <section class="view" id="view-status" aria-label="Status">
        <section class="work-panel full-width">
          <div class="panel-header">
            <div>
              <p class="section-label">System Status</p>
              <h2 id="statusTitle">Loading</h2>
            </div>
            <div class="toolbar">
              <button class="button button-primary" type="button" data-run-pipeline="live"><span data-icon="play"></span>Run Pipeline</button>
              <button class="icon-button" type="button" id="refreshStatus" aria-label="Refresh status"><span data-icon="refresh-cw"></span></button>
            </div>
          </div>
          <div class="metrics" id="statusMetrics"></div>
          <div class="status-layout">
            <article class="command-block">
              <p class="section-label">Last Result</p>
              <pre id="runOutput">No pipeline run from this UI yet.</pre>
            </article>
            <article class="path-block">
              <p class="section-label">Configured Paths</p>
              <dl id="pathList"></dl>
            </article>
          </div>
          <div class="pairing-strip">
            <div>
              <p class="section-label">iPhone App</p>
              <h3>Pair Scanner</h3>
            </div>
            <div class="toolbar">
              <button class="button button-secondary" type="button" data-pairing-show><span data-icon="external-link"></span>Show QR Code</button>
              <button class="button button-danger" type="button" data-pairing-rotate><span data-icon="refresh-cw"></span>New Token + QR</button>
            </div>
          </div>
        </section>
      </section>
    </main>

    <div class="modal-backdrop" id="pairingModal" hidden>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="pairingTitle">
        <div class="modal-header">
          <div>
            <p class="section-label">iPhone Pairing</p>
            <h2 id="pairingTitle">Scan QR Code</h2>
          </div>
          <button class="icon-button" type="button" data-close-pairing aria-label="Close pairing QR"><span data-icon="x"></span></button>
        </div>
        <div class="qr-layout">
          <div class="qr-box" id="pairingQr"></div>
          <div>
            <dl id="pairingDetails"></dl>
            <p class="muted" id="pairingWarnings"></p>
          </div>
        </div>
      </section>
    </div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <script src="/ui/app.js" type="module"></script>
  </body>
</html>`;

export const uiCss = `:root {
  --charcoal: #1b2535;
  --charcoal-mid: #243040;
  --slate: #334e68;
  --amber: #e09b2d;
  --amber-dark: #c07818;
  --amber-light: #f5c46a;
  --forest: #2a7a5e;
  --linen: #f5f1eb;
  --linen-dark: #ede8e0;
  --linen-border: #ddd9d0;
  --mid-gray: #6b7a8d;
  --light-on-dark: #a8bdd0;
  --body-text: #2c3e50;
  color-scheme: light;
}

* { box-sizing: border-box; }
html { min-width: 320px; }
body {
  margin: 0;
  background: var(--linen);
  color: var(--body-text);
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}
button, input { font: inherit; }
button { cursor: pointer; }
.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 40px;
  background: var(--charcoal);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  color: var(--linen);
}
.wordmark {
  color: var(--linen);
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  text-decoration: none;
  font: 600 20px/1 "Courier New", Courier, monospace;
  letter-spacing: 0;
  white-space: nowrap;
}
.wordmark span { color: var(--amber); }
.wordmark small {
  color: var(--light-on-dark);
  font: 600 10px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  letter-spacing: 5px;
  text-transform: uppercase;
}
.top-nav { display: flex; align-items: center; gap: 24px; }
.top-nav a {
  color: var(--light-on-dark);
  text-decoration: none;
  font-size: 13px;
  font-weight: 650;
}
.top-nav a.is-active { color: var(--amber); }
.header-actions, .toolbar, .action-grid, .due-editor {
  display: flex;
  align-items: center;
  gap: 8px;
}
.shell {
  max-width: 1440px;
  margin: 0 auto;
  padding: 24px 40px 40px;
}
.page-title {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 24px;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--linen-border);
}
.section-label {
  margin: 0;
  color: var(--amber-dark);
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
}
h1, h2 {
  margin: 8px 0 0;
  color: var(--charcoal);
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: 0;
}
h1 { font-size: clamp(36px, 5vw, 52px); }
h2 { font-size: 26px; }
.segmented {
  display: grid;
  grid-template-columns: repeat(4, minmax(88px, 1fr));
  gap: 4px;
  width: min(640px, 100%);
  padding: 4px;
  background: var(--linen-dark);
  border: 1px solid var(--linen-border);
  border-radius: 6px;
}
.segmented button {
  min-height: 40px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--body-text);
  font-size: 14px;
  font-weight: 650;
}
.segmented button.is-active {
  background: var(--amber);
  border-color: var(--amber);
  color: var(--charcoal);
}
.view { display: none; gap: 16px; }
.view.is-active { display: grid; }
#view-console, #view-review { grid-template-columns: 260px minmax(0, 1fr); }
.sidebar {
  background: var(--charcoal);
  border-radius: 6px;
  padding: 16px;
  color: var(--linen);
}
.filter-list { display: grid; gap: 8px; margin-top: 20px; }
.filter-button {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--light-on-dark);
  padding: 8px 10px;
  text-align: left;
  font-size: 14px;
  font-weight: 650;
}
.filter-button strong {
  margin-left: auto;
  color: inherit;
  font: 700 12px/1 "Courier New", Courier, monospace;
}
.filter-button.is-active {
  background: var(--amber);
  border-color: var(--amber);
  color: var(--charcoal);
}
.work-panel, .review-list, .review-detail {
  min-width: 0;
  border: 1px solid var(--linen-border);
  border-radius: 6px;
  background: var(--linen-dark);
}
.full-width { grid-column: 1 / -1; }
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid var(--linen-border);
}
.panel-header.compact { align-items: start; }
.button, .icon-button {
  min-height: 40px;
  border-radius: 4px;
  border: 1px solid var(--linen-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 14px;
  color: var(--charcoal);
  background: var(--linen);
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
}
.button-primary {
  background: var(--amber);
  border-color: var(--amber);
}
.button-primary:hover { background: var(--amber-light); }
.button-secondary { background: var(--linen); }
.button-quiet {
  background: transparent;
  color: inherit;
  border-color: rgba(255,255,255,0.12);
}
.work-panel .button-quiet, .review-detail .button-quiet {
  color: var(--charcoal);
  border-color: var(--linen-border);
  background: var(--linen);
}
.button-danger {
  color: #7f1d1d;
  border-color: rgba(127, 29, 29, 0.22);
  background: #fff1f1;
}
.button:disabled, .icon-button:disabled { opacity: 0.45; cursor: not-allowed; }
.icon-button {
  width: 40px;
  padding: 0;
  aspect-ratio: 1 / 1;
}
.icon {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}
.search {
  min-height: 40px;
  width: min(340px, 44vw);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--linen-border);
  border-radius: 4px;
  background: var(--linen);
}
.search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--charcoal);
}
.table-wrap { overflow-x: auto; }
table { width: 100%; min-width: 900px; border-collapse: collapse; text-align: left; font-size: 14px; }
th {
  padding: 12px 16px;
  border-bottom: 1px solid var(--linen-border);
  color: var(--mid-gray);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 2px;
  text-transform: uppercase;
}
td {
  padding: 13px 16px;
  border-bottom: 1px solid var(--linen-border);
  background: var(--linen);
  vertical-align: middle;
}
tr:hover td { background: #fbfaf6; }
.vendor-cell { font-weight: 750; color: var(--charcoal); }
.muted { color: var(--mid-gray); }
.mono { font-family: "Courier New", Courier, monospace; font-size: 12px; }
.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.status-review, .status-overdue { background: rgba(224,155,45,0.20); color: var(--amber-dark); }
.status-actionable, .status-completed { background: rgba(42,122,94,0.12); color: var(--forest); }
.status-muted { background: var(--linen-dark); color: var(--mid-gray); }
.status-default { background: rgba(51,78,104,0.12); color: var(--slate); }
.empty-state {
  display: none;
  padding: 24px;
  color: var(--mid-gray);
  background: var(--linen);
}
.empty-state.is-visible { display: block; }
.stack-list { display: grid; }
.review-card {
  display: flex;
  gap: 12px;
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--linen-border);
  background: transparent;
  padding: 16px;
  text-align: left;
}
.review-card.is-active { background: #fdf6ea; }
.review-card .badge {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: var(--charcoal);
  color: var(--amber);
  display: grid;
  place-items: center;
  flex: 0 0 32px;
}
.review-card.is-active .badge { background: var(--amber); color: var(--charcoal); }
.review-card strong { display: block; color: var(--charcoal); }
.review-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
  padding: 16px;
}
.pdf-stage {
  min-height: 620px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--linen-border);
  border-radius: 6px;
  background-color: var(--linen);
  background-image: repeating-linear-gradient(to bottom, rgba(27,37,53,0.05), rgba(27,37,53,0.05) 1px, transparent 1px, transparent 9px);
  padding: 24px;
}
.paper-placeholder {
  width: min(540px, 84%);
  margin: auto;
  padding: 44px;
  border: 1px solid var(--linen-border);
  background: #fbfaf6;
  color: var(--mid-gray);
  text-align: center;
}
.paper-placeholder div {
  height: 22px;
  width: 180px;
  margin: 0 auto 32px;
  background: var(--charcoal);
}
.paper-placeholder .button { margin-top: 18px; }
.ocr-document {
  width: 100%;
  height: 100%;
  min-height: 570px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  border: 1px solid var(--linen-border);
  border-radius: 6px;
  background: #fbfaf6;
  padding: 18px;
}
.ocr-document header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--linen-border);
  padding-bottom: 12px;
}
.ocr-document h3 {
  margin: 0;
  color: var(--charcoal);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 22px;
  font-weight: 400;
}
.ocr-document pre {
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  color: var(--body-text);
  font: 14px/1.65 "Courier New", Courier, monospace;
}
.inspector { display: grid; align-content: start; gap: 16px; }
.info-block {
  margin: 0;
  padding: 16px;
  border: 1px solid var(--linen-border);
  border-radius: 6px;
  background: var(--linen);
}
.info-block dl, .path-block dl {
  display: grid;
  gap: 10px;
  margin: 16px 0 0;
}
.info-block div, .path-block div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
dt { color: var(--mid-gray); }
dd { margin: 0; color: var(--charcoal); font-weight: 750; overflow-wrap: anywhere; text-align: right; }
.info-block p:not(.section-label) { margin: 14px 0 0; font-size: 14px; }
.due-editor input[type="date"] {
  min-height: 38px;
  border: 1px solid var(--linen-border);
  border-radius: 4px;
  background: #fbfaf6;
  color: var(--charcoal);
  padding: 0 8px;
}
.field-editor {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}
.field-editor label {
  display: grid;
  gap: 6px;
  color: var(--mid-gray);
  font-size: 13px;
  font-weight: 650;
}
.field-editor input,
.field-editor select {
  min-height: 38px;
  width: 100%;
  border: 1px solid var(--linen-border);
  border-radius: 4px;
  background: #fbfaf6;
  color: var(--charcoal);
  padding: 0 8px;
}
.due-editor label { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; color: var(--mid-gray); }
.action-bar {
  padding: 16px;
  border-top: 1px solid var(--linen-border);
}
.action-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin-top: 12px;
}
.board {
  display: grid;
  grid-template-columns: repeat(5, minmax(210px, 1fr));
  gap: 16px;
  padding: 16px;
  overflow-x: auto;
}
.board-column {
  min-height: 280px;
  border: 1px solid var(--linen-border);
  border-radius: 6px;
  background: var(--linen);
  padding: 12px;
}
.board-column header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.board-card {
  width: 100%;
  display: block;
  border: 1px solid var(--linen-border);
  border-left: 3px solid var(--slate);
  border-radius: 4px 6px 6px 4px;
  background: var(--linen-dark);
  padding: 12px;
  margin-bottom: 10px;
  text-align: left;
}
.board-card.review { border-left-color: var(--amber); background: #fdf6ea; }
.board-card.actionable { border-left-color: var(--forest); }
.board-card strong { color: var(--charcoal); }
.board-card p { margin: 4px 0 0; color: var(--mid-gray); font-size: 13px; }
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  padding: 16px;
}
.metric {
  border: 1px solid var(--linen-border);
  border-radius: 6px;
  background: var(--linen);
  padding: 16px;
}
.metric strong {
  display: block;
  margin-top: 14px;
  color: var(--charcoal);
  font: 400 28px/1.1 "Courier New", Courier, monospace;
}
.metric span { display: block; margin-top: 4px; color: var(--mid-gray); font-size: 13px; }
.status-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
  gap: 16px;
  padding: 0 16px 16px;
}
.pairing-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 16px 16px;
  padding: 16px;
  border: 1px solid var(--linen-border);
  border-radius: 6px;
  background: var(--linen);
}
.pairing-strip h3 {
  margin: 8px 0 0;
  color: var(--charcoal);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 24px;
  font-weight: 400;
}
.command-block {
  margin: 0;
  border-radius: 6px;
  background: var(--charcoal);
  color: var(--linen);
  padding: 16px;
}
.command-block .section-label { color: var(--amber); }
pre {
  margin: 16px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--light-on-dark);
  font: 13px/1.7 "Courier New", Courier, monospace;
}
.path-block {
  margin: 0;
  border: 1px solid var(--linen-border);
  border-radius: 6px;
  background: var(--linen);
  padding: 16px;
}
.toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  max-width: min(460px, calc(100vw - 48px));
  border-radius: 6px;
  background: var(--charcoal);
  color: var(--linen);
  padding: 12px 14px;
  box-shadow: none;
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 160ms ease, transform 160ms ease;
  pointer-events: none;
}
.toast.is-visible { opacity: 1; transform: translateY(0); }
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: rgba(27, 37, 53, 0.48);
  padding: 24px;
}
.modal-backdrop[hidden] { display: none; }
.modal {
  width: min(760px, 100%);
  border: 1px solid var(--linen-border);
  border-radius: 8px;
  background: var(--linen);
  color: var(--body-text);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border-bottom: 1px solid var(--linen-border);
}
.qr-layout {
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: 18px;
  padding: 18px;
}
.qr-box {
  display: grid;
  place-items: center;
  min-height: 340px;
  border: 1px solid var(--linen-border);
  border-radius: 6px;
  background: #fff;
}
.qr-box svg {
  max-width: 100%;
  height: auto;
}
#pairingDetails {
  display: grid;
  gap: 12px;
  margin: 0;
}
@media (max-width: 1080px) {
  .app-header { padding: 0 20px; }
  .top-nav { display: none; }
  .shell { padding: 20px; }
  .page-title { align-items: stretch; flex-direction: column; }
  #view-console, #view-review { grid-template-columns: 1fr; }
  .sidebar { order: 2; }
  .filter-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .review-grid, .status-layout, .qr-layout { grid-template-columns: 1fr; }
  .action-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .app-header { align-items: stretch; flex-direction: column; padding: 12px 16px; }
  .header-actions { width: 100%; }
  .header-actions .button { flex: 1; }
  .shell { padding: 16px; }
  .segmented { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .toolbar { width: 100%; flex-wrap: wrap; justify-content: flex-end; }
  .search { width: 100%; }
  .panel-header { align-items: flex-start; flex-direction: column; }
  .pairing-strip { align-items: stretch; flex-direction: column; }
  .filter-list, .metrics, .action-grid { grid-template-columns: 1fr; }
  .pdf-stage { min-height: 460px; }
}`;

export const uiJs = `const categories = ["BILL", "HEALTH-INSURANCE", "OTHER-INSURANCE", "SCHOOL-FAMILY", "TAX-LEGAL-GOVERNMENT", "HOME-AUTO", "RECEIPT-RECORD", "SUBSCRIPTION", "UNKNOWN"];
const statuses = ["imported", "Inbox", "Needs Review", "Actionable", "Waiting", "Completed", "Archived", "Error", "Duplicate", "Deleted"];
const boardStatuses = ["imported", "Inbox", "Needs Review", "Actionable", "Waiting", "Completed"];
const state = {
  documents: [],
  status: "All",
  query: "",
  selectedId: null,
  currentView: "console",
  statusPayload: null
};

const els = {
  filters: document.getElementById("statusFilters"),
  rows: document.getElementById("documentRows"),
  empty: document.getElementById("documentsEmpty"),
  workListTitle: document.getElementById("workListTitle"),
  search: document.getElementById("documentSearch"),
  refreshDocuments: document.getElementById("refreshDocuments"),
  reviewItems: document.getElementById("reviewItems"),
  reviewCount: document.getElementById("reviewCount"),
  reviewTitle: document.getElementById("reviewTitle"),
  pdfStage: document.getElementById("pdfStage"),
  openPdf: document.getElementById("openPdf"),
  fieldList: document.getElementById("fieldList"),
  categorySelect: document.getElementById("categorySelect"),
  shortcutLabel: document.getElementById("shortcutLabel"),
  dueDate: document.getElementById("dueDate"),
  clearDueDate: document.getElementById("clearDueDate"),
  board: document.getElementById("boardColumns"),
  statusTitle: document.getElementById("statusTitle"),
  statusMetrics: document.getElementById("statusMetrics"),
  refreshStatus: document.getElementById("refreshStatus"),
  pathList: document.getElementById("pathList"),
  runOutput: document.getElementById("runOutput"),
  pairingModal: document.getElementById("pairingModal"),
  pairingQr: document.getElementById("pairingQr"),
  pairingDetails: document.getElementById("pairingDetails"),
  pairingWarnings: document.getElementById("pairingWarnings"),
  toast: document.getElementById("toast")
};

function icon(name) {
  const paths = {
    "archive": "<path d='M3 7h18'/><path d='M5 7v12h14V7'/><path d='M8 3h8l2 4H6z'/><path d='M10 12h4'/>",
    "bell-plus": "<path d='M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7'/><path d='M10 21h4'/><path d='M19 2v6'/><path d='M22 5h-6'/>",
    "check-circle-2": "<path d='M21 12a9 9 0 1 1-9-9'/><path d='m9 12 2 2 5-6'/>",
    "circle-check": "<circle cx='12' cy='12' r='9'/><path d='m9 12 2 2 4-5'/>",
    "external-link": "<path d='M15 3h6v6'/><path d='M10 14 21 3'/><path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'/>",
    "inbox": "<path d='M22 12h-6l-2 3h-4l-2-3H2'/><path d='M5 5h14l3 7v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5z'/>",
    "play": "<path d='m6 3 14 9-14 9z'/>",
    "refresh-cw": "<path d='M21 12a9 9 0 0 1-15 6.7L3 16'/><path d='M3 21v-5h5'/><path d='M3 12a9 9 0 0 1 15-6.7L21 8'/><path d='M21 3v5h-5'/>",
    "search": "<circle cx='11' cy='11' r='7'/><path d='m21 21-4.3-4.3'/>",
    "shield-check": "<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10'/><path d='m9 12 2 2 4-5'/>",
    "tag": "<path d='M20 10 12 2H4v8l8 8z'/><circle cx='7.5' cy='7.5' r='1'/>",
    "trash-2": "<path d='M3 6h18'/><path d='M8 6V4h8v2'/><path d='M19 6l-1 14H6L5 6'/><path d='M10 11v6'/><path d='M14 11v6'/>",
    "x": "<path d='M18 6 6 18'/><path d='m6 6 12 12'/>"
  };
  return "<svg class='icon' viewBox='0 0 24 24' aria-hidden='true'>" + (paths[name] || paths.inbox) + "</svg>";
}

document.querySelectorAll("[data-icon]").forEach((node) => {
  node.innerHTML = icon(node.getAttribute("data-icon"));
});
els.categorySelect.innerHTML = categories.map((category) => "<option value='" + category + "'>" + category + "</option>").join("");

function text(value, fallback = "-") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function escapeHtml(value) {
  return text(value, "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function vendorName(doc) {
  return text(doc.vendor, doc.document_id || "Unknown document");
}

function isOverdue(doc) {
  return Boolean(doc.due_date && doc.status !== "Completed" && doc.status !== "Archived" && doc.status !== "Deleted" && doc.due_date < new Date().toISOString().slice(0, 10));
}

function statusClass(doc) {
  if (isOverdue(doc)) return "status-overdue";
  if (doc.status === "Needs Review") return "status-review";
  if (doc.status === "Actionable") return "status-actionable";
  if (doc.status === "Completed") return "status-completed";
  if (doc.status === "Archived" || doc.status === "Deleted") return "status-muted";
  return "status-default";
}

function visibleDocuments() {
  const query = state.query.trim().toLowerCase();
  return state.documents.filter((doc) => {
    const status = text(doc.status, "Inbox");
    const statusMatch = state.status === "All" ? status !== "Deleted" : state.status === "Overdue" ? isOverdue(doc) : status === state.status;
    if (!statusMatch) return false;
    if (!query) return true;
    return [doc.document_id, doc.batch_id, doc.vendor, doc.category, doc.review_reason].some((value) => text(value, "").toLowerCase().includes(query));
  });
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || ("HTTP " + response.status));
  return body;
}

async function loadDocuments() {
  const body = await api("/api/documents?limit=500");
  state.documents = body.documents || [];
  if (!state.selectedId || !state.documents.some((doc) => doc.document_id === state.selectedId)) {
    const firstReview = state.documents.find((doc) => doc.status === "Needs Review");
    state.selectedId = firstReview ? firstReview.document_id : (state.documents[0] && state.documents[0].document_id) || null;
  }
  renderAll();
}

async function loadStatus() {
  const body = await api("/api/status");
  state.statusPayload = body;
  renderStatus();
}

function renderFilters() {
  const counts = {};
  statuses.forEach((status) => counts[status] = 0);
  counts.All = state.documents.filter((doc) => text(doc.status, "Inbox") !== "Deleted").length;
  counts.Overdue = 0;
  state.documents.forEach((doc) => {
    const status = text(doc.status, "Inbox");
    counts[status] = (counts[status] || 0) + 1;
    if (isOverdue(doc)) counts.Overdue += 1;
  });
  const ordered = ["All", "imported", "Inbox", "Overdue", "Needs Review", "Actionable", "Waiting", "Completed", "Archived", "Error", "Duplicate", "Deleted"];
  els.filters.innerHTML = ordered.map((status) => {
    const label = status === "imported" ? "Imported" : status;
    return "<button class='filter-button" + (state.status === status ? " is-active" : "") + "' type='button' data-status='" + escapeHtml(status) + "'>" +
      icon(status === "Inbox" || status === "All" || status === "imported" ? "inbox" : status === "Completed" ? "circle-check" : status === "Archived" ? "archive" : "tag") +
      "<span>" + escapeHtml(label) + "</span><strong>" + text(counts[status] || 0, "0") + "</strong></button>";
  }).join("");
}

function renderTable() {
  const docs = visibleDocuments();
  els.workListTitle.textContent = state.status === "All" ? "All Documents" : state.status === "imported" ? "Imported" : state.status;
  els.rows.innerHTML = docs.map((doc) => {
    const statusLabel = isOverdue(doc) ? "Overdue" : text(doc.status, "Inbox");
    return "<tr>" +
      "<td><span class='vendor-cell'>" + escapeHtml(vendorName(doc)) + "</span><br><span class='muted mono'>" + escapeHtml(doc.document_id) + "</span></td>" +
      "<td><span class='status-pill " + statusClass(doc) + "'>" + escapeHtml(statusLabel) + "</span></td>" +
      "<td class='muted'>" + escapeHtml(doc.category || doc.detected_category || doc.shortcut_label) + "</td>" +
      "<td class='" + (isOverdue(doc) ? "vendor-cell" : "muted") + "'>" + escapeHtml(doc.due_date) + "</td>" +
      "<td class='muted'>" + escapeHtml(doc.review_reason || doc.error_message || doc.ocr_summary) + "</td>" +
      "<td class='muted mono'>" + escapeHtml(doc.batch_id) + "</td>" +
      "<td><button class='button button-secondary' type='button' data-open-doc='" + escapeHtml(doc.document_id) + "'>Open</button></td>" +
    "</tr>";
  }).join("");
  els.empty.classList.toggle("is-visible", docs.length === 0);
}

function selectedDocument() {
  return state.documents.find((doc) => doc.document_id === state.selectedId) || null;
}

function renderReview() {
  const reviewDocs = state.documents.filter((doc) => doc.status === "Needs Review");
  els.reviewCount.textContent = reviewDocs.length + (reviewDocs.length === 1 ? " document" : " documents");
  els.reviewItems.innerHTML = reviewDocs.map((doc) => {
    return "<button class='review-card" + (doc.document_id === state.selectedId ? " is-active" : "") + "' type='button' data-select-review='" + escapeHtml(doc.document_id) + "'>" +
      "<span class='badge'>" + icon("shield-check") + "</span><span><strong>" + escapeHtml(vendorName(doc)) + "</strong>" +
      "<span class='muted'>" + escapeHtml(doc.review_reason || "Review required") + "</span><span class='mono muted'>" + escapeHtml(doc.batch_id) + "</span></span></button>";
  }).join("") || "<div class='empty-state is-visible'>No documents need review.</div>";

  const doc = selectedDocument();
  document.querySelectorAll("[data-doc-action]").forEach((button) => button.disabled = !doc);
  els.openPdf.disabled = !doc;
  if (!doc) {
    els.reviewTitle.textContent = "Select a document";
    els.pdfStage.innerHTML = "<div class='paper-placeholder'><div></div><p>Select a document to read OCR text here, with the PDF viewer available for visual inspection.</p></div>";
    els.fieldList.innerHTML = "";
    els.categorySelect.value = "UNKNOWN";
    els.shortcutLabel.value = "";
    els.dueDate.value = "";
    els.clearDueDate.checked = false;
    return;
  }
  els.reviewTitle.textContent = vendorName(doc);
  const pdfHref = "/api/documents/" + encodeURIComponent(doc.document_id) + "/pdf";
  els.pdfStage.innerHTML = "<article class='ocr-document'><header><div><p class='section-label'>OCR Text</p><h3>" + escapeHtml(vendorName(doc)) + "</h3></div><a class='button button-primary' href='" + pdfHref + "' target='_blank' rel='noopener'>" + icon("external-link") + "Open PDF Viewer</a></header><pre>" + escapeHtml(doc.ocr_text || doc.ocr_summary || "No OCR text captured yet. Run the pipeline to extract text and generate a summary.") + "</pre></article>";
  els.fieldList.innerHTML = field("Category", doc.category) + field("Shortcut Label", doc.shortcut_label) + field("Due Date", doc.due_date) + field("Amount", doc.amount) + field("Confidence", doc.confidence);
  els.categorySelect.value = categories.includes(doc.category) ? doc.category : "UNKNOWN";
  els.shortcutLabel.value = text(doc.shortcut_label || doc.category, "");
  els.dueDate.value = text(doc.due_date, "");
  els.clearDueDate.checked = false;
}

function field(label, value) {
  return "<div><dt>" + escapeHtml(label) + "</dt><dd>" + escapeHtml(value) + "</dd></div>";
}

function renderBoard() {
  els.board.innerHTML = boardStatuses.map((status) => {
    const docs = state.documents.filter((doc) => text(doc.status, "Inbox") === status).slice(0, 20);
    const label = status === "imported" ? "Imported" : status;
    return "<section class='board-column'><header><p class='section-label'>" + escapeHtml(label) + "</p><span class='mono muted'>" + docs.length + "</span></header>" +
      docs.map((doc) => "<button class='board-card " + (status === "Needs Review" ? "review" : status === "Actionable" ? "actionable" : "") + "' type='button' data-open-doc='" + escapeHtml(doc.document_id) + "'><strong>" + escapeHtml(vendorName(doc)) + "</strong><p>" + escapeHtml(doc.due_date ? ("Due " + doc.due_date) : (doc.review_reason || doc.ocr_summary || doc.document_id)) + "</p></button>").join("") +
      (docs.length ? "" : "<p class='muted'>No documents.</p>") + "</section>";
  }).join("");
}

function renderStatus() {
  const payload = state.statusPayload;
  if (!payload) return;
  els.statusTitle.textContent = payload.ok ? "Receiver online" : "Receiver unavailable";
  const metrics = [
    ["Endpoint", payload.receiver ? payload.receiver.port : "-", payload.receiver ? payload.receiver.host : "-"],
    ["Token", payload.receiver && payload.receiver.tokenConfigured ? "set" : "missing", "Intake bearer token"],
    ["Upload Intake", payload.uploadIntake, "paired uploads ready"],
    ["Importable", payload.importablePairs, "iCloud plus uploads"],
    ["Schedule", payload.pipelineSchedule && payload.pipelineSchedule.enabled ? payload.pipelineSchedule.intervalMinutes + "m" : "off", payload.pipelineSchedule && payload.pipelineSchedule.nextRunAt ? "Next " + payload.pipelineSchedule.nextRunAt : "Periodic local processor"]
  ];
  els.statusMetrics.innerHTML = metrics.map((item) => "<article class='metric'><p class='section-label'>" + escapeHtml(item[0]) + "</p><strong>" + escapeHtml(item[1]) + "</strong><span>" + escapeHtml(item[2]) + "</span></article>").join("");
  const paths = payload.paths || {};
  els.pathList.innerHTML = Object.keys(paths).sort().map((key) => field(key, paths[key])).join("");
}

function renderAll() {
  renderFilters();
  renderTable();
  renderReview();
  renderBoard();
  renderStatus();
}

function showView(view, updateHash = true) {
  state.currentView = view;
  document.querySelectorAll(".view").forEach((node) => node.classList.toggle("is-active", node.id === "view-" + view));
  document.querySelectorAll("[data-view-tab]").forEach((node) => node.classList.toggle("is-active", node.getAttribute("data-view-tab") === view));
  document.querySelectorAll("[data-view-link]").forEach((node) => node.classList.toggle("is-active", node.getAttribute("data-view-link") === view));
  if (updateHash) history.replaceState(null, "", "#" + view);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 3200);
}

async function applyAction(action) {
  const doc = selectedDocument();
  if (!doc) return;
  if (action === "delete" && !confirm("Quarantine or delete this document according to pipeline rules?")) return;
  const body = { action, dryRun: false };
  if (action === "update-fields") {
    body.category = els.categorySelect.value;
    body.shortcutLabel = els.shortcutLabel.value;
  }
  if (action === "actionable") {
    body.category = els.categorySelect.value;
    body.shortcutLabel = els.shortcutLabel.value;
  }
  if (els.clearDueDate.checked) body.clearDueDate = true;
  else if (els.dueDate.value) body.dueDate = els.dueDate.value;
  const result = await api("/api/documents/" + encodeURIComponent(doc.document_id) + "/actions", {
    method: "POST",
    body: JSON.stringify(body)
  });
  toast(result.action + " applied to " + doc.document_id);
  await loadDocuments();
}

async function showPairingQr(rotate = false) {
  if (rotate && !confirm("Generate a new iPhone upload token? Existing paired devices will need the new QR code.")) return;
  const baseUrl = window.location.origin;
  const body = rotate
    ? await api("/api/pairing/rotate-token", { method: "POST", body: JSON.stringify({ baseUrl }) })
    : await api("/api/pairing/qr?baseUrl=" + encodeURIComponent(baseUrl));
  els.pairingQr.innerHTML = body.qrSvg;
  els.pairingDetails.innerHTML = field("Endpoint", body.payload.endpoint) + field("Token", body.payload.token) + field("Authorization", body.payload.authHeader);
  els.pairingWarnings.textContent = (body.payload.warnings || []).join(" ");
  els.pairingModal.hidden = false;
}

async function runPipeline(mode) {
  const dryRun = mode !== "live";
  const body = await api("/api/pipeline/process-pending", {
    method: "POST",
    body: JSON.stringify({ dryRun })
  });
  els.runOutput.textContent = JSON.stringify(body, null, 2);
  toast(dryRun ? "Dry check finished." : "Pipeline run finished.");
  await Promise.all([loadDocuments(), loadStatus()]);
  showView("status");
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  const view = target.getAttribute("data-view-tab") || target.getAttribute("data-view-link");
  if (view) {
    event.preventDefault();
    showView(view);
    return;
  }
  const status = target.getAttribute("data-status");
  if (status) {
    state.status = status;
    renderAll();
    return;
  }
  const openId = target.getAttribute("data-open-doc") || target.getAttribute("data-select-review");
  if (openId) {
    state.selectedId = openId;
    if (target.hasAttribute("data-open-doc")) showView("review");
    renderAll();
    return;
  }
  const action = target.getAttribute("data-doc-action");
  if (action) {
    target.disabled = true;
    try { await applyAction(action); } catch (error) { toast(error.message); } finally { target.disabled = false; }
    return;
  }
  const pipelineMode = target.getAttribute("data-run-pipeline");
  if (pipelineMode) {
    target.disabled = true;
    try { await runPipeline(pipelineMode); } catch (error) { toast(error.message); } finally { target.disabled = false; }
    return;
  }
  if (target.hasAttribute("data-pairing-show")) {
    target.disabled = true;
    try { await showPairingQr(false); } catch (error) { toast(error.message); } finally { target.disabled = false; }
    return;
  }
  if (target.hasAttribute("data-pairing-rotate")) {
    target.disabled = true;
    try { await showPairingQr(true); } catch (error) { toast(error.message); } finally { target.disabled = false; }
    return;
  }
  if (target.hasAttribute("data-close-pairing")) {
    els.pairingModal.hidden = true;
  }
});

els.search.addEventListener("input", () => {
  state.query = els.search.value;
  renderTable();
});
els.refreshDocuments.addEventListener("click", () => loadDocuments().then(() => toast("Document list refreshed.")).catch((error) => toast(error.message)));
els.refreshStatus.addEventListener("click", () => loadStatus().then(() => toast("Status refreshed.")).catch((error) => toast(error.message)));
els.openPdf.addEventListener("click", () => {
  const doc = selectedDocument();
  if (doc) window.open("/api/documents/" + encodeURIComponent(doc.document_id) + "/pdf", "_blank", "noopener");
});

const initial = location.hash.replace("#", "");
showView(["console", "review", "board", "status"].includes(initial) ? initial : "console", false);
Promise.all([loadDocuments(), loadStatus()]).catch((error) => toast(error.message));`;
