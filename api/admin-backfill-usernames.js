import { getSheetsClient } from "./ai-reply.js";
import * as mc from "./_manychat.js";

// One-off admin backfill: fill the `username` column (L) for existing leads
// created before that column existed, so their Instagram button appears.
//
// Protected: send header `x-admin-token: <MANYCHAT_API_TOKEN>` (the token you
// already have in Vercel). POST only. Add ?dry_run=1 to preview without writing.
export const config = { maxDuration: 60 };

const LEADS_TAB = process.env.GOOGLE_SHEETS_TAB || "Leads";
const LEADS_RANGE = `${LEADS_TAB}!A2:L`;

// Sources whose lead id IS a ManyChat subscriber_id.
const MC_SOURCES = new Set(["DM · ANA", "AI CHAT"]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  // Auth: header must match the ManyChat token (present in Vercel env).
  const secret = process.env.MANYCHAT_API_TOKEN;
  const given = req.headers["x-admin-token"];
  if (!secret || given !== secret) {
    return res.status(401).json({ error: "Não autorizado. Falta ou não coincide o header x-admin-token." });
  }

  const ctx = getSheetsClient();
  if (!ctx) return res.status(500).json({ error: "Google Sheets não configurado." });
  const { sheets, spreadsheetId } = ctx;

  const dryRun = req.query?.dry_run === "1" || req.query?.dry_run === "true";

  try {
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: LEADS_RANGE });
    const rows = resp.data.values || [];

    let updated = 0, skipped = 0, failed = 0;
    const details = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const id = String(r[0] || "").trim();
      const source = String(r[6] || "").trim();
      const username = String(r[11] || "").trim();
      const rowNumber = i + 2; // +1 header, +1 for 1-based

      if (!id) { skipped++; continue; }
      if (username) { skipped++; details.push({ id, action: "skip", reason: "já tem username" }); continue; }
      // Only ManyChat leads whose id looks like a subscriber_id (numeric).
      if (!MC_SOURCES.has(source) || !/^\d+$/.test(id)) {
        skipped++; details.push({ id, action: "skip", reason: `não é subscriber (source="${source}")` });
        continue;
      }

      try {
        const info = await mc.getSubscriberInfo(id);
        const p = mc.subscriberProfile(info);
        const handle = String(p.username || "").trim();
        if (!handle) {
          failed++; details.push({ id, action: "fail", reason: "getInfo sem username" });
          continue;
        }
        if (!dryRun) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${LEADS_TAB}!L${rowNumber}`,
            valueInputOption: "RAW",
            requestBody: { values: [[handle]] },
          });
        }
        updated++;
        details.push({ id, action: dryRun ? "would-update" : "update", username: handle });
      } catch (e) {
        failed++;
        details.push({ id, action: "fail", reason: e?.message || "getInfo error" });
      }
    }

    const summary = { total: rows.filter((r) => r && r[0]).length, updated, skipped, failed, dryRun };
    console.log("[backfill-usernames] summary:", JSON.stringify(summary));
    return res.status(200).json({ ...summary, details });
  } catch (err) {
    console.error("backfill-usernames error:", err);
    const detail = err?.errors?.[0]?.message || err?.message || "unknown";
    return res.status(502).json({ error: "Erro no backfill.", detail });
  }
}
