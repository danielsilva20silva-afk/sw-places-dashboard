import { google } from "googleapis";
import { getCalendarIds } from "./_adapters/googleAuth.js";

// Google Calendar is the single source of truth for scheduling.
// The service account either IMPERSONATES a Workspace user (Domain-Wide
// Delegation via GOOGLE_IMPERSONATE_EMAIL, e.g. Gustavo) or accesses calendars
// SHARED with it directly (e.g. Brandon). GOOGLE_CALENDAR_ID may be a
// COMMA-SEPARATED list; the FIRST id is the PRIMARY (ALL writes go there), the
// rest are read-only secondaries merged into the view. A single id behaves
// exactly as before.
const TZ = "Europe/Lisbon";

// Resolve the calendar list for this request. With no GOOGLE_CALENDAR_ID we keep
// the old behaviour ONLY when impersonating (the user's own "primary"); without
// impersonation an empty list means "not configured" → a friendly 4xx.
function resolveCalendars() {
  const ids = getCalendarIds();
  if (ids.length) return ids;
  return process.env.GOOGLE_IMPERSONATE_EMAIL ? ["primary"] : [];
}

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
function toEvent(e, calendarId = "", isPrimary = true) {
  const allDay = !!(e.start && e.start.date);
  return {
    id: e.id,
    // Empty when the event has no summary; the frontend supplies the per-client
    // "Untitled"/"Busy" label (which also depends on primary vs secondary).
    title: e.summary || "",
    description: e.description || "",
    location: e.location || "",
    allDay,
    start: allDay ? e.start.date : (e.start?.dateTime || ""),
    end: allDay ? addDays(e.end?.date || e.start.date, -1) : (e.end?.dateTime || ""),
    reminderMinutes: readReminderMinutes(e),
    calendarId,
    // Events on a non-primary (secondary) calendar are display-only — the
    // dashboard never writes to them (writes always go to the primary).
    readOnly: !isPrimary,
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
  const CALENDARS = resolveCalendars();
  if (!CALENDARS.length) {
    return res.status(400).json({ error: "Google Calendar não configurado (GOOGLE_CALENDAR_ID)." });
  }
  // ALL writes go to the FIRST calendar (the primary). Never write to secondaries.
  const PRIMARY = CALENDARS[0];

  try {
    if (req.method === "GET") {
      const { start, end } = req.query || {};
      const base = { singleEvents: true, orderBy: "startTime", maxResults: 2500, timeZone: TZ };
      if (start) base.timeMin = new Date(start).toISOString();
      if (end) base.timeMax = new Date(end).toISOString();

      // Fetch every calendar independently; one failing (not shared / no access)
      // must not sink the others — collect its error and still return the rest.
      const results = await Promise.allSettled(
        CALENDARS.map((id) => cal.events.list({ ...base, calendarId: id }))
      );
      const events = [];
      const errors = [];
      results.forEach((r, i) => {
        const id = CALENDARS[i];
        if (r.status === "fulfilled") {
          for (const e of r.value.data.items || []) {
            if (e.status !== "cancelled") events.push(toEvent(e, id, id === PRIMARY));
          }
        } else {
          const info = errorInfo(r.reason);
          errors.push({ calendarId: id, error: info.error, detail: info.detail });
        }
      });
      events.sort((a, b) => new Date(a.start) - new Date(b.start));
      return res.status(200).json({ events, errors });
    }

    if (req.method === "POST") {
      const b = req.body ?? {};
      if (!b.title || !b.start) {
        return res.status(400).json({ error: "Faltam campos: título e início são obrigatórios." });
      }
      const reminders = buildReminders(b.reminderMinutes);
      const r = await cal.events.insert({
        calendarId: PRIMARY, // writes → primary only
        requestBody: {
          summary: b.title, description: b.description || "", location: b.location || "",
          ...toGoogleTimes(b),
          ...(reminders ? { reminders } : {}),
        },
      });
      return res.status(201).json(toEvent(r.data, PRIMARY, true));
    }

    if (req.method === "PATCH") {
      const b = req.body ?? {};
      if (!b.id) return res.status(400).json({ error: "Campo 'id' em falta." });
      if (!b.title || !b.start) {
        return res.status(400).json({ error: "Faltam campos: título e início são obrigatórios." });
      }
      const reminders = buildReminders(b.reminderMinutes);
      // Edits target the primary only. A secondary (read-only) event id here
      // yields a clear 404 rather than a silent failure (and the UI hides Edit
      // on read-only events anyway).
      const r = await cal.events.patch({
        calendarId: PRIMARY, eventId: b.id,
        requestBody: {
          summary: b.title, description: b.description || "", location: b.location || "",
          ...toGoogleTimes(b),
          ...(reminders ? { reminders } : {}),
        },
      });
      return res.status(200).json(toEvent(r.data, PRIMARY, true));
    }

    if (req.method === "DELETE") {
      const id = req.query?.id ?? req.body?.id;
      if (!id) return res.status(400).json({ error: "Parâmetro 'id' em falta." });
      await cal.events.delete({ calendarId: PRIMARY, eventId: id }); // primary only
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
