// Derived follow-up cadence engine (pure, node-testable). brandon-only — the
// caller gates everything on hasFeature('followupCadence'). NOTHING is stored:
// lastContacted / nextFollowUp are computed at read time from data we already
// have (the lead's notes-history timestamps, its completed actions, its creation
// date, and its classification). Imports only the shared action comparator (also
// a pure helper) so the chosen override action orders identically everywhere.
//
// Cadence (days) by classification: A=7, B=28, C=75. Unclassified leads must be
// classified within 48h of creation. A lead's PENDING action with a due date
// overrides the computed cadence (manual intent wins). Closed/Lost are never due.

import { compareActions } from "./actions.js";

const DAY = 86400000;
const CADENCE_DAYS = { A: 7, B: 28, C: 75 };
const UNCLASSIFIED_HOURS = 48;
const DEFAULT_TERMINAL = ["Closed", "Lost"];

// Launch floor (Europe/Lisbon day): the cadence baseline is never older than this,
// so at launch the "Due today" list drains gradually from the reset instead of
// dumping the entire historical backlog as overdue on day one. Overridable per
// call via opts.resetDate (for tests).
export const CADENCE_RESET_DATE = "2026-10-13";

// "YYYY-MM-DD" → ms at UTC midnight (comparable with the ms instants we use; the
// final overdue/today check is day-indexed in Lisbon, so midnight-UTC is fine).
function dateStrMs(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

// Europe/Lisbon day index (days since epoch). Mirrors utils.lisbonDayIndex;
// inlined so this module imports nothing and stays trivially testable.
function lisbonDayIndex(ms) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  const [y, m, d] = s.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY);
}

// Latest notes-history timestamp → ms, or null. Matches notesFormat's stored
// marker "[DD/MM/YYYY HH:mm]" (optionally " · editada"), Lisbon wall-clock. The
// wall-clock parts are read as an instant (good to the day for cadence math).
const STAMP_RE = /\[(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?: · editada)?\]/g;
function latestNoteMs(notes) {
  const s = String(notes || "");
  let m, best = null;
  STAMP_RE.lastIndex = 0;
  while ((m = STAMP_RE.exec(s)) !== null) {
    const dd = +m[1], mo = +m[2], yyyy = +m[3], hh = +m[4], mi = +m[5];
    const ms = Date.UTC(yyyy, mo - 1, dd, hh, mi);
    if (best == null || ms > best) best = ms;
  }
  return best;
}

function toMs(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
}

// created_at (full ISO) preferred, else the date column ("YYYY-MM-DD").
function creationMs(lead) {
  return toMs(lead && lead.created_at) ?? toMs(lead && lead.date);
}

// computeFollowup(lead, actions, opts?) → { lastContacted, nextFollowUp,
// isOverdue, isDueToday, daysOverdue, reason, classification, cadenceDays,
// overridden }. `actions` = the lead's action rows (as returned by
// api.getActions: { done, done_at, due_at, created_at, ... }); the caller passes
// the composite's aggregated actions for merged leads. Times are ms (or null).
// reason ∈ "cadence" | "classify" | "scheduled" | "terminal".
export function computeFollowup(lead, actions = [], opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const terminal = new Set(opts.terminalStatuses || DEFAULT_TERMINAL);
  const list = Array.isArray(actions) ? actions : [];
  const cls = (lead && lead.classification) || "";
  const classified = cls === "A" || cls === "B" || cls === "C";
  const cadenceDays = classified ? CADENCE_DAYS[cls] : null;

  // lastContacted = latest of note timestamps and completed-action timestamps.
  let lastContacted = latestNoteMs(lead && lead.manual_notes);
  for (const a of list) {
    if (!a || !a.done) continue;
    const ms = toMs(a.done_at) ?? toMs(a.created_at);
    if (ms != null && (lastContacted == null || ms > lastContacted)) lastContacted = ms;
  }

  const base = {
    lastContacted, nextFollowUp: null, isOverdue: false, isDueToday: false,
    daysOverdue: 0, reason: "cadence", classification: cls, cadenceDays, overridden: false, nextAction: null,
  };

  // Closed / Lost are never due.
  if (lead && terminal.has(lead.status)) return { ...base, reason: "terminal" };

  // Baseline = most recent contact (or creation), FLOORED at the cadence reset:
  //   baseline = max(lastContacted ?? creation, resetDate)
  // The floor only LIFTS baselines older than the reset; a newer contact/creation
  // is kept as-is (never pushed back). Applies to every lead, including the
  // unclassified 48h rule (an unclassified lead older than the reset counts 48h
  // from the reset, not from its creation).
  const resetMs = dateStrMs(opts.resetDate != null ? opts.resetDate : CADENCE_RESET_DATE) ?? 0;
  const contactedOrCreated = lastContacted != null ? lastContacted : creationMs(lead);
  const baseline = Math.max(contactedOrCreated != null ? contactedOrCreated : resetMs, resetMs);

  // Computed next follow-up.
  let nextFollowUp;
  let reason;
  if (classified) {
    nextFollowUp = baseline + cadenceDays * DAY;
    reason = "cadence";
  } else {
    nextFollowUp = baseline + UNCLASSIFIED_HOURS * 3600000;
    reason = "classify";
  }

  // A pending (not-done) action with a due date overrides the cadence. Pick the
  // lead's winning action with the SHARED comparator (due_at, then created_at,
  // then id) — the same order the Actions card uses — and expose it as nextAction
  // so the Due-today list can tie-break identically across leads.
  let nextAction = null;
  for (const a of list) {
    if (!a || a.done || toMs(a.due_at) == null) continue;
    if (nextAction == null || compareActions(a, nextAction) < 0) nextAction = a;
  }
  let overridden = false;
  if (nextAction != null) { nextFollowUp = toMs(nextAction.due_at); reason = "scheduled"; overridden = true; }

  if (nextFollowUp == null) return { ...base, reason, overridden, nextAction };

  const todayIdx = lisbonDayIndex(now);
  const nextIdx = lisbonDayIndex(nextFollowUp);
  const isOverdue = nextIdx < todayIdx;
  const isDueToday = nextIdx === todayIdx;

  return {
    ...base,
    nextFollowUp,
    isOverdue,
    isDueToday,
    daysOverdue: isOverdue ? todayIdx - nextIdx : 0,
    reason,
    overridden,
    nextAction,
  };
}
