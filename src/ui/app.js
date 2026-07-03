const categories = ["BILL", "HEALTH-INSURANCE", "OTHER-INSURANCE", "SCHOOL-FAMILY", "TAX-LEGAL-GOVERNMENT", "HOME-AUTO", "RECEIPT-RECORD", "SUBSCRIPTION", "UNKNOWN"];
const statuses = ["imported", "Inbox", "Needs Review", "Actionable", "Waiting", "Completed", "Archived", "Error", "Duplicate", "Deleted"];
const boardStatuses = ["Waiting", "imported", "Inbox", "Needs Review", "Actionable", "Completed"];
const state = {
  documents: [],
  total: 0,
  offset: 0,
  status: "All",
  category: "All",
  query: "",
  selectedId: null,
  currentView: "console",
  statusPayload: null
};
const PAGE_SIZE = 100;

const els = {
  filters: document.getElementById("statusFilters"),
  rows: document.getElementById("documentRows"),
  empty: document.getElementById("documentsEmpty"),
  workListTitle: document.getElementById("workListTitle"),
  search: document.getElementById("documentSearch"),
  categoryFilter: document.getElementById("documentCategoryFilter"),
  refreshDocuments: document.getElementById("refreshDocuments"),
  reviewItems: document.getElementById("reviewItems"),
  reviewCount: document.getElementById("reviewCount"),
  reviewTitle: document.getElementById("reviewTitle"),
  pdfStage: document.getElementById("pdfStage"),
  openPdf: document.getElementById("openPdf"),
  fieldList: document.getElementById("fieldList"),
  categorySelect: document.getElementById("categorySelect"),
  shortcutLabel: document.getElementById("shortcutLabel"),
  vendorInput: document.getElementById("vendorInput"),
  notesInput: document.getElementById("notesInput"),
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
  importPdfModal: document.getElementById("importPdfModal"),
  importPdfForm: document.getElementById("importPdfForm"),
  importPdfFile: document.getElementById("importPdfFile"),
  importPdfCategory: document.getElementById("importPdfCategory"),
  importPdfLabel: document.getElementById("importPdfLabel"),
  importPdfNote: document.getElementById("importPdfNote"),
  pipelineChip: document.getElementById("pipelineChip"),
  scheduleMenu: document.getElementById("scheduleMenu"),
  scheduleMenuWrap: document.getElementById("scheduleMenuWrap"),
  docPager: document.getElementById("docPager"),
  pagerCount: document.getElementById("pagerCount"),
  pagerPrev: document.getElementById("pagerPrev"),
  pagerNext: document.getElementById("pagerNext"),
  tokenDialog: document.getElementById("tokenDialog"),
  tokenDialogMessage: document.getElementById("tokenDialogMessage"),
  tokenDialogInput: document.getElementById("tokenDialogInput"),
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
    "upload-cloud": "<path d='M16 16l-4-4-4 4'/><path d='M12 12v9'/><path d='M20.4 18.9A5 5 0 0 0 18 9h-1.3A8 8 0 1 0 4 16.3'/>",
    "x": "<path d='M18 6 6 18'/><path d='m6 6 12 12'/>"
  };
  return "<svg class='icon' viewBox='0 0 24 24' aria-hidden='true'>" + (paths[name] || paths.inbox) + "</svg>";
}

document.querySelectorAll("[data-icon]").forEach((node) => {
  node.innerHTML = icon(node.getAttribute("data-icon"));
});
els.categorySelect.innerHTML = categories.map((category) => "<option value='" + category + "'>" + category + "</option>").join("");
els.categoryFilter.innerHTML = "<option value='All'>All Categories</option>" + categories.map((category) => "<option value='" + category + "'>" + category + "</option>").join("");
els.importPdfCategory.innerHTML = categories.map((category) => "<option value='" + category + "'>" + category + "</option>").join("");
els.importPdfCategory.value = "UNKNOWN";

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
  if (isOverdue(doc)) return "chip-attention";
  if (doc.status === "Needs Review") return "chip-review";
  if (doc.status === "Actionable") return "chip-attention";
  if (doc.status === "Completed" || doc.status === "Archived") return "chip-done";
  if (doc.status === "Deleted" || doc.status === "Duplicate") return "chip-quiet";
  if (doc.status === "Error") return "chip-error";
  return "chip-slate";
}

