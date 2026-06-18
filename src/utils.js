// Relative, human-friendly date label in pt-PT
export function relDate(dateStr) {
  const diff = Math.floor((new Date() - new Date(dateStr)) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  if (diff < 7) return `${diff}d atrás`;
  return new Date(dateStr).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
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
