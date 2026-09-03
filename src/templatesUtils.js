// Pure helpers for the WhatsApp template manager (no imports → unit-testable).

// Fill the placeholders in a template body with sample (or real) values.
// Unknown placeholders are left untouched; missing values render as "".
export function renderTemplate(body, values = {}) {
  const v = values || {};
  return String(body == null ? "" : body)
    .replace(/\{greeting\}/g, v.greeting == null ? "" : v.greeting)
    .replace(/\{name\}/g, v.name == null ? "" : v.name)
    .replace(/\{area\}/g, v.area == null ? "" : v.area)
    .replace(/\{campaign\}/g, v.campaign == null ? "" : v.campaign);
}

// A match key applies to a campaign when it appears as a case-insensitive
// substring of the campaign name — the same rule the Apps Script uses at runtime.
export function keyMatchesCampaign(matchKey, campaign) {
  const k = String(matchKey == null ? "" : matchKey).trim().toLowerCase();
  const c = String(campaign == null ? "" : campaign).toLowerCase();
  return k !== "" && c !== "" && c.includes(k);
}

// Does this key match at least one of the known campaigns?
export function keyMatchesAny(matchKey, campaigns) {
  return (campaigns || []).some((c) => keyMatchesCampaign(matchKey, c));
}

// Audiences shown as subheadings (buyers-reel has two). "any" has no subheading.
export const AUDIENCE_ORDER = ["any", "specific_area", "open"];
