# Astrikos S!aP · Intelligence Command Center

A Three.js intro for the Tech Mahindra × Astrikos AI partnership: a spark, then one 3.2 s scene per dashboard (8 in all) with trending-keyword call-outs, then a globe that shatters into the dashboard links. The scenes keep cycling in the centre of the hub, with the 8 links down the sides.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Deploying on Netlify

`netlify.toml` is included: in Netlify choose **Add new site → Import an existing project**, pick this repo, and keep the detected settings (build `npm ci && npm run build`, publish `dist`, Node 22). Every push to `main` redeploys.

## Where things live

| What | File |
| --- | --- |
| Dashboard titles, flags, hot keywords, **links**, loop speed | `src/config.js` |
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
