// Brandon — client configuration (placeholders; real branding/users added later).
// Only Dashboard + Leads are enabled for now.
export default {
  key: "brandon",

  branding: {
    name: "Brandon",
    logoText: "Brandon",
    logoMonogram: "B",
    tagline: "",
    primaryColor: "#C9A96E",
    loginPlaceholder: "email@…",
  },

  // Empty for now — no valid credentials yet. Login page still renders.
  users: [],

  features: {
    dashboard: true,
    leads: true,
    conversas: false,
    recuperar: false,
    newsletter: false,
    ana: false,
  },

  // Same pipeline constants as SW Places for now.
  constants: {
    STATUS_CONFIG: {
      "Novo":             { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6", border: "#BFDBFE" },
      "Contactado":       { bg: "#FFFBEB", text: "#92400E", dot: "#F59E0B", border: "#FDE68A" },
      "Sem resposta":     { bg: "#F1F5F9", text: "#475569", dot: "#64748B", border: "#E2E8F0" },
      "Reunião agendada": { bg: "#F5F3FF", text: "#5B21B6", dot: "#8B5CF6", border: "#DDD6FE" },
      "Fechado":          { bg: "#F0FDF4", text: "#14532D", dot: "#22C55E", border: "#BBF7D0" },
      "Perdido":          { bg: "#FFF1F2", text: "#881337", dot: "#F43F5E", border: "#FECDD3" },
    },
    STATUSES: ["Novo", "Contactado", "Sem resposta", "Reunião agendada", "Fechado", "Perdido"],
    BUDGETS: ["Todos", "Até 300k", "300k–500k", "+500k", "+1M"],
    INTENTIONS: ["Todas", "Habitação própria", "Casa de férias", "Investimento"],
  },
};
