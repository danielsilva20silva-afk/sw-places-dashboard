// Date helpers for the calendar. The browser runs in the user's local zone
// (Europe/Lisbon for this client), so local getters == Lisbon time.

export const p2 = (n) => String(n).padStart(2, "0");

// JS Date → "YYYY-MM-DD" (local)
export const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

// JS Date → "YYYY-MM-DDTHH:MM" (value for <input type=datetime-local>)
export const toLocalInput = (d) => `${ymd(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;

export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function addMonths(d, n) { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; }
export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// Monday-based start of the week containing d.
export function startOfWeekMon(d) {
  const x = startOfDay(d);
  const wd = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  x.setDate(x.getDate() - wd);
  return x;
}

export const sameYmd = (a, b) => ymd(a) === ymd(b);

// A timed event's start/end as Date objects; all-day → local midnight bounds.
export function eventStartDate(ev) {
  if (ev.allDay) { const [y, m, d] = String(ev.start).split("-").map(Number); return new Date(y, m - 1, d); }
  return new Date(ev.start);
}
export function eventEndDate(ev) {
  if (ev.allDay) { const [y, m, d] = String(ev.end || ev.start).split("-").map(Number); return new Date(y, m - 1, d, 23, 59, 59); }
  return new Date(ev.end || ev.start);
}
// Local "YYYY-MM-DD" key of the event's start day (for placing it in a cell).
export const eventDayKey = (ev) => (ev.allDay ? ev.start : ymd(new Date(ev.start)));

// Short time label for an event ("14:30" or "Dia inteiro").
export function timeLabel(ev) {
  if (ev.allDay) return "Dia inteiro";
  return new Date(ev.start).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export const WEEKDAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function monthTitle(d) {
  return d.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}
