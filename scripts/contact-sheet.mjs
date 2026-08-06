/**
 * Builds a labelled contact sheet of every optimized image, so the whole
 * library can be reviewed at a glance when art-directing the page.
 *
 *   node scripts/contact-sheet.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const CELL = 300;
const LABEL = 26;
const COLS = 5;

const manifest = JSON.parse(await readFile('assets/img/manifest.json', 'utf8'));
const names = Object.keys(manifest);
const rows = Math.ceil(names.length / COLS);

const sheetW = COLS * CELL;
const sheetH = rows * (CELL + LABEL);

const composites = [];

for (const [i, name] of names.entries()) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = col * CELL;
  const y = row * (CELL + LABEL);

  // Prefer the grass-avoiding crop where one was generated — that is the
  // variant the gallery actually renders.
  const entry = manifest[name];
  const src = entry.crop
    ? `assets/img/${name}-crop-${Math.max(...entry.crop.widths)}.webp`
    : `assets/img/${name}-${Math.min(...entry.widths)}.webp`;

  const thumb = await sharp(src)
    .resize({ width: CELL, height: CELL, fit: 'cover' })
    .toBuffer();

  composites.push({ input: thumb, top: y, left: x });

  const label = entry.crop
    ? `${name}  CROP (grass ${(entry.crop.grassFraction * 100).toFixed(0)}%)`
    : `${name}  full frame`;
  const svg = Buffer.from(
    `<svg width="${CELL}" height="${LABEL}">
       <rect width="100%" height="100%" fill="#1a1a1a"/>
       <text x="6" y="18" font-family="monospace" font-size="13" fill="#eee">${label}</text>
     </svg>`
  );
  composites.push({ input: svg, top: y + CELL, left: x });
}

await sharp({
  create: { width: sheetW, height: sheetH, channels: 3, background: '#1a1a1a' },
})
  .composite(composites)
  .jpeg({ quality: 88 })
  .toFile('assets/img/_contact-sheet.jpg');

console.log(`Contact sheet: ${names.length} images, ${sheetW}x${sheetH} -> assets/img/_contact-sheet.jpg`);
