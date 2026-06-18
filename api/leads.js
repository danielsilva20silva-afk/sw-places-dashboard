import { google } from "googleapis";

// Google Sheet tab name. Columns A–J must be, in order:
// id | name | email | phone | budget | intention | source | date | status | notes
const SHEET_NAME = process.env.GOOGLE_SHEETS_TAB || "Leads";
const DATA_RANGE = `${SHEET_NAME}!A2:J`;

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!email || !key || !spreadsheetId) return null;

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return { sheets: google.sheets({ version: "v4", auth }), spreadsheetId };
}

function rowToLead(r) {
  return {
    id: r[0] ?? "",
    name: r[1] ?? "",
    email: r[2] ?? "",
    phone: r[3] ?? "",
    budget: r[4] ?? "",
    intention: r[5] ?? "",
    source: r[6] ?? "",
    date: r[7] ?? "",
    status: r[8] || "Novo",
    notes: r[9] ?? "",
  };
}

export default async function handler(req, res) {
  const ctx = getSheetsClient();
  if (!ctx) {
    return res.status(500).json({
      error: "Google Sheets não configurado (GOOGLE_SHEETS_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY).",
    });
  }
  const { sheets, spreadsheetId } = ctx;

  try {
    if (req.method === "GET") {
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: DATA_RANGE });
      const rows = resp.data.values || [];
      const leads = rows.filter((r) => r && r[0]).map(rowToLead);
      return res.status(200).json(leads);
    }

    if (req.method === "POST") {
      const b = req.body ?? {};
      if (!b.name && !b.email) {
        return res.status(400).json({ error: "Lead precisa de pelo menos nome ou email." });
      }
      const id = b.id ? String(b.id) : String(Date.now());
      const date = b.date || new Date().toISOString().slice(0, 10);
      const row = [
        id, b.name || "", b.email || "", b.phone || "", b.budget || "",
        b.intention || "", b.source || "", date, b.status || "Novo", b.notes || "",
      ];
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAME}!A:J`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [row] },
      });
      return res.status(201).json(rowToLead(row));
    }

    if (req.method === "PATCH") {
      const { id, status, notes } = req.body ?? {};
      if (!id) return res.status(400).json({ error: "Campo 'id' em falta." });

      // Find the row by id, preserving any field not provided.
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: DATA_RANGE });
      const rows = resp.data.values || [];
      const idx = rows.findIndex((r) => r && String(r[0]) === String(id));
      if (idx === -1) return res.status(404).json({ error: "Lead não encontrado." });

      const existing = rows[idx];
      const newStatus = status ?? existing[8] ?? "Novo";
      const newNotes = notes ?? existing[9] ?? "";
      const rowNumber = idx + 2; // +1 for header row, +1 for 1-based indexing
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!I${rowNumber}:J${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[newStatus, newNotes]] },
      });
      return res.status(200).json({ ...rowToLead(existing), status: newStatus, notes: newNotes });
    }

    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("leads handler error:", err);
    const detail =
      err?.errors?.[0]?.message ||
      err?.response?.data?.error?.message ||
      err?.message ||
      "unknown";
    const code = typeof err?.code === "number" ? err.code : err?.response?.status;
    return res
      .status(code >= 400 && code < 600 ? code : 502)
      .json({ error: "Erro a comunicar com o Google Sheets.", detail });
  }
}
