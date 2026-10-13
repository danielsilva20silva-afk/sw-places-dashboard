// Derived follow-up cadence engine (pure, node-testable). brandon-only — the
// caller gates everything on hasFeature('followupCadence'). NOTHING is stored:
// lastContacted / nextFollowUp / the attempts counter are computed at read time
// from data we already have (the lead's notes-history timestamps, its completed
// actions, its creation date, classification and status). Imports only the shared
// action comparator (also a pure helper) so the chosen override action orders
// identically everywhere.

import { compareActions } from "./actions.js";

const DAY = 86400000;
// Normal cadence (days) by classification; the retry chain used while a lead is
// "Contacted — no answer" is longer (give the lead room between call attempts).
const CADENCE_DAYS = { A: 7, B: 28, C: 75 };
export const RETRY_DAYS = { A: 7, B: 30, C: 180 };
const UNCLASSIFIED_HOURS = 48;
const DEFAULT_TERMINAL = ["Closed", "Lost"];

// The status whose cadence is the no-answer retry chain (brandon label). Overridable
// via opts.noAnswerStatus for tests.
export const NO_ANSWER_STATUS = "Contacted — no answer";

// Conventions for the "No answer" one-click log: a completed action with this exact
// title is an ATTEMPT (structured counter source); a notes-history entry with this
// exact text is the prefilled no-answer note (NOT a "real contact"). The counter is
// derived from attempt ACTIONS, never from note text.
export const ATTEMPT_TITLE = "📞 No-answer attempt";
export const PREFILLED_NO_ANSWER_NOTE = "Tried calling, no answer";

// Auto-downgrade thresholds: classification A moves to B on the 4th no-answer
// attempt since the last real contact; B moves to C on the 3rd. C is terminal for
// the chain (no further downgrade).
const DOWNGRADE_TARGET = { A: "B", B: "C" };
const DOWNGRADE_THRESHOLD = { A: 4, B: 3 };
export function downgradeTarget(cls) { return DOWNGRADE_TARGET[cls] || null; }
export function downgradeThreshold(cls) { return DOWNGRADE_THRESHOLD[cls] || null; }

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
// inlined so this module imports nothing (beyond the comparator) and stays testable.
function lisbonDayIndex(ms) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  const [y, m, d] = s.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY);
}

// All dated notes-history entries → [{ ms, text }], matching notesFormat's stored
// marker "[DD/MM/YYYY HH:mm]" (optionally " · editada"), Lisbon wall-clock.
const MARK_RE = /\[(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?: · editada)?\]/g;
function datedNoteEntries(notes) {
  const s = String(notes || "");
  const marks = [];
  let m;
  MARK_RE.lastIndex = 0;
  while ((m = MARK_RE.exec(s)) !== null) {
    marks.push({ ms: Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]), start: m.index, end: MARK_RE.lastIndex });
  }
  return marks.map((mk, i) => ({
    ms: mk.ms,
    text: s.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : s.length).trim(),
  }));
}

function latestNoteMs(notes) {
  let best = null;
  for (const e of datedNoteEntries(notes)) if (best == null || e.ms > best) best = e.ms;
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

// Attempts since the last REAL contact. Real contact = a manual notes entry whose
// text is NOT the prefilled no-answer note, OR a completed action that is NOT an
// attempt (a normal completed action, or the downgrade log). Attempts = completed
// attempt-actions dated after that anchor. Derived from actions, never note text.
export function attemptStats(lead, actions = [], cls = (lead && lead.classification) || "") {
  const list = Array.isArray(actions) ? actions : [];
  let resetMs = -Infinity;
  for (const e of datedNoteEntries(lead && lead.manual_notes)) {
    if (e.text && e.text !== PREFILLED_NO_ANSWER_NOTE && e.ms > resetMs) resetMs = e.ms;
  }
  const attemptTimes = [];
  for (const a of list) {
    if (!a || !a.done) continue;
    const ms = toMs(a.done_at) ?? toMs(a.created_at);
    if (ms == null) continue;
    if ((a.title || "") === ATTEMPT_TITLE) attemptTimes.push(ms);
    else if (ms > resetMs) resetMs = ms; // completed non-attempt action = real contact
  }
  const attempts = attemptTimes.filter((ms) => ms > resetMs).length;
  return { attempts, threshold: DOWNGRADE_THRESHOLD[cls] || null };
}

// computeFollowup(lead, actions, opts?) → { lastContacted, nextFollowUp, isOverdue,
// isDueToday, daysOverdue, reason, classification, cadenceDays, overridden,
// nextAction, attempts, attemptThreshold }. Times are ms (or null). reason ∈
// "cadence" | "classify" | "scheduled" | "terminal".
export function computeFollowup(lead, actions = [], opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const terminal = new Set(opts.terminalStatuses || DEFAULT_TERMINAL);
  const noAnswerStatus = opts.noAnswerStatus != null ? opts.noAnswerStatus : NO_ANSWER_STATUS;
  const list = Array.isArray(actions) ? actions : [];
  const cls = (lead && lead.classification) || "";
  const classified = cls === "A" || cls === "B" || cls === "C";
  // Status-aware cadence: the no-answer retry chain is longer than the normal one.
  const noAnswer = !!lead && lead.status === noAnswerStatus;
  const cadenceDays = classified ? (noAnswer ? RETRY_DAYS[cls] : CADENCE_DAYS[cls]) : null;
  const stats = attemptStats(lead, list, cls);

  // lastContacted = latest of note timestamps and completed-action timestamps.
  let lastContacted = latestNoteMs(lead && lead.manual_notes);
  for (const a of list) {
    if (!a || !a.done) continue;
    const ms = toMs(a.done_at) ?? toMs(a.created_at);
    if (ms != null && (lastContacted == null || ms > lastContacted)) lastContacted = ms;
  }

  const base = {
    lastContacted, nextFollowUp: null, isOverdue: false, isDueToday: false,
    daysOverdue: 0, reason: "cadence", classification: cls, cadenceDays, overridden: false,
    nextAction: null, attempts: stats.attempts, attemptThreshold: stats.threshold,
  };

  // Closed / Lost are never due.
  if (lead && terminal.has(lead.status)) return { ...base, reason: "terminal" };

  // Baseline = most recent contact (or creation), FLOORED at the cadence reset.
  const resetMs = dateStrMs(opts.resetDate != null ? opts.resetDate : CADENCE_RESET_DATE) ?? 0;
  const contactedOrCreated = lastContacted != null ? lastContacted : creationMs(lead);
  const baseline = Math.max(contactedOrCreated != null ? contactedOrCreated : resetMs, resetMs);

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
  // then id) and expose it as nextAction so the Today list tie-breaks identically.
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
