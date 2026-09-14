// Pure helpers for the lead-actions feature (no imports → node-testable). Due
// dates are compared in the browser's LOCAL calendar (the consultant works in
// Lisbon; browser TZ = working TZ, same assumption the calendar makes).

export const DUE_COLORS = { overdue: "#DC2626", today: "#D97706", future: "#6B7280" };

// Classify a pending action's due_at (ISO) relative to `now`:
//   overdue → already past · today → due later today · future → a later day.
export function dueState(dueISO, now = Date.now()) {
  const due = new Date(dueISO).getTime();
  if (!Number.isFinite(due)) return "future";
  if (due < now) return "overdue";
  const d = new Date(due);
  const n = new Date(now);
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) {
    return "today";
  }
  return "future";
}

// Sort comparator by due_at ascending (soonest first).
export function sortByDue(a, b) {
  return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
}

// Split a stored UTC ISO due_at into the { date, time } wall-clock parts an edit
// form seeds its inputs with (browser-local calendar; empty/invalid → tomorrow 10:00).
const pad = (n) => String(n).padStart(2, "0");
export function splitLocal(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return { date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`, time: "10:00" };
  }
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

// Partition {action, lead} items for the two dashboard cards:
//   overdue + today  → the "Today" card (overdue shown loud, on top)
//   upcoming         → the "Upcoming" card (everything due after today)
// Each bucket sorted by due (soonest first).
export function partitionActions(items, now = Date.now()) {
  const overdue = [];
  const today = [];
  const upcoming = [];
  for (const it of items || []) {
    const st = dueState(it.action.due_at, now);
    if (st === "overdue") overdue.push(it);
    else if (st === "today") today.push(it);
    else upcoming.push(it); // "future"
  }
  const byDue = (a, b) => sortByDue(a.action, b.action);
  overdue.sort(byDue);
  today.sort(byDue);
  upcoming.sort(byDue);
  return { overdue, today, upcoming };
}

// Group already-sorted items by their local calendar day. Returns
// [{ dayStart, items }] in ascending day order (items kept in incoming order).
export function byCalendarDay(items) {
  const map = new Map();
  for (const it of items || []) {
    const d = new Date(it.action.due_at);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const g = map.get(dayStart) || { dayStart, items: [] };
    g.items.push(it);
    map.set(dayStart, g);
  }
  return Array.from(map.values()).sort((a, b) => a.dayStart - b.dayStart);
}