function visibleDocuments() {
  const query = state.query.trim().toLowerCase();
  return state.documents.filter((doc) => {
    const status = text(doc.status, "Inbox");
    const statusMatch = state.status === "All" ? status !== "Deleted" : state.status === "Overdue" ? isOverdue(doc) : status === state.status;
    if (!statusMatch) return false;
    if (state.status === "All" && state.category !== "All" && text(doc.category) !== state.category) return false;
    if (!query) return true;
    return [doc.document_id, doc.batch_id, doc.vendor, doc.category, doc.review_reason].some((value) => text(value, "").toLowerCase().includes(query));
  });
}

function adminToken() {
  return localStorage.getItem("mailbills.adminToken");
}

let tokenDialogPending = null;

function promptToken(message) {
  if (!els.tokenDialog || typeof els.tokenDialog.showModal !== "function") {
    return Promise.resolve(window.prompt(message));
  }
  if (tokenDialogPending) return tokenDialogPending;
  els.tokenDialogMessage.textContent = message;
  els.tokenDialogInput.value = "";
  tokenDialogPending = new Promise((resolve) => {
    els.tokenDialog.addEventListener("close", () => {
      tokenDialogPending = null;
      resolve(els.tokenDialog.returnValue === "submit" ? els.tokenDialogInput.value : null);
    }, { once: true });
  });
  els.tokenDialog.returnValue = "cancel";
  els.tokenDialog.showModal();
  els.tokenDialogInput.focus();
  return tokenDialogPending;
}

async function api(path, options = {}) {
  const headers = options.body instanceof FormData
    ? { ...(options.headers || {}) }
    : { "content-type": "application/json", ...(options.headers || {}) };
  const token = adminToken();
  if (token) headers.authorization = "Bearer " + token;
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    const body = await response.json().catch(() => ({}));
    const entered = await promptToken(body.error || "Admin token required");
    if (entered && entered.trim()) {
      localStorage.setItem("mailbills.adminToken", entered.trim());
      return api(path, options);
    }
    throw new Error(body.error || "admin token required");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || ("HTTP " + response.status));
  return body;
}

async function loadDocuments() {
  const body = await api("/api/documents?limit=" + PAGE_SIZE + "&offset=" + state.offset);
  state.documents = body.documents || [];
  state.total = typeof body.total === "number" ? body.total : state.documents.length;
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
    return "<tr" + (doc.document_id === state.selectedId ? " class='is-selected'" : "") + ">" +
      "<td><button class='row-open' type='button' data-open-doc='" + escapeHtml(doc.document_id) + "'>" + escapeHtml(vendorName(doc)) + "</button><span class='muted mono doc-id'>" + escapeHtml(doc.document_id) + "</span></td>" +
      "<td class='amount-cell'>" + escapeHtml(doc.amount) + "</td>" +
      "<td class='" + (isOverdue(doc) ? "due-overdue" : "muted") + "'>" + escapeHtml(doc.due_date) + "</td>" +
      "<td><span class='chip " + statusClass(doc) + "'>" + escapeHtml(statusLabel) + "</span></td>" +
      "<td class='muted'>" + escapeHtml(doc.category || doc.detected_category || doc.shortcut_label) + "</td>" +
    "</tr>";
  }).join("");
  els.empty.classList.toggle("is-visible", docs.length === 0);
}

