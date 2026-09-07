// Operational, self-expiring config for Ana's system prompt, read by
// _ana-prompt.js. Kept separate from the frozen prompt text so temporary tweaks
// (like an availability window) don't touch the prompt itself. Not a route (the
// leading underscore keeps Vercel from exposing it as an endpoint).
//
// Availability window: while today <= availabilityUntil, Ana appends this EXACT
// phrasing about WHEN the Gustavo will make contact (an authorized exception to
// the "never promise deadlines" rule). After the date, nothing is injected and
// the rule applies again — automatically, no code change needed. Set either field
// to "" to disable. Env vars ANA_AVAILABILITY_NOTE / ANA_AVAILABILITY_UNTIL
// override these when present (so it can also be changed without editing code).
export const ANA_CONFIG = {
  // No active availability window. To announce one, set both fields, e.g.:
  //   availabilityNote: "O Gustavo entra em contacto contigo a partir de dia X.",
  //   availabilityUntil: "2026-08-24"  // last day the note is shown (inclusive)
  // It expires on its own after availabilityUntil (evaluated per request).
  availabilityNote: "",
  availabilityUntil: "", // ISO date (YYYY-MM-DD), inclusive
};
