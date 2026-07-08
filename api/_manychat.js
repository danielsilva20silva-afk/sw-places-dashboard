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
