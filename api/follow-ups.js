import serverConfig from "./_config.js";
import { getCalendarContext } from "./_adapters/googleAuth.js";

// "Schedule follow-up" — creates/lists Google Calendar follow-up events for a
// lead. Feature-flagged per client (serverConfig.followups) and gated on the
// GOOGLE_CALENDAR_ID env var. The service account must have the target calendar
// shared with it ("Make changes to events"). Additive: no adapter/API changes.

const TZ = "Europe/Lisbon";
const DURATION_MIN = 30;
const REMIND_MIN = 30; // popup reminder, minutes before
const DASHBOARD_URL = "https://brandon-dashboard.vercel.app";
// Private extended property tags so GET only returns OUR follow-ups, never the
// rest of the owner's calendar.
const TAG_KEY = "swDashboardKind";
const TAG_VAL = "followup";

// "YYYY-MM-DDTHH:mm[:ss]" → "YYYY-MM-DDTHH:mm:00" (Google wants seconds).
function withSeconds(s) {
  const v = String(s || "").trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? `${v}:00` : v;
}

// Add minutes to a naive "YYYY-MM-DDTHH:mm[:ss]" wall-clock string, returning the
// same naive format. UTC math on the parts avoids server-timezone drift; the
// result is still wall-clock (timeZone is attached separately on the event).
function addMinutes(naive, mins) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(naive || ""));
  if (!m) return withSeconds(naive);
  const [, y, mo, d, h, mi, s] = m;
  const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)) + mins * 60000;
  const dt = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}T${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}:00`;
}

function buildDescription({ phone, email, note }) {
  const lines = [];
  if (phone) lines.push(`Phone: ${phone}`);
  if (email) lines.push(`Email: ${email}`);
  if (note && String(note).trim()) lines.push("", String(note).trim());
  lines.push("", `Dashboard: ${DASHBOARD_URL}`);
  return lines.join("\n");
}

// Map a Google Calendar API error to a friendly message. 403/404 usually mean
// the calendar isn't shared with the service account yet (or a wrong id).
function calErr(err) {
  const code = err?.code || err?.response?.status;
  if (code === 403 || code === 404) {
    return { status: 502, error: "Calendar not connected yet." };
  }
  const detail = err?.errors?.[0]?.message || err?.response?.data?.error?.message || err?.message || "unknown";
  return { status: 502, error: "Calendar error.", detail };
}

export default async function handler(req, res) {
  // Gate 1: feature enabled for this client?
  if (!serverConfig.followups) {
    return res.status(403).json({ error: "Follow-ups não estão disponíveis para este cliente." });
  }
  // Gate 2: calendar configured? (missing env → friendly, never a crash)
  const ctx = getCalendarContext();
  if (!ctx) {
    return res.status(400).json({ error: "Calendar not connected yet." });
  }
  const { calendar, calendarId } = ctx;

  try {
    if (req.method === "POST") {
      const b = req.body ?? {};
      const name = String(b.name || "").trim();
      const datetime = withSeconds(b.datetime);
      if (!name) return res.status(400).json({ error: "Falta o nome do lead." });
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(datetime)) {
        return res.status(400).json({ error: "Data/hora inválida." });
      }
      const r = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: `Follow up: ${name}`,
          description: buildDescription(b),
          start: { dateTime: datetime, timeZone: TZ },
          end: { dateTime: addMinutes(datetime, DURATION_MIN), timeZone: TZ },
          reminders: { useDefault: false, overrides: [{ method: "popup", minutes: REMIND_MIN }] },
          extendedProperties: {
            private: {
              [TAG_KEY]: TAG_VAL,
              leadId: String(b.leadId ?? b.id ?? ""),
              leadName: name,
            },
          },
        },
      });
      const ev = r.data;
      return res.status(201).json({
        id: ev.id,
        start: ev.start?.dateTime || datetime,
        leadName: name,
      });
    }

    if (req.method === "GET") {
      const r = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 10,
        privateExtendedProperty: `${TAG_KEY}=${TAG_VAL}`,
      });
      const items = (r.data.items || [])
        .filter((e) => e.status !== "cancelled" && e.start?.dateTime)
        .map((e) => ({
          id: e.id,
          start: e.start.dateTime,
          leadName: e.extendedProperties?.private?.leadName || (e.summary || "").replace(/^Follow up:\s*/, ""),
          leadId: e.extendedProperties?.private?.leadId || "",
        }));
      return res.status(200).json(items);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("follow-ups handler error:", err?.message || err);
    // GET degrades to an empty list so the dashboard card just hides; POST
    // surfaces the friendly error inline in the drawer.
    if (req.method === "GET") return res.status(200).json([]);
    const info = calErr(err);
    return res.status(info.status).json({ error: info.error, detail: info.detail });
  }
}
