/* ============================================================================
   Hers Cottons — page behaviour.

   Structured so that every enhancement is optional. If this file fails to load
   or throws, the page remains a complete, readable, navigable shop site.
   ========================================================================= */

import { clothHero, weaveGallery, shouldEnhance, prefersReducedMotion } from './gl.js';
import { initReveals, revealNew, initTilt, initMagnetic } from './motion.js';

const select = (sel, root = document) => root.querySelector(sel);
const selectAll = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------------------------------------------------------------------------
   Navigation
   ------------------------------------------------------------------------ */

function initNav() {
  const nav = select('.nav');
  const toggle = select('.nav__toggle');
  const links = select('.nav__links');
  if (!nav) return;

  // Cheap scrolled-state flag, read once per frame rather than per scroll event.
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      nav.dataset.scrolled = String(window.scrollY > 60);
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (!toggle || !links) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    links.dataset.open = String(open);
    // Stop the page scrolling behind the full-screen mobile menu.
    document.body.style.overflow = open ? 'hidden' : '';
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
}

/* ---------------------------------------------------------------------------
   Opening hours — tells people whether the shop is open right now
   ------------------------------------------------------------------------ */

function initOpeningStatus() {
  const pill = select('[data-open-status]');
  const list = select('.hours');
  if (!list) return;

  // Asia/Kolkata regardless of where the visitor is; the shop is in Aligarh.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const today = get('weekday');
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));

  const row = selectAll('li', list).find((li) => li.dataset.day === today);
  if (row) row.setAttribute('data-today', '');

  if (!pill) return;

  const open = row?.dataset.open;
  const close = row?.dataset.close;

  let isOpen = false;
  if (open && close) {
    const toMinutes = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    isOpen = minutes >= toMinutes(open) && minutes < toMinutes(close);
  }

  pill.textContent = isOpen ? 'Open now' : 'Closed now';
  pill.style.color = isOpen ? 'var(--gold)' : 'var(--ink-soft)';
}

/* ---------------------------------------------------------------------------
   Instagram feed
   ------------------------------------------------------------------------ */

function feedItemMarkup(post) {
  const article = document.createElement('a');
  article.className = 'feed__item';
  article.href = post.permalink;
  article.target = '_blank';
  article.rel = 'noopener';

  const img = document.createElement('img');
  const largest = post.variants.at(-1);
  img.src = `assets/instagram/${largest.file}`;
  img.srcset = post.variants.map((v) => `assets/instagram/${v.file} ${v.width}w`).join(', ');
  img.sizes = '(max-width: 48rem) 50vw, 20rem';
  img.width = post.width;
  img.height = post.height;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = post.alt;
  if (post.lqip) img.style.backgroundImage = `url("${post.lqip}")`;
  img.style.backgroundSize = 'cover';

  article.append(img);

  if (post.caption) {
    const meta = document.createElement('div');
    meta.className = 'feed__meta';
    const caption = document.createElement('p');
    caption.className = 'feed__caption';
    caption.textContent = post.caption;
    meta.append(caption);
    article.append(meta);
  }

  // Screen readers should know this leaves the site.
  const note = document.createElement('span');
  note.className = 'visually-hidden';
  note.textContent = ' (opens Instagram in a new tab)';
  article.append(note);

  return article;
}

async function initFeed() {
  const grid = select('[data-feed]');
  if (!grid) return;

  const status = select('[data-feed-status]', grid);

  try {
    const res = await fetch('assets/instagram/feed.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`feed.json responded ${res.status}`);

    const { posts } = await res.json();
    if (!Array.isArray(posts) || !posts.length) throw new Error('feed is empty');

    const fragment = document.createDocumentFragment();
    posts.forEach((post) => fragment.append(feedItemMarkup(post)));

    grid.replaceChildren(fragment);

    // These tiles did not exist when the motion layer bound its handlers.
    revealNew(grid);
    initTilt('.feed__item');
  } catch (err) {
    // The fallback shop photos are already in the HTML — leave them in place
    // and simply drop the "loading" note.
    console.info('Instagram feed unavailable, showing shop photos instead:', err.message);
    status?.remove();
    grid.dataset.fallback = 'true';
  }
}

/* ---------------------------------------------------------------------------
   WebGL scenes
   ------------------------------------------------------------------------ */

/** Run a scene only while its section is on screen and the tab is visible. */
function bindVisibility(scene, element) {
  let onScreen = false;

  const update = () => {
    if (onScreen && !document.hidden) scene.play();
    else scene.pause();
  };

  const observer = new IntersectionObserver(
    ([entry]) => {
      onScreen = entry.isIntersecting;
      update();
    },
    { rootMargin: '120px' }
  );
  observer.observe(element);

  document.addEventListener('visibilitychange', update);
  return () => observer.disconnect();
}

async function initHero() {
  const stage = select('.hero__stage');
  const canvas = select('.hero__canvas');
  const still = select('.hero__still');
  if (!stage || !canvas || !still) return;

  if (!shouldEnhance()) {
    // Reduced motion still deserves the shader's look, just frozen.
    if (prefersReducedMotion() && document.createElement('canvas').getContext('webgl2')) {
      try {
        const scene = await clothHero(canvas, still.currentSrc || still.src);
        scene.renderStill();
        stage.dataset.gl = 'ready';
      } catch { /* leave the still image in place */ }
    }
    return;
  }

  try {
    const scene = await clothHero(canvas, still.currentSrc || still.src);
    stage.dataset.gl = 'ready';
    bindVisibility(scene, stage);
    scene.play();

    const hero = select('.hero');
    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          scene.setSettle(window.scrollY / Math.max(1, hero.offsetHeight));
          ticking = false;
        });
      },
      { passive: true }
    );
  } catch (err) {
    console.info('Hero cloth disabled:', err.message);
  }
}

async function initWeave() {
  const weave = select('.weave');
  const canvas = select('.weave__canvas');
  const track = select('.weave__track');
  if (!weave || !canvas || !track || !shouldEnhance()) return;

  const items = selectAll('.weave__item img', track).map((img) => ({
    src: img.currentSrc || img.src,
  }));
  if (items.length < 2) return;

  try {
    const scene = await weaveGallery(canvas, items);

    // Only hand over to the canvas once it has real layout. A zero-width
    // canvas would hide the DOM track and render nothing in its place.
    if (!canvas.clientWidth || !canvas.clientHeight) {
      scene.destroy();
      return;
    }

    weave.dataset.gl = 'ready';

    // The track stays in the accessibility tree (opacity alone does not remove
    // it) so its figcaptions are still announced, but it must not be a focus
    // stop — tabbing into an invisible scroller strands sighted keyboard users.
    track.setAttribute('tabindex', '-1');

    bindVisibility(scene, weave);
    scene.play();

    // The canvas is driven by the section's own progress through the viewport,
    // so the strip advances as the page scrolls.
    let ticking = false;
    const update = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const rect = weave.getBoundingClientRect();
        const total = rect.height + window.innerHeight;
        const progress = (window.innerHeight - rect.top) / total;
        scene.setProgress(progress);
        ticking = false;
      });
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  } catch (err) {
    console.info('Weave gallery disabled:', err.message);
  }
}

/* ---------------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------------ */

function boot() {
  initNav();
  initReveals();
  initTilt();
  initMagnetic();
  initOpeningStatus();
  initFeed();
  initHero();
  initWeave();

  document.documentElement.dataset.jsReady = 'true';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
