export interface ClassificationResult {
  category: string;
  detectedCategory: string;
  status: string;
  actionRequired: boolean;
  amount?: string;
  dueDate?: string;
  confidence: string;
  urgencyReasons: string[];
  reviewReason?: string;
  recommendedNextAction: string;
  vendor?: string;
  summary: string;
}

const CATEGORY_BILL = "BILL";
const CATEGORY_HEALTH_INSURANCE = "HEALTH-INSURANCE";
const CATEGORY_HOME_AUTO = "HOME-AUTO";
const CATEGORY_OTHER_INSURANCE = "OTHER-INSURANCE";
const CATEGORY_RECEIPT_RECORD = "RECEIPT-RECORD";
const CATEGORY_TAX_LEGAL = "TAX-LEGAL-GOVERNMENT";
const CATEGORY_SCHOOL_FAMILY = "SCHOOL-FAMILY";
const CATEGORY_SUBSCRIPTION = "SUBSCRIPTION";
const CATEGORY_OTHER = "UNKNOWN";

const ACTIONABLE_CATEGORIES = new Set([
  CATEGORY_BILL,
  CATEGORY_HEALTH_INSURANCE,
  CATEGORY_HOME_AUTO,
  CATEGORY_OTHER_INSURANCE,
  CATEGORY_SCHOOL_FAMILY,
  CATEGORY_TAX_LEGAL,
  CATEGORY_SUBSCRIPTION
]);

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};

const VENDOR_PATTERNS: Array<[string, RegExp]> = [
  ["Verizon", /\bverizon\b/i],
  ["Aetna", /\baetna\b/i],
  ["Cleveland Clinic", /\bcleveland clinic\b/i],
  ["GEICO", /\bgeico\b/i],
  ["Target", /\btarget\b/i],
  ["Internal Revenue Service", /\binternal revenue service\b|\birs\b/i],
  ["New Yorker", /\bnew yorker\b/i],
  ["Dominion Energy", /\bdominion energy\b/i]
];

export function classifyMail(ocrText: string, options: { shortcutLabel?: string | null } = {}): ClassificationResult {
  const text = normalizeText(ocrText);
  const detectedCategory = detectCategory(text);
  const label = normalizeLabel(options.shortcutLabel);
  const category = !label || label === CATEGORY_OTHER ? detectedCategory : label;
  const vendor = detectVendor(text);
  const amount = extractAmount(text);
  const dueDate = extractDueDate(text);
  const actionRequired = detectActionRequired(text, detectedCategory, amount, dueDate);
  const urgencyReasons = urgencyReasonsFor(text, detectedCategory, amount, dueDate, actionRequired);

  let reviewReason: string | undefined;
  let confidence = "high";
  let status = actionRequired ? "Actionable" : "Archived";
  let recommendedNextAction = actionRequired ? "Review in Mail Bills UI" : "Archive as record";

  if (label && label !== detectedCategory && clearCategoryConflict(label, detectedCategory)) {
    reviewReason = `Shortcut label ${label} conflicts with OCR-detected category ${detectedCategory}`;
    confidence = "low";
    status = "Needs Review";
    recommendedNextAction = "Resolve category conflict in Mail Bills UI";
  } else if (!vendor) {
    reviewReason = "missing sender/vendor";
    confidence = "low";
    status = "Needs Review";
    recommendedNextAction = "Review missing sender/vendor before routing";
  } else if (isBillLike(detectedCategory, text)) {
    if (!amount) {
      reviewReason = "bill-like item missing amount";
      confidence = "low";
      status = "Needs Review";
      recommendedNextAction = "Review missing amount before routing";
    } else if (!dueDate) {
      reviewReason = "bill-like item missing due date";
      confidence = "low";
      status = "Needs Review";
      recommendedNextAction = "Review missing due date before routing";
    }
  }

  return {
    category,
    detectedCategory,
    status,
    actionRequired,
    amount,
    dueDate,
    confidence,
    urgencyReasons,
    reviewReason,
    recommendedNextAction,
    vendor,
    summary: summarize(text)
  };
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean).join("\n").trim();
}

