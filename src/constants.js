// Design tokens
export const GOLD = "#C9A96E";

// Lead status configuration
export const STATUS_CONFIG = {
  "Novo":             { bg: "#EFF6FF", text: "#1D4ED8", dot: "#3B82F6", border: "#BFDBFE" },
  "Contactado":       { bg: "#FFFBEB", text: "#92400E", dot: "#F59E0B", border: "#FDE68A" },
  "Sem resposta":     { bg: "#F1F5F9", text: "#475569", dot: "#64748B", border: "#E2E8F0" },
  "Reunião agendada": { bg: "#F5F3FF", text: "#5B21B6", dot: "#8B5CF6", border: "#DDD6FE" },
  "Fechado":          { bg: "#F0FDF4", text: "#14532D", dot: "#22C55E", border: "#BBF7D0" },
  "Perdido":          { bg: "#FFF1F2", text: "#881337", dot: "#F43F5E", border: "#FECDD3" },
};
export const STATUSES = ["Novo", "Contactado", "Sem resposta", "Reunião agendada", "Fechado", "Perdido"];
export const BUDGETS = ["Todos", "Até 300k", "300k–500k", "+500k", "+1M"];
export const INTENTIONS = ["Todas", "Habitação própria", "Casa de férias", "Investimento"];

// Initial mock meetings (in-memory)
export const MEETINGS = [
  { id: 3, name: "Michael Brown", date: "2026-06-20", time: "14:00", type: "Videocall" },
  { id: 11, name: "Sophie Martin", date: "2026-06-25", time: "15:00", type: "Videocall" },
  { id: 7, name: "James Wilson", date: "2026-06-28", time: "10:00", type: "Presencial" },
];

// Dev fallback only — real leads come from the /api/leads (Google Sheets) endpoint
export const MOCK_LEADS = [
  { id: 1, name: "João Silva", email: "joao@email.com", phone: "+351912345678", budget: "300k–500k", intention: "Habitação própria", source: "V23 — Algarve", date: "2026-06-17", status: "Novo", notes: "" },
  { id: 2, name: "Ana Martins", email: "ana@email.com", phone: "+351963111222", budget: "+500k", intention: "Investimento", source: "V5 — Comunidade", date: "2026-06-16", status: "Contactado", notes: "Interessada em Fix & Flip" },
  { id: 3, name: "Michael Brown", email: "michael@email.com", phone: "+447911123456", budget: "+1M", intention: "Investimento", source: "V24 — EN Community", date: "2026-06-15", status: "Reunião agendada", notes: "Call marcada 20 jun" },
  { id: 4, name: "Sara Costa", email: "sara@email.com", phone: "+351934567890", budget: "Até 300k", intention: "Casa de férias", source: "V1 — Lisboa vs CV", date: "2026-06-14", status: "Fechado", notes: "" },
  { id: 5, name: "Thomas Müller", email: "thomas@email.com", phone: "+4915123456789", budget: "300k–500k", intention: "Casa de férias", source: "V12 — Foreigners", date: "2026-06-13", status: "Perdido", notes: "Decidiu outro país" },
  { id: 6, name: "Catarina Lopes", email: "cat@email.com", phone: "+351965432109", budget: "300k–500k", intention: "Habitação própria", source: "V23 — Algarve", date: "2026-06-12", status: "Novo", notes: "" },
  { id: 7, name: "James Wilson", email: "james@email.com", phone: "+14155550123", budget: "+1M", intention: "Investimento", source: "V24 — EN Community", date: "2026-06-11", status: "Contactado", notes: "" },
  { id: 8, name: "Beatriz Fonseca", email: "bea@email.com", phone: "+351912000111", budget: "300k–500k", intention: "Habitação própria", source: "V7 — 3 Razões", date: "2026-06-10", status: "Novo", notes: "" },
  { id: 9, name: "Lena Fischer", email: "lena@email.com", phone: "+4917612345678", budget: "+500k", intention: "Investimento", source: "V24 — EN Community", date: "2026-06-08", status: "Novo", notes: "" },
  { id: 10, name: "Ricardo Sousa", email: "ricardo@email.com", phone: "+351961234567", budget: "300k–500k", intention: "Habitação própria", source: "V1 — Lisboa vs CV", date: "2026-06-05", status: "Contactado", notes: "" },
  { id: 11, name: "Sophie Martin", email: "sophie@email.com", phone: "+33612345678", budget: "+1M", intention: "Investimento", source: "V24 — EN Community", date: "2026-06-03", status: "Reunião agendada", notes: "Videocall 25 jun 15h" },
  { id: 12, name: "Paulo Ferreira", email: "paulo@email.com", phone: "+351934111222", budget: "Até 300k", intention: "Habitação própria", source: "V23 — Algarve", date: "2026-05-28", status: "Fechado", notes: "" },
];
