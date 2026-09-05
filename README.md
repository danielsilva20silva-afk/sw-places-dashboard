# SW Places Dashboard

## Deploy no Vercel (gratuito)

1. Vai a https://vercel.com e cria conta com o teu GitHub
2. Clica em "Add New Project"
3. Faz upload desta pasta ou liga ao GitHub
4. Vercel deteta Vite automaticamente — clica Deploy
5. Em 1 minuto está online

## Credenciais de teste

- Daniel (admin): daniel@swplaces.com / daniel2026
- Gustavo: gustavo@swplaces.com / guga2026

## Mudar passwords
Edita o ficheiro src/Login.jsx, array USERS

## Notificações de novos leads (email via Resend)

Envia um email sempre que um lead passa a ter contacto (telefone ou email).
Ativado por cliente pela flag `notifications` em `api/_config.js`
(swplaces: `true`, brandon: `false`). Env vars (definir no Vercel, server-only):

| Var | Obrigatória | Descrição |
|---|---|---|
| `RESEND_API_KEY` | sim | API key do Resend |
| `NOTIFY_EMAILS` | sim | destinatários, separados por vírgula (ex: `gustavo@…,daniel@…`) |
| `NOTIFY_FROM_EMAIL` | não | remetente, ex: `SW Places Leads <leads@teu-dominio.com>` (domínio verificado no Resend). Sem isto usa o remetente de teste do Resend (`onboarding@resend.dev`), que só entrega ao dono da conta Resend |
| `NOTIFY_DASHBOARD_URL` | não | URL base do dashboard para o link no email (por defeito o URL de produção do cliente) |

Sem `RESEND_API_KEY` ou `NOTIFY_EMAILS` o envio é ignorado em silêncio (nunca
parte o fluxo). Disparos: lead convertido manualmente (`convert-lead`) e lead
criado à mão com contacto (`leads` POST). O disparo no fluxo da Ana
(`ai-reply.js`, ficheiro congelado) está pendente de decisão.