function normalizeLabel(label?: string | null): string | undefined {
  if (!label) return undefined;
  const cleaned = label.trim().toUpperCase().replaceAll("_", "-").replaceAll(" ", "-");
  const aliases: Record<string, string> = {
    HEALTH: CATEGORY_HEALTH_INSURANCE,
    MEDICAL: CATEGORY_HEALTH_INSURANCE,
    "INSURANCE-HEALTH": CATEGORY_HEALTH_INSURANCE,
    AUTO: CATEGORY_HOME_AUTO,
    "CAR-INSURANCE": CATEGORY_HOME_AUTO,
    "AUTO-INSURANCE": CATEGORY_HOME_AUTO,
    "HOME-INSURANCE": CATEGORY_HOME_AUTO,
    RECEIPT: CATEGORY_RECEIPT_RECORD,
    TAX: CATEGORY_TAX_LEGAL,
    LEGAL: CATEGORY_TAX_LEGAL,
    SCHOOL: CATEGORY_SCHOOL_FAMILY,
    FAMILY: CATEGORY_SCHOOL_FAMILY
  };
  return aliases[cleaned] ?? cleaned;
}

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  if (containsAny(lower, "health insurance", "medical", "doctor", "patient responsibility", "explanation of benefits", "eob", "clinic")) return CATEGORY_HEALTH_INSURANCE;
  if (containsAny(lower, "auto insurance", "car insurance", "home insurance", "homeowners insurance", "geico", "policy will lapse")) return CATEGORY_HOME_AUTO;
  if (lower.includes("insurance")) return CATEGORY_OTHER_INSURANCE;
  if (containsAny(lower, "internal revenue service", "irs", "tax", "notice cp")) return CATEGORY_TAX_LEGAL;
  if (containsAny(lower, "school", "tuition", "field trip", "permission slip", "student", "parent teacher", "pta", "daycare")) return CATEGORY_SCHOOL_FAMILY;
  if (lower.includes("subscription")) return CATEGORY_SUBSCRIPTION;
  if (containsAny(lower, "receipt", "total paid", "thank you for your purchase", "no balance due")) return CATEGORY_RECEIPT_RECORD;
  if (containsAny(lower, "bill", "amount due", "payment due", "amount you owe")) return CATEGORY_BILL;
  return CATEGORY_OTHER;
}

function detectVendor(text: string): string | undefined {
  for (const [vendor, pattern] of VENDOR_PATTERNS) {
    if (pattern.test(text)) return vendor;
  }
  const firstLine = text.split("\n").find((line) => line.trim());
  return firstLine && /[A-Za-z]/.test(firstLine) ? firstLine.slice(0, 80) : undefined;
}

function extractAmount(text: string): string | undefined {
  // Labeled pattern: the label and the dollar sign may be separated by up to
  // 40 characters including newlines (e.g. "TOTAL $ THIS DELIVERY\n$804.06").
  // \b prevents matching "total" inside "Subtotal". (?!\.?\d) blocks partial
  // matches of unit prices like $4.879 (both as 4.87 and as backtracked bare 4)
  // while allowing amounts followed by sentence punctuation like "$95.00.".
  const labeledPattern =
    /\b(?:amount due|amount you owe|premium amount due|balance due|total paid|total)[\s\S]{0,40}?\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)(?!\.?\d)/i;
  const labeledMatch = text.match(labeledPattern);
  if (labeledMatch !== null && labeledMatch.index !== undefined) {
    // Guard against unit prices: reject if the matched $ is immediately
    // preceded by @ (e.g. "@ $4.879 per gallon").
    const dollarPos = labeledMatch.index + labeledMatch[0].lastIndexOf("$");
    const before = text.slice(Math.max(0, dollarPos - 6), dollarPos);
    if (!before.includes("@")) {
      return labeledMatch[1].replaceAll(",", "");
    }
  }

  // Fallback: scan ALL dollar amounts, exclude unit prices (@ within 6 chars
  // before the $), exclude amounts with 3+ decimal places via (?!\.?\d), then
  // return the LARGEST value found. (?!\.?\d) allows amounts followed by
  // sentence punctuation like "$95.00." while still blocking $4.879.
  const fallbackPattern = /\$\s*([0-9][0-9,]*(?:\.[0-9]{2})?)(?!\.?\d)/gi;
  let largestValue: number | undefined;
  let largestStr: string | undefined;
  for (const match of text.matchAll(fallbackPattern)) {
    if (match.index === undefined) continue;
    const before = text.slice(Math.max(0, match.index - 6), match.index);
    if (before.includes("@")) continue;
    const str = match[1].replaceAll(",", "");
    const value = parseFloat(str);
    if (largestValue === undefined || value > largestValue) {
      largestValue = value;
      largestStr = str;
    }
  }
  return largestStr;
}

