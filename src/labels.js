import config from "./config";

// Per-client UI language. DEFAULTS are the current Portuguese strings, so a
// client with no `labels` in its config (swplaces) renders byte-identically.
// brandon.js supplies a full English `labels` override. t(key) returns the
// client value when present, else the PT default. Values may be strings OR
// arrays (e.g. monthsShort, form option lists).
//
// NOTE: this is DISPLAY only. Stored data (statuses come from config; the notes
// storage format keeps its "[DD/MM/YYYY HH:mm]" / "· editada" tokens) is never
// translated — see notesFormat.js.
const DEFAULTS = {
  // ── Login ──
  login_title: "Entrar na conta",
  login_email: "Email",
  login_password: "Password",
  login_submit: "Entrar",
  login_submitting: "A entrar...",
  login_error: "Email ou password incorretos.",

  // ── Header / nav ──
  logout: "Sair",
  logout_title: "Sair da conta",

  // ── Notifications ──
  notif_title: "Notificações",
  notif_new_suffix: "novas",              // "{n} novas"
  notif_new_leads: "Novos leads",
  notif_mark_all: "Marcar todas como vistas",
  notif_upcoming: "Próximas reuniões",
  notif_allday: "Dia inteiro",
  notif_stale_suffix: "sem contacto há mais de 2 dias", // "{n} lead(s) …"
  notif_view_all: "Ver todos os leads",

  // ── Dashboard tab ──
  loading_leads: "A carregar leads…",
  stat_total: "Total Leads",
  week_suffix: "esta semana",             // "+{n} esta semana"
  stat_new: "Novos",
  stat_new_sub: "por contactar",
  stat_incontact: "Em contacto",
  stat_incontact_sub: "em progresso",
  stat_closed: "Fechados",
  stat_closed_sub: "este mês",
  chart_title: "Leads ao longo do tempo",
  chart_sub: "Últimos 14 dias",
  recent_title: "Leads recentes",
  view_all: "Ver todos →",

  // ── Leads tab ──
  search_label: "Pesquisar",
  search_ph: "Nome, email, estado, notas…",
  f_status: "Estado",
  f_classification: "Classificação",
  f_budget: "Orçamento",
  f_intention: "Intenção",
  f_source: "Origem",
  f_period: "Período",
  f_contact: "Contacto",
  f_sort: "Ordenar",
  all_m: "Todos",                         // "all" (sentinel display)
  all_f: "Todas",
  unclassified: "Sem classificação",
  period_all: "Tudo",
  period_today: "Hoje",
  period_7d: "Últimos 7 dias",
  period_30d: "Últimos 30 dias",
  contact_all: "Todos",
  contact_phone: "Com telemóvel",
  contact_email: "Com email",
  contact_none: "Sem contacto válido",
  sort_recent: "Mais recentes primeiro",
  sort_old: "Mais antigos primeiro",
  new_lead: "+ Novo lead",
  empty_leads: "Nenhum lead encontrado.",

  // ── Quick actions / drawer contact buttons ──
  act_call: "Ligar",
  act_whatsapp: "WhatsApp",
  act_email: "Email",
  act_instagram: "Instagram",
  no_contact: "Sem contacto válido",

  // ── Lead drawer ──
  d_name: "Nome",
  d_email: "Email",
  d_phone: "Telefone",
  d_budget: "Orçamento",
  d_intention: "Intenção",
  d_status: "Estado",
  d_classification: "Classificação",
  d_summary: "Resumo da conversa",
  d_source_post: "Publicação de origem",
  d_view_shared: "📷 Ver publicação partilhada ↗",
  d_send_whatsapp: "💬 Enviar WhatsApp",
  d_delete: "🗑 Eliminar lead",
  d_deleting: "A eliminar…",
  d_delete_confirm: "Tens a certeza que queres eliminar este lead?",
  d_delete_failed: "Não foi possível eliminar o lead. Tenta novamente.",
  d_no_name: "Sem nome",
  save_saving: "A guardar…",
  save_saved: "Guardado ✓",
  save_auto: "As alterações guardam-se automaticamente.",
  save_failed: "Não foi possível guardar.",
  save_retry: "Tentar de novo",

  // ── Classification ──
  cls_A: "A — Quente",
  cls_B: "B — Morno",
  cls_C: "C — Frio",
  cls_clear: "Limpar",

  // ── Notes history (DISPLAY only — storage tokens are NOT translated) ──
  notes_title: "Notas",
  notes_placeholder: "Escreve uma nota…",
  notes_add: "Adicionar nota",
  notes_no_date: "sem data",
  notes_edited: "editada",                // rendered as " · editada"; stored token unchanged
  notes_edit: "Editar",
  notes_delete: "Eliminar",
  notes_delete_confirm: "Eliminar esta nota?",
  notes_save: "Guardar",
  notes_cancel: "Cancelar",

  // ── New-lead modal ──
  nl_title: "Novo lead",
  nl_name: "Nome",
  nl_name_ph: "Nome do lead",
  nl_email: "Email",
  nl_email_ph: "email@exemplo.com",
  nl_phone: "Telefone",
  nl_phone_ph: "+351 ...",
  nl_budget: "Orçamento",
  nl_budget_ph: "ex. até 300k, 700k-900k",
  nl_intention: "Intenção",
  nl_zone: "Zona",
  nl_zone_ph: "ex. Aljezur, Lagos",
  nl_notes: "Notas",
  nl_notes_ph: "Contexto útil sobre o lead...",
  nl_create: "Criar lead",
  nl_creating: "A criar…",
  nl_cancel: "Cancelar",
  nl_err_name: "Indica o nome do lead.",
  nl_err_contact: "Indica pelo menos um contacto (email ou telefone).",
  nl_err_failed: "Não foi possível criar o lead. Tenta novamente.",
  nl_intention_opts: ["", "viver", "investir", "férias", "vender", "terreno", "outro"],

  // ── Follow-ups (Google Calendar) ──
  fu_title: "Agendar seguimento",
  fu_date: "Data",
  fu_time: "Hora",
  fu_note: "Nota (opcional)",
  fu_note_ph: "ex. confirmar detalhes da visita…",
  fu_confirm: "Agendar seguimento",
  fu_scheduling: "A agendar…",
  fu_success_prefix: "Seguimento agendado para", // "… {data}"
  fu_error: "Não foi possível agendar. Tenta de novo.",
  fu_upcoming_title: "Próximos seguimentos",

  // ── Calendar (CalendarView / EventModal / DateTimePicker) ──
  cal_prev: "Anterior",
  cal_next: "Seguinte",
  cal_updating: "a atualizar…",
  cal_month: "Mês",
  cal_week: "Semana",
  cal_new_event: "+ Novo evento",
  cal_new_event_short: "+ Evento",
  cal_loading: "A carregar calendário…",
  cal_not_connected: "Não foi possível carregar o calendário.",
  cal_showing_cached: "A mostrar os dados anteriores.",
  cal_partial: "Alguns calendários não estão ligados:", // "… {ids}"
  cal_readonly: "Só leitura (calendário secundário)",
  cal_untitled: "Sem título",       // primary calendar, no summary
  cal_untitled_busy: "Ocupado",     // secondary (read-only) calendar, no summary
  cal_legend_primary: "Pessoal",    // legend dot (only shown with a secondary calendar)
  cal_legend_secondary: "Trabalho",
  cal_more: "mais",                  // "+{n} mais"
  cal_no_events: "Sem eventos neste dia.",
  cal_all_day: "Dia inteiro",
  cal_all_day_suffix: "dia inteiro", // "… · dia inteiro"
  cal_hour: "Hora",
  cal_min: "Min",
  weekdays_short: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"], // Monday-first
  cal_new_title: "Novo evento",
  cal_edit_title: "Editar evento",
  cal_view_title: "Evento",
  cal_edit: "Editar",
  cal_delete: "Eliminar",
  cal_f_title: "Título",
  cal_title_ph: "Ex. Visita com João",
  cal_date: "Data",
  cal_start: "Início",
  cal_duration: "Duração",
  cal_reminder: "Notificação",
  cal_location: "Localização",
  cal_location_ph: "Ex. Escritório, Aljezur",
  cal_description: "Descrição",
  cal_optional: "(opcional)",
  cal_title_required: "O título é obrigatório.",
  cal_delete_confirm: "Eliminar este evento do calendário?",
  cal_delete_failed: "Não foi possível eliminar.",
  cal_ends_at_prefix: "termina às",  // "termina às 14:30"
  cal_ends_on_prefix: "termina",     // "termina 5 ago, 14:30"
  cal_rem_none: "Sem notificação",
  cal_rem_hour: "1 hora",
  cal_rem_day: "1 dia antes",
  cal_rem_hours_suffix: "horas antes",
  cal_rem_days_suffix: "dias antes",

  // ── Duplicate detection + merge (dedupe feature) ──
  dup_badge: "Possível duplicado",           // row indicator tooltip
  dup_title: "Possível duplicado",           // drawer panel title
  dup_of: "Igual a:",                        // "Igual a: {nome} · {origem} · {data}"
  dup_matched_phone: "mesmo telefone",
  dup_matched_email: "mesmo email",
  dup_primary_hint: "O registo principal mantém o estado, a classificação e as notas. Nada é apagado — podes separar a qualquer momento.",
  dup_primary_label: "Principal:",           // "Principal: {nome}"
  dup_switch_primary: "Trocar",              // switch which record is primary
  dup_merge: "Unir",
  dup_merging: "A unir…",
  dup_merge_failed: "Não foi possível unir. Tenta de novo.",
  merged_badge: "Unido",                     // row indicator tooltip (+ count)
  merged_title: "Registos unidos",
  merged_sources: "Origens",                 // chips heading
  merged_answers: "Respostas do formulário", // grouped summaries heading
  merged_notes_title: "Histórico de notas",
  merged_note_primary: "principal",          // origin tag on a note from the primary
  merged_unmerge: "Separar",
  merged_unmerging: "A separar…",
  merged_unmerge_confirm: "Separar este registo? Volta a aparecer como lead independente.",
  merged_unmerge_failed: "Não foi possível separar.",

  // ── Dates ──
  date_locale: "pt-PT",
  today: "Hoje",
  yesterday: "Ontem",
  days_ago_suffix: "atrás",               // "{n}d atrás"
  months_short: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"],
};

export function t(key) {
  const v = config.labels && config.labels[key];
  return v != null ? v : DEFAULTS[key];
}
