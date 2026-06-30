export interface BillSummary {
  bill_info?: {
    sender?: string;
    mail_address?: string;
    website?: string;
    phone_number?: string;
  };
  due_date?: string;
  amount_due?: string;
  account_holder?: {
    name?: string;
    account_number?: string;
  };
  insurance_provider?: {
    name?: string;
    coverage?: string;
  };
  payment_methods?: string[];
  guarantor_info?: {
    name?: string;
    account_number?: string;
  };
  total_balance?: string;
  payment_status?: string;
  balance_due?: string;
}

const OLLAMA_HOST = process.env["OLLAMA_HOST"] ?? "http://yoyodyne.local:11434";
const OLLAMA_MODEL = "llama3.2";
const OLLAMA_TIMEOUT_MS = 60_000;

const PROMPT_TEMPLATE = `You are a document intelligence assistant. Extract structured information from this physical mail OCR text.

Return ONLY valid JSON matching this schema (omit any fields you cannot find — do not invent values):
{
  "bill_info": { "sender": "organization name", "mail_address": "mailing address", "website": "website URL", "phone_number": "phone number" },
  "due_date": "due date string",
  "amount_due": "formatted amount string",
  "account_holder": { "name": "name", "account_number": "account number" },
  "insurance_provider": { "name": "provider name", "coverage": "coverage type" },
  "payment_methods": ["payment method 1", "payment method 2"],
  "guarantor_info": { "name": "name", "account_number": "account number" },
  "total_balance": "total balance amount",
  "payment_status": "payment status (e.g. Past Due, Current, Paid)",
  "balance_due": "balance due amount"
}

OCR Text:
`;

/**
 * Calls the Ollama API on the local network to extract structured bill data from raw OCR text.
 * Returns null if the request fails or the model returns unparseable output.
 */
export async function extractBillSummary(ocrText: string): Promise<BillSummary | null> {
  if (!ocrText.trim()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  let responseText: string;
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          {
            role: "user",
            content: PROMPT_TEMPLATE + ocrText.slice(0, 12000)
          }
        ]
      })
    });

    if (!response.ok) return null;

    const payload = await response.json() as { message?: { content?: string } };
    responseText = payload.message?.content ?? "";
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const match = responseText.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    return JSON.parse(match[0]) as BillSummary;
  } catch {
    return null;
  }
}
