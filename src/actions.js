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
