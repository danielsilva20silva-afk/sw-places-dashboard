import { createClient } from "@supabase/supabase-js";

// Supabase data adapter — used by clients whose dataSource is "supabase"
// (currently Brandon). Exposes the SAME Leads interface as sheets.js so the thin
// endpoints (api/leads.js, api/conversations.js) need zero changes.
//
// Brandon has no Ana / Conversas feature, so the Conversations operations are
// stubs: reads return empty, writes throw a clear DataError. They exist only so
// the adapter satisfies the full interface if ever imported by conversations.js.

// ── Table / columns ──
// Brandon's leads live in the landing-page's `subscribers` table:
//   id (uuid) | email | created_at | source | ip_country | replied_at |
//   replied_to_listing | viewing_booked (bool) | closed (bool) | notes |
//   budget_range | purpose | area | comment | property_type | status (text)
// Only the columns the dashboard maps are selected.
const TABLE = process.env.SUPABASE_LEADS_TABLE || "subscribers";
const SELECT_COLS =
  "id, email, created_at, source, notes, budget_range, purpose, area, comment, property_type, status";

// Domain error the endpoints surface directly (status + message preserved).
// Duck-typed via `.expose` so endpoints need no import of this class — mirrors
// the DataError in sheets.js (each adapter is self-contained).
export class DataError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

// Opaque connection handle (parallels sheets.getContext). Returned to the
// endpoint and passed back into each operation; null when env is missing so the
// endpoint maps a 500 "not configured".
export function getContext() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  return { supabase };
}

// ── Read mapping: subscribers row → dashboard lead shape ──
const s = (v) => (v == null ? "" : String(v));

// Notes shown in the dashboard prepend derived context that has no dedicated
// dashboard field: a "{area} · {property_type}" header then the intake comment.
// The real editable notes come last. Empty parts are omitted. On WRITE we strip
// this derived prefix back off so only the user's real notes persist — never the
// prefix (see updateLead / stripDerivedPrefix).
function derivedPrefix(row) {
  const header = [s(row.area).trim(), s(row.property_type).trim()]
    .filter(Boolean)
    .join(" · ");
  return [header, s(row.comment).trim()].filter(Boolean).join("\n\n");
}

function composeNotes(row) {
  return [derivedPrefix(row), s(row.notes).trim()].filter(Boolean).join("\n\n");
}

// Inverse of composeNotes on the notes textarea: remove the leading derived
// prefix so only the user's real notes are stored. If the prefix isn't present
// verbatim (e.g. the user edited inside it), store the text as-is — best effort.
function stripDerivedPrefix(full, row) {
  const prefix = derivedPrefix(row);
  if (!prefix) return full;
  if (full === prefix) return "";
  if (full.startsWith(prefix + "\n\n")) return full.slice(prefix.length + 2);
  if (full.startsWith(prefix + "\n")) return full.slice(prefix.length + 1);
  return full;
}

function rowToLead(row) {
  const email = s(row.email);
  return {
    id: s(row.id),
    // name is display-only, derived from the email local-part (no name column).
    name: email.includes("@") ? email.split("@")[0] : email,
    email,
    phone: "", // no column
    budget: s(row.budget_range),
    intention: s(row.purpose),
    source: s(row.source),
    date: s(row.created_at).slice(0, 10), // YYYY-MM-DD
    status: s(row.status) || "New",
    notes: composeNotes(row),
    created_at: s(row.created_at),
    username: "", // no column
    source_content: "", // no column
  };
}

// Dashboard lead field → subscribers column, for writes. Fields with no column
// (name, phone) are absent here and thus silently ignored on write.
const WRITE_MAP = {
  email: "email",
  budget: "budget_range",
  intention: "purpose",
  notes: "notes", // raw user text only — never the composed prefix
  status: "status",
};

// Build the column patch from an incoming body, mapping only keys that were
// actually provided (the drawer sends just the changed fields).
function bodyToColumns(b) {
  const cols = {};
  for (const [field, col] of Object.entries(WRITE_MAP)) {
    if (b[field] !== undefined) cols[col] = b[field];
  }
  return cols;
}

// ────────────────────────────── Leads ──────────────────────────────
export async function getLeads(ctx) {
  const { supabase } = ctx;
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(rowToLead);
}

export async function addLead(ctx, b) {
  const { supabase } = ctx;
  const insert = bodyToColumns(b);
  // A manually-added lead still needs a source so it's attributable.
  if (!insert.source && b.source) insert.source = b.source;
  if (!insert.source) insert.source = "dashboard";
  const { data, error } = await supabase
    .from(TABLE)
    .insert(insert)
    .select(SELECT_COLS)
    .single();
  if (error) throw new Error(error.message);
  return rowToLead(data);
}

export async function updateLead(ctx, id, b) {
  const { supabase } = ctx;

  // Read the current row first: needed to 404 cleanly and to strip the derived
  // notes prefix (which requires the row's area/comment/property_type).
  const { data: current, error: readErr } = await supabase
    .from(TABLE)
    .select(SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!current) throw new DataError(404, "Lead não encontrado.");

  const cols = bodyToColumns(b);
  // The notes textarea carries the derived prefix on read — strip it so only the
  // user's real notes are persisted (never the prefix).
  if ("notes" in cols) cols.notes = stripDerivedPrefix(s(cols.notes), current);

  // Nothing mappable changed → return the current row unchanged.
  if (Object.keys(cols).length === 0) return rowToLead(current);

  const { data, error } = await supabase
    .from(TABLE)
    .update(cols)
    .eq("id", id)
    .select(SELECT_COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new DataError(404, "Lead não encontrado.");
  return rowToLead(data);
}

export async function deleteLead(ctx, id) {
  const { supabase } = ctx;
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new DataError(404, "Lead não encontrado.");
  return { id: String(id) };
}

// ────────────────────────── Conversations ──────────────────────────
// Brandon has no Ana/Conversas feature. Reads return empty so nothing crashes
// if ever called; writes fail loudly with a domain error.
const NO_CONVERSATIONS = "Conversas não estão disponíveis para esta fonte de dados.";

export async function listConversations() {
  return [];
}

export async function getThread(_ctx, contactId) {
  return { contact_id: String(contactId), messages: [] };
}

export async function addMessage() {
  throw new DataError(501, NO_CONVERSATIONS);
}

export async function updateMessage() {
  throw new DataError(501, NO_CONVERSATIONS);
}

export async function deleteMessage() {
  throw new DataError(501, NO_CONVERSATIONS);
}
