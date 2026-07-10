import { useState, useRef, useEffect } from "react";
import { GOLD } from "../constants";
import { relDate } from "../utils";
import * as api from "../api";
import Avatar from "../components/Avatar";
import LeadDrawer from "../components/LeadDrawer";
import DashboardTab from "../tabs/DashboardTab";
import LeadsTab from "../tabs/LeadsTab";
import NewsletterTab from "../tabs/NewsletterTab";
import AnaTab from "../tabs/AnaTab";
import ConversasTab from "../tabs/ConversasTab";
import RecuperarTab from "../tabs/RecuperarTab";

// Tracks whether the viewport is mobile-width (header switches to a hamburger menu)
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(`(max-width: ${breakpoint}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

export default function Dashboard({ onLogout }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerLead, setDrawerLead] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [seenLeadIds, setSeenLeadIds] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);
  useEffect(() => {
    const h = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => {
    const h = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Load leads from Google Sheets on mount
  useEffect(() => {
    let active = true;
    api.getLeads()
      .then(data => { if (active) setLeads(data); })
      .catch(() => { if (active) setLeads([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Upcoming Google Calendar events (next 30 days) for the notifications panel.
  // The full calendar lives on the Dashboard tab; this is just the heads-up feed.
  useEffect(() => {
    let active = true;
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    api.getCalendarEvents(now.toISOString(), in30.toISOString())
      .then(data => { if (active) setUpcomingEvents(data); })
      .catch(() => { if (active) setUpcomingEvents([]); });
    return () => { active = false; };
  }, []);

  // Edit lead details (from the drawer). Optimistic, persists via PATCH, and
  // reconciles with the server row. Returns {ok} so the drawer can show errors
  // without discarding the user's typed values.
  const updateLead = async (id, fields) => {
    const snapshot = leads;
    setLeads(ls => ls.map(l => String(l.id) === String(id) ? { ...l, ...fields } : l));
    try {
      const res = await api.updateLead(id, fields);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setLeads(ls => ls.map(l => String(l.id) === String(id) ? { ...l, ...updated } : l));
      return { ok: true };
    } catch (e) {
      setLeads(snapshot); // revert on failure
      return { ok: false, error: e?.message || "erro" };
    }
  };
  // Quick status change (from the row dropdowns) — optimistic, best-effort.
  const updateStatus = (id, status) => {
    setLeads(leads.map(l => l.id === id ? { ...l, status } : l));
    api.updateLead(id, { status }).catch(() => {});
  };
  // Delete a lead: persist, then drop it from the list on success
  const deleteLead = async (id) => {
    try {
      const res = await api.deleteLead(id);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLeads(ls => ls.filter(l => String(l.id) !== String(id)));
      return true;
    } catch {
      return false;
    }
  };
  // Manually create a lead (source "Manual"); zone folded into notes (no column)
  const addLead = async (f) => {
    const zone = (f.zone || "").trim();
    const baseNotes = (f.notes || "").trim();
    const notes = zone ? `${baseNotes}${baseNotes ? "\n" : ""}Zona: ${zone}` : baseNotes;
    const payload = {
      id: String(Date.now()),
      name: (f.name || "").trim(),
      email: (f.email || "").trim(),
      phone: (f.phone || "").trim(),
      budget: (f.budget || "").trim(),
      intention: (f.intention || "").trim(),
      source: "Manual",
      status: "Novo",
      date: new Date().toISOString().slice(0, 10),
      notes,
    };
    try {
      const res = await api.addLead(payload);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = await res.json();
      setLeads(ls => [created, ...ls]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || "erro" };
    }
  };

  const newLeads = leads.filter(l => l.status === "Novo");
  const unseenNewLeads = newLeads.filter(l => !seenLeadIds.includes(l.id));
  const upcomingMeetings = upcomingEvents.slice(0, 3); // already future, sorted by start
  const notContacted = leads.filter(l => {
    const diff = Math.floor((new Date() - new Date(l.date)) / 86400000);
    return l.status === "Novo" && diff >= 2;
  });

  // Opening the popup no longer auto-marks notifications as seen.
  const toggleNotifications = () => setNotifOpen(o => !o);
  // Mark a single lead notification as seen
  const markSeen = (id) => setSeenLeadIds(prev => prev.includes(id) ? prev : [...prev, id]);
  // Mark every current "Novo" lead as seen
  const markAllSeen = () => setSeenLeadIds(prev => Array.from(new Set([...prev, ...newLeads.map(l => l.id)])));
  // Promote a conversation into a lead, then jump to it in the Leads tab.
  const convertToLead = async (conv) => {
    try {
      const { lead } = await api.convertToLead({ contactId: conv.contact_id, name: conv.name, username: conv.username });
      if (!lead) throw new Error("sem lead");
      setLeads(ls => ls.some(l => String(l.id) === String(lead.id))
        ? ls.map(l => String(l.id) === String(lead.id) ? lead : l)
        : [lead, ...ls]);
      setActiveTab("leads");
      setDrawerLead(lead);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || "erro" };
    }
  };

  const tabs = [["dashboard", "Dashboard"], ["leads", "Leads"], ["conversas", "Conversas"], ["recuperar", "Recuperar conversas"], ["newsletter", "Newsletter"], ["ana", "Testar Ana"]];

  // Notifications panel: full-width sheet on mobile (never clipped), anchored dropdown on desktop
  const notifPanelStyle = isMobile
    ? { position: "fixed", top: 60, left: 12, right: 12, zIndex: 200, background: "white", borderRadius: 16, overflow: "hidden", boxShadow: "0 12px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)" }
    : { position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 200, background: "white", borderRadius: 16, width: 320, overflow: "hidden", boxShadow: "0 12px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)" };

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", background: "#F4F4F2", minHeight: "100vh", maxWidth: "100%", overflowX: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#111", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54 }}>
          <div onClick={() => setActiveTab("dashboard")} title="Ir para o Dashboard"
            onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", transition: "opacity 0.15s" }}>
            <div style={{ width: 28, height: 28, background: GOLD, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#000" }}>S</div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "white", letterSpacing: "-0.3px" }}>SW Places</span>
          </div>
          {!isMobile && (
            <div style={{ display: "flex", gap: 2 }}>
              {tabs.map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer",
                  background: activeTab === tab ? "rgba(255,255,255,0.12)" : "transparent",
                  color: activeTab === tab ? "white" : "rgba(255,255,255,0.4)",
                }}>{label}</button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div ref={notifRef} style={{ position: "relative" }}>
            <button onClick={toggleNotifications} style={{
              display: "flex", alignItems: "center", gap: 6,
              border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 8,
              background: notifOpen ? "rgba(255,255,255,0.1)" : "transparent",
            }}>
              <span style={{ fontSize: 16 }}>🔔</span>
              {unseenNewLeads.length > 0 && (
                <span style={{
                  background: GOLD, color: "#000", borderRadius: 20,
                  fontSize: 11, fontWeight: 700, padding: "1px 7px", lineHeight: "18px",
                }}>
                  {unseenNewLeads.length}
                </span>
              )}
            </button>

            {notifOpen && (
              <div style={notifPanelStyle}>
                <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid #F0F0F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>Notificações</p>
                  <span style={{ fontSize: 11, color: "#888" }}>{newLeads.length + upcomingMeetings.length} novas</span>
                </div>

                {/* New leads */}
                {newLeads.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px 6px" }}>
                      <p style={{ fontSize: 10, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, margin: 0 }}>Novos leads</p>
                      <button onClick={markAllSeen} style={{ fontSize: 11, color: "#888", cursor: "pointer", background: "none", border: "none", padding: 0 }}>Marcar todas como vistas</button>
                    </div>
                    <div style={{ maxHeight: 280, overflowY: "auto" }}>
                      {newLeads.map(lead => {
                        const unread = !seenLeadIds.includes(lead.id);
                        return (
                          <div key={lead.id} onClick={() => { markSeen(lead.id); setDrawerLead(lead); setNotifOpen(false); }} style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
                            cursor: "pointer", transition: "background 0.1s",
                          }}
                            onMouseEnter={e => e.currentTarget.style.background = "#FAFAFA"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: unread ? "#3B82F6" : "transparent", flexShrink: 0 }} />
                            <Avatar name={lead.name} size={32} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: unread ? 700 : 400, color: unread ? "#111" : "#555", margin: 0 }}>{lead.name}</p>
                              <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0" }}>{lead.budget} · {lead.intention}</p>
                            </div>
                            <span style={{ fontSize: 11, color: "#CCC", flexShrink: 0 }}>{relDate(lead.date)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Upcoming meetings */}
                {upcomingMeetings.length > 0 && (
                  <div style={{ borderTop: newLeads.length > 0 ? "1px solid #F5F5F5" : "none" }}>
                    <p style={{ fontSize: 10, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, padding: "12px 18px 6px", margin: 0 }}>Próximas reuniões</p>
                    {upcomingMeetings.map(m => {
                      const sd = m.allDay ? new Date(m.start + "T00:00") : new Date(m.start);
                      const when = m.allDay ? "Dia inteiro" : sd.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
                      const mon = sd.toLocaleDateString("pt-PT", { month: "short" });
                      return (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px" }}>
                          <div style={{ width: 32, height: 32, background: GOLD + "20", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD, lineHeight: 1 }}>{sd.getDate()}</span>
                            <span style={{ fontSize: 8, color: GOLD, textTransform: "uppercase" }}>{mon}</span>
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</p>
                            <p style={{ fontSize: 11, color: "#888", margin: "2px 0 0" }}>{when}{m.location ? ` · ${m.location}` : ""}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Not contacted warning */}
                {notContacted.length > 0 && (
                  <div style={{ borderTop: "1px solid #F5F5F5", padding: "12px 18px", background: "#FFFBEB" }}>
                    <p style={{ fontSize: 12, color: "#92400E", margin: 0, fontWeight: 500 }}>
                      ⚠️ {notContacted.length} lead{notContacted.length > 1 ? "s" : ""} sem contacto há mais de 2 dias
                    </p>
                  </div>
                )}

                <div style={{ padding: "12px 18px", borderTop: "1px solid #F0F0F0" }}>
                  <button onClick={() => { setActiveTab("leads"); setNotifOpen(false); }} style={{
                    width: "100%", background: "#111", color: "white", border: "none",
                    borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}>Ver todos os leads</button>
                </div>
              </div>
            )}
            </div>
            {!isMobile && (
              <button onClick={onLogout} title="Sair da conta" style={{
                background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)",
                border: "none", borderRadius: 8, padding: "5px 12px",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}>Sair</button>
            )}
            {isMobile && (
              <div ref={menuRef} style={{ position: "relative" }}>
                <button onClick={() => setMenuOpen(o => !o)} aria-label="Menu" title="Menu" style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: menuOpen ? "rgba(255,255,255,0.1)" : "transparent",
                  border: "none", color: "white", fontSize: 20, lineHeight: 1,
                  cursor: "pointer", padding: "4px 8px", borderRadius: 8,
                }}>☰</button>
                {menuOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 10px)", right: 0, zIndex: 200,
                    background: "white", borderRadius: 14, width: 200, overflow: "hidden",
                    boxShadow: "0 12px 48px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.06)",
                  }}>
                    {tabs.map(([tab, label]) => (
                      <button key={tab} onClick={() => { setActiveTab(tab); setMenuOpen(false); }} style={{
                        display: "block", width: "100%", textAlign: "left", padding: "12px 16px",
                        border: "none", cursor: "pointer", fontSize: 14,
                        background: activeTab === tab ? "#F8F7F4" : "white",
                        color: activeTab === tab ? "#111" : "#555",
                        fontWeight: activeTab === tab ? 600 : 500,
                        borderLeft: `3px solid ${activeTab === tab ? GOLD : "transparent"}`,
                      }}>{label}</button>
                    ))}
                    <button onClick={() => { setMenuOpen(false); onLogout(); }} style={{
                      display: "block", width: "100%", textAlign: "left", padding: "12px 16px",
                      border: "none", borderTop: "1px solid #F0F0F0", background: "white",
                      color: "#DC2626", fontSize: 14, fontWeight: 500, cursor: "pointer",
                    }}>Sair</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 48px" }}>

        {loading && (
          <div style={{ padding: "80px 0", textAlign: "center", color: "#999", fontSize: 14 }}>A carregar leads…</div>
        )}

        {!loading && (
          <>
            {activeTab === "dashboard" && (
              <DashboardTab
                leads={leads}
                onOpenLead={setDrawerLead}
                updateStatus={updateStatus}
                onViewAllLeads={() => setActiveTab("leads")}
              />
            )}

            {activeTab === "leads" && (
              <LeadsTab leads={leads} onOpenLead={setDrawerLead} updateStatus={updateStatus} onCreateLead={addLead} />
            )}

            {activeTab === "conversas" && <ConversasTab onConvert={convertToLead} />}

            {activeTab === "recuperar" && <RecuperarTab />}

            {activeTab === "newsletter" && <NewsletterTab leads={leads} />}

            {activeTab === "ana" && <AnaTab />}
          </>
        )}
      </div>

      {drawerLead && <LeadDrawer lead={drawerLead} onClose={() => setDrawerLead(null)} onUpdate={updateLead} onDelete={deleteLead} />}
    </div>
  );
}
