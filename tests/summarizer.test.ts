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

describe("sanitizeBillSummary", () => {
  it("drops date and money fields that contain no digits", async () => {
    const { sanitizeBillSummary } = await import("../src/summarizer.js");
    const summary = sanitizeBillSummary({
      due_date: "PAY BY",
      amount_due: "$804.06",
      total_balance: "N/A",
      balance_due: "unknown",
      payment_status: "Current"
    });
    expect(summary.due_date).toBeUndefined();
    expect(summary.amount_due).toBe("$804.06");
    expect(summary.total_balance).toBeUndefined();
    expect(summary.balance_due).toBeUndefined();
    expect(summary.payment_status).toBe("Current");
  });

  it("keeps digit-bearing dates in any format", async () => {
    const { sanitizeBillSummary } = await import("../src/summarizer.js");
    expect(sanitizeBillSummary({ due_date: "02/01/26" }).due_date).toBe("02/01/26");
    expect(sanitizeBillSummary({ due_date: "June 15, 2026" }).due_date).toBe("June 15, 2026");
  });
});
