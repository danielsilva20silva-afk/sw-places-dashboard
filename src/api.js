// API helpers for the leads endpoint (backed by Google Sheets).

// GET /api/leads → array of leads (normalized to an array)
export async function getLeads() {
  const res = await fetch("/api/leads");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// PATCH /api/leads → update status/notes for a lead by id.
// `notes` is optional: when omitted it's left out of the body and the
// server preserves the existing value.
export function updateLead(id, status, notes) {
  return fetch("/api/leads", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, status, notes }),
  });
}

// POST /api/leads → append a new lead row
export function addLead(lead) {
  return fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
  });
}
