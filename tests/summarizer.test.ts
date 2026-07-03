import { describe, expect, it } from "vitest";
import { PROMPT_TEMPLATE } from "../src/summarizer.js";

describe("PROMPT_TEMPLATE rules", () => {
  it('contains the service-date exclusion rule', () => {
    expect(PROMPT_TEMPLATE).toContain("NEVER use a sale");
  });

  it('contains the omit due_date rule', () => {
    expect(PROMPT_TEMPLATE).toContain('omit "due_date"');
  });

  it('contains the amount_due / receipt-total distinction', () => {
    expect(PROMPT_TEMPLATE).toContain('"amount_due" is ONLY an amount the document demands be paid');
  });
});
