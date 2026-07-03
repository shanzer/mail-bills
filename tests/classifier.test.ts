import { describe, expect, it } from "vitest";
import { classifyMail } from "../src/classifier.js";

describe("classifier", () => {
  it("extracts actionable bill fields", () => {
    const result = classifyMail("Dominion Energy bill amount due $61.20 due 06/10/2026");

    expect(result.status).toBe("Actionable");
    expect(result.vendor).toBe("Dominion Energy");
    expect(result.amount).toBe("61.20");
    expect(result.dueDate).toBe("2026-06-10");
    expect(result.urgencyReasons).toContain("amount due");
  });

  it("requires review on clear shortcut label conflict", () => {
    const result = classifyMail(
      "Mass General Brigham\nPatient responsibility $84.10\nHealth insurance explanation of benefits",
      { shortcutLabel: "BILL" }
    );

    expect(result.status).toBe("Needs Review");
    expect(result.detectedCategory).toBe("HEALTH-INSURANCE");
    expect(result.reviewReason).toContain("conflicts");
  });

  it("uses the detected category when the shortcut label is unknown", () => {
    const result = classifyMail("Dominion Energy bill amount due $61.20 due 06/10/2026", { shortcutLabel: "Unknown" });

    expect(result.category).toBe("BILL");
    expect(result.detectedCategory).toBe("BILL");
  });
});

describe("amount extraction", () => {
  it("extracts TOTAL from delivery ticket with amount on next line", () => {
    const text = `Petro Heating Oil
SALE # 4712 DATE 02/01/26 11:39:17
164.8 Gallons @ $4.879
TOTAL $ THIS DELIVERY
$804.06
Thank you for your business`;
    expect(classifyMail(text).amount).toBe("804.06");
  });

  it("returns undefined when only dollar figure is a unit price", () => {
    const text = `Order: 50 widgets @ $4.879 each`;
    expect(classifyMail(text).amount).toBeUndefined();
  });

  it("extracts inline labeled amount (Amount due $50)", () => {
    expect(classifyMail("Amount due $50").amount).toBe("50");
  });

  it("labeled path skips Subtotal and matches the Total line", () => {
    const text = `Subtotal $10.00\nTax $5.00\nTotal charged $95.00`;
    expect(classifyMail(text).amount).toBe("95.00");
  });

  it("fallback prefers largest amount when no labeled keyword present", () => {
    const text = `Payment received $10.00\nCharge $95.00\nFee $5.00`;
    expect(classifyMail(text).amount).toBe("95.00");
  });

  it("fallback accepts amount followed by sentence punctuation (no labeled keyword)", () => {
    const text = `Charge $95.00. Fee $5.00`;
    expect(classifyMail(text).amount).toBe("95.00");
  });

  it("labeled path accepts amount followed by sentence punctuation", () => {
    expect(classifyMail("Amount due: $95.00.").amount).toBe("95.00");
  });

  it("ignores unit price without @ prefix when 3 decimal places", () => {
    const text = `Delivery charge $4.879/gal applies`;
    expect(classifyMail(text).amount).toBeUndefined();
  });
});

describe("due date extraction", () => {
  it("rejects impossible calendar dates", () => {
    const result = classifyMail("GEICO bill. Amount due $50. Payment due 13/45/2026.");
    expect(result.dueDate).toBeUndefined();
  });

  it("rejects a real-looking but invalid day-of-month", () => {
    const result = classifyMail("GEICO bill. Amount due $50. Due date: 02/30/2026.");
    expect(result.dueDate).toBeUndefined();
  });

  it("ignores dates that are not adjacent to a due/pay keyword", () => {
    const result = classifyMail("GEICO statement period January 5, 2026 through February 4, 2026. Amount due $50.");
    expect(result.dueDate).toBeUndefined();
  });

  it("still extracts keyword-adjacent dates", () => {
    expect(classifyMail("GEICO bill amount due $50, payment due by June 15, 2026").dueDate).toBe("2026-06-15");
    expect(classifyMail("GEICO bill amount due $50. Due date: 06/15/2026").dueDate).toBe("2026-06-15");
  });
});
