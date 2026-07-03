import { describe, expect, it } from "vitest";
import { uiJs, uiHtml, uiCss } from "../src/ui.js";

describe("bill summary display", () => {
  it("renders structured JSON summary instead of raw OCR text", () => {
    expect(uiJs).toContain("renderBillSummary(billJson, doc.notes)");
    expect(uiJs).toContain("ocr_summary_json");
    expect(uiJs).toContain("Bill Summary");
    expect(uiJs).not.toContain("OCR Text");
  });

  it("renderBillSummary handles null input gracefully", () => {
    expect(uiJs).toContain("function renderBillSummary(json, notes)");
    expect(uiJs).toContain("No bill summary yet");
  });

  it("renderBillSummary shows notes in the summary card when present", () => {
    expect(uiJs).toContain("bill-notes");
    expect(uiJs).toContain("section-label'>Notes");
    // Notes block must be conditional (falsy guard)
    expect(uiJs).toContain("notes");
  });

  it("renderBillSummary renders amount cards with highlight class", () => {
    expect(uiJs).toContain("bill-amount-card");
    expect(uiJs).toContain("highlight");
    expect(uiJs).toContain("amount_due");
    expect(uiJs).toContain("balance_due");
  });

  it("renderBillSummary renders payment methods", () => {
    expect(uiJs).toContain("payment_methods");
    expect(uiJs).toContain("bill-method");
  });
});

describe("vendor and notes editing", () => {
  it("vendor and notes inputs exist in the HTML", () => {
    expect(uiHtml).toContain("id=\"vendorInput\"");
    expect(uiHtml).toContain("id=\"notesInput\"");
  });

  it("populates vendor and notes from the selected document", () => {
    expect(uiJs).toContain("els.vendorInput.value = text(doc.vendor");
    expect(uiJs).toContain("els.notesInput.value = text(doc.notes");
  });

  it("clears vendor and notes when no document is selected", () => {
    expect(uiJs).toContain("els.vendorInput.value = \"\"");
    expect(uiJs).toContain("els.notesInput.value = \"\"");
  });

  it("sends vendor and notes in update-fields and actionable actions", () => {
    expect(uiJs).toContain("body.vendor = els.vendorInput.value");
    expect(uiJs).toContain("body.notes = els.notesInput.value");
  });

  it("passes document notes into the Bill Summary card", () => {
    expect(uiJs).toContain("renderBillSummary(billJson, doc.notes)");
  });
});

describe("embedded UI behavior", () => {
  it("review detail uses selectedDocument() so any status can be inspected and actioned", () => {
    // Must use selectedDocument() — not reviewDocs.find() — so clicking any document
    // (Actionable, Archived, Deleted, etc.) from the console or board navigates to
    // a populated detail panel with correctly enabled action buttons.
    expect(uiJs).toContain("const doc = selectedDocument();");
    expect(uiJs).not.toContain("const doc = reviewDocs.find(");
  });

  it("purge button is enabled only for Deleted-status documents", () => {
    expect(uiJs).toContain("(action === \"purge\" && status !== \"Deleted\")");
  });

  it("delete button is disabled for already-deleted documents", () => {
    expect(uiJs).toContain("(action === \"delete\" && status === \"Deleted\")");
  });

  it("clears selection and returns to console after delete", () => {
    expect(uiJs).toContain("if (action === \"delete\") {");
    expect(uiJs).toContain("state.selectedId = null;");
    expect(uiJs).toContain("state.status = \"All\";");
    expect(uiJs).toContain("showView(\"console\");");
  });
});

describe("brand restyle", () => {
  it("renders the amber-bracket wordmark with thin spaces", () => {
    expect(uiHtml).toContain("{&thinsp;</span>mail-bills<span class=\"bracket\">&thinsp;}");
  });

  it("defines the brand tokens including forest-light", () => {
    ["--charcoal: #1b2535", "--amber: #e09b2d", "--forest: #2a7a5e", "--forest-light: #3a9a76", "--linen: #f5f1eb"].forEach((token) => {
      expect(uiCss).toContain(token);
    });
  });

  it("uses no red and no box shadows anywhere", () => {
    // The old danger palette and error red must be gone; charcoal/amber-dark carry those roles.
    expect(uiCss).not.toMatch(/#(e57373|7f1d1d|fff1f1)/i);
    expect(uiCss).not.toContain("box-shadow");
  });

  it("maps statuses to brand chips (forest reserved for success)", () => {
    expect(uiJs).toContain("function statusClass(doc)");
    expect(uiJs).toContain("return \"chip-review\"");
    expect(uiJs).toContain("if (doc.status === \"Completed\" || doc.status === \"Archived\") return \"chip-done\"");
    expect(uiJs).toContain("if (doc.status === \"Error\") return \"chip-error\"");
    expect(uiJs).not.toContain("status-pill");
  });

  it("renders amounts in the table as mono right-aligned cells", () => {
    expect(uiJs).toContain("<td class='amount-cell'>");
    expect(uiCss).toMatch(/\.amount-col, \.amount-cell \{ text-align: right; \}/);
  });

  it("keeps rows openable and marks the selected row", () => {
    expect(uiJs).toContain("data-open-doc='");
    expect(uiJs).toContain("is-selected");
  });

  it("admin-token dialog keeps the localStorage + 401 retry mechanism", () => {
    expect(uiHtml).toContain("id=\"tokenDialog\"");
    expect(uiHtml).toContain("method=\"dialog\"");
    expect(uiJs).toContain("function promptToken(message)");
    expect(uiJs).toContain("localStorage.setItem(\"mailbills.adminToken\", entered.trim())");
    expect(uiJs).toContain("return api(path, options);");
  });
});
