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
