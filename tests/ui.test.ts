import { describe, expect, it } from "vitest";
import { uiJs, uiHtml } from "../src/ui.js";

describe("bill summary display", () => {
  it("renders structured JSON summary instead of raw OCR text", () => {
    expect(uiJs).toContain("renderBillSummary(billJson)");
    expect(uiJs).toContain("ocr_summary_json");
    expect(uiJs).toContain("Bill Summary");
    expect(uiJs).not.toContain("OCR Text");
  });

  it("renderBillSummary handles null input gracefully", () => {
    expect(uiJs).toContain("function renderBillSummary(json)");
    expect(uiJs).toContain("No bill summary yet");
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
