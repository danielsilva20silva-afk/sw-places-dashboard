// Brandon van Riet — client configuration.
// Dashboard + Leads only (no Ana / Conversas). Data comes from Supabase.
export default {
  key: "brandon",

  branding: {
    name: "Brandon van Riet",
    logoText: "Brandon van Riet",
    logoMonogram: "B",
    tagline: "Algarve",
    primaryColor: "#C9A96E",     // same gold as SW Places for now
    loginPlaceholder: "email@brandonvanriet.com",
    emailProvider: "system",     // "system" → mailto: (until Brandon says otherwise)
  },

  users: [
    { email: "daniel.silva20@hotmail.com", password: "daniel2026", role: "admin", name: "Daniel" },
    { email: "brandon@brandonvanriet.com", password: "brandon2026", role: "admin", name: "Brandon" },
  ],

  features: {
    dashboard: true,
    leads: true,
    conversas: false,
    recuperar: false,
    newsletter: false,
    ana: false,
    calendar: false,    // no Google Calendar for Brandon yet (own calendar TBD)
  },

  // Brandon's own pipeline (English). STATUS_CONFIG reuses the SW Places colour
  // styles: New→"Novo" blue, Contacted→"Contactado" amber, Viewing booked→
  // "Reunião agendada" violet, Closed→"Fechado" green, Lost→"Perdido" rose.
  constants: {
    STATUS_CONFIG: {
      "New":            { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6", border: "#BFDBFE" },
      "Contacted":      { bg: "#FFFBEB", text: "#92400E", dot: "#F59E0B", border: "#FDE68A" },
      "Viewing booked": { bg: "#F5F3FF", text: "#5B21B6", dot: "#8B5CF6", border: "#DDD6FE" },
      "Closed":         { bg: "#F0FDF4", text: "#14532D", dot: "#22C55E", border: "#BBF7D0" },
      "Lost":           { bg: "#FFF1F2", text: "#881337", dot: "#F43F5E", border: "#FECDD3" },
    },
    STATUSES: ["New", "Contacted", "Viewing booked", "Closed", "Lost"],
    // First entry is the "show all" sentinel the shared LeadsTab filter expects
    // (it defaults filterBudget/filterIntention to "Todos"/"Todas"); the real
    // options follow. Prepended to keep the filter dropdowns functional.
    BUDGETS: ["Todos", "Under €1M", "€1M – €2M", "€2M – €5M", "Over €5M"],
    INTENTIONS: ["Todas", "A primary residence", "A second home / holiday property", "An investment / rental property"],
    // The meeting-scheduling status. Brandon has no calendar yet (features.calendar
    // false), so this is only used if/when calendar is enabled for Brandon.
    calendarTriggerStatus: "Viewing booked",
    // Statuses counted by the Dashboard "Em contacto" (in progress) stat.
    inContactStatuses: ["Contacted", "Viewing booked"],
    // Named statuses used by dashboard logic. noAnswer null → Brandon has no
    // "no answer" status, so the WhatsApp "no answer" button never shows.
    statusRoles: { new: "New", closed: "Closed", noAnswer: null },
  },

  dataSource: "supabase",
};
