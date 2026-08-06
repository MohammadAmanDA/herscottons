/**
 * Image pipeline for Hers Cottons.
 *
 * Source photos live in /photos and are a mix of iPhone HEIC (which no browser
 * can render) and oversized JPG/PNG. This converts everything into responsive
 * WebP + a JPG fallback, and writes a manifest with intrinsic dimensions so the
 * page can set width/height and avoid layout shift.
 *
 *   node scripts/optimize-images.mjs
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';
import heicConvert from 'heic-convert';

const SRC = 'photos';
const OUT = 'assets/img';
const WIDTHS = [480, 960, 1600];
const CROP_WIDTHS = [480, 960];
const QUALITY = { webp: 78, jpg: 82 };

/**
 * Decode any supported source file into a sharp instance, EXIF rotation applied.
 *
 * Extensions here lie: every file in /photos named *.HEIC is in fact a JPEG
 * (magic bytes FF D8 FF). So sniff the buffer and ignore the filename.
 */
async function load(file) {
  const raw = await readFile(join(SRC, file));

  const isJpeg = raw[0] === 0xff && raw[1] === 0xd8 && raw[2] === 0xff;
  const isPng = raw.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  // ISO-BMFF container: bytes 4..8 are 'ftyp', brand follows.
  const isHeic = raw.subarray(4, 8).toString() === 'ftyp' &&
    ['heic', 'heix', 'hevc', 'mif1'].includes(raw.subarray(8, 12).toString());

  if (isHeic) {
    const jpg = await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.94 });
    return sharp(Buffer.from(jpg));
  }

  if (!isJpeg && !isPng) {
    throw new Error(`${file}: unrecognised format (starts with ${raw.subarray(0, 4).toString('hex')})`);
  }

  // rotate() with no argument applies the EXIF orientation tag, then clears it.
  return sharp(raw).rotate();
}

/**
 * Most product shots are flat-lays on bright green astroturf, which clashes
 * badly with the warm palette. Chroma-keying it out was tried and rejected:
 * nothing can distinguish grass from green *fabric*, so it discoloured the
 * merchandise. Instead, find the crop window containing the least grass.
 *
 * Returns an extract region at full-resolution coordinates, or null when the
 * image has no meaningful grass (portraits, the storefront) and should be
 * left alone.
 */
