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

// GET /api/calendar?start&end → events in a range (backed by Google Calendar)
export async function getCalendarEvents(startISO, endISO) {
  const qs = new URLSearchParams();
  if (startISO) qs.set("start", startISO);
  if (endISO) qs.set("end", endISO);
  const res = await fetch(`/api/calendar?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return Array.isArray(data) ? data : [];
}

// POST /api/calendar → create an event, returns the created event
export async function createEvent(event) {
  const res = await fetch("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// PATCH /api/calendar → update an event by id
export async function updateEvent(event) {
  const res = await fetch("/api/calendar", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// DELETE /api/calendar?id=X → delete an event
export async function deleteEvent(id) {
  const res = await fetch(`/api/calendar?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
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
// (each with its sheet `row`, needed for edit/delete).
export async function getConversation(contactId) {
  const res = await fetch(`/api/conversations?contact_id=${encodeURIComponent(contactId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.messages) ? data.messages : [];
}

// PATCH /api/conversations → edit a stored message's text
export async function editMessage({ contactId, row, timestamp, message }) {
  const res = await fetch("/api/conversations", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact_id: contactId, row, timestamp, message }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// DELETE /api/conversations?contact_id&row&timestamp → remove one message
export async function deleteMessage({ contactId, row, timestamp }) {
  const qs = new URLSearchParams({ contact_id: String(contactId), row: String(row) });
  if (timestamp) qs.set("timestamp", timestamp);
  const res = await fetch(`/api/conversations?${qs.toString()}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// POST /api/conversations → append a message to a thread
export async function addMessage({ contactId, role, message, timestamp }) {
  const res = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact_id: contactId, role, message, timestamp }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
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

// POST /api/log-flow-message → record a manually-sent DM (or flow message) as an
// assistant turn in the conversation history (and stamp the reel origin on the
// lead), so live Ana has context when the person replies. Returns { status:"ok" }.
export async function logFlowMessage({ subscriberId, message, name, username, sourceContent, sourceUrl }) {
  const res = await fetch("/api/log-flow-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscriber_id: subscriberId,
      message,
      name,
      username,
      source_content: sourceContent,
      source_url: sourceUrl,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// POST /api/convert-lead → promote a conversation into a lead (id = contact_id).
// Returns { status: "created" | "exists", lead }.
export async function convertToLead({ contactId, name, username }) {
  const res = await fetch("/api/convert-lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact_id: contactId, name, username }),
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