function renderPager() {
  if (!els.docPager) return;
  const from = state.total === 0 ? 0 : state.offset + 1;
  const to = Math.min(state.offset + PAGE_SIZE, state.total);
  els.pagerCount.textContent = "Showing " + from + "–" + to + " of " + state.total;
  els.pagerPrev.disabled = state.offset <= 0;
  els.pagerNext.disabled = state.offset + PAGE_SIZE >= state.total;
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
  }).join("") || "<div class='empty-state is-visible'>Nothing needs review.</div>";

  const doc = selectedDocument();
  document.querySelectorAll("[data-doc-action]").forEach((button) => {
    const action = button.getAttribute("data-doc-action");
    const status = text(doc?.status, "");
    const disabled = !doc
      || (action === "actionable" && status === "Actionable")
      || (action === "archive" && (status === "Archived" || status === "Deleted"))
      || (action === "complete" && (status === "Completed" || status === "Deleted"))
      || (action === "delete" && status === "Deleted")
      || (action === "purge" && status !== "Deleted");
    button.disabled = disabled;
  });
  els.openPdf.disabled = !doc;
  if (!doc) {
    els.reviewTitle.textContent = "Select a document";
    els.pdfStage.innerHTML = "<div class='paper-placeholder'><div></div><p>Select a document to read it here.</p></div>";
    els.fieldList.innerHTML = "";
    els.categorySelect.value = "UNKNOWN";
    els.shortcutLabel.value = "";
    els.vendorInput.value = "";
    els.notesInput.value = "";
    els.dueDate.value = "";
    els.clearDueDate.checked = false;
    return;
  }
  els.reviewTitle.textContent = vendorName(doc);
  const pdfHref = "/api/documents/" + encodeURIComponent(doc.document_id) + "/pdf";
  const billJson = doc.ocr_summary_json ? (function() { try { return JSON.parse(doc.ocr_summary_json); } catch(e) { return null; } })() : null;
  els.pdfStage.innerHTML = "<article class='ocr-document'><header><div><p class='section-label'>Bill Summary</p><h3>" + escapeHtml(vendorName(doc)) + "</h3></div><a class='button button-secondary' href='" + pdfHref + "' target='_blank' rel='noopener'>" + icon("external-link") + "Open PDF viewer</a></header>" + renderBillSummary(billJson, doc.notes) + "</article>";
  els.fieldList.innerHTML = field("Document", doc.document_id, "mono") +
    field("SHA-256", doc.sha256 ? String(doc.sha256).slice(0, 12) + "…" : "-", "mono") +
    field("Batch", doc.batch_id, "mono") +
    field("Category", doc.category) + field("Shortcut Label", doc.shortcut_label) + field("Due Date", doc.due_date) +
    field("Amount", doc.amount, "mono") + field("Confidence", doc.confidence) +
    (doc.review_reason ? field("Reason", doc.review_reason) : "");
  els.categorySelect.value = categories.includes(doc.category) ? doc.category : "UNKNOWN";
  els.shortcutLabel.value = text(doc.shortcut_label || doc.category, "");
  els.vendorInput.value = text(doc.vendor, "");
  els.notesInput.value = text(doc.notes, "");
  els.dueDate.value = text(doc.due_date, "");
  els.clearDueDate.checked = false;
}

function field(label, value, cls) {
  return "<div><dt>" + escapeHtml(label) + "</dt><dd" + (cls ? " class='" + cls + "'" : "") + ">" + escapeHtml(value) + "</dd></div>";
}

