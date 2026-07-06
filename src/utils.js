// Relative, human-friendly date label in pt-PT
export function relDate(dateStr) {
  const diff = Math.floor((new Date() - new Date(dateStr)) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff < 7) return `${diff}d atrás`;
  return new Date(dateStr).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
}

// Contact validation. Empty values and leftover webhook placeholders
// (anything starting with "{{", e.g. "{{phone}}") are treated as invalid.
function isPlaceholder(value) {
  if (typeof value !== "string") return true;
  const v = value.trim();
  return v === "" || v.startsWith("{{");
}

export function isValidEmail(value) {
  if (isPlaceholder(value)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPhone(value) {
  if (isPlaceholder(value)) return false;
  // Require at least 7 digits once non-numeric chars (+, spaces, ()) are stripped
  return value.replace(/[^0-9]/g, "").length >= 7;
}

// Returns the trimmed value if it's real data, or null if empty/placeholder.
// Use for display so raw "{{...}}" placeholders never reach the UI.
export function cleanField(value) {
  return isPlaceholder(value) ? null : value.trim();
}

// Chart data — leads per day, last 14 days, computed from live leads
export function buildChartData(leads) {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const count = leads.filter(l => l.date === dateStr).length;
    days.push({
      day: d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" }),
      leads: count,
    });
  }
  return days;
}
