// Composite data adapter — merges Leads from several source adapters behind the
// same interface the thin endpoints expect. Generic: given an ordered list of
// { key, adapter }, the FIRST is the "primary" (owns addLead + conversations).
//
// Used by the brandon client to combine Supabase (landing-page subscribers) with
// the Meta Ads Instant Forms Google Sheet. See api/_config.js.

const s = (v) => (v == null ? "" : String(v));

// Domain error the endpoints surface directly (duck-typed via `.expose`).
export class DataError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

export function createComposite(sources) {
  if (!sources || !sources.length) throw new Error("composite: no sources provided");
  const primaryKey = sources[0].key;

  // Build a per-source context. A source whose env is missing yields ctx=null;
  // it's skipped on read and errors clearly on write, so one unconfigured/broken
  // source never takes down the whole dashboard.
  function getContext() {
    const built = sources.map(({ key, adapter }) => {
      let ctx = null;
      try {
        ctx = adapter.getContext();
      } catch (err) {
        console.error(`composite: getContext for "${key}" threw:`, err?.message || err);
      }
      return { key, adapter, ctx };
    });
    // Endpoint treats a falsy context as "not configured" → 500. Only bail if
    // NO source is available; otherwise proceed with whatever is up.
    if (built.every((sc) => !sc.ctx)) return null;
    return { sources: built };
  }

  function find(cc, key) {
    return cc.sources.find((sc) => sc.key === key);
  }

  // The adapter that owns a given lead id (by ownsId predicate), else primary.
  function ownerFor(cc, id) {
    return (
      cc.sources.find((sc) => typeof sc.adapter.ownsId === "function" && sc.adapter.ownsId(id)) ||
      find(cc, primaryKey)
    );
  }

  function requireUp(sc) {
    if (!sc) throw new DataError(500, "Fonte de dados não configurada.");
    if (!sc.ctx) throw new DataError(503, `Fonte de dados "${sc.key}" indisponível.`);
    return sc;
  }

  // Merge leads from every available source; a failing source logs and yields []
  // so the others still render. Sorted by date (YYYY-MM-DD) desc.
  async function getLeads(cc) {
    const perSource = await Promise.all(
      cc.sources.map(async (sc) => {
        if (!sc.ctx) return [];
        try {
          return await sc.adapter.getLeads(sc.ctx);
        } catch (err) {
          console.error(`composite getLeads: source "${sc.key}" failed:`, err?.message || err);
          return [];
        }
      })
    );
    const merged = perSource.flat();
    merged.sort((a, b) => s(b.date).localeCompare(s(a.date)));
    return merged;
  }

  async function addLead(cc, b) {
    const sc = requireUp(find(cc, primaryKey));
    return sc.adapter.addLead(sc.ctx, b);
  }

  async function updateLead(cc, id, b) {
    const sc = requireUp(ownerFor(cc, id));
    return sc.adapter.updateLead(sc.ctx, id, b);
  }

  async function deleteLead(cc, id) {
    const sc = requireUp(ownerFor(cc, id));
    return sc.adapter.deleteLead(sc.ctx, id);
  }

  // Conversations aren't merged — they belong to the primary source only.
  function primary(cc) {
    return find(cc, primaryKey);
  }
  async function listConversations(cc) {
    const sc = primary(cc);
    return sc?.ctx ? sc.adapter.listConversations(sc.ctx) : [];
  }
  async function getThread(cc, contactId) {
    const sc = primary(cc);
    return sc?.ctx
      ? sc.adapter.getThread(sc.ctx, contactId)
      : { contact_id: String(contactId), messages: [] };
  }
  async function addMessage(cc, args) {
    const sc = requireUp(primary(cc));
    return sc.adapter.addMessage(sc.ctx, args);
  }
  async function updateMessage(cc, args) {
    const sc = requireUp(primary(cc));
    return sc.adapter.updateMessage(sc.ctx, args);
  }
  async function deleteMessage(cc, args) {
    const sc = requireUp(primary(cc));
    return sc.adapter.deleteMessage(sc.ctx, args);
  }

  return {
    getContext,
    getLeads,
    addLead,
    updateLead,
    deleteLead,
    listConversations,
    getThread,
    addMessage,
    updateMessage,
    deleteMessage,
    DataError,
  };
}
