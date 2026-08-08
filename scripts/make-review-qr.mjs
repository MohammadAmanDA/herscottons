/**
 * Generates the QR code customers scan to leave a Google review.
 *
 * It encodes https://herscottons.pages.dev/review — our own short link, NOT
 * Google's URL. That indirection is the whole point: Google's review URL
 * changes when a profile is claimed, merged or moved, and a QR printed with
 * the raw Google link would be dead the day that happens. Ours is redirected
 * in _redirects, so printed cards stay valid forever.
 *
 * SVG is the deliverable — it prints crisp at any size, from a counter card
 * to a shop poster.
 *
 *   node scripts/make-review-qr.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';

const URL = 'https://herscottons.pages.dev/review';
const OUT = 'assets/print';

await mkdir(OUT, { recursive: true });

// High error correction: QR codes in a shop get smudged, creased and printed
// on cheap card. H tolerates ~30% damage and still scans.
const options = {
  errorCorrectionLevel: 'H',
  margin: 2,
  color: { dark: '#1A120D', light: '#FDF8F3' }, // matches the site palette
};

const svg = await QRCode.toString(URL, { ...options, type: 'svg', width: 1000 });
await writeFile(`${OUT}/review-qr.svg`, svg);

// PNG too, for WhatsApp and anything that will not take an SVG.
await writeFile(`${OUT}/review-qr.png`, await QRCode.toBuffer(URL, { ...options, width: 1200 }));

console.log(`encoded : ${URL}`);
console.log(`written : ${OUT}/review-qr.svg  (vector, for print)`);
console.log(`written : ${OUT}/review-qr.png  (1200px, for WhatsApp)`);
