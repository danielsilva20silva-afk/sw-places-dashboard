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

// THE shared action comparator: due_at ascending (soonest first), then explicit
// tie-breakers so equal-due-time actions have a deterministic order — created_at
// ascending, then id. Used by the Actions card (groupActions), the drawer list,
// AND the Due-today list (via followups), so those surfaces can never disagree on
// ties (e.g. three actions all at 11:00 render in the same order everywhere).
export function compareActions(a, b) {
  const ms = (v) => { const t = new Date(v == null ? NaN : v).getTime(); return Number.isFinite(t) ? t : Infinity; };
  const ad = ms(a && a.due_at), bd = ms(b && b.due_at);
  if (ad !== bd) return ad - bd;
  const ac = ms(a && a.created_at), bc = ms(b && b.created_at);
  if (ac !== bc) return ac - bc;
  return String((a && a.id) ?? "").localeCompare(String((b && b.id) ?? ""));
}

// Back-compat name for the shared comparator (soonest first, deterministic ties).
export const sortByDue = compareActions;

// Group {action, lead} items for the dashboard card: overdue, today, and the
// count/list of upcoming actions within the next 7 days. Each bucket sorted by due.
export function groupActions(items, now = Date.now()) {
  const overdue = [];
  const today = [];
  const week = [];
  const weekEnd = now + 7 * 86400000;
  for (const it of items || []) {
    const st = dueState(it.action.due_at, now);
    if (st === "overdue") overdue.push(it);
    else if (st === "today") today.push(it);
    else if (new Date(it.action.due_at).getTime() <= weekEnd) week.push(it);
  }
  const byDue = (a, b) => sortByDue(a.action, b.action);
  overdue.sort(byDue);
  today.sort(byDue);
  week.sort(byDue);
  return { overdue, today, week };
}
