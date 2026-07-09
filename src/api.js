// API helpers for the leads endpoint (backed by Google Sheets).

// GET /api/leads → array of leads (normalized to an array)
export async function getLeads() {
  const res = await fetch("/api/leads");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// PATCH /api/leads → update a lead by id. `fields` is a partial object; any of
// name/email/phone/budget/intention/status/notes may be present. Fields left
// out are preserved server-side (id/source/date/created_at always are).
export function updateLead(id, fields) {
  return fetch("/api/leads", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...fields }),
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

// GET /api/conversations → all conversations (with isLead + full threads)
export async function getConversations() {
  const res = await fetch("/api/conversations");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// GET /api/conversations?contact_id=X → just that thread's messages
export async function getConversation(contactId) {
  const res = await fetch(`/api/conversations?contact_id=${encodeURIComponent(contactId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

// POST /api/recover-conversation (mode "generate") → Ana's reply for a pre-Ana
// DM, resolving the subscriber from a handle or an explicit subscriber_id.
// On a failed handle lookup the thrown error carries .needSubscriberId = true.
export async function recoverGenerate({ handle, subscriberId, message }) {
  const res = await fetch("/api/recover-conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "generate", handle, subscriber_id: subscriberId, message }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.needSubscriberId = data.status === "need_subscriber_id";
    throw err;
  }
  return data;
}

// POST /api/recover-conversation (mode "save") → save the (message, reply) pair
// to the conversation history so live Ana has context next time.
export async function recoverSave({ subscriberId, message, reply, name, username }) {
  const res = await fetch("/api/recover-conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "save", subscriber_id: subscriberId, message, reply, name, username }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// GET /api/toggle-ana?subscriber_id=X → { active }
export async function getAnaState(subscriberId) {
  const res = await fetch(`/api/toggle-ana?subscriber_id=${encodeURIComponent(subscriberId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// POST /api/toggle-ana → set Ana active/silenced for a subscriber
export async function setAnaState(subscriberId, active) {
  const res = await fetch("/api/toggle-ana", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscriber_id: subscriberId, active }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
