import { google } from "googleapis";

// Google Sheet tab name. Columns A–L must be, in order:
// id | name | email | phone | budget | intention | source | date | status | notes | created_at | username
const SHEET_NAME = process.env.GOOGLE_SHEETS_TAB || "Leads";
const DATA_RANGE = `${SHEET_NAME}!A2:L`;

// Full ISO timestamp with the Europe/Lisbon offset, e.g. "2026-07-09T14:32:05+01:00".
// (Kept self-contained here so this route doesn't import the Ana/Anthropic bundle.)
function lisbonISO(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    timeZoneName: "shortOffset",
  }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t)?.value || "";
  let hh = g("hour"); if (hh === "24") hh = "00";
  const raw = g("timeZoneName").replace("GMT", "").trim();
  let off = "+00:00";
  const m = raw.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (m) off = `${m[1]}${m[2].padStart(2, "0")}:${m[3] || "00"}`;
  return `${g("year")}-${g("month")}-${g("day")}T${hh}:${g("minute")}:${g("second")}${off}`;
}

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

// Resolve the numeric sheetId (gid) for a tab title — required by deleteDimension.
async function getSheetId(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const sheet = (meta.data.sheets || []).find((s) => s.properties.title === title);
  return sheet ? sheet.properties.sheetId : null;
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
    created_at: r[10] ?? "",
    username: r[11] ?? "",
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
      const createdAt = b.created_at || lisbonISO();
      const row = [
        id, b.name || "", b.email || "", b.phone || "", b.budget || "",
        b.intention || "", b.source || "", date, b.status || "Novo", b.notes || "", createdAt, b.username || "",
      ];
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${SHEET_NAME}!A:L`,
        valueInputOption: "RAW",
        requestBody: { values: [row] },
      });
      return res.status(201).json(rowToLead(row));
    }

    if (req.method === "PATCH") {
      const b = req.body ?? {};
      const { id } = b;
      if (!id) return res.status(400).json({ error: "Campo 'id' em falta." });

      // Find the row by id. Only the fields present in the body are changed;
      // id / source / date / created_at are always preserved.
      const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: DATA_RANGE });
      const rows = resp.data.values || [];
      const idx = rows.findIndex((r) => r && String(r[0]) === String(id));
      if (idx === -1) return res.status(404).json({ error: "Lead não encontrado." });

      const ex = rowToLead(rows[idx]);
      const merged = {
        ...ex,
        name: b.name ?? ex.name,
        email: b.email ?? ex.email,
        phone: b.phone ?? ex.phone,
        budget: b.budget ?? ex.budget,
        intention: b.intention ?? ex.intention,
        status: b.status ?? ex.status,
        notes: b.notes ?? ex.notes,
      };
      const rowNumber = idx + 2; // +1 header, +1 for 1-based indexing
      const rowVals = [
        merged.id, merged.name, merged.email, merged.phone, merged.budget,
        merged.intention, merged.source, merged.date, merged.status, merged.notes, merged.created_at,
      ];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A${rowNumber}:K${rowNumber}`,
        valueInputOption: "RAW",
        requestBody: { values: [rowVals] },
      });
      return res.status(200).json(merged);
    }

    if (req.method === "DELETE") {
      const id = req.query?.id ?? req.body?.id;
      if (!id) return res.status(400).json({ error: "Parâmetro 'id' em falta." });

      const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: DATA_RANGE });
      const rows = resp.data.values || [];
      const idx = rows.findIndex((r) => r && String(r[0]) === String(id));
      if (idx === -1) return res.status(404).json({ error: "Lead não encontrado." });

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

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
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
