// Duplicate-lead detection + link-based merge (pure logic, no imports so it's
// unit-testable in node and framework-agnostic). The dashboard applies merges at
// READ time from a list of link rows — source records are never modified. A merge
// is a single row in Supabase `lead_links` (primary_id, secondary_id); unmerge is
// deleting that row. Feature-flagged ("dedupe") — off clients never call this.
//
// THE PRIMARY USE CASE: the same person fills a Meta instant form AND the landing
// page form (two records, two sources). We flag pairs sharing a normalized phone
// or email, let the user merge them into one primary, and fold the secondaries.

// ── Normalizers (the match keys) ──

// Case-insensitive, trimmed email; "" when not a real address.
export function normalizeEmail(value) {
  const s = String(value == null ? "" : value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}

// Significant-digits phone key: strip a "p:" prefix and all non-digits, drop
// leading zeros (so the "00" intl prefix and a leading national 0 are ignored),
// then compare the last 9 digits — enough to match "+351 966 123 456" with
// "966123456". Fewer than 7 significant digits → "" (too short to trust).
export function normalizePhone(value) {
  let d = String(value == null ? "" : value).replace(/^p:/i, "").replace(/\D/g, "");
  d = d.replace(/^0+/, "");
  if (d.length < 7) return "";
  return d.length > 9 ? d.slice(-9) : d;
}

// ── Detection ──

// Undirected pairs of leads that share a normalized phone OR email. Each pair is
// { a, b, on } where a<b (string order, stable) and `on` lists the matched keys.
export function detectPairs(leads) {
  const byEmail = new Map();
  const byPhone = new Map();
  const push = (map, key, id) => {
    if (!key) return;
    const arr = map.get(key);
    if (arr) arr.push(id); else map.set(key, [id]);
  };
  for (const l of leads) {
    const id = String(l.id);
    push(byEmail, normalizeEmail(l.email), id);
    push(byPhone, normalizePhone(l.phone), id);
  }
  const pairs = new Map(); // "a|b" -> { a, b, on:Set }
  const addFrom = (map, on) => {
    for (const ids of map.values()) {
      if (ids.length < 2) continue;
      const uniq = Array.from(new Set(ids));
      for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
          const a = uniq[i] < uniq[j] ? uniq[i] : uniq[j];
          const b = uniq[i] < uniq[j] ? uniq[j] : uniq[i];
          const k = a + "|" + b;
          const cur = pairs.get(k) || { a, b, on: new Set() };
          cur.on.add(on);
          pairs.set(k, cur);
        }
      }
    }
  };
  addFrom(byEmail, "email");
  addFrom(byPhone, "phone");
  return Array.from(pairs.values()).map((p) => ({ a: p.a, b: p.b, on: Array.from(p.on) }));
}

// ── Link graph → merge view ──

// Follow the secondary→primary chain to a terminal primary id (handles a person
// merged across 3+ records, and is cycle-safe).
function makeRootOf(secToPrim) {
  return function rootOf(id) {
    let cur = String(id);
    const seen = new Set();
    while (secToPrim.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = secToPrim.get(cur);
    }
    return cur;
  };
}

// Concatenate a secondary's searchable fields so a merged primary stays findable
// by the secondary's data (campaign, email variant, phone, name…).
function searchTextFor(lead) {
  return [lead.name, lead.email, lead.phone, lead.source, lead.budget, lead.intention, lead.notes]
    .filter(Boolean)
    .join(" ");
}

// Apply link rows to the loaded leads. Returns:
//   displayLeads     — list to render (secondaries folded away; primaries enriched)
//   enrichedById     — Map id → the display object for that id (for the drawer)
//   candidatesByLead — Map id → [{ lead, on }] detected-but-unlinked duplicates
//   rootOf           — id → its group's primary id
//
// Enriched primary objects (new objects, originals untouched) carry:
//   __merged true, __mergedCount, mergedSecondaries [{ lead, linkId }], __dupSearch
// Leads with an unlinked candidate carry __dupCandidate true.
export function computeDedupe(leads, links) {
  const byId = new Map(leads.map((l) => [String(l.id), l]));

  const secToPrim = new Map();
  const linkBySecondary = new Map();
  for (const lk of links || []) {
    const sec = String(lk.secondary_id);
    const prim = String(lk.primary_id);
    if (!sec || !prim || sec === prim) continue;
    secToPrim.set(sec, prim); // last write wins
    linkBySecondary.set(sec, lk);
  }
  const rootOf = makeRootOf(secToPrim);

  // Group present leads by their root primary id.
  const groups = new Map(); // rootId -> [present leadId]
  for (const l of leads) {
    const r = rootOf(l.id);
    const arr = groups.get(r);
    if (arr) arr.push(String(l.id)); else groups.set(r, [String(l.id)]);
  }

  const hiddenSecondaryIds = new Set();
  const mergedByPrimary = new Map(); // primaryId -> [{ lead, linkId }]
  for (const [root, memberIds] of groups) {
    const primaryLead = byId.get(root);
    // Only merge when the primary itself is loaded and the group has ≥2 members.
    // If the primary is missing (e.g. its source is temporarily down) we leave the
    // secondaries visible rather than make the person vanish.
    if (!primaryLead || memberIds.length < 2) continue;
    const secs = [];
    for (const mid of memberIds) {
      if (mid === root) continue;
      const secLead = byId.get(mid);
      if (!secLead) continue;
      hiddenSecondaryIds.add(mid);
      secs.push({ lead: secLead, linkId: linkBySecondary.get(mid)?.id });
    }
    if (secs.length) mergedByPrimary.set(root, secs);
  }

  // Detection candidates: unlinked pairs, neither side folded away.
  const pairs = detectPairs(leads);
  const candidatesByLead = new Map();
  const addCand = (id, entry) => {
    const arr = candidatesByLead.get(id);
    if (arr) arr.push(entry); else candidatesByLead.set(id, [entry]);
  };
  for (const { a, b, on } of pairs) {
    if (hiddenSecondaryIds.has(a) || hiddenSecondaryIds.has(b)) continue;
    if (rootOf(a) === rootOf(b)) continue; // already in the same merged group
    const la = byId.get(a);
    const lb = byId.get(b);
    if (!la || !lb) continue;
    addCand(a, { lead: lb, on });
    addCand(b, { lead: la, on });
  }

  // Build the display list (order preserved), enriching as needed.
  const enrichedById = new Map();
  const displayLeads = [];
  for (const l of leads) {
    const id = String(l.id);
    if (hiddenSecondaryIds.has(id)) continue;
    const secs = mergedByPrimary.get(id);
    const hasCand = candidatesByLead.has(id);
    let out = l;
    if (secs || hasCand) {
      out = { ...l };
      if (secs) {
        out.__merged = true;
        out.__mergedCount = secs.length;
        out.mergedSecondaries = secs;
        out.__dupSearch = secs.map((x) => searchTextFor(x.lead)).join(" ");
      }
      if (hasCand) out.__dupCandidate = true;
    }
    enrichedById.set(id, out);
    displayLeads.push(out);
  }

  return { displayLeads, enrichedById, candidatesByLead, rootOf };
}
