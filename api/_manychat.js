// ManyChat Instagram API helper (IG uses the /fb/ prefix endpoints).
// Not a route (leading underscore keeps Vercel from exposing it).
const BASE = "https://api.manychat.com/fb";

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.MANYCHAT_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

// GET /fb/subscriber/getInfo?subscriber_id=... → subscriber data (incl. tags)
export async function getSubscriberInfo(subscriberId) {
  const res = await fetch(`${BASE}/subscriber/getInfo?subscriber_id=${encodeURIComponent(subscriberId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${process.env.MANYCHAT_API_TOKEN}` },
  });
  if (!res.ok) throw new Error(`getInfo HTTP ${res.status}`);
  return res.json();
}

// Extract profile fields from a subscriber record. Accepts either a full
// getInfo response ({ data: {...} }) or a raw subscriber object (as returned in
// findByName's data array). Username key varies by ManyChat/IG setup, so we
// check the common candidates.
export function subscriberProfile(info) {
  const d = info?.data || info || {};
  return {
    id: String(d.id || d.subscriber_id || "").trim(),
    first: String(d.first_name || "").trim(),
    last: String(d.last_name || "").trim(),
    name: String(d.name || "").trim(),
    username: String(d.username || d.user_name || d.ig_username || d.instagram_username || "").trim(),
  };
}

// GET /fb/subscriber/findByName?name=... → subscribers whose name/username
// matches the query. ManyChat matches loosely, so callers must disambiguate.
// Returns the raw data array (each element is a subscriber record).
export async function findByName(query) {
  const res = await fetch(`${BASE}/subscriber/findByName?name=${encodeURIComponent(query)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${process.env.MANYCHAT_API_TOKEN}` },
  });
  if (!res.ok) throw new Error(`findByName HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

// True if the subscriber carries the given tag (case-insensitive).
export function subscriberHasTag(info, tagName) {
  const tags = info?.data?.tags || [];
  const target = String(tagName).toLowerCase();
  return tags.some((t) => String(t?.name || "").toLowerCase() === target);
}

// POST /fb/subscriber/setCustomField → set a custom field value
export async function setCustomField(subscriberId, fieldId, value) {
  const res = await fetch(`${BASE}/subscriber/setCustomField`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ subscriber_id: subscriberId, field_id: fieldId, field_value: value }),
  });
  if (!res.ok) throw new Error(`setCustomField HTTP ${res.status}`);
  return res.json();
}

// POST /fb/sending/sendFlow → trigger a flow for the subscriber
export async function sendFlow(subscriberId, flowNs) {
  const res = await fetch(`${BASE}/sending/sendFlow`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ subscriber_id: subscriberId, flow_ns: flowNs }),
  });
  if (!res.ok) throw new Error(`sendFlow HTTP ${res.status}`);
  return res.json();
}

// POST /fb/subscriber/addTagByName → add a tag (created if it doesn't exist)
export async function addTagByName(subscriberId, tagName) {
  const res = await fetch(`${BASE}/subscriber/addTagByName`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ subscriber_id: subscriberId, tag_name: tagName }),
  });
  if (!res.ok) throw new Error(`addTagByName HTTP ${res.status}`);
  return res.json();
}

// POST /fb/subscriber/removeTagByName → remove a tag
export async function removeTagByName(subscriberId, tagName) {
  const res = await fetch(`${BASE}/subscriber/removeTagByName`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ subscriber_id: subscriberId, tag_name: tagName }),
  });
  if (!res.ok) throw new Error(`removeTagByName HTTP ${res.status}`);
  return res.json();
}
