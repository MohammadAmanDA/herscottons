/**
 * One-off preparation for the founder portrait.
 *
 * The source arrives with a solid bar across the bottom (the badge an image
 * tool stamps on its output), and needs to end up at a clean 4:5 so the page
 * frame does not crop his shoulders.
 *
 * Retouching is deliberately restrained: a portrait that looks processed is
 * worse than one that looks plain.
 *
 *   node scripts/prepare-portrait.mjs
 */

import { copyFile, writeFile, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const SRC = 'photos/owner2.jpg';
const BACKUP = 'photos/owner2.original.jpg';

/** Detect the solid bar by walking up from the bottom edge. */
async function findContentBottom(image) {
  const { data, info } = await image.clone().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const rowMean = (y) => {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return sum / width;
  };

  for (let y = height - 1; y > height * 0.6; y--) {
    if (rowMean(y) > 28) return y + 1;
  }
  return height;
}

// Read the bytes up front and work from the buffer. Constructing sharp from a
// path keeps a file handle open on Windows, and the write back to that same
// path then fails.
const source = await readFile(SRC);
const original = sharp(source).rotate();
const meta = await original.metadata();

// Keep the untouched file around; this script is destructive otherwise.
await copyFile(SRC, BACKUP);

const contentBottom = await findContentBottom(original);

// Trim to 4:5 so the portrait frame needs no further cropping. Take the excess
// off the width, centred, which keeps both shoulders in frame.
const targetWidth = Math.round(contentBottom * 0.8);
const left = Math.max(0, Math.round((meta.width - targetWidth) / 2));
const width = Math.min(targetWidth, meta.width - left);

const out = await original
  .extract({ left, top: 0, width, height: contentBottom })
  // Gentle screen finishing. linear() lifts contrast slightly without
  // clipping the bright backdrop; the modulate is barely perceptible.
  .linear(1.05, -6)
  .modulate({ brightness: 1.01, saturation: 1.03 })
  .sharpen({ sigma: 0.7, m1: 0.5, m2: 0.7 })
  .jpeg({ quality: 94, mozjpeg: true })
  .toBuffer();

// writeFile rather than sharp.toFile: on Windows the reader still holds a
// handle on SRC, and writing through sharp fails with "unable to open for write".
await writeFile(SRC, out);

const after = await sharp(SRC).metadata();
console.log(`source          ${meta.width}x${meta.height}`);
console.log(`bar removed at  y=${contentBottom} (${meta.height - contentBottom}px trimmed)`);
console.log(`result          ${after.width}x${after.height}  ratio ${(after.width / after.height).toFixed(3)} (4:5 = 0.800)`);
console.log(`original kept   ${BACKUP}`);
