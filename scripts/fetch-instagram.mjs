/**
 * Pulls the latest posts from @herscottons and bakes them into the repo.
 *
 * Runs daily in GitHub Actions. Supports two sources:
 *
 *   BEHOLD  (default) — reads a public JSON feed from behold.so. Behold holds
 *           the Meta credentials and renews them, so this repo needs NO secrets
 *           at all and there is no 60-day token to babysit. A feed ID is a
 *           public identifier, safe to commit.
 *
 *   META    — talks to the Instagram API with Instagram Login directly. Free
 *           and unlimited, but requires a Meta developer app, a long-lived
 *           token, and a GitHub PAT so the token can renew itself.
 *
 * Either way the images are downloaded INTO the repo rather than hotlinked.
 * Instagram and Behold CDN URLs are signed and expire, so hotlinking breaks
 * silently after a few days. Baking them in also means the homepage makes zero
 * third-party requests and leaks nothing about visitors.
 *
 * Fails safe: on any error an existing feed is left untouched. A stale feed
 * beats an empty one.
 *
 *   npm run instagram
 */

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const OUT_DIR = 'assets/instagram';
const FEED = join(OUT_DIR, 'feed.json');
const CONFIG = 'instagram.config.json';
const POST_COUNT = 6;
const WIDTHS = [480, 960];

/** Media types we can render. Videos are represented by their thumbnail. */
const RENDERABLE = new Set(['IMAGE', 'CAROUSEL_ALBUM', 'VIDEO']);

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG, 'utf8'));
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------------------------
   Sources — each returns a normalised array of posts
   ------------------------------------------------------------------------ */

/**
 * Instagram captions here are written as shop listings: SHOUTED IN CAPS, padded
 * with tildes, and tailed by a colour disclaimer and a phone number. That reads
 * fine in the app and badly on a restrained page, so normalise it.
 */
function cleanCaption(raw) {
  if (!raw) return '';

  let text = raw
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/@[\p{L}\p{N}_.]+/gu, '')
    // Boilerplate the shop appends to most posts — not caption content.
    .replace(/disclaimer\s*:.*$/is, '')
    .replace(/to book[, ].*?(call|whatsapp).*$/is, '')
    // Tilde and dash separators used as bullets.
    .replace(/\s*[~]+\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();

  // If it is mostly uppercase, recase it. Preserve genuine acronyms of 2-3
  // letters so things like "XL" survive.
  const letters = text.replace(/[^\p{L}]/gu, '');
  const upper = text.replace(/[^\p{Lu}]/gu, '');
  if (letters.length > 20 && upper.length / letters.length > 0.7) {
    text = text
      .toLowerCase()
      .replace(/(^\s*\p{L})|([.!?]\s+\p{L})/gu, (m) => m.toUpperCase());
  }

  return text.replace(/\s*[·\-,;:]\s*$/, '').trim();
}

/** Cut to a length without slicing a word in half. */
function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[·,;:\-\s]+$/, '') + '…';
}

function altFrom(post, caption, index) {
  // Instagram's own alt text is the best source when the shop has set it.
  if (post.altText) return truncate(String(post.altText), 160);
  if (!caption) return `Recent Hers Cottons Instagram post ${index + 1}`;
  const firstSentence = caption.split(/[.!?\n]/)[0].trim();
  return truncate(firstSentence.length > 8 ? firstSentence : caption, 160);
}

async function fromBehold(feedId) {
  const res = await fetch(`https://feeds.behold.so/${feedId}`);
  if (!res.ok) {
    throw new Error(
      `Behold responded ${res.status}. Check the feed ID in ${CONFIG} is correct and the feed is published.`
    );
  }
  const body = await res.json();

  return (body.posts ?? [])
    .filter((p) => RENDERABLE.has(p.mediaType))
    .slice(0, POST_COUNT)
    .map((p, i) => {
      const caption = cleanCaption(p.caption ?? p.prunedCaption);
      // sizes.large is 1000px max, ample for a 480/960 render.
      const source = p.sizes?.large?.mediaUrl ?? p.sizes?.full?.mediaUrl ?? p.thumbnailUrl ?? p.mediaUrl;
      return {
        id: p.id,
        permalink: p.permalink,
        type: p.mediaType,
        timestamp: p.timestamp,
        caption: truncate(caption, 180),
        alt: altFrom(p, caption, i),
        source,
      };
    });
}

