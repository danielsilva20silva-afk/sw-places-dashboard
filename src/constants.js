// Client-specific tokens now live in the active client config (src/config).
// Re-exported here so existing `../constants` imports keep working unchanged;
// switch clients via VITE_CLIENT.
import config from "./config";

export const GOLD = config.branding.primaryColor;
export const { STATUS_CONFIG, STATUSES, BUDGETS, INTENTIONS } = config.constants;

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
