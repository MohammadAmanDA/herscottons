/**
 * Verifies that every local asset referenced by index.html actually exists.
 *
 * The original site shipped three broken images because the HTML asked for
 * photos/photo18.jpg while the file on disk was photo18.HEIC. That is a silent
 * failure — the page still renders, just with holes in it. This makes it loud.
 *
 *   node scripts/check-links.mjs
 */

import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const HTML = 'index.html';
const html = await readFile(HTML, 'utf8');

/** Every attribute that can hold one or more local URLs. */
const refs = new Set();

// src="..." and href="..." — single URL each.
for (const [, attr, value] of html.matchAll(/\b(src|href)\s*=\s*"([^"]+)"/g)) {
  refs.add(value);
}

// srcset="a.webp 480w, b.webp 960w" and imagesrcset — comma-separated candidates.
for (const [, value] of html.matchAll(/\b(?:image)?srcset\s*=\s*"([^"]+)"/gi)) {
  for (const candidate of value.split(',')) {
    const url = candidate.trim().split(/\s+/)[0];
    if (url) refs.add(url);
  }
}

const isRemote = (u) =>
  /^(https?:)?\/\//i.test(u) || u.startsWith('data:') || u.startsWith('mailto:') || u.startsWith('#');

const local = [...refs].filter((u) => u && !isRemote(u));

const missing = [];
for (const ref of local) {
  const path = join(dirname(HTML), ref.split('?')[0].split('#')[0]);
  try {
    await access(path);
  } catch {
    missing.push(ref);
  }
}

// Anchor targets should resolve to a real element too.
const anchors = [...html.matchAll(/href\s*=\s*"#([\w-]+)"/g)].map((m) => m[1]);
const danglingAnchors = anchors.filter(
  (id) => !new RegExp(`\\bid\\s*=\\s*"${id}"`).test(html)
);

console.log(`Checked ${local.length} local asset references in ${HTML}.`);

if (missing.length) {
  console.error(`\n${missing.length} MISSING file(s):`);
  missing.forEach((m) => console.error(`  ${m}`));
}

if (danglingAnchors.length) {
  console.error(`\n${danglingAnchors.length} dangling anchor link(s):`);
  danglingAnchors.forEach((a) => console.error(`  #${a}`));
}

if (!missing.length && !danglingAnchors.length) {
  console.log('All references resolve.');
} else {
  process.exit(1);
}