function renderBillSummary(json, notes) {
  if (!json) {
    return "<p class='muted' style='padding:8px 0'>No bill summary yet. Run the pipeline to extract and analyze this document.</p>";
  }
  let html = "<div class='bill-summary'>";

  // Prominent amount/status cards
  const cards = [];
  if (json.amount_due) cards.push(["Amount Due", json.amount_due, true]);
  if (json.balance_due && json.balance_due !== json.amount_due) cards.push(["Balance Due", json.balance_due, true]);
  if (json.total_balance && json.total_balance !== json.amount_due) cards.push(["Total Balance", json.total_balance, false]);
  if (json.due_date) cards.push(["Due Date", json.due_date, false]);
  if (json.payment_status) cards.push(["Status", json.payment_status, json.payment_status === "Past Due"]);
  if (cards.length) {
    html += "<dl class='bill-amounts'>";
    cards.forEach(function(c) {
      html += "<div class='bill-amount-card" + (c[2] ? " highlight" : "") + "'><dt>" + escapeHtml(c[0]) + "</dt><dd>" + escapeHtml(c[1]) + "</dd></div>";
    });
    html += "</dl>";
  }

  // Info fields
  const bi = json.bill_info || {};
  const ah = json.account_holder || {};
  const gi = json.guarantor_info || {};
  const ip = json.insurance_provider || {};
  const rows = [];
  if (bi.sender) rows.push(["From", bi.sender]);
  if (bi.mail_address) rows.push(["Mailing Address", bi.mail_address]);
  if (bi.website) rows.push(["Website", bi.website]);
  if (bi.phone_number) rows.push(["Phone", bi.phone_number]);
  if (ah.name) rows.push(["Account Holder", ah.name]);
  if (ah.account_number) rows.push(["Account #", ah.account_number]);
  if (gi.name && gi.name !== ah.name) rows.push(["Guarantor", gi.name]);
  if (ip.name) rows.push(["Insurance", ip.name]);
  if (ip.coverage) rows.push(["Coverage", ip.coverage]);
  if (rows.length) {
    html += "<dl class='bill-info-fields'>";
    rows.forEach(function(r) {
      html += "<div><dt>" + escapeHtml(r[0]) + "</dt><dd>" + escapeHtml(r[1]) + "</dd></div>";
    });
    html += "</dl>";
  }

  // Payment methods
  if (json.payment_methods && json.payment_methods.length) {
    html += "<div class='bill-section'><p class='section-label'>Payment Methods</p><ul class='bill-methods'>";
    json.payment_methods.forEach(function(m) {
      html += "<li class='bill-method'>" + escapeHtml(m) + "</li>";
    });
    html += "</ul></div>";
  }

  if (notes) {
    html += "<div class='bill-section'><p class='section-label'>Notes</p><p class='bill-notes'>" + escapeHtml(notes) + "</p></div>";
  }

  html += "</div>";
  return html;
}

function renderBoard() {
  els.board.innerHTML = boardStatuses.map((status) => {
    const docs = state.documents.filter((doc) => text(doc.status, "Inbox") === status).slice(0, 20);
    const label = status === "imported" ? "Imported" : status;
    return "<section class='board-column'><header><p class='section-label'>" + escapeHtml(label) + "</p><span class='mono muted'>" + docs.length + "</span></header>" +
      docs.map((doc) => "<button class='board-card " + (status === "Needs Review" ? "review" : status === "Actionable" ? "actionable" : "") + "' type='button' data-open-doc='" + escapeHtml(doc.document_id) + "'><strong>" + escapeHtml(vendorName(doc)) + "</strong><p>" + escapeHtml(doc.due_date ? ("Due " + doc.due_date) : (doc.review_reason || doc.ocr_summary || doc.document_id)) + "</p></button>").join("") +
      (docs.length ? "" : "<p class='muted'>Nothing here.</p>") + "</section>";
  }).join("");
}

function renderStatus() {
  const payload = state.statusPayload;
  if (!payload) return;
  els.statusTitle.textContent = payload.ok ? "Receiver online" : "Receiver unavailable";
  if (els.pipelineChip) {
    const schedule = payload.pipelineSchedule;
    els.pipelineChip.hidden = false;
    els.pipelineChip.textContent = schedule && schedule.enabled ? "Auto " + schedule.intervalMinutes + "m" : "Manual";
  }
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
  renderPager();
  renderReview();
  renderBoard();
  renderStatus();
}

