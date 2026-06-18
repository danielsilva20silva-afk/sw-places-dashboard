import { google } from "googleapis";

// Google Sheet tab name. Columns A–F must be, in order:
// id | name | date | time | type | leadId
const SHEET_NAME = process.env.GOOGLE_MEETINGS_TAB || "Meetings";
const DATA_RANGE = `${SHEET_NAME}!A2:F`;

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

function rowToMeeting(r) {
  return {
    id: r[0] ?? "",
    name: r[1] ?? "",
    date: r[2] ?? "",
    time: r[3] ?? "",
    type: r[4] ?? "",
    leadId: r[5] ?? "",
  };
}

// Resolve the numeric sheetId (gid) for a tab title — required by deleteDimension.
async function getSheetId(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const sheet = (meta.data.sheets || []).find((s) => s.properties.title === title);
  return sheet ? sheet.properties.sheetId : null;
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
      const meetings = rows.filter((r) => r && r[0]).map(rowToMeeting);
      return res.status(200).json(meetings);
    }

    if (req.method === "POST") {
      const b = req.body ?? {};
      if (!b.name || !b.date) {
        return res.status(400).json({ error: "Reunião precisa de nome e data." });
      }
      const id = b.id ? String(b.id) : String(Date.now());
      const row = [id, b.name || "", b.date || "", b.time || "", b.type || "", b.leadId || ""];
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAME}!A:F`,
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });
      return res.status(201).json(rowToMeeting(row));
    }

    if (req.method === "DELETE") {
      const id = req.query?.id;
      if (!id) return res.status(400).json({ error: "Parâmetro 'id' em falta." });

      const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: DATA_RANGE });
      const rows = resp.data.values || [];
      const idx = rows.findIndex((r) => r && String(r[0]) === String(id));
      if (idx === -1) return res.status(404).json({ error: "Reunião não encontrada." });

      const sheetId = await getSheetId(sheets, spreadsheetId, SHEET_NAME);
      if (sheetId == null) return res.status(500).json({ error: `Tab "${SHEET_NAME}" não encontrada.` });

      // Data rows start at sheet row 2 → 0-based dimension index of rows[idx] is idx + 1.
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: { sheetId, dimension: "ROWS", startIndex: idx + 1, endIndex: idx + 2 },
            },
          }],
        },
      });
      return res.status(200).json({ id: String(id) });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("meetings handler error:", err);
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
