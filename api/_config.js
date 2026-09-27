// Server-side client config, selected by process.env.CLIENT (default "swplaces").
// NOTE: this is a SEPARATE variable from the frontend's VITE_CLIENT. Both must be
// set to the same client key per deployment (VITE_CLIENT drives the built UI,
// CLIENT drives the API). An unknown CLIENT throws so a misconfig fails loud.
const CLIENT = process.env.CLIENT || "swplaces";

const CONFIGS = {
  swplaces: { dataSource: "sheets", followups: false, dedupe: false, templates: false, actions: false, archive: false, classSuggest: false, notifications: true },
  // Brandon merges two lead sources: Supabase (landing page) is primary; the
  // Meta Ads Instant Forms Google Sheet is secondary. Order matters — the first
  // source is the primary (owns addLead). See api/_adapters/composite.js.
  // followups: Google Calendar "Schedule follow-up" feature (api/follow-ups.js).
  // dedupe + templates: brandon-only Supabase features served by one function,
  // api/brandon-store.js (?resource=links | ?resource=templates), to stay within
  // Vercel's 12-function cap. templates powers the "Meta Leads Notifier" Apps
  // Script, which reads active templates via a token.
  // actions: per-lead next-action tracking (api/brandon-store.js?resource=actions).
  // archive: hide leads from the working list without deleting — works for Meta
  // leads too (Meta owns those rows) (api/brandon-store.js?resource=archive).
  // classSuggest: frontend-only — suggested A/B/C from the Meta form's Intent
  // answer (the Meta adapter maps Area/Intent unconditionally; this flag just
  // gates the suggestion UI so other clients stay untouched). Kept here too so
  // both config systems declare it.
  brandon: { dataSource: "composite", sources: ["supabase", "metaLeadsSheet"], followups: true, dedupe: true, templates: true, actions: true, archive: true, classSuggest: true, notifications: false },
};

const serverConfig = CONFIGS[CLIENT];
if (!serverConfig) throw new Error(`Unknown CLIENT: ${CLIENT}`);

export default serverConfig;
export { CLIENT };
