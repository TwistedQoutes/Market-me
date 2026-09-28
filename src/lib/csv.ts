import type { Lead } from "./types";

const COLUMNS: [header: string, value: (lead: Lead) => string | number][] = [
  ["intent_score", (l) => l.intentScore],
  ["intent", (l) => l.intent],
  ["status", (l) => l.status],
  ["platform", (l) => l.platform],
  ["author", (l) => l.author],
  ["title", (l) => l.title],
  ["url", (l) => l.sourceUrl],
  ["posted", (l) => l.postedAt],
  ["excerpt", (l) => l.excerpt],
  ["why_fit", (l) => l.whyFit],
  ["suggested_angle", (l) => l.suggestedAngle],
  ["outreach_message", (l) => l.outreach?.message ?? ""],
  ["notes", (l) => l.notes],
  ["found_at", (l) => l.createdAt],
];

function cell(value: string | number): string {
  let s = String(value);
  // Neutralise spreadsheet formula injection from scraped text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function leadsToCsv(leads: Lead[]): string {
  const rows = [COLUMNS.map(([h]) => h), ...leads.map((l) => COLUMNS.map(([, get]) => cell(get(l))))];
  return rows.map((r) => r.join(",")).join("\r\n") + "\r\n";
}
