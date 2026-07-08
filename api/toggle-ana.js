import { google } from "googleapis";
import * as mc from "./_manychat.js";

// Mirror tab: one column of contact_ids that are currently MUTED (Ana silent).
// Presence = muted. Source of truth for silencing is the ManyChat "Humano"
// tag; this mirror only lets the UI read state without a slow live API call.
const MUTED_TAB = process.env.GOOGLE_ANA_MUTED_TAB || "AnaMuted";
const MUTED_RANGE = `${MUTED_TAB}!A2:A`;
const HUMAN_TAG = process.env.MANYCHAT_HUMAN_TAG || "Humano";

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!email || !key || !spreadsheetId) return null;
  const auth = new google.auth.JWT({
    email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return { sheets: google.sheets({ version: "v4", auth }), spreadsheetId };
}

async function ensureMutedTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties(title)" });
  const exists = (meta.data.sheets || []).some((s) => s.properties.title === MUTED_TAB);
  if (exists) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: MUTED_TAB } } }] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `${MUTED_TAB}!A1`, valueInputOption: "RAW",
    requestBody: { values: [["contact_id"]] },
  });
}

async function readMuted(sheets, spreadsheetId) {
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: MUTED_RANGE });
  return (resp.data.values || []).map((r) => String(r[0])).filter(Boolean);
}

async function setMuted(sheets, spreadsheetId, id, muted) {
  const rows = await readMuted(sheets, spreadsheetId);
  const has = rows.includes(id);
  let next;
  if (muted && !has) next = [...rows, id];
  else if (!muted && has) next = rows.filter((x) => x !== id);
  else return; // no change
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: MUTED_RANGE });
  if (next.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId, range: `${MUTED_TAB}!A2`, valueInputOption: "RAW",
      requestBody: { values: next.map((x) => [x]) },
    });
  }
}

export default async function handler(req, res) {
  const ctx = getSheetsClient();
  if (!ctx) {
    return res.status(500).json({ error: "Google Sheets não configurado." });
  }
  const { sheets, spreadsheetId } = ctx;

  try {
    await ensureMutedTab(sheets, spreadsheetId);

    // GET ?subscriber_id=X → current state (active = not muted)
    if (req.method === "GET") {
      const sid = req.query?.subscriber_id;
      if (!sid) return res.status(400).json({ error: "Parâmetro 'subscriber_id' em falta." });
      const muted = await readMuted(sheets, spreadsheetId);
      return res.status(200).json({ subscriber_id: String(sid), active: !muted.includes(String(sid)) });
    }

    // POST { subscriber_id, active } → add/remove the ManyChat 'Humano' tag
    if (req.method === "POST") {
      const { subscriber_id, active } = req.body ?? {};
      if (subscriber_id === undefined || subscriber_id === null || active === undefined) {
        return res.status(400).json({ error: "Campos 'subscriber_id' e 'active' são obrigatórios." });
      }
      const sidStr = String(subscriber_id);
      if (!/^\d+$/.test(sidStr)) {
        return res.status(400).json({ error: "subscriber_id inválido (não é um contacto ManyChat)." });
      }
      if (!process.env.MANYCHAT_API_TOKEN) {
        return res.status(500).json({ error: "MANYCHAT_API_TOKEN não configurado." });
      }
      const sidNum = Number(sidStr);
      const wantActive = !!active;

      // ManyChat tag = source of truth. active → remove 'Humano'; silence → add.
      if (wantActive) await mc.removeTagByName(sidNum, HUMAN_TAG);
      else await mc.addTagByName(sidNum, HUMAN_TAG);

      // Update the UI mirror only after the tag change succeeded.
      await setMuted(sheets, spreadsheetId, sidStr, !wantActive);

      return res.status(200).json({ subscriber_id: sidStr, active: wantActive });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("toggle-ana error:", err);
    const detail =
      err?.errors?.[0]?.message ||
      err?.response?.data?.error?.message ||
      err?.message ||
      "unknown";
    return res.status(502).json({ error: "Erro ao alterar o estado da Ana.", detail });
  }
}
