// Client-side CSV export of the leads list. No serverless function — the CSV is
// built entirely from the leads the frontend already holds (the composite of
// Supabase + Meta sheets, with dedupe applied). Read-only: nothing here mutates
// a lead.
//
// One row per lead AS DISPLAYED: a merged lead (dedupe feature) is a single row —
// the composite primary (contact-field fallback already applied in dedupe.js) —
// and its "sources" column lists every campaign/source it was merged from.

import config from "./config";
import { t } from "./labels";
import { cleanField, sourceCampaignLabel } from "./utils";
import { buildCsv, downloadCsv } from "./csv";

// Short campaign/source label for a lead's own source (e.g. "BUYERS REEL",
// "Landing Page"). Same shortening the Leads source filter uses.
function campaignOf(lead) {
  return sourceCampaignLabel(cleanField(lead.source)) || "";
}

// All campaigns/sources for a lead, including every merged secondary's — distinct,
// joined with "; " (e.g. "Landing Page; BUYERS REEL"). For a non-merged lead it's
// just its own source.
function sourcesOf(lead) {
  const secondaries = Array.isArray(lead.mergedSecondaries)
    ? lead.mergedSecondaries.map((s) => sourceCampaignLabel(cleanField(s.lead && s.lead.source)) || "")
    : [];
  const all = [campaignOf(lead), ...secondaries].filter(Boolean);
  return Array.from(new Set(all)).join("; ");
}

// ISO calendar date (YYYY-MM-DD) from created_at (full ISO) or the date column.
function isoDate(lead) {
  const raw = cleanField(lead.created_at) || cleanField(lead.date) || "";
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return m ? m[1] : raw;
}

const c = (v) => cleanField(v) || ""; // real value or "" (drops "{{…}}" placeholders)

// Column set: header label key (translated per client) + how to read the cell.
// Order puts the analysis-critical columns first (source/campaign, classification,
// status, date) so the export reads as "which ad brought which quality of lead".
const COLUMNS = [
  { key: "csv_col_name", get: (l) => l.name || "" },
  { key: "csv_col_email", get: (l) => c(l.email) },
  { key: "csv_col_phone", get: (l) => c(l.phone) },
  { key: "csv_col_campaign", get: campaignOf },
  { key: "csv_col_sources", get: sourcesOf },
  { key: "csv_col_classification", get: (l) => l.classification || "" },
  { key: "csv_col_status", get: (l) => l.status || "" },
  { key: "csv_col_created", get: isoDate },
  { key: "csv_col_budget", get: (l) => c(l.budget) },
  { key: "csv_col_intent", get: (l) => c(l.intention) },
  { key: "csv_col_area", get: (l) => c(l.area) },
  { key: "csv_col_notes", get: (l) => c(l.notes) },
  { key: "csv_col_manual_notes", get: (l) => l.manual_notes || "" },
  { key: "csv_col_source_content", get: (l) => c(l.source_content) },
  { key: "csv_col_source_url", get: (l) => c(l.source_url) },
  { key: "csv_col_username", get: (l) => c(l.username) },
  { key: "csv_col_id", get: (l) => String(l.id == null ? "" : l.id) },
];

// Build the CSV string (with BOM) for a list of leads.
export function leadsToCsv(leads) {
  const headers = COLUMNS.map((col) => t(col.key));
  const rows = (leads || []).map((lead) => COLUMNS.map((col) => col.get(lead)));
  return buildCsv(headers, rows);
}

// Build + download: "{client}-leads-YYYY-MM-DD.csv" (e.g. brandon-leads-2026-09-04.csv).
export function exportLeadsCsv(leads) {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${config.key}-leads-${date}.csv`;
  downloadCsv(filename, leadsToCsv(leads));
}
