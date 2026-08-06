/**
 * Pulls the latest posts from @herscottons and bakes them into the repo.
 *
 * Runs daily in GitHub Actions. Two jobs, in order:
 *
 *   1. Refresh the long-lived access token. Meta tokens last 60 days with NO
 *      grace period — one missed refresh and the feed dies until somebody
 *      re-authorises by hand. Running daily gives ~59 days of slack.
 *   2. Fetch the newest posts, download the images into the repo, and write
 *      assets/instagram/feed.json.
 *
 * Images are downloaded rather than hotlinked because Instagram's CDN URLs are
 * signed and expire within days. Baking them in also means the homepage makes
 * zero third-party requests at runtime.
 *
 * Fails safe: if anything goes wrong and a previous feed exists, the old feed
 * is left untouched and the run is not treated as fatal. A stale feed beats an
 * empty one.
 *
 *   INSTAGRAM_ACCESS_TOKEN=... node scripts/fetch-instagram.mjs
 */

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const OUT_DIR = 'assets/instagram';
const FEED = join(OUT_DIR, 'feed.json');
const POST_COUNT = 6;
const WIDTHS = [480, 960];

const API = 'https://graph.instagram.com';

/** Media types we can render. Videos are represented by their thumbnail. */
const RENDERABLE = new Set(['IMAGE', 'CAROUSEL_ALBUM', 'VIDEO']);

async function api(path, params) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url);
  const body = await res.json();

  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw new Error(
      `Instagram API ${res.status}: ${e.message ?? 'unknown'}` +
        (e.code ? ` (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''})` : '')
    );
  }
  return body;
}

/**
 * Extend the token by another 60 days and hand the new value back to the
 * workflow, which persists it into GitHub Secrets.
 */
async function refreshToken() {
  const body = await api('/refresh_access_token', {
    grant_type: 'ig_refresh_token',
    access_token: TOKEN,
  });

  const days = Math.round((body.expires_in ?? 0) / 86400);
  console.log(`Token refreshed, valid ~${days} days.`);

  if (process.env.GITHUB_OUTPUT && body.access_token) {
    // Multi-line-safe output syntax; the value is masked by the workflow.
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `new_token<<TOKEN_EOF\n${body.access_token}\nTOKEN_EOF\n`,
      { flag: 'a' }
    );
  }
  return body.access_token ?? TOKEN;
}

/** Strip hashtags and mention spam, then clip to a usable caption. */
function cleanCaption(raw) {
  if (!raw) return '';
  return raw
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/@[\p{L}\p{N}_.]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First clause of the caption, short enough to serve as alt text. */
function altFrom(caption, index) {
  const clean = cleanCaption(caption);
  if (!clean) return `Recent Hers Cottons Instagram post ${index + 1}`;
  const firstSentence = clean.split(/[.!?\n]/)[0].trim();
  return (firstSentence.length > 8 ? firstSentence : clean).slice(0, 120);
}

async function main() {
  if (!TOKEN) throw new Error('INSTAGRAM_ACCESS_TOKEN is not set.');

  await mkdir(OUT_DIR, { recursive: true });

  const token = await refreshToken();

  const { data } = await api('/me/media', {
    fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp',
    limit: 25,
    access_token: token,
  });

  const posts = (data ?? [])
    .filter((p) => RENDERABLE.has(p.media_type))
    .filter((p) => p.media_url || p.thumbnail_url)
    .slice(0, POST_COUNT);

  if (!posts.length) throw new Error('API returned no renderable posts.');

  const feed = [];
  const keep = new Set(['feed.json']);

  for (const [i, post] of posts.entries()) {
    // Videos expose a still at thumbnail_url; images use media_url directly.
    const source = post.media_type === 'VIDEO' ? post.thumbnail_url : post.media_url;

    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to download media for ${post.id}: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const image = sharp(buffer).rotate();
    const meta = await image.metadata();

    const variants = [];
    for (const w of WIDTHS.filter((w) => w <= meta.width).concat(meta.width < WIDTHS[0] ? [meta.width] : [])) {
      const filename = `${post.id}-${w}.webp`;
      await writeFile(
        join(OUT_DIR, filename),
        await image.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
      );
      variants.push({ width: w, file: filename });
      keep.add(filename);
    }

    const lqip = await image.clone().resize({ width: 20 }).webp({ quality: 40 }).toBuffer();

    feed.push({
      id: post.id,
      permalink: post.permalink,
      type: post.media_type,
      timestamp: post.timestamp,
      caption: cleanCaption(post.caption).slice(0, 200),
      alt: altFrom(post.caption, i),
      width: meta.width,
      height: meta.height,
      aspect: Number((meta.width / meta.height).toFixed(4)),
      variants,
      lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
    });

    console.log(`  ${i + 1}. ${post.media_type.padEnd(15)} ${post.permalink}`);
  }

  await writeFile(
    FEED,
    JSON.stringify({ fetchedAt: new Date().toISOString(), posts: feed }, null, 2)
  );

  // Drop images belonging to posts that have rotated out of the feed.
  for (const file of await readdir(OUT_DIR)) {
    if (!keep.has(file)) {
      await unlink(join(OUT_DIR, file));
      console.log(`  removed stale ${file}`);
    }
  }

  console.log(`\nWrote ${feed.length} posts to ${FEED}`);
}

main().catch(async (err) => {
  console.error(`\nInstagram sync failed: ${err.message}`);

  // A stale feed is better than a broken one. Only hard-fail if there is
  // nothing already on disk for the page to fall back to.
  try {
    const existing = JSON.parse(await readFile(FEED, 'utf8'));
    console.error(
      `Keeping existing feed of ${existing.posts.length} posts from ${existing.fetchedAt}.`
    );
    process.exit(0);
  } catch {
    console.error('No existing feed to fall back on.');
    process.exit(1);
  }
});
