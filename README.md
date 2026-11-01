# Intelligence Command Center · Tech Mahindra × Astrikos AI

A Three.js intro for the Tech Mahindra × Astrikos AI partnership: a spark, then one 3.2 s scene per dashboard (8 in all) with trending-keyword call-outs, then a globe that shatters into the dashboard links. The scenes keep cycling in the centre of the hub, with the 8 links down the sides.

```bash
npm install
npm run dev                # Tech Mahindra × Astrikos edition, http://localhost:5173
npm run dev:astrikos       # Astrikos-only edition
npm run build              # → dist/
npm run build:astrikos     # → dist-astrikos/
```

## Two editions

The same code builds two sites:

| | Tech Mahindra × Astrikos AI (default) | Astrikos only |
| --- | --- | --- |
| Logos | Tech Mahindra & Astrikos | Astrikos |
| Accent colour | Tech Mahindra red | Astrikos magenta |
| Dashboard links | the `techm-*` deployments | the Astrikos deployments |
| Build | `npm run build` → `dist/` | `npm run build:astrikos` → `dist-astrikos/` |

What differs lives in `src/edition.js`, the `link(techm, astrikos)` URLs in `src/config.js`, `vite.config.js`, and the `<!-- techm -->` blocks in `index.html` (left out of the Astrikos build, along with the Tech Mahindra logo files).

## Deploying

Both builds are plain static files with relative paths, so they work from a domain root or any sub-folder.

### Hostinger

1. Build: `npm run build` (and/or `npm run build:astrikos`).
2. In hPanel open **Websites → your site → File Manager**, go to `public_html` (or a sub-folder such as `public_html/astrikos`), and upload the **contents** of `dist/` (or `dist-astrikos/`), not the folder itself. Uploading a zip of the contents and choosing **Extract** is quickest.
3. `.htaccess` comes with the build: it caches the fingerprinted assets for a year and always revalidates `index.html`, so a re-upload shows at once.

To host both editions on one domain, put one in `public_html` and the other in a sub-folder.

### Netlify

`netlify.toml` builds the default edition: in Netlify choose **Add new site → Import an existing project**, pick this repo, and keep the detected settings (build `npm ci && npm run build`, publish `dist`, Node 22). For the Astrikos edition add a second site from the same repo with build command `npm ci && npm run build:astrikos` and publish directory `dist-astrikos`. Every push to `main` redeploys both.

## Where things live

| What | File |
| --- | --- |
| Dashboard titles, hot keywords, **links**, loop speed | `src/config.js` |
| Edition switch and brand accent | `src/edition.js` |
| Captions, #keyword chips and the 3D call-outs for each scene | `src/intro/story.js` |
| Every intro timing | `src/intro/timeline.js` |
| Each dashboard's 3D scene, camera and live effects | `src/intro/scenes.js` |
| Procedural structures (racks, cranes, factory, campus, airport, store, BMS…) | `src/intro/shapes.js` |
| Intro sequencing, finale and the hub scene loop | `src/intro/Intro.js` |
| Logos (official, from techmahindra.com and astrikos.ai) | `public/brand/` |

## Behaviour

- The intro plays once per browser session, then the hub opens directly. **Skip**: button, `Esc`, `Enter` or `Space`. **Replay**: the refresh icon or `R`.
- In the hub, hovering or focusing a link shows that dashboard's scene and pauses the auto-advance; the active link's bar counts down to the next scene.
- `prefers-reduced-motion` shows a still scene with no auto-advance. Without WebGL the links still work.
- Dev aids: `?intro` forces the intro; `?at=9.8` freezes it at that second for tuning.