async function fromMeta(token) {
  const call = async (path, params) => {
    const url = new URL(path, 'https://graph.instagram.com');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok || body.error) {
      const e = body.error ?? {};
      throw new Error(
        `Instagram API ${res.status}: ${e.message ?? 'unknown'}` +
          (e.code ? ` (code ${e.code})` : '')
      );
    }
    return body;
  };

  // Extend the token by another 60 days; there is no grace period once it lapses.
  const refreshed = await call('/refresh_access_token', {
    grant_type: 'ig_refresh_token',
    access_token: token,
  });
  console.log(`Token refreshed, valid ~${Math.round((refreshed.expires_in ?? 0) / 86400)} days.`);

  if (process.env.GITHUB_OUTPUT && refreshed.access_token) {
    await writeFile(
      process.env.GITHUB_OUTPUT,
      `new_token<<TOKEN_EOF\n${refreshed.access_token}\nTOKEN_EOF\n`,
      { flag: 'a' }
    );
  }

  const { data } = await call('/me/media', {
    fields: 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp',
    limit: 25,
    access_token: refreshed.access_token ?? token,
  });

  return (data ?? [])
    .filter((p) => RENDERABLE.has(p.media_type))
    .filter((p) => p.media_url || p.thumbnail_url)
    .slice(0, POST_COUNT)
    .map((p, i) => {
      const caption = cleanCaption(p.caption);
      return {
        id: p.id,
        permalink: p.permalink,
        type: p.media_type,
        timestamp: p.timestamp,
        caption: truncate(caption, 180),
        alt: altFrom(p, caption, i),
        source: p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url,
      };
    });
}

/* ---------------------------------------------------------------------------
   Main
   ------------------------------------------------------------------------ */

async function main() {
  const config = await loadConfig();
  const feedId = process.env.BEHOLD_FEED_ID || config.beholdFeedId;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;

  let posts;
  if (feedId && config.provider !== 'meta') {
    console.log(`Source: Behold (feed ${feedId})`);
    posts = await fromBehold(feedId);
  } else if (token) {
    console.log('Source: Instagram API with Instagram Login');
    posts = await fromMeta(token);
  } else {
    throw new Error(
      `No source configured. Set "beholdFeedId" in ${CONFIG}, or provide INSTAGRAM_ACCESS_TOKEN.`
    );
  }

  if (!posts.length) throw new Error('Source returned no renderable posts.');

  await mkdir(OUT_DIR, { recursive: true });

  const feed = [];
  const keep = new Set(['feed.json']);

  for (const [i, post] of posts.entries()) {
    const res = await fetch(post.source);
    if (!res.ok) throw new Error(`Failed to download media for ${post.id}: ${res.status}`);

    const image = sharp(Buffer.from(await res.arrayBuffer())).rotate();
    const meta = await image.metadata();

    const variants = [];
    for (const w of WIDTHS) {
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
      type: post.type,
      timestamp: post.timestamp,
      caption: post.caption,
      alt: post.alt,
      width: meta.width,
      height: meta.height,
      aspect: Number((meta.width / meta.height).toFixed(4)),
      variants,
      lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
    });

    console.log(`  ${i + 1}. ${post.type.padEnd(15)} ${post.permalink}`);
  }

  await writeFile(FEED, JSON.stringify({ fetchedAt: new Date().toISOString(), posts: feed }, null, 2));

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

  try {
    const existing = JSON.parse(await readFile(FEED, 'utf8'));
    if (existing.posts?.length) {
      console.error(`Keeping existing feed of ${existing.posts.length} posts from ${existing.fetchedAt}.`);
      process.exit(0);
    }
    console.error('Existing feed is empty; the page will show curated shop photos.');
  } catch {
    console.error('No existing feed on disk.');
  }
  process.exit(1);
});