async function findLeastGrassCrop(image, meta, targetAspect = 4 / 5) {
  const SCAN = 200;
  const { data, info } = await image
    .clone()
    .resize({ width: SCAN })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const isGrass = new Uint8Array(info.width * info.height);
  let grassTotal = 0;
  for (let i = 0, p = 0; i < data.length; i += info.channels, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Astroturf is strongly green-dominant and reasonably bright.
    if (g - Math.max(r, b) > 22 && g > 60) {
      isGrass[p] = 1;
      grassTotal++;
    }
  }

  const grassFraction = grassTotal / isGrass.length;
  // Under ~8% grass there is nothing worth cropping away.
  if (grassFraction < 0.08) return null;

  // Largest window of the target aspect that fits inside the scan image.
  let winW = info.width;
  let winH = Math.round(winW / targetAspect);
  if (winH > info.height) {
    winH = info.height;
    winW = Math.round(winH * targetAspect);
  }
  // Shrink slightly so there is room to slide.
  winW = Math.round(winW * 0.88);
  winH = Math.round(winH * 0.88);

  const step = Math.max(2, Math.round(SCAN / 40));
  let best = null;

  for (let top = 0; top + winH <= info.height; top += step) {
    for (let left = 0; left + winW <= info.width; left += step) {
      let grass = 0;
      // Sample on a coarse lattice; exact counts are not needed to rank windows.
      for (let y = top; y < top + winH; y += 2) {
        const rowOffset = y * info.width;
        for (let x = left; x < left + winW; x += 2) {
          grass += isGrass[rowOffset + x];
        }
      }
      // Tie-break toward the centre so framing stays natural.
      const cx = left + winW / 2 - info.width / 2;
      const cy = top + winH / 2 - info.height / 2;
      const score = grass + Math.hypot(cx, cy) * 0.35;

      if (!best || score < best.score) best = { score, top, left };
    }
  }

  if (!best) return null;

  const scale = meta.width / info.width;
  const left = Math.round(best.left * scale);
  const top = Math.round(best.top * scale);
  return {
    left,
    top,
    // Clamp so the region can never run past the edge after rounding.
    width: Math.min(Math.round(winW * scale), meta.width - left),
    height: Math.min(Math.round(winH * scale), meta.height - top),
    grassFraction: Number(grassFraction.toFixed(3)),
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const files = (await readdir(SRC)).filter((f) =>
    ['.heic', '.jpg', '.jpeg', '.png'].includes(extname(f).toLowerCase())
  );

  const manifest = {};
  let savedBytes = 0;

  for (const file of files) {
    const name = basename(file, extname(file)).toLowerCase();
    const image = await load(file);
    const raw = await image.metadata();
    const srcBytes = (await readFile(join(SRC, file))).length;

    // metadata() reports dimensions BEFORE the EXIF rotation that rotate()
    // applies. Orientation 5-8 are the 90/270 cases, where the emitted image
    // has width and height swapped relative to what metadata() says.
    const swapped = raw.orientation >= 5 && raw.orientation <= 8;
    const meta = {
      ...raw,
      width: swapped ? raw.height : raw.width,
      height: swapped ? raw.width : raw.height,
    };

    const widths = WIDTHS.filter((w) => w <= meta.width).concat(
      WIDTHS.every((w) => w > meta.width) ? [meta.width] : []
    );

    // Track the largest WebP separately: a browser downloads exactly one
    // variant, so total-across-variants is not a meaningful saving.
    let largestWebp = 0;
    let outBytes = 0;
    for (const w of widths) {
      const resized = image.clone().resize({ width: w, withoutEnlargement: true });

      const webp = await resized.clone().webp({ quality: QUALITY.webp }).toBuffer();
      await writeFile(join(OUT, `${name}-${w}.webp`), webp);
      outBytes += webp.length;
      if (w === Math.max(...widths)) largestWebp = webp.length;

      // One JPG fallback at the largest size only — WebP is universal now, this
      // is belt-and-braces for very old Android stock browsers.
      if (w === Math.max(...widths)) {
        const jpg = await resized.clone().jpeg({ quality: QUALITY.jpg, mozjpeg: true }).toBuffer();
        await writeFile(join(OUT, `${name}-${w}.jpg`), jpg);
        outBytes += jpg.length;
      }
    }

    // A 4:5 crop framed to exclude as much astroturf as possible. This is the
    // variant the gallery uses; the full frame stays available for detail views.
    const crop = await findLeastGrassCrop(image, meta);
    if (crop) {
      const cropped = image.clone().extract(crop);
      // Always emit BOTH widths. Skipping the larger one when the crop is
      // narrower than 960 leaves the HTML pointing at a file that does not
      // exist — withoutEnlargement caps the pixels without dropping the file.
      for (const w of CROP_WIDTHS) {
        const buf = await cropped
          .clone()
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: QUALITY.webp })
          .toBuffer();
        await writeFile(join(OUT, `${name}-crop-${w}.webp`), buf);
      }
    }

    // Tiny blurred placeholder, inlined as a data URI to cover the image
    // while the real one streams in.
    const lqip = await image.clone().resize({ width: 20 }).webp({ quality: 40 }).toBuffer();

    const aspect = meta.width / meta.height;
    manifest[name] = {
      widths,
      width: meta.width,
      height: meta.height,
      aspect: Number(aspect.toFixed(4)),
      orientation: aspect > 1.05 ? 'landscape' : aspect < 0.95 ? 'portrait' : 'square',
      crop: crop ? { ...crop, widths: CROP_WIDTHS } : null,
      lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
    };

    savedBytes += srcBytes - largestWebp;
    const pct = Math.round((1 - largestWebp / srcBytes) * 100);
    console.log(
      `${file.padEnd(16)} ${String(meta.width).padStart(4)}x${String(meta.height).padEnd(4)} ${manifest[name].orientation.padEnd(9)}` +
        ` ${(srcBytes / 1024).toFixed(0).padStart(5)}KB -> ${(largestWebp / 1024).toFixed(0).padStart(4)}KB  ${String(pct).padStart(3)}% lighter`
    );
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(
    `\n${files.length} images processed into ${WIDTHS.join('/')}px WebP + JPG fallback.` +
      `\nLargest-variant saving (what a desktop visitor downloads): ${(savedBytes / 1024 / 1024).toFixed(1)}MB.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
