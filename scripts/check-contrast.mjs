/**
 * Verifies every text/background pair in the palette against WCAG AA.
 * Ratios are computed, never estimated. Run this whenever a colour changes.
 *
 *   node scripts/check-contrast.mjs
 */

const LIGHT = {
  cream: '#FDF8F3',
  ivory: '#F7F0E8',
  sand: '#EFE4D6',
};

const DARK = {
  deep: '#1A120D',
  deepSoft: '#241912',
};

const ON_LIGHT = {
  ink: '#2E211A',
  'ink-soft': '#6B5344',
  gold: '#855D2D',
};

/**
 * Purely ornamental strokes — motif linework and hairline rules. WCAG sets no
 * contrast requirement for decoration that carries no information, so these
 * are reported for awareness but not asserted against.
 */
const DECORATIVE = {
  'gold-leaf': '#C49A6C',
};

const ON_DARK = {
  'ink-invert': '#F4EBE1',
  'ink-invert-soft': '#C3AE9B',
  'gold-invert': '#E0AC72',
};

const srgb = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * srgb((n >> 16) & 255) +
    0.7152 * srgb((n >> 8) & 255) +
    0.0722 * srgb(n & 255)
  );
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

let failures = 0;

function report(title, fgs, bgs, { assert = true } = {}) {
  console.log(`\n${title}`);
  console.log('─'.repeat(74));
  for (const [fgName, fg] of Object.entries(fgs)) {
    for (const [bgName, bg] of Object.entries(bgs)) {
      const ratio = contrast(fg, bg);
      const label = `${fgName} on ${bgName}`;

      if (!assert) {
        console.log(`${label.padEnd(46)} ${ratio.toFixed(2).padStart(6)}:1  (decorative, no requirement)`);
        continue;
      }

      // AA is 4.5:1 for body text.
      const pass = ratio >= 4.5;
      if (!pass) failures++;
      console.log(
        `${label.padEnd(46)} ${ratio.toFixed(2).padStart(6)}:1  ${pass ? 'PASS' : 'FAIL'}  (needs 4.5)`
      );
    }
  }
}

report('LIGHT SCHEME', ON_LIGHT, LIGHT);
report('DARK SECTIONS', ON_DARK, DARK);
report('ORNAMENT — never used for text', DECORATIVE, LIGHT, { assert: false });

console.log(
  `\n${failures === 0 ? 'All body-text pairs pass WCAG AA.' : `${failures} body-text pair(s) FAIL WCAG AA.`}`
);
process.exit(failures === 0 ? 0 : 1);
