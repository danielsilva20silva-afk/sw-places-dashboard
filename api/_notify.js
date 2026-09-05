import config, { CLIENT } from "./_config.js";

// New-lead email notifications via Resend. Not a route (leading underscore).
// Gated by the per-client `notifications` flag (api/_config.js) and by env:
//   RESEND_API_KEY      Resend API key (server only)
//   NOTIFY_EMAILS       comma-separated recipient list
//   NOTIFY_FROM_EMAIL   sender, e.g. "SW Places Leads <leads@teu-dominio.com>"
//                       (optional; defaults to Resend's test sender)
//   NOTIFY_DASHBOARD_URL  dashboard base URL for the link (optional; per-client default)
// Every send is best-effort: notifyNewLead never throws, so a failed email can
// never break the lead flow. Call it inside the caller's waitUntil (fire-and-forget).

// ── Contact validation (same semantics as the frontend isRealLead / utils.js) ──
function isPlaceholder(v) {
  if (typeof v !== "string") return true;
  const s = v.trim();
  return s === "" || s.startsWith("{{");
}
function hasValidEmail(v) {
  if (isPlaceholder(v)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
function hasValidPhone(v) {
  if (isPlaceholder(v)) return false;
  return v.replace(/[^0-9]/g, "").length >= 7;
}
// A lead is notifiable once it has a reachable CONTACT (phone or email). This is
// the "tem telefone ou email" half of isRealLead — a name-only or contact-less
// row is not notified.
export function hasContact(lead) {
  return hasValidPhone(lead?.phone) || hasValidEmail(lead?.email);
}

// Dedup: only notify when a lead BECOMES contactable — it had no contact before
// and has one now. On creation pass before=null (notify iff the new lead has a
// contact); on an update pass the prior row (so a lead that already had a contact
// is never notified twice).
export function becameContactable(before, after) {
  const had = before ? hasContact(before) : false;
  return hasContact(after) && !had;
}

// Map a Leads sheet row (A..O) to the minimal lead shape the notifier reads.
// Used by the ai-reply.js upsertLead hook (which works with row arrays).
export function leadFromSheetRow(r) {
  if (!r) return null;
  return {
    id: r[0] ?? "",
    name: r[1] ?? "",
    email: r[2] ?? "",
    phone: r[3] ?? "",
    budget: r[4] ?? "",
    intention: r[5] ?? "",
    source: r[6] ?? "",
    notes: r[9] ?? "",
    source_content: r[12] ?? "",
    source_url: r[14] ?? "",
  };
}

// ── Email building ──
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clean = (v) => (isPlaceholder(v) ? "" : String(v).trim());

// wa.me digits: strip non-digits; a bare 9-digit PT number gets the 351 prefix.
function waDigits(phone) {
  const d = String(phone || "").replace(/[^0-9]/g, "");
  if (d.length === 9 && /^[239]/.test(d)) return "351" + d;
  return d;
}

function dashboardUrl() {
  if (process.env.NOTIFY_DASHBOARD_URL) return process.env.NOTIFY_DASHBOARD_URL.replace(/\/+$/, "");
  return CLIENT === "brandon"
    ? "https://brandon-dashboard-one.vercel.app"
    : "https://sw-places-dashboard.vercel.app";
}

function displayName(lead) {
  return clean(lead.name) || clean(lead.email) || clean(lead.phone) || "Sem nome";
}

export function buildEmail(lead) {
  const name = displayName(lead);
  const sourceContent = clean(lead.source_content);
  const source = clean(lead.source);
  const subject = `🔥 Novo lead: ${name}${sourceContent || source ? ` — ${sourceContent || source}` : ""}`;

  const phone = clean(lead.phone);
  const email = clean(lead.email);
  const budget = clean(lead.budget);
  const intention = clean(lead.intention);
  const notes = clean(lead.notes);
  const sourceUrl = clean(lead.source_url);
  const wa = phone ? waDigits(phone) : "";

  const row = (label, value) => value ? `<tr><td style="padding:4px 12px 4px 0;color:#888;font-size:13px;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:4px 0;color:#111;font-size:13px">${value}</td></tr>` : "";

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h2 style="font-size:18px;margin:0 0 4px">🔥 Novo lead${sourceContent || source ? `: ${esc(sourceContent || source)}` : ""}</h2>
  <p style="font-size:13px;color:#888;margin:0 0 16px">${esc(name)}</p>
  <table style="border-collapse:collapse;width:100%">
    ${row("Nome", esc(name))}
    ${row("Telefone", phone ? `${esc(phone)}${wa ? ` &nbsp; <a href="https://wa.me/${esc(wa)}" style="color:#16A34A;font-weight:600;text-decoration:none">Abrir WhatsApp ↗</a>` : ""}` : "")}
    ${row("Email", email ? `<a href="mailto:${esc(email)}" style="color:#2563EB;text-decoration:none">${esc(email)}</a>` : "")}
    ${row("Orçamento", esc(budget))}
    ${row("Intenção", esc(intention))}
    ${row("Origem", esc(source))}
    ${row("Reel", sourceUrl ? `<a href="${esc(sourceUrl)}" style="color:#8A6D2F;text-decoration:none">${esc(sourceUrl)} ↗</a>` : "")}
  </table>
  ${notes ? `<div style="margin-top:16px"><p style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin:0 0 6px">Resumo da conversa</p><div style="background:#FAFAF9;border:1px solid #F0F0F0;border-radius:8px;padding:12px 14px;font-size:13px;color:#444;line-height:1.5;white-space:pre-wrap">${esc(notes)}</div></div>` : ""}
  <p style="margin-top:20px"><a href="${esc(dashboardUrl())}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;border-radius:8px;padding:10px 18px;font-size:13px;font-weight:600">Abrir o dashboard →</a></p>
</div>`;

  return { subject, html };
}

// Send a new-lead notification. Best-effort: never throws, never blocks the flow.
export async function notifyNewLead(lead) {
  try {
    if (!config.notifications) return; // feature off for this client
    if (!lead || !hasContact(lead)) return; // only contactable leads
    const apiKey = process.env.RESEND_API_KEY;
    const to = (process.env.NOTIFY_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!apiKey || to.length === 0) {
      console.warn("[notify] skipped: RESEND_API_KEY or NOTIFY_EMAILS not set");
      return;
    }
    const from = process.env.NOTIFY_FROM_EMAIL || "SW Places Leads <onboarding@resend.dev>";
    const { subject, html } = buildEmail(lead);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[notify] Resend HTTP ${res.status}: ${body}`);
      return;
    }
    console.log(`[notify] new-lead email sent for ${lead.id ?? "?"} to ${to.join(", ")}`);
  } catch (e) {
    console.error("[notify] notifyNewLead failed:", e?.message);
  }
}

// Convenience for callers: notify only if the lead just became contactable.
// Returns a promise safe to hand to waitUntil (never rejects).
export function notifyOnNewContact(before, after) {
  if (!becameContactable(before, after)) return Promise.resolve();
  return notifyNewLead(after);
}
