/**
 * Builds a printable sheet of review cards.
 *
 * The QR is inlined into the HTML rather than linked, so the file prints
 * correctly from any device with no network and nothing to go missing. It is
 * regenerated from the same source URL as the standalone QR, so the two can
 * never drift apart.
 *
 *   node scripts/make-review-card.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises';
import QRCode from 'qrcode';

const URL = 'https://herscottons.pages.dev/review';
const SPOKEN = 'herscottons.pages.dev/r';
const OUT = 'assets/print';

await mkdir(OUT, { recursive: true });

// Level H survives creasing, smudging and cheap card stock — all guaranteed
// in a shop. Rendered without a quiet-zone margin because the card supplies
// its own whitespace.
const qr = await QRCode.toString(URL, {
  errorCorrectionLevel: 'H',
  margin: 0,
  type: 'svg',
  color: { dark: '#1A120D', light: '#FDF8F3' },
});

// Strip the XML prolog so the SVG can be embedded directly in HTML.
const qrInline = qr.replace(/<\?xml.*?\?>/, '').trim();

const card = `
      <article class="card">
        <p class="brand">Hers Cottons</p>
        <p class="stars" aria-hidden="true">★★★★★</p>
        <div class="qr">${qrInline}</div>
        <p class="ask">Scan to rate us on Google</p>
        <p class="ask ask--hi" lang="hi">गूगल पर रिव्यू दें</p>
        <p class="url">${SPOKEN}</p>
      </article>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Hers Cottons — review cards to print</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&display=swap">
<style>
  /* Physical sizing: 8 cards per A4 sheet, 90x55mm — standard business card,
     so they fit a card holder and any local printer can cut them. */
  @page { size: A4; margin: 8mm; }

  :root {
    --cream: #FDF8F3;
    --ink:   #2E211A;
    --soft:  #6B5344;
    --gold:  #855D2D;
    --leaf:  #C49A6C;
  }

  * { box-sizing: border-box; margin: 0; }

  body {
    font-family: ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif;
    background: #e8e2da;
    padding: 8mm;
  }

  .sheet {
    display: grid;
    grid-template-columns: repeat(2, 90mm);
    grid-auto-rows: 55mm;
    gap: 4mm;
    justify-content: center;
  }

  .card {
    background: var(--cream);
    border: 0.3mm dashed var(--leaf); /* cut guide */
    padding: 3mm;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto auto;
    column-gap: 3.5mm;
    align-items: center;
    text-align: left;
  }

  .qr {
    grid-row: 1 / 4;
    width: 34mm;
    height: 34mm;
  }
  .qr svg { width: 100%; height: 100%; display: block; }

  .brand {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-weight: 400;
    font-size: 5.2mm;
    letter-spacing: 0.7mm;
    text-transform: uppercase;
    color: var(--ink);
    align-self: end;
  }

  .stars { display: none; }

  .ask {
    font-size: 3.1mm;
    line-height: 1.35;
    color: var(--soft);
  }
  .ask--hi { font-size: 3.4mm; color: var(--ink); margin-top: 0.6mm; }

  .url {
    font-size: 2.7mm;
    letter-spacing: 0.15mm;
    color: var(--gold);
    align-self: start;
    margin-top: 1mm;
  }

  /* Screen-only helper so the file is understandable when opened normally. */
  .note {
    max-width: 180mm;
    margin: 0 auto 6mm;
    padding: 4mm 5mm;
    background: #fff;
    border-left: 1mm solid var(--gold);
    font-size: 3.6mm;
    line-height: 1.5;
    color: var(--ink);
  }
  .note strong { color: var(--gold); }

  @media print {
    body { background: #fff; padding: 0; }
    .note { display: none; }
    .card { border-color: #d8cdbd; }
  }
</style>
</head>
<body>

<div class="note">
  <p><strong>To print:</strong> press Ctrl&nbsp;+&nbsp;P, choose A4, and set Margins
  to <strong>Default</strong> and Scale to <strong>100%</strong> — not "Fit to page",
  which shrinks the QR. Tick "Background graphics" so the cream colour prints.
  Cut along the dashed lines. Eight cards per sheet.</p>
  <p style="margin-top:2mm">Every card points at
  <strong>${SPOKEN}</strong>, which forwards to your Google review page. If that
  Google link ever changes, the cards keep working.</p>
</div>

<div class="sheet">${card.repeat(8)}
</div>

</body>
</html>
`;

await writeFile(`${OUT}/review-card.html`, html);
console.log(`written : ${OUT}/review-card.html  (8 cards per A4 sheet, 90x55mm)`);

/* ---------------------------------------------------------------------------
   A4 wall poster
   ------------------------------------------------------------------------ */

// A 120mm QR scans reliably from about 2 metres, which is roughly the distance
// someone stands from a shop wall. Smaller than this and customers have to
// walk up to it, which most will not do.
const poster = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Hers Cottons — review poster (A4)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&display=swap">
<style>
  @page { size: A4; margin: 0; }

  :root {
    --cream: #FDF8F3;
    --ink:   #2E211A;
    --soft:  #6B5344;
    --gold:  #855D2D;
    --leaf:  #C49A6C;
  }

  * { box-sizing: border-box; margin: 0; }

  body {
    font-family: ui-sans-serif, system-ui, 'Segoe UI', Roboto, sans-serif;
    background: #ddd6cc;
    display: flex;
    justify-content: center;
    padding: 10mm;
  }

  .poster {
    width: 210mm;
    height: 297mm;
    background: var(--cream);
    padding: 13mm 16mm 11mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    border: 1.2mm solid var(--leaf);
    outline: 0.3mm solid var(--cream);
    outline-offset: -3mm;
  }

  .brand {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-weight: 300;
    font-size: 13.5mm;
    letter-spacing: 3mm;
    text-transform: uppercase;
    color: var(--ink);
    line-height: 1;
  }

  .est {
    font-size: 3.4mm;
    letter-spacing: 1.6mm;
    text-transform: uppercase;
    color: var(--gold);
    margin-top: 4mm;
  }

  .rule {
    width: 34mm; height: 0.4mm;
    background: var(--leaf);
    margin: 6mm 0;
  }

  .headline {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-weight: 400;
    font-size: 13mm;
    line-height: 1.15;
    color: var(--ink);
  }

  .headline em { font-style: italic; color: var(--gold); }

  .hi {
    font-size: 7mm;
    color: var(--ink);
    margin-top: 4mm;
  }

  .stars {
    font-size: 9mm;
    letter-spacing: 2mm;
    color: var(--leaf);
    margin-top: 6mm;
  }

  .qr {
    width: 120mm;
    height: 120mm;
    margin: 6mm 0 5mm;
  }
  .qr svg { width: 100%; height: 100%; display: block; }

  .instruction {
    font-size: 4.6mm;
    letter-spacing: 0.3mm;
    color: var(--soft);
  }

  .url {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 7mm;
    letter-spacing: 0.6mm;
    color: var(--gold);
    margin-top: 3mm;
  }

  .foot {
    margin-top: auto;
    padding-top: 6mm;
    border-top: 0.3mm solid var(--leaf);
    width: 100%;
    font-size: 3.4mm;
    letter-spacing: 0.9mm;
    text-transform: uppercase;
    color: var(--soft);
  }

  .note {
    max-width: 190mm;
    margin: 0 auto 6mm;
    padding: 4mm 5mm;
    background: #fff;
    border-left: 1mm solid var(--gold);
    font-size: 3.6mm;
    line-height: 1.5;
    color: var(--ink);
  }
  .note strong { color: var(--gold); }

  @media print {
    body { background: #fff; padding: 0; display: block; }
    .note { display: none; }
    .poster { border-color: var(--leaf); }
  }
</style>
</head>
<body>

<div>
  <div class="note">
    <p><strong>To print:</strong> Ctrl&nbsp;+&nbsp;P, paper size <strong>A4</strong>,
    margins <strong>None</strong>, scale <strong>100%</strong>, and tick
    <strong>Background graphics</strong>. The QR is 120&nbsp;mm, which scans from
    roughly two metres away — do not let the printer shrink it.</p>
  </div>

  <div class="poster">
    <p class="brand">Hers Cottons</p>
    <p class="est">Aligarh &middot; Since 1980</p>

    <div class="rule"></div>

    <p class="headline">Happy with your<br><em>purchase?</em></p>
    <p class="hi" lang="hi">गूगल पर रिव्यू दें</p>
    <p class="stars" aria-hidden="true">★ ★ ★ ★ ★</p>

    <div class="qr">${qrInline}</div>

    <p class="instruction">Point your phone camera here</p>
    <p class="url">${SPOKEN}</p>

    <p class="foot">Asghari Lodge &middot; Amir Nishan Road &middot; Aligarh</p>
  </div>
</div>

</body>
</html>
`;

await writeFile(`${OUT}/review-poster-a4.html`, poster);
console.log(`written : ${OUT}/review-poster-a4.html  (A4 wall poster, 120mm QR)`);
console.log(`encodes : ${URL}`);
