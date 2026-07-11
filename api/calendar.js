import { google } from "googleapis";

// Google Calendar is the single source of truth for scheduling.
// The service account uses Domain-Wide Delegation to IMPERSONATE a Workspace
// user (GOOGLE_IMPERSONATE_EMAIL, e.g. gmiguel@sw-places.com): it acts AS that
// user, so it has full access to their calendar without relying on an external
// share (which the Workspace policy limited to free/busy). Because we act as
// the user, the calendar id defaults to their own "primary" calendar.
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || "primary";
const TZ = "Europe/Lisbon";

function getCalendarClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const subject = process.env.GOOGLE_IMPERSONATE_EMAIL || undefined; // DWD impersonation
  if (!email || !key) return null;
  const auth = new google.auth.JWT({
    email, key, scopes: ["https://www.googleapis.com/auth/calendar"], subject,
  });
  return google.calendar({ version: "v3", auth });
}

// "YYYY-MM-DD" + n days (UTC math on the calendar date, no tz drift).
function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Ensure an RFC3339 local datetime has seconds ("...T14:00" → "...T14:00:00").
function withSeconds(s) {
  return /T\d{2}:\d{2}$/.test(s) ? `${s}:00` : s;
}

// Reminder minutes → Google reminders object. -1 = no notification; a number =
// that many minutes before via a popup. null/undefined = leave reminders alone
// (don't send the field), preserving whatever the event/calendar had.
function buildReminders(minutes) {
  if (minutes === null || minutes === undefined) return undefined;
  if (Number(minutes) < 0) return { useDefault: false, overrides: [] };
  return { useDefault: false, overrides: [{ method: "popup", minutes: Number(minutes) }] };
}

// Read a reminder value back for the edit form: the first override's minutes if
// determinable, -1 when explicitly none, or null (unknown → uses calendar
// default; the form falls back to its own default).
function readReminderMinutes(e) {
  const rem = e.reminders;
  if (!rem) return null;
  if (Array.isArray(rem.overrides) && rem.overrides.length > 0) {
    const popup = rem.overrides.find((o) => o.method === "popup") || rem.overrides[0];
    return typeof popup.minutes === "number" ? popup.minutes : null;
  }
  if (rem.useDefault === false) return -1; // overrides empty + not default → none
  return null; // useDefault true → not determinable
}

// Google event → our shape. All-day events use `date`; timed use `dateTime`.
// Google stores all-day end as EXCLUSIVE; we return it inclusive for display.
function toEvent(e) {
  const allDay = !!(e.start && e.start.date);
  return {
    id: e.id,
    title: e.summary || "(sem título)",
    description: e.description || "",
    location: e.location || "",
    allDay,
    start: allDay ? e.start.date : (e.start?.dateTime || ""),
    end: allDay ? addDays(e.end?.date || e.start.date, -1) : (e.end?.dateTime || ""),
    reminderMinutes: readReminderMinutes(e),
  };
}

// Our input → Google start/end. For all-day, `end` is treated as inclusive and
// stored +1 (Google's exclusive convention).
function toGoogleTimes(b) {
  if (b.allDay) {
    const startDate = b.start;
    const inclusiveEnd = b.end || b.start;
    return { start: { date: startDate }, end: { date: addDays(inclusiveEnd, 1) } };
  }
  return {
    start: { dateTime: withSeconds(b.start), timeZone: TZ },
    end: { dateTime: withSeconds(b.end || b.start), timeZone: TZ },
  };
}

function errorInfo(err) {
  const code = err?.code || err?.response?.status;
  if (code === 403) return { status: 403, error: "Sem acesso ao calendário. Confirma que foi partilhado com a conta de serviço com permissão para fazer alterações." };
  if (code === 404) return { status: 404, error: "Calendário não encontrado. Verifica o GOOGLE_CALENDAR_ID." };
  const detail = err?.errors?.[0]?.message || err?.response?.data?.error?.message || err?.message || "unknown";
  return { status: code >= 400 && code < 600 ? code : 502, error: "Erro no Google Calendar.", detail };
}

export default async function handler(req, res) {
  const cal = getCalendarClient();
  if (!cal) {
    return res.status(500).json({ error: "Google Calendar não configurado (GOOGLE_CALENDAR_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)." });
  }

  try {
    if (req.method === "GET") {
      const { start, end } = req.query || {};
      const params = {
        calendarId: CALENDAR_ID, singleEvents: true, orderBy: "startTime",
        maxResults: 2500, timeZone: TZ,
      };
      if (start) params.timeMin = new Date(start).toISOString();
      if (end) params.timeMax = new Date(end).toISOString();
      const r = await cal.events.list(params);
      const events = (r.data.items || []).filter((e) => e.status !== "cancelled").map(toEvent);
      return res.status(200).json(events);
    }

    if (req.method === "POST") {
      const b = req.body ?? {};
      if (!b.title || !b.start) {
        return res.status(400).json({ error: "Faltam campos: título e início são obrigatórios." });
      }
      const reminders = buildReminders(b.reminderMinutes);
      const r = await cal.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: {
          summary: b.title, description: b.description || "", location: b.location || "",
          ...toGoogleTimes(b),
          ...(reminders ? { reminders } : {}),
        },
      });
      return res.status(201).json(toEvent(r.data));
    }

    if (req.method === "PATCH") {
      const b = req.body ?? {};
      if (!b.id) return res.status(400).json({ error: "Campo 'id' em falta." });
      if (!b.title || !b.start) {
        return res.status(400).json({ error: "Faltam campos: título e início são obrigatórios." });
      }
      const reminders = buildReminders(b.reminderMinutes);
      const r = await cal.events.patch({
        calendarId: CALENDAR_ID, eventId: b.id,
        requestBody: {
          summary: b.title, description: b.description || "", location: b.location || "",
          ...toGoogleTimes(b),
          ...(reminders ? { reminders } : {}),
        },
      });
      return res.status(200).json(toEvent(r.data));
    }

    if (req.method === "DELETE") {
      const id = req.query?.id ?? req.body?.id;
      if (!id) return res.status(400).json({ error: "Parâmetro 'id' em falta." });
      await cal.events.delete({ calendarId: CALENDAR_ID, eventId: id });
      return res.status(200).json({ id: String(id) });
    }

    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("calendar handler error:", err?.message);
    const info = errorInfo(err);
    return res.status(info.status).json({ error: info.error, detail: info.detail });
  }
}
