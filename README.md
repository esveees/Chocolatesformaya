# Bueno, for you ♡ — Interactive 3D Chocolate Experience

A romantic, cinematic Three.js experience: pick how many Kinder Bueno chocolates
to make, watch them unwrap in real 3D, then eat each of the 4 pieces one at a time.

## Running it

This uses ES modules and loads a texture via `fetch`, so it needs to be served
over HTTP (not opened directly as a `file://` URL).

**Quick local preview:**
```bash
cd choco
python3 -m http.server 8080
# open http://localhost:8080
```

**GitHub Pages:** push this folder's contents to a repo and enable Pages on the
root (or `/docs`) — everything is relative paths, no build step required.

## Structure

```
index.html            loading → quantity → 3D scene screens
css/style.css          romantic dark-wine theme, responsive
js/main.js              Three.js scene, camera rig, state machine, UI wiring
js/chocolate.js         per-chocolate entity: wrapper + bar + open/eat animations
js/chocolateFactory.js  procedural geometry (lobed bar, bite-carving, wrapper)
js/crumbs.js            instanced crumb particle burst on each bite
js/tween.js             tiny dependency-free tween/easing engine
js/audio.js             Web Audio synthesized SFX + ambient pad (no mp3 files)
js/ambient2d.js         soft drifting particles behind the pre-3D screens
assets/wrapper.png      your uploaded Kinder Bueno packaging artwork
```

## Notes on assets

- **Wrapper artwork**: your uploaded Kinder Bueno packaging image is used
  directly as the texture on the wrapped chocolate (mapped across both halves).
- **Chocolate bar geometry**: no `.glb`/`.gltf` model was provided, so the bar
  is built as real 3D geometry — four puffy lobes with a drizzle line on top —
  shaped to match the reference renders you shared. If you later have a GLB of
  the bar, swap the `_buildBar()` method in `js/chocolate.js` to load it with
  `GLTFLoader` instead.
- **Sound**: no audio files were provided, so all effects (tap, unwrap, bite,
  crumbs, chime) and the ambient pad are synthesized live with the Web Audio
  API — zero missing-asset risk, and the ♪ button mutes/unmutes everything.
- **Bite mark**: each bite carves a real concave indentation into the piece's
  geometry (vertex math, no CSG library needed), so it's genuine 3D, not a
  texture swap.

## Verified against the brief

Quantity selector (1–10) drives chocolate count · natural scattered layout, not
a grid · drag/swipe/pinch/scroll camera via OrbitControls · raycast tap
detection (no fake HTML hit-boxes) · full open animation (react → approach →
rotate → unwrap → reveal → wrapper aside) · exactly 4 independently-eatable
pieces per bar with a real bite + crumbs + counter · every chocolate tracks its
own wrapped/opened/eaten state independently · cinematic camera intro/focus/
settle with damping · dark romantic theme with particles and soft glow ·
responsive layout/camera/scale by screen size · reused geometry/materials
where possible · loading screen with progress and error handling.
