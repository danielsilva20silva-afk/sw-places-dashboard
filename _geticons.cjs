const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#C9A96E"/>
  <text x="256" y="262" text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica, Arial, sans-serif" font-weight="700"
        font-size="220" letter-spacing="-4" fill="#111111">SW</text>
</svg>`;
const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: true } }).render().asPng();
for (const [name, size] of [['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]) {
  fs.writeFileSync('public/' + name, render(size));
  console.log('wrote', name, size);
}