function showView(view, updateHash = true) {
  state.currentView = view;
  document.querySelectorAll(".view").forEach((node) => node.classList.toggle("is-active", node.id === "view-" + view));
  document.querySelectorAll("[data-view-link]").forEach((node) => {
    const isActive = node.getAttribute("data-view-link") === view;
    node.classList.toggle("is-active", isActive);
    node.setAttribute("aria-current", isActive ? "page" : "false");
  });
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
  if (action === "delete" && !confirm("Move to quarantine? Files will be held for 7 days before permanent deletion.")) return;
  if (action === "purge" && !confirm("Permanently delete files from disk? This cannot be undone.")) return;
  const body = { action, dryRun: false };
  if (action === "update-fields") {
    body.category = els.categorySelect.value;
    body.shortcutLabel = els.shortcutLabel.value;
    body.vendor = els.vendorInput.value;
    body.notes = els.notesInput.value;
  }
  if (action === "actionable") {
    body.category = els.categorySelect.value;
    body.shortcutLabel = els.shortcutLabel.value;
    body.vendor = els.vendorInput.value;
    body.notes = els.notesInput.value;
  }
  if (els.clearDueDate.checked) body.clearDueDate = true;
  else if (els.dueDate.value) body.dueDate = els.dueDate.value;
  const result = await api("/api/documents/" + encodeURIComponent(doc.document_id) + "/actions", {
    method: "POST",
    body: JSON.stringify(body)
  });
  if (action === "send-to-paperless") toast("Sent to Paperless: " + doc.document_id);
  else if (action === "purge") toast("Purged from disk: " + doc.document_id);
  else toast(result.action + " applied to " + doc.document_id);
  if (action === "delete") {
    state.selectedId = null;
    state.status = "Deleted";
    showView("console");
  } else if (action === "purge") {
    state.selectedId = null;
  }
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

function showImportPdfModal() {
  els.importPdfForm.reset();
  els.importPdfCategory.value = "UNKNOWN";
  els.importPdfModal.hidden = false;
}

function closeImportPdfModal() {
  els.importPdfModal.hidden = true;
}

async function submitImportPdf() {
  const file = els.importPdfFile.files && els.importPdfFile.files[0];
  if (!file) throw new Error("Choose a PDF to import.");
  const form = new FormData();
  form.append("pdf", file);
  form.append("category", els.importPdfCategory.value || "UNKNOWN");
  if (els.importPdfLabel.value.trim()) form.append("label", els.importPdfLabel.value.trim());
  if (els.importPdfNote.value.trim()) form.append("note", els.importPdfNote.value.trim());
  const body = await api("/api/documents/import-pdf", {
    method: "POST",
    body: form,
    headers: {}
  });
  closeImportPdfModal();
  toast("Queued PDF import: " + body.documentId);
  await Promise.all([loadDocuments(), loadStatus()]);
}

async function runPipeline(mode) {
  const dryRun = mode !== "live";
  const body = await api("/api/pipeline/process-pending", {
    method: "POST",
    body: JSON.stringify({ dryRun })
  });
  const batches = Array.isArray(body.batches) ? body.batches : [];
  const counts = batches.reduce((s, b) => ({ imported: s.imported + (b.imported || 0), failed: s.failed + (b.failed || 0), skipped: s.skipped + (b.skipped || 0) }), { imported: 0, failed: 0, skipped: 0 });
  const ok = body.ok !== false;
  const parts = [batches.length + " batch" + (batches.length !== 1 ? "es" : "")];
  if (counts.imported) parts.push(counts.imported + " imported");
  if (counts.failed) parts.push(counts.failed + " failed");
  if (counts.skipped) parts.push(counts.skipped + " skipped");
  const label = (dryRun ? "Dry check" : "Pipeline run") + (ok ? "" : " failed");
  els.runOutput.innerHTML = "<p class='run-summary " + (ok ? "run-ok" : "run-err") + "'>" + (ok ? "✓" : "✗") + " " + escapeHtml(label) + " — " + escapeHtml(parts.join(", ")) + "</p><details class='run-details'><summary>Full JSON</summary><pre>" + escapeHtml(JSON.stringify(body, null, 2)) + "</pre></details>";
  toast(dryRun ? "Dry check finished." : "Pipeline run finished.");
  await Promise.all([loadDocuments(), loadStatus()]);
  showView("status");
}

function openScheduleMenu() {
  const menu = els.scheduleMenu;
  if (!menu) return;
  const schedule = state.statusPayload && state.statusPayload.pipelineSchedule;
  menu.querySelectorAll("[data-schedule-preset]").forEach(function(btn) {
    const value = btn.getAttribute("data-schedule-preset");
    let active = false;
    if (schedule) {
      if (!schedule.enabled) {
        active = value === "off";
      } else {
        active = value !== "off" && Number(value) === schedule.intervalMinutes;
      }
    }
    btn.classList.toggle("is-active", active);
  });
  menu.hidden = false;
  if (els.pipelineChip) els.pipelineChip.setAttribute("aria-expanded", "true");
}

function closeScheduleMenu() {
  if (els.scheduleMenu) els.scheduleMenu.hidden = true;
  if (els.pipelineChip) els.pipelineChip.setAttribute("aria-expanded", "false");
}

function toggleScheduleMenu() {
  if (els.scheduleMenu && !els.scheduleMenu.hidden) {
    closeScheduleMenu();
  } else {
    openScheduleMenu();
  }
}

async function applySchedulePreset(preset) {
  const body = preset === "off"
    ? { enabled: false }
    : { enabled: true, intervalMinutes: Number(preset) };
  try {
    const response = await api("/api/pipeline/schedule", {
      method: "POST",
      body: JSON.stringify(body)
    });
    const schedule = response.schedule;
    if (els.pipelineChip) {
      els.pipelineChip.textContent = schedule && schedule.enabled ? "Auto " + schedule.intervalMinutes + "m" : "Manual";
    }
    if (state.statusPayload) {
      state.statusPayload.pipelineSchedule = schedule;
    }
    closeScheduleMenu();
    toast(schedule && schedule.enabled ? "Auto-run set to every " + schedule.intervalMinutes + " min." : "Pipeline set to manual.");
  } catch (error) {
    toast(error.message);
  }
}

document.addEventListener("click", async (event) => {
  // Close the schedule menu when clicking outside its wrapper.
  if (els.scheduleMenuWrap && !els.scheduleMenuWrap.contains(event.target)) {
    closeScheduleMenu();
  }
  const target = event.target.closest("button, a");
  if (!target) return;
  // Schedule chip toggle opens/closes the preset menu.
  if (target.id === "pipelineChip") {
    toggleScheduleMenu();
    return;
  }
  // Schedule preset selection — must return early to prevent fall-through.
  const preset = target.getAttribute("data-schedule-preset");
  if (preset !== null) {
    await applySchedulePreset(preset);
    return;
  }
  const view = target.getAttribute("data-view-link");
  if (view) {
    event.preventDefault();
    showView(view);
    return;
  }
  const status = target.getAttribute("data-status");
  if (status) {
    state.status = status;
    state.offset = 0;
    loadDocuments().catch((error) => toast(error.message));
    return;
  }
  if (target.id === "pagerPrev" && state.offset > 0) {
    state.offset = Math.max(0, state.offset - PAGE_SIZE);
    loadDocuments().catch((error) => toast(error.message));
    return;
  }
  if (target.id === "pagerNext" && state.offset + PAGE_SIZE < state.total) {
    state.offset += PAGE_SIZE;
    loadDocuments().catch((error) => toast(error.message));
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
  if (target.hasAttribute("data-import-pdf-open")) {
    showImportPdfModal();
    return;
  }
  if (target.hasAttribute("data-import-pdf-close")) {
    closeImportPdfModal();
    return;
  }
  if (target.hasAttribute("data-close-pairing")) {
    els.pairingModal.hidden = true;
  }
});

els.importPdfForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = els.importPdfForm.querySelector("button[type='submit']");
  submit.disabled = true;
  try { await submitImportPdf(); } catch (error) { toast(error.message); } finally { submit.disabled = false; }
});

els.search.addEventListener("input", () => {
  state.query = els.search.value;
  state.offset = 0;
  loadDocuments().catch((error) => toast(error.message));
});
els.categoryFilter.addEventListener("change", () => {
  state.category = els.categoryFilter.value;
  if (state.status !== "All") state.status = "All";
  state.offset = 0;
  loadDocuments().catch((error) => toast(error.message));
});
els.refreshDocuments.addEventListener("click", () => loadDocuments().then(() => toast("Document list refreshed.")).catch((error) => toast(error.message)));
els.refreshStatus.addEventListener("click", () => loadStatus().then(() => toast("Status refreshed.")).catch((error) => toast(error.message)));
els.openPdf.addEventListener("click", () => {
  const doc = selectedDocument();
  if (doc) window.open("/api/documents/" + encodeURIComponent(doc.document_id) + "/pdf", "_blank", "noopener");
});

const initial = location.hash.replace("#", "");
showView(["console", "review", "board", "status"].includes(initial) ? initial : "console", false);
Promise.all([loadDocuments(), loadStatus()]).catch((error) => toast(error.message));