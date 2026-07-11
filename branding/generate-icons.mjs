// Generate a client's icon set (favicon.svg + icon-192/512.png + apple-touch-
// icon.png) into branding/<client>/, from that client's branding.logoMonogram +
// primaryColor — a gold rounded square with the black monogram, matching the
// in-app logo (src/pages/Login.jsx / Dashboard.jsx).
//
//   node branding/generate-icons.mjs <client>
//
// Run once per NEW client and commit the output. NOTE: swplaces is intentionally
// NOT generated here — its icons are a hand-made "SW" (two-letter) design kept
// verbatim in branding/swplaces/. Only run this for clients whose icon is the
// simple monogram square.
import { Resvg } from '@resvg/resvg-js'
import { writeFileSync, mkdirSync } from 'node:fs'

const client = process.argv[2]
if (!client) {
  console.error('usage: node branding/generate-icons.mjs <client>')
  process.exit(1)
}

const { default: cfg } = await import(new URL(`../src/config/${client}.js`, import.meta.url).href)
const { logoMonogram, primaryColor } = cfg.branding

const svg = (size) => {
  const rx = Math.round(size * 0.22)
  const fontSize = Math.round(size * 0.58)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${rx}" fill="${primaryColor}"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${fontSize}" fill="#000">${logoMonogram}</text></svg>`
}

const png = (size) =>
  new Resvg(svg(size), {
    font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' },
    fitTo: { mode: 'width', value: size },
  })
    .render()
    .asPng()

const dir = new URL(`./${client}/`, import.meta.url)
mkdirSync(dir, { recursive: true })
const at = (f) => new URL(f, dir)

writeFileSync(at('favicon.svg'), svg(512))
writeFileSync(at('icon-192.png'), png(192))
writeFileSync(at('icon-512.png'), png(512))
writeFileSync(at('apple-touch-icon.png'), png(180))

console.log(`branding/${client}/ — generated favicon.svg, icon-192, icon-512, apple-touch-icon (monogram "${logoMonogram}", ${primaryColor})`)
