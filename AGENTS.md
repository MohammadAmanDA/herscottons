# OpenCode Agent Instructions — Hers Cottons 3D Retail Showcase

This document outlines codebase conventions, the core 3D and API architecture, and specific pitfalls for building the Hers Cottons 3D Showcase.

---

## 🚨 Critical Gotchas (Read Before Coding)

1. **HEIC Image Format**: The `/photos` directory contains `.HEIC` files (e.g., `photo2.HEIC`, `photo9.HEIC`). **Browsers cannot natively render HEIC.** Every HEIC image must be converted to optimized WebP/JPG before use in the UI.
2. **Instagram Token Lifecycle**: Instagram Basic Display long-lived access tokens expire every 60 days. The application architecture must use serverless refresh logic or an automated token-renewal workflow to prevent feed breakage.
3. **Spline Loader Overhead**: Spline runtime scenes (`.splinecode`) can be heavy. Always implement a lightweight Suspense loader with an elegant SVG placeholder (such as our heritage mandala) while the WebGL context compiles.

---

## 🛠️ Technical Architecture & Stack

```
                  ┌──────────────────────────────────────────────────┐
                  │                 Vercel / Netlify                 │
                  │   - Fast global CDN (loads 3D assets/images)     │
                  │   - Serverless Functions (secure API requests)   │
                  └────────┬────────────────────────────────┬────────┘
                           │                                │
┌──────────────────────────▼──────────────────────┐  ┌──────▼───────────────────────────┐
│              Frontend Web App                   │  │     Instagram Basic Display      │
│  - React + Vite (Fast HMR, optimized builds)    │  │  - Vercel function manages token │
│  - Tailwind CSS + Framer Motion (Fluid layouts) │  │  - Fallback: scheduled Action     │
│  - @splinetool/react-spline (Interactive 3D)    │  │    scrapes media -> posts.json   │
└─────────────────────────────────────────────────┘  └──────────────────────────────────┘
```

### 1. 3D Engine: Spline Integration
* **Stack**: `@splinetool/react-spline` for interactive scenes, backed by Three.js/R3F only for custom shader support if needed.
* **Aesthetics**: Fully responsive 3D scenes (rotating traditional motifs, smooth mouse-follow gold dust, floating elegant textile models) designed in Spline's visual editor.
* **Optimization**:
  * Utilize low-polygon meshes and compressed textures in Spline.
  * Lazy-load the Spline scene component using React Suspense.
  * Provide a high-quality WebP static layout fallback for older mobile devices.

### 2. Instagram Basic Display Integration
* **Standalone Utility**: Build and verify `/scripts/test-instagram.js` before integrating with the frontend UI.
* **Data Flow**:
  1. React component calls local serverless function `/api/instagram`.
  2. Serverless function queries the Instagram Graph API with a secure environment variable `INSTAGRAM_ACCESS_TOKEN`.
  3. Returns a clean JSON payload mapping images, reels, and video permalinks.
  4. Drops back to pre-rendered static `posts.json` if the API limits are hit or the token expires.

---

## 📂 Project Layout

```text
hers-cottons-3d/
├── .github/workflows/   # Daily Instagram cache updater
├── scripts/
│   ├── test-instagram.js # Isolated API test utility
│   └── convert-heic.js   # HEIC to WebP/JPG utility
├── public/               # static 3D models and fallback assets
└── src/
    ├── components/
    │   ├── 3D/           # Spline canvas wrappers & load states
    │   ├── Layout/       # Heritage, Story, InstagramGrid, Visit
    │   └── UI/           # Custom Cursor, Luxury Loader, Nav
    └── hooks/            # useInstagramFeed.js
```

---

## 🚀 Reconstruction Roadmap (Step-by-Step)

### Phase 1: Scaffolding & Setup
1. Initialize a Vite-React app (`npm create vite@latest . -- --template react`).
2. Install Tailwind CSS, Framer Motion, GSAP, `@splinetool/react-spline`.
3. Add a script to handle HEIC conversions to optimized WebP formats.

### Phase 2: Standalone Instagram Testing
1. Implement and verify `/scripts/test-instagram.js` with the active Instagram Token.
2. Confirm dynamic media structure and field mappings work perfectly.

### Phase 3: Interactive 3D Canvas
1. Load and integrate the primary Spline responsive scene into React.
2. Build custom WebGL/SVG fallback layers for low-end devices and loading states.

### Phase 4: Full UI Implementation
1. Port static content from the original landing page (Heritage, Story, Founders, Visit).
2. Wire up the dynamic Instagram grid component to use `useInstagramFeed` hook.
3. Polish the custom animations, transition curves, and cursors.
