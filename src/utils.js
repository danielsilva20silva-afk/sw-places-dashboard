// Integer day index (days since epoch) of an instant, on the Europe/Lisbon
// CALENDAR. Used so "Hoje"/"Ontem" reflect real Lisbon days, not a 24h window.
function lisbonDayIndex(d) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const [y, m, day] = s.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, day) / 86400000);
}

// Relative, human-friendly day label in pt-PT, based on the Europe/Lisbon
// calendar day (a lead from yesterday 21:48 reads "Ontem", never "Hoje").
export function relDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diff = lisbonDayIndex(new Date()) - lisbonDayIndex(d);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff > 1 && diff < 7) return `${diff}d atrás`;
  return d.toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", day: "numeric", month: "short" });
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

// Relative time with minute/hour granularity (for conversation freshness)
export function relTime(dateStr) {
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return "";
  const min = Math.floor((Date.now() - then) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return relDate(dateStr);
}

// Day + time label for a lead, in Europe/Lisbon.
// Uses created_at (full ISO) when present → "Hoje, 14:32" / "9 jul, 09:15".
// Falls back to date-only (relDate) for legacy rows without a created_at.
export function leadWhen(lead) {
  const iso = lead && lead.created_at;
  if (!iso) return relDate(lead && lead.date);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return relDate(lead.date);
  const time = d.toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" });
  return `${relDate(iso)}, ${time}`;
}

// Normalised sort instant (epoch ms). Uses created_at when present; otherwise
// the date-only column treated as the END of that day, so legacy date-only
// leads sort at-or-after same-day timestamped ones (no interleaving). Both
// paths yield a comparable instant. Returns 0 when neither parses.
export function leadTime(lead) {
  const ca = lead && lead.created_at;
  if (ca) {
    const t = new Date(ca).getTime();
    if (!isNaN(t)) return t;
  }
  const dt = lead && lead.date;
  if (dt) {
    const [y, m, day] = String(dt).split("-").map(Number);
    if (y && m && day) return Date.UTC(y, m - 1, day, 23, 59, 59); // end of that calendar day
    const t = new Date(dt).getTime();
    if (!isNaN(t)) return t;
  }
  return 0;
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
