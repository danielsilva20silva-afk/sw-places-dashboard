// SW Places — full client configuration.
// Everything client-specific for the dashboard lives here. Adding a new client
// means creating a sibling config file, registering it in ./index.js, and
// deploying with VITE_CLIENT set to its key.
// (Step 1 of the multi-client refactor: branding + users + pipeline constants
// only. API/data wiring and feature flags come in later steps.)
export default {
  key: "swplaces",

  branding: {
    name: "SW Places",
    logoText: "SW Places",      // header wordmark + login title
    logoMonogram: "S",          // letter inside the gold square logo
    tagline: "Costa Vicentina", // login subtitle
    primaryColor: "#C9A96E",    // gold accent
    loginPlaceholder: "email@swplaces.com",
  },

  // Login credentials (moved verbatim from src/pages/Login.jsx).
  users: [
    { email: "daniel@swplaces.com", password: "daniel2026", role: "admin", name: "Daniel Silva" },
    { email: "gmiguel@sw-places.com", password: "guga2026", role: "admin", name: "Gustavo Miguel" },
  ],

  // Which dashboard modules this client has. Keys are the real navigation tab
  // keys. All true for SW Places → identical to today.
  features: {
    dashboard: true,    // "Dashboard"
    leads: true,        // "Leads"
    conversas: true,    // "Conversas" (active Instagram conversations)
    recuperar: true,    // "Recuperar conversas"
    newsletter: true,   // "Newsletter"
    ana: true,          // "Testar Ana"
    calendar: true,     // Google Calendar: mini-calendar + meeting-scheduling flow
  },

  // Lead pipeline constants (moved from src/constants.js).
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
    // Status whose selection opens the calendar meeting-scheduling flow.
    calendarTriggerStatus: "Reunião agendada",
  },
};
