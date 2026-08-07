/* ============================================================================
   Motion layer — scroll reveals, 3D tilt, and spring micro-interactions.

   No animation library. Every effect here is CSS doing the work; JavaScript
   only supplies numbers (pointer position, stagger index) as custom properties
   and gets out of the way. That keeps animation on the compositor and costs
   nothing in payload, which matters on a 4G connection.

   Everything is off under prefers-reduced-motion, and tilt is off on touch
   devices where there is no hover to respond to.
   ========================================================================= */

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------------------------------------------------------------------------
   Scroll reveals, with stagger
   ------------------------------------------------------------------------ */

/**
 * Fade-in-up on enter. Children of a [data-stagger] container get an
 * incrementing index so they arrive one after another rather than together.
 */
export function initReveals() {
  const targets = [...document.querySelectorAll('[data-reveal]')];

  // Assign stagger indices up front so the delay is pure CSS.
  document.querySelectorAll('[data-stagger]').forEach((group) => {
    const step = Number(group.dataset.stagger) || 1;
    [...group.children].forEach((child, i) => {
      child.style.setProperty('--i', String(i * step));
      if (!child.hasAttribute('data-reveal')) child.setAttribute('data-reveal', '');
    });
  });

  // Re-query: the loop above may have added new targets.
  const all = new Set([...targets, ...document.querySelectorAll('[data-reveal]')]);

  if (reduced()) {
    all.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );

  all.forEach((el) => observer.observe(el));
}

/** Reveal newly injected nodes, e.g. the Instagram feed after it loads. */
export function revealNew(container, step = 1) {
  const children = [...container.children];
  children.forEach((child, i) => {
    child.style.setProperty('--i', String(i * step));
    child.setAttribute('data-reveal', '');
  });

  if (reduced()) {
    children.forEach((c) => c.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );
  children.forEach((c) => observer.observe(c));
}

/* ---------------------------------------------------------------------------
   3D tilt
   ------------------------------------------------------------------------ */

/**
 * Cursor-tracked tilt with lift, scale and a moving sheen.
 *
 * Pointer position is written to --px/--py and the transform is composed in
 * CSS. Reads of getBoundingClientRect are cached per hover and refreshed on
 * scroll, so pointermove never forces a synchronous layout.
 */
export function initTilt(selector = '[data-tilt]', maxDeg = 9) {
  const cards = [...document.querySelectorAll(selector)];
  if (!cards.length || reduced() || !canHover()) return;

  for (const card of cards) {
    let rect = null;
    let frame = 0;
    let pending = null;

    const measure = () => {
      rect = card.getBoundingClientRect();
    };

    const apply = () => {
      frame = 0;
      if (!pending || !rect) return;
      const { clientX, clientY } = pending;

      // -0.5 .. 0.5 from the centre of the card.
      const px = (clientX - rect.left) / rect.width - 0.5;
      const py = (clientY - rect.top) / rect.height - 0.5;

      // Written as finished degree values. Passing bare numbers and doing the
      // multiplication in CSS does not work: calc() cannot resolve the types
      // of two unregistered custom properties, and the rotation silently
      // computes to zero.
      card.style.setProperty('--ry', `${(px * maxDeg).toFixed(3)}deg`);
      card.style.setProperty('--rx', `${(-py * maxDeg).toFixed(3)}deg`);
      // Sheen follows the cursor in percentage terms.
      card.style.setProperty('--sx', `${((clientX - rect.left) / rect.width) * 100}%`);
      card.style.setProperty('--sy', `${((clientY - rect.top) / rect.height) * 100}%`);
    };

    card.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      measure();
      card.dataset.tilting = 'true';
      pending = e;
      apply();
    });

    card.addEventListener(
      'pointermove',
      (e) => {
        if (card.dataset.tilting !== 'true') return;
        pending = e;
        // Coalesce to one write per frame.
        if (!frame) frame = requestAnimationFrame(apply);
      },
      { passive: true }
    );

    const reset = () => {
      card.dataset.tilting = 'false';
      cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    };

    card.addEventListener('pointerleave', reset);
    // A card can be scrolled out from under a stationary cursor.
    card.addEventListener('pointercancel', reset);
    window.addEventListener('scroll', () => { if (card.dataset.tilting === 'true') measure(); }, { passive: true });

    // Keyboard users get the lift without the cursor-tracked rotation.
    card.addEventListener('focus', () => { card.dataset.tilting = 'focus'; });
    card.addEventListener('blur', reset);
  }
}

/* ---------------------------------------------------------------------------
   Magnetic buttons
   ------------------------------------------------------------------------ */

/**
 * Buttons drift a few pixels toward the cursor, then spring back on leave.
 * Deliberately small — the spring in the CSS supplies the character, and a
 * large offset makes a control feel evasive rather than responsive.
 */
export function initMagnetic(selector = '[data-magnetic]') {
  const els = [...document.querySelectorAll(selector)];
  if (!els.length || reduced() || !canHover()) return;

  const STRENGTH = 0.22;

  for (const el of els) {
    let rect = null;
    let frame = 0;

    el.addEventListener('pointerenter', () => { rect = el.getBoundingClientRect(); });

    el.addEventListener(
      'pointermove',
      (e) => {
        if (!rect) return;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const dx = (e.clientX - (rect.left + rect.width / 2)) * STRENGTH;
          const dy = (e.clientY - (rect.top + rect.height / 2)) * STRENGTH;
          el.style.setProperty('--mx', `${dx.toFixed(2)}px`);
          el.style.setProperty('--my', `${dy.toFixed(2)}px`);
        });
      },
      { passive: true }
    );

    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      el.style.setProperty('--mx', '0px');
      el.style.setProperty('--my', '0px');
    };

    el.addEventListener('pointerleave', reset);
    el.addEventListener('blur', reset);
  }
}
