// Suggested lead classification from the buyer form's Intent answer (pure, no
// imports → node-testable). SUGGEST only — never auto-assigns; a manually set
// classification always wins and clears the suggestion (returns null then).
//
// Rule (intent = lead.intention, the humanized "when are you looking to buy"):
//   contains "actively"        → A (🔥 hot)
//   contains "6" or "12 month" → B (warm)
//   contains "exploring"       → C (cold)
//   otherwise                  → null (no suggestion)
export function suggestClassification(lead) {
  if (!lead) return null;
  if (lead.classification && String(lead.classification).trim()) return null; // manual wins
  const it = String(lead.intention || "").toLowerCase();
  if (!it) return null;
  if (it.includes("actively")) return "A";
  if (it.includes("6") || it.includes("12 month")) return "B";
  if (it.includes("exploring")) return "C";
  return null;
}
