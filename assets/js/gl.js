/* ============================================================================
   Hand-written WebGL2 for the hero cloth and the weave gallery.

   Deliberately dependency-free. Three.js would be ~600KB over the wire for two
   textured planes, and this shop's customers are on mid-range Android over 4G.
   This file is a few KB and does the same job better.

   Everything here is progressive enhancement: if WebGL2 is missing, the device
   looks underpowered, or the visitor prefers reduced motion, none of it runs
   and the plain HTML underneath is what people get.
   ========================================================================= */

/** True when animation should be suppressed entirely. */
export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Decide whether this device should get the WebGL treatment at all.
 *
 * The effects are decoration. On a cheap phone, on a metered connection, or in
 * Data Saver mode, the right answer is a fast static page.
 */
export function shouldEnhance() {
  if (prefersReducedMotion()) return false;

  const net = navigator.connection;
  if (net) {
    if (net.saveData) return false;
    if (['slow-2g', '2g', '3g'].includes(net.effectiveType)) return false;
  }

  // deviceMemory is Chromium-only; absence is not evidence of a weak device.
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return false;

  const probe = document.createElement('canvas');
  return Boolean(probe.getContext('webgl2'));
}

/* ---------------------------------------------------------------------------
   Minimal GL helpers
   ------------------------------------------------------------------------ */

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function program(gl, vertexSource, fragmentSource) {
  const vs = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link failed: ${log}`);
  }
  return prog;
}

/** Collect uniform locations up front so the render loop stays allocation-free. */
function uniforms(gl, prog, names) {
  return Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));
}

function loadTexture(gl, url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // Web images are top-left origin; GL samples bottom-left.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      resolve({ tex, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error(`Could not load texture: ${url}`));
    img.src = url;
  });
}

/**
 * Size the drawing buffer to the element, capping device pixel ratio.
 * Uncapped DPR on a 3x phone screen means rendering 9x the pixels for no
 * visible gain — it is the single most common cause of jank on mobile.
 */
function resize(gl, canvas, maxDpr = 2) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    return true;
  }
  return false;
}

/* ---------------------------------------------------------------------------
   Shared vertex shader — a single oversized triangle covering the viewport.
   Cheaper than a quad: one primitive, no diagonal seam.
   ------------------------------------------------------------------------ */

const FULLSCREEN_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

/* ---------------------------------------------------------------------------
   HERO — woven cloth
   ------------------------------------------------------------------------ */

const CLOTH_FS = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_tex;
uniform vec2  u_resolution;
uniform vec2  u_texSize;
uniform float u_time;
uniform vec2  u_pointer;      // normalised, in viewport space
uniform float u_pointerAmp;   // decays to 0 when the pointer stops
uniform float u_settle;       // 0 at rest, 1 when scrolled past the hero

/* Reproduce CSS background-size: cover, so the photo is never distorted. */
vec2 coverUv(vec2 uv, vec2 res, vec2 texSize) {
  float screenAspect = res.x / res.y;
  float imageAspect  = texSize.x / texSize.y;
  vec2 scale = screenAspect > imageAspect
    ? vec2(1.0, imageAspect / screenAspect)
    : vec2(screenAspect / imageAspect, 1.0);
  return (uv - 0.5) * scale + 0.5;
}

/* Two crossed sine families standing in for warp and weft threads. */
float weave(vec2 uv, float t) {
  float warp = sin(uv.y * 190.0 + sin(uv.x * 8.0 + t * 0.3) * 2.0);
  float weft = sin(uv.x * 190.0 + sin(uv.y * 8.0 - t * 0.24) * 2.0);
  return warp * weft;
}

void main() {
  vec2 uv = coverUv(v_uv, u_resolution, u_texSize);

  /* Ambient drift: the cloth breathes even when nothing is happening. */
  float drift = 1.0 - u_settle;
  vec2 sway = vec2(
    sin(uv.y * 6.2 + u_time * 0.42) * 0.0042,
    cos(uv.x * 5.1 + u_time * 0.31) * 0.0034
  ) * drift;

  /* Pointer ripple, falling off with distance so it reads as fabric being
     pushed rather than the whole image sliding. */
  vec2 toPointer = v_uv - u_pointer;
  toPointer.x *= u_resolution.x / u_resolution.y;
  float dist = length(toPointer);
  float ripple = sin(dist * 34.0 - u_time * 3.4) * exp(-dist * 7.0) * u_pointerAmp;
  vec2 push = normalize(toPointer + 1e-5) * ripple * 0.02;

  vec2 finalUv = uv + sway + push;

  /* Chromatic split scaled by how hard the cloth is being disturbed —
     invisible at rest, a soft prismatic edge under the cursor. */
  float split = (abs(ripple) * 0.9 + length(sway) * 6.0) * 0.006;
  vec3 color = vec3(
    texture(u_tex, finalUv + vec2(split, 0.0)).r,
    texture(u_tex, finalUv).g,
    texture(u_tex, finalUv - vec2(split, 0.0)).b
  );

  /* Thread texture, and a matching light response so the weave catches. */
  float threads = weave(finalUv, u_time) * 0.5 + 0.5;
  color *= 0.965 + threads * 0.07 * drift;
  color += vec3(0.85, 0.68, 0.45) * ripple * 0.16;

  /* Vignette, so the display type at the centre always holds. */
  float vignette = smoothstep(1.15, 0.28, length(v_uv - 0.5));
  color *= 0.72 + vignette * 0.28;

  fragColor = vec4(color, 1.0);
}`;

export async function clothHero(canvas, textureUrl) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    powerPreference: 'low-power',
  });
  if (!gl) throw new Error('WebGL2 unavailable');

  const prog = program(gl, FULLSCREEN_VS, CLOTH_FS);
  const u = uniforms(gl, prog, [
    'u_tex', 'u_resolution', 'u_texSize', 'u_time', 'u_pointer', 'u_pointerAmp', 'u_settle',
  ]);

  const { tex, width, height } = await loadTexture(gl, textureUrl);

  // WebGL2 core requires a bound VAO even when pulling vertices from gl_VertexID.
  gl.bindVertexArray(gl.createVertexArray());
  gl.useProgram(prog);
  gl.uniform1i(u.u_tex, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform2f(u.u_texSize, width, height);

  const state = {
    pointer: [0.5, 0.5],
    target: [0.5, 0.5],
    amp: 0,
    settle: 0,
    running: false,
    destroyed: false,
  };

  const onPointer = (e) => {
    const r = canvas.getBoundingClientRect();
    state.target = [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height];
    state.amp = 1;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  let raf = 0;
  const start = performance.now();

  function frame(now) {
    if (state.destroyed) return;

    resize(gl, canvas);

    // Ease the pointer so a fast flick does not snap the ripple across screen.
    state.pointer[0] += (state.target[0] - state.pointer[0]) * 0.08;
    state.pointer[1] += (state.target[1] - state.pointer[1]) * 0.08;
    state.amp *= 0.955;

    gl.uniform1f(u.u_time, (now - start) / 1000);
    gl.uniform2f(u.u_resolution, canvas.width, canvas.height);
    gl.uniform2f(u.u_pointer, state.pointer[0], state.pointer[1]);
    gl.uniform1f(u.u_pointerAmp, state.amp);
    gl.uniform1f(u.u_settle, state.settle);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (state.running) raf = requestAnimationFrame(frame);
  }

  const api = {
    /** Fraction of the hero scrolled past, 0..1. Flattens the cloth as you go. */
    setSettle(v) { state.settle = Math.min(1, Math.max(0, v)); },

    play() {
      if (state.running || state.destroyed) return;
      state.running = true;
      raf = requestAnimationFrame(frame);
    },

    pause() {
      state.running = false;
      cancelAnimationFrame(raf);
    },

    /** Draw exactly one frame — used under prefers-reduced-motion. */
    renderStill() { frame(performance.now()); },

    destroy() {
      state.destroyed = true;
      api.pause();
      window.removeEventListener('pointermove', onPointer);
      gl.deleteTexture(tex);
      gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };

  return api;
}

/* ---------------------------------------------------------------------------
   WEAVE GALLERY — a curved strip of fabric planes driven by scroll
   ------------------------------------------------------------------------ */

const GALLERY_VS = `#version 300 es
in vec2 a_position;   // -0.5..0.5 across the plane
out vec2 v_uv;
out float v_depth;

uniform vec2  u_resolution;
uniform float u_offset;   // plane centre, in plane-widths from viewport centre
uniform float u_planeW;   // plane width in clip units
uniform float u_planeH;
uniform float u_velocity;

void main() {
  v_uv = a_position + 0.5;

  vec2 pos = a_position;
  float centre = u_offset;

  /* Bend the strip: planes away from centre rotate back and sink slightly,
     which reads as a cylinder without any perspective matrix. */
  float curve = centre + pos.x * u_planeW;
  float depth = cos(clamp(curve, -1.6, 1.6)) * 0.5 + 0.5;
  v_depth = depth;

  /* Scroll velocity stretches each plane along its travel axis. */
  float stretch = 1.0 + abs(u_velocity) * 0.22;

  vec2 clip;
  clip.x = (centre + pos.x * u_planeW * stretch);
  clip.y = pos.y * u_planeH * (0.86 + depth * 0.14) - (1.0 - depth) * 0.06;

  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const GALLERY_FS = `#version 300 es
precision highp float;

in vec2 v_uv;
in float v_depth;
out vec4 fragColor;

uniform sampler2D u_tex;
uniform float u_velocity;
uniform float u_time;

void main() {
  /* Displace horizontally with velocity, strongest at the vertical middle,
     so the fabric appears to drag as the strip moves. */
  float wave = sin(v_uv.y * 3.14159);
  vec2 uv = v_uv + vec2(u_velocity * 0.05 * wave, 0.0);

  float split = abs(u_velocity) * 0.014;
  vec3 color = vec3(
    texture(u_tex, uv + vec2(split, 0.0)).r,
    texture(u_tex, uv).g,
    texture(u_tex, uv - vec2(split, 0.0)).b
  );

  /* Planes at the edge of the arc fall back toward the page colour. */
  color = mix(vec3(0.937, 0.894, 0.839), color, 0.35 + v_depth * 0.65);

  /* Discard beyond the plane so the curve does not smear at the edges. */
  float inside = step(0.0, uv.x) * step(uv.x, 1.0);
  if (inside < 0.5) discard;

  fragColor = vec4(color, 1.0);
}`;

export async function weaveGallery(canvas, items) {
  const gl = canvas.getContext('webgl2', {
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  if (!gl) throw new Error('WebGL2 unavailable');

  const prog = program(gl, GALLERY_VS, GALLERY_FS);
  const u = uniforms(gl, prog, [
    'u_tex', 'u_resolution', 'u_offset', 'u_planeW', 'u_planeH', 'u_velocity', 'u_time',
  ]);

  // A subdivided grid so the vertex curve is smooth rather than faceted.
  const COLS = 24;
  const ROWS = 2;
  const verts = [];
  const indices = [];
  for (let y = 0; y <= ROWS; y++) {
    for (let x = 0; x <= COLS; x++) {
      verts.push(x / COLS - 0.5, y / ROWS - 0.5);
    }
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const a = y * (COLS + 1) + x;
      const b = a + COLS + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_position');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  const textures = await Promise.all(items.map((item) => loadTexture(gl, item.src)));

  gl.useProgram(prog);
  gl.uniform1i(u.u_tex, 0);
  gl.activeTexture(gl.TEXTURE0);

  const state = {
    scroll: 0,
    target: 0,
    velocity: 0,
    running: false,
    destroyed: false,
  };

  let raf = 0;
  const start = performance.now();

  function frame(now) {
    if (state.destroyed) return;

    resize(gl, canvas);

    const previous = state.scroll;
    state.scroll += (state.target - state.scroll) * 0.09;
    state.velocity = state.scroll - previous;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const aspect = canvas.width / canvas.height;
    const planeW = 0.52;
    const planeH = Math.min(1.7, (planeW * aspect) / 0.8); // keep 4:5 portrait
    const gap = 0.62;

    gl.uniform2f(u.u_resolution, canvas.width, canvas.height);
    gl.uniform1f(u.u_planeW, planeW);
    gl.uniform1f(u.u_planeH, planeH);
    gl.uniform1f(u.u_velocity, state.velocity * 8);
    gl.uniform1f(u.u_time, (now - start) / 1000);

    textures.forEach((texture, i) => {
      const offset = i * gap - state.scroll;
      // Skip planes fully outside the viewport.
      if (Math.abs(offset) > 1 + planeW) return;
      gl.uniform1f(u.u_offset, offset);
      gl.bindTexture(gl.TEXTURE_2D, texture.tex);
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    });

    if (state.running) raf = requestAnimationFrame(frame);
  }

  const api = {
    /** Progress through the strip, 0..1. */
    setProgress(p) {
      const span = (items.length - 1) * 0.62;
      state.target = Math.min(1, Math.max(0, p)) * span - span / 2 + 0;
    },
    play() {
      if (state.running || state.destroyed) return;
      state.running = true;
      raf = requestAnimationFrame(frame);
    },
    pause() {
      state.running = false;
      cancelAnimationFrame(raf);
    },
    renderStill() { frame(performance.now()); },
    destroy() {
      state.destroyed = true;
      api.pause();
      textures.forEach((t) => gl.deleteTexture(t.tex));
      gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };

  return api;
}
