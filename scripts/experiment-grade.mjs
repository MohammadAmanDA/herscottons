/**
 * Experiment: can the green astroturf background be tamed programmatically?
 *
 * Most product shots are flat-lays on bright artificial grass. The saturated
 * green clashes with the warm cream palette. This tries two treatments and
 * writes a side-by-side sheet for review:
 *
 *   1. CROP   - centre crop to squeeze the grass border out of frame
 *   2. TAME   - keep luminance, collapse the chroma of grass-green pixels
 *               toward a warm stone, leaving the fabric untouched
 *
 *   node scripts/experiment-grade.mjs
 */

import sharp from 'sharp';

const SAMPLES = ['photo13', 'photo3', 'photo5', 'photo15'];
const CELL = 380;

/** Warm stone the grass gets pushed toward. */
const STONE = { r: 176, g: 166, b: 148 };

/**
 * Collapse chroma on grass-green pixels while preserving their luminance,
 * so the astroturf texture survives but the colour stops shouting.
 */
async function tameGreen(path) {
  const img = sharp(path);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);

  for (let i = 0; i < px.length; i += info.channels) {
    const r = px[i], g = px[i + 1], b = px[i + 2];

    // Grass test: green clearly dominant over both other channels.
    const greenDominance = g - Math.max(r, b);
    if (greenDominance <= 12) continue;

    // Ramp the effect in so there is no hard edge where the test flips.
    const strength = Math.min(1, (greenDominance - 12) / 45);

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const stoneLum = 0.2126 * STONE.r + 0.7152 * STONE.g + 0.0722 * STONE.b;
    const scale = lum / stoneLum;

    px[i]     = Math.round(r * (1 - strength) + Math.min(255, STONE.r * scale) * strength);
    px[i + 1] = Math.round(g * (1 - strength) + Math.min(255, STONE.g * scale) * strength);
    px[i + 2] = Math.round(b * (1 - strength) + Math.min(255, STONE.b * scale) * strength);
  }

  return sharp(px, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

const cells = [];

for (const [row, name] of SAMPLES.entries()) {
  const src = `assets/img/${name}-960.webp`;
  const y = row * (CELL + 24);

  const original = await sharp(src).resize({ width: CELL, height: CELL, fit: 'cover' }).toBuffer();

  // Centre crop to 74% then resize back up: pushes the grass border out of frame.
  const meta = await sharp(src).metadata();
  const side = Math.round(Math.min(meta.width, meta.height) * 0.74);
  const cropped = await sharp(src)
    .extract({
      left: Math.round((meta.width - side) / 2),
      top: Math.round((meta.height - side) / 2),
      width: side,
      height: side,
    })
    .resize({ width: CELL, height: CELL, fit: 'cover' })
    .toBuffer();

  // A sharp instance built from raw pixels has no implied container, so an
  // explicit encoder is required before the buffer can be composited.
  const tamedFull = await (await tameGreen(src)).png().toBuffer();

  const tamed = await sharp(tamedFull)
    .resize({ width: CELL, height: CELL, fit: 'cover' })
    .png()
    .toBuffer();

  // Both treatments combined.
  const both = await sharp(tamedFull)
    .extract({
      left: Math.round((meta.width - side) / 2),
      top: Math.round((meta.height - side) / 2),
      width: side,
      height: side,
    })
    .resize({ width: CELL, height: CELL, fit: 'cover' })
    .png()
    .toBuffer();

  [original, cropped, tamed, both].forEach((buf, col) => {
    cells.push({ input: buf, top: y, left: col * (CELL + 12) });
  });

  cells.push({
    input: Buffer.from(
      `<svg width="${CELL * 4 + 36}" height="24">
         <rect width="100%" height="100%" fill="#111"/>
         <text x="4" y="17" font-family="monospace" font-size="14" fill="#ddd">${name}   |   original   |   crop 74%   |   green tamed   |   both</text>
       </svg>`
    ),
    top: y + CELL,
    left: 0,
  });
}

await sharp({
  create: {
    width: CELL * 4 + 36,
    height: SAMPLES.length * (CELL + 24),
    channels: 3,
    background: '#111',
  },
})
  .composite(cells)
  .jpeg({ quality: 90 })
  .toFile('assets/img/_experiment-grade.jpg');

console.log('Wrote assets/img/_experiment-grade.jpg');
