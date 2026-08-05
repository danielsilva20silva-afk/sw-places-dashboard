import { google } from "googleapis";

// Shared Google service-account auth for the Sheets-backed adapters (sheets.js
// and metaLeadsSheet.js). Returns an authorized Sheets client + the configured
// spreadsheet id, or null when env is missing so the caller maps a 500.
// Extracted verbatim from sheets.js's original getContext — behavior identical.
export function getSheetsContext() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!email || !key || !spreadsheetId) return null;
  const auth = new google.auth.JWT({
    email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return { sheets: google.sheets({ version: "v4", auth }), spreadsheetId };
}

// GOOGLE_CALENDAR_ID may be a COMMA-SEPARATED list of calendar ids (trimmed).
// The FIRST id is the PRIMARY (read/write, where all dashboard-created events
// go); any others are secondary (typically shared read-only, display + no
// double-booking). A single id behaves exactly as before. Returns [] when unset.
export function getCalendarIds() {
  return (process.env.GOOGLE_CALENDAR_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Service-account Google Calendar client for the follow-ups feature. Unlike
// api/calendar.js (which impersonates a Workspace user via Domain-Wide
// Delegation), this uses the service account DIRECTLY — the target calendar(s)
// are SHARED with the SA's email. Returns { calendar, calendarIds } (first id is
// the primary for writes) or null when env is missing (caller maps a friendly 4xx).
export function getCalendarContext() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const calendarIds = getCalendarIds();
  if (!email || !key || !calendarIds.length) return null;
  const auth = new google.auth.JWT({
    email, key, scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
  return { calendar: google.calendar({ version: "v3", auth }), calendarIds };
}
