import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Active client, selected at build time. No VITE_CLIENT → "swplaces", so existing
// deploys are byte-for-byte unchanged. Mirrors src/config/index.js's default.
const CLIENT = process.env.VITE_CLIENT || 'swplaces'

// Per-client tab title, apple web-app title and PWA manifest, driven by the SAME
// src/config/<client>.js branding the app itself uses (single source of truth).
// - index.html carries {{APP_TITLE}} / {{APP_APPLE_TITLE}} placeholders that this
//   plugin replaces at transform time.
// - manifest.json is NOT a static file anymore: it's generated here (served by a
//   dev middleware, emitted as an asset in the build) with per-client name /
//   short_name / description / theme_color.
function clientBrandingPlugin() {
  let branding = null

  async function load() {
    if (branding) return branding
    let mod
    try {
      mod = await import(new URL(`./src/config/${CLIENT}.js`, import.meta.url).href)
    } catch {
      throw new Error(
        `[client-branding] Unknown VITE_CLIENT "${CLIENT}" — no src/config/${CLIENT}.js`
      )
    }
    branding = mod.default.branding
    return branding
  }

  const buildManifest = (b) =>
    JSON.stringify(
      {
        name: b.name,
        short_name: b.name,
        description: `${b.name} — dashboard de leads e agenda.`,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#111111',
        theme_color: b.primaryColor,
        // TODO (per-client PWA icons + favicon): icons and public/favicon.svg are
        // still SHARED across clients. Swap in per-client icon-192/512, apple-touch
        // and favicon once brand assets exist — the mechanism is already per-client.
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      null,
      2
    )

  return {
    name: 'client-branding',
    async configResolved() {
      await load()
    },
    async transformIndexHtml(html) {
      const b = await load()
      return html
        .replaceAll('{{APP_TITLE}}', b.name)
        .replaceAll('{{APP_APPLE_TITLE}}', b.name)
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0]
        if (url !== '/manifest.json') return next()
        const b = await load()
        res.setHeader('Content-Type', 'application/manifest+json')
        res.end(buildManifest(b))
      })
    },
    async generateBundle() {
      const b = await load()
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: buildManifest(b) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), clientBrandingPlugin()],
})
