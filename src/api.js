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

// DELETE /api/leads?id=X → delete a lead by id
export function deleteLead(id) {
  return fetch(`/api/leads?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

// GET /api/meetings → array of meetings (normalized to an array)
export async function getMeetings() {
  const res = await fetch("/api/meetings");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// POST /api/meetings → append a new meeting row
export function addMeeting(meeting) {
  return fetch("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meeting),
  });
}

// DELETE /api/meetings?id=X → delete a meeting by id
export function deleteMeeting(id) {
  return fetch(`/api/meetings?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

// POST /api/ai-reply → { reply } from Ana for a contact's conversation
export async function aiReply(contactId, message) {
  const res = await fetch("/api/ai-reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact_id: contactId, message }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// DELETE /api/ai-reply?contact_id=X → clear a conversation's history
export function clearConversation(contactId) {
  return fetch(`/api/ai-reply?contact_id=${encodeURIComponent(contactId)}`, { method: "DELETE" });
}
