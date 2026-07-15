// Regenerates public/og.png (the link-preview card). Run with `npm run og`.
// Kept as a script rather than a build step: it changes about once a year.
import sharp from 'sharp';

const W = 1200;
const H = 630;
const FONT = 'Segoe UI, Open Sans, Helvetica, sans-serif';

const lines = [];
for (let x = 0; x <= W; x += 28) {
  lines.push(
    `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#ffffff" stroke-opacity="${x % 112 === 0 ? 0.2 : 0.1}" stroke-width="1"/>`
  );
}
for (let y = 0; y <= H; y += 28) {
  lines.push(
    `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#ffffff" stroke-opacity="${y % 112 === 0 ? 0.2 : 0.1}" stroke-width="1"/>`
  );
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="0.5" cy="0.4" r="0.85">
      <stop offset="0" stop-color="#32508D"/>
      <stop offset="0.78" stop-color="#223769"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75">
      <stop offset="0.4" stop-color="#223769" stop-opacity="0"/>
      <stop offset="1" stop-color="#223769" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${lines.join('\n  ')}
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
  <text x="80" y="150" font-family="${FONT}" font-size="40" font-weight="700" fill="#ffffff">BluePrint<tspan fill="#2689E6">3</tspan></text>
  <text x="80" y="320" font-family="${FONT}" font-size="82" font-weight="800" fill="#ffffff" letter-spacing="-1">Your idea, in your hands.</text>
  <text x="80" y="386" font-family="${FONT}" font-size="31" font-weight="400" fill="#ffffff" fill-opacity="0.9">3D modelling, prototyping and low-volume printing &#8212; under one roof.</text>
  <text x="80" y="545" font-family="${FONT}" font-size="24" font-weight="600" fill="#ffffff" fill-opacity="0.75" letter-spacing="3">QUOTED WITHIN 24 HOURS</text>
</svg>`;

const out = 'public/og.png';
await sharp(Buffer.from(svg), { density: 144 }).resize(W, H).png({ compressionLevel: 9 }).toFile(out);
console.log(`wrote ${out}`);