function extractDueDate(text: string): string | undefined {
  const numeric = text.match(/\b(?:due date|due|payment due|pay by|renew by)\D{0,20}(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i);
  const numericDate = numeric ? isoDate(Number(numeric[3]), Number(numeric[1]), Number(numeric[2])) : undefined;
  if (numericDate) return numericDate;
  const monthNames = Object.keys(MONTHS).join("|");
  const named = text.match(new RegExp(`\\b(?:due date|due|payment due by|payment due|pay by|renew by)\\D{0,20}(${monthNames})\\s+(\\d{1,2}),\\s*(\\d{4})\\b`, "i"));
  return named ? isoDate(Number(named[3]), MONTHS[named[1].toLowerCase()], Number(named[2])) : undefined;
}

function isoDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Round-trip guard: Date.UTC(2026, 1, 30) rolls over to March — reject rollovers.
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return undefined;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function detectActionRequired(text: string, category: string, amount?: string, dueDate?: string): boolean {
  const lower = text.toLowerCase();
  if (containsAny(lower, "not a bill", "no balance due")) return false;
  if (ACTIONABLE_CATEGORIES.has(category) && (amount || dueDate)) return true;
  return containsAny(lower, "action required", "final notice", "past due", "deadline", "pay by", "renew by");
}

function urgencyReasonsFor(text: string, category: string, amount: string | undefined, dueDate: string | undefined, actionRequired: boolean): string[] {
  if (!actionRequired) return [];
  const lower = text.toLowerCase();
  const reasons: string[] = [];
  if (amount && !containsAny(lower, "total paid", "no balance due", "not a bill")) reasons.push("amount due");
  if (dueDate) reasons.push("due date");
  if ([CATEGORY_HEALTH_INSURANCE, CATEGORY_HOME_AUTO, CATEGORY_OTHER_INSURANCE].includes(category)) reasons.push("medical/insurance deadline");
  if (category === CATEGORY_TAX_LEGAL) reasons.push("tax/legal/government notice");
  if (category === CATEGORY_SCHOOL_FAMILY) reasons.push("school/family deadline");
  if (containsAny(lower, "final notice", "past due", "urgent", "action required", "deadline")) reasons.push("action required language");
  if (containsAny(lower, "cancellation", "lapse", "denial", "appeal", "collections")) reasons.push("lapse/cancellation risk");
  return reasons;
}

function clearCategoryConflict(label: string, detectedCategory: string): boolean {
  if (label === detectedCategory) return false;
  if (label === CATEGORY_OTHER || detectedCategory === CATEGORY_OTHER) return false;
  return true;
}

function isBillLike(category: string, text: string): boolean {
  const lower = text.toLowerCase();
  if (containsAny(lower, "not a bill", "no balance due")) return false;
  if (!ACTIONABLE_CATEGORIES.has(category)) return false;
  return containsAny(lower, "bill", "amount due", "payment due", "premium amount due", "amount you owe", "pay by", "renew by", "due date");
}

function summarize(text: string): string {
  const collapsed = text.split(/\s+/).join(" ");
  return collapsed.length <= 240 ? collapsed : `${collapsed.slice(0, 239).trimEnd()}...`;
}

function containsAny(text: string, ...needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}
