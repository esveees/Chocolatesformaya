import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { Chocolate } from './chocolate.js';
import { CrumbSystem } from './crumbs.js';
import { startAmbient2D } from './ambient2d.js';
import { audio } from './audio.js';
import { tween, stepTweens, Easing } from './tween.js';

// ----------------------------------------------------------------------
// DOM references
// ----------------------------------------------------------------------
const el = {
  loadingScreen: document.getElementById('loading-screen'),
  loadingBarFill: document.getElementById('loading-bar-fill'),
  loadingError: document.getElementById('loading-error'),
  retryBtn: document.getElementById('retry-btn'),
  quantityScreen: document.getElementById('quantity-screen'),
  sceneRoot: document.getElementById('scene-root'),
  qtyValue: document.getElementById('qty-value'),
  qtyMinus: document.getElementById('qty-minus'),
  qtyPlus: document.getElementById('qty-plus'),
  makeBtn: document.getElementById('make-btn'),
  glCanvas: document.getElementById('gl'),
  backBtn: document.getElementById('back-btn'),
  hudTitle: document.getElementById('hud-title'),
  soundBtn: document.getElementById('sound-btn'),
  iconSoundOn: document.getElementById('icon-sound-on'),
  iconSoundOff: document.getElementById('icon-sound-off'),
  piecesPill: document.getElementById('pieces-pill'),
  piecesLabel: document.getElementById('pieces-label'),
  hint: document.getElementById('hint'),
  finishedToast: document.getElementById('finished-toast'),
};

startAmbient2D('bg-particles');

// ----------------------------------------------------------------------
// App state
// ----------------------------------------------------------------------
const app = {
  quantity: 3,
  chocolates: [],
  focused: null, // Chocolate currently focused/opened, or null in overview
  ready: false,
  busy: false,
};

let scene, camera, renderer, controls, clock;
let webglReady = false;
let crumbSystem, dustPoints;
let overviewDistance = 3.2;
const sceneCenter = new THREE.Vector3(0, 0.15, 0);

// ----------------------------------------------------------------------
// Loading
// ----------------------------------------------------------------------
function setLoadingProgress(p) {
  el.loadingBarFill.style.width = `${Math.min(100, Math.max(0, p))}%`;
}

async function boot() {
  let fakeProgress = 0;
  const fakeInterval = setInterval(() => {
    fakeProgress = Math.min(78, fakeProgress + Math.random() * 10);
    setLoadingProgress(fakeProgress);
  }, 160);

  try {
    const [wrapperTexture] = await Promise.all([
      loadTexture('assets/wrapper.png'),
      new Promise(res => setTimeout(res, 900)), // minimum splash time for the mood
    ]);

    clearInterval(fakeInterval);
    setLoadingProgress(100);

    app.wrapperTexture = wrapperTexture;
    initThree();

    if (!webglReady) {
      throw new Error('WebGL is unavailable in this browser/device.');
    }

    await new Promise(res => setTimeout(res, 260));
    switchScreen(el.loadingScreen, el.quantityScreen);
    app.ready = true;
  } catch (err) {
    clearInterval(fakeInterval);
    console.error(err);
    el.loadingError.hidden = false;
    el.loadingError.textContent = err?.message || "Something didn't load quite right — please refresh to try again.";
    el.retryBtn.hidden = false;
  }
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      resolve(tex);
    }, undefined, (err) => reject(new Error(`Failed to load ${url}`)));
  });
}

function switchScreen(from, to) {
  from.classList.add('fading-out');
  setTimeout(() => {
    from.classList.remove('active', 'fading-out');
    to.classList.add('active');
  }, 500);
}

// ----------------------------------------------------------------------
// Three.js scene setup
// ----------------------------------------------------------------------
function initThree() {
  // Some mobile browsers expose a WebGL context but fail when the renderer
  // requests an advanced feature set. Test the canvas first and use a
  // conservative renderer configuration so the page does not silently stop
  // after the quantity screen.
  const testCanvas = document.createElement('canvas');
  const testGL = testCanvas.getContext('webgl2', { antialias: true, alpha: false }) ||
                 testCanvas.getContext('webgl', { antialias: true, alpha: false }) ||
                 testCanvas.getContext('experimental-webgl');
  if (!testGL) {
    webglReady = false;
    return;
  }
  webglReady = true;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0306);
  scene.fog = new THREE.FogExp2(0x0c0306, 0.11);

  camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 60);
  camera.position.set(0, 1.6, 4.6);

  renderer = new THREE.WebGLRenderer({
    canvas: el.glCanvas,
    antialias: window.devicePixelRatio < 1.75,
    alpha: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Environment map for soft, believable reflections. This is optional:
  // if a mobile GPU cannot create it, the chocolates still render normally.
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    app.envMap = envRT.texture;
  } catch (e) {
    console.warn('Environment map unavailable, continuing without it.', e);
    app.envMap = null;
  }

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    app.busy = true;
    el.loadingError.hidden = false;
    el.loadingError.textContent = 'The 3D view lost its graphics context. Please reload the page.';
  }, { passive: false });

  // ---- lighting: warm key, soft cool fill, low ambient ----
  const key = new THREE.SpotLight(0xffcf9e, 3.2, 12, Math.PI / 5, 0.5, 1.4);
  key.position.set(2.4, 3.6, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0025;
  key.target.position.set(0, 0.2, 0);
  scene.add(key, key.target);

  const fill = new THREE.PointLight(0x8a3550, 1.1, 10, 2);
  fill.position.set(-2.2, 1.2, -1.4);
  scene.add(fill);

  const rim = new THREE.PointLight(0xd9a860, 0.9, 8, 2);
  rim.position.set(0.5, 1.8, -2.4);
  scene.add(rim);

  const hemi = new THREE.HemisphereLight(0x2a0912, 0x0c0306, 0.35);
  scene.add(hemi);

  // ---- ground shadow-catcher ----
  const groundGeo = new THREE.CircleGeometry(6, 48);
  const groundMat = new THREE.ShadowMaterial({ opacity: 0.45 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  ground.receiveShadow = true;
  scene.add(ground);

  // subtle warm disc glow under the cluster
  const glowGeo = new THREE.CircleGeometry(2.6, 48);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x4a0f1e, transparent: true, opacity: 0.35 });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.39;
  scene.add(glow);

  crumbSystem = new CrumbSystem(scene);
  dustPoints = buildDust();
  scene.add(dustPoints);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.9;
  controls.maxDistance = 8;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.minPolarAngle = Math.PI * 0.15;
  controls.target.copy(sceneCenter);
  controls.enablePan = false;
  controls.screenSpacePanning = false;
  controls.panSpeed = 0.6;
  controls.rotateSpeed = 0.75;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.update();

  clock = new THREE.Clock();

  window.addEventListener('resize', onResize);
  setupPointerInteraction();

  renderer.setAnimationLoop(renderLoop);
}

function buildDust() {
  const N = 90;
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 1.2 + Math.random() * 3.2;
    const a = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = Math.random() * 2.6 - 0.3;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xd9a860, size: 0.018, transparent: true, opacity: 0.35,
    sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.basePositions = positions.slice();
  return pts;
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (app.focused === null && app.chocolates.length) {
    recomputeOverviewCamera(true);
  }
}

// ----------------------------------------------------------------------
// Layout: a natural loose cluster, never a flat grid
// ----------------------------------------------------------------------
function layoutChocolates(count) {
  const positions = [];
  const isMobile = window.innerWidth < 720;
  const arcSpan = Math.min(Math.PI * 0.95, 0.55 + count * 0.16);
  const baseRadius = isMobile ? 0.62 : 0.85;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = -arcSpan / 2 + t * arcSpan + (Math.random() - 0.5) * 0.18;
    const radiusJitter = (Math.random() - 0.5) * 0.35;
    const radius = baseRadius + radiusJitter + (i % 2 === 0 ? 0.12 : -0.08);
    const heightJitter = (Math.random() - 0.5) * 0.22;

    const x = Math.sin(angle) * radius;
    const z = -Math.cos(angle) * radius * 0.55 + (Math.random() - 0.5) * 0.2;
    const y = heightJitter;

    positions.push({
      pos: new THREE.Vector3(x, y, z),
      rotY: angle * 0.6 + (Math.random() - 0.5) * 0.6,
    });
  }
  return positions;
}

function recomputeOverviewCamera(instant = false) {
  const count = app.chocolates.length || 1;
  const isMobile = window.innerWidth < 720;
  const dist = THREE.MathUtils.clamp((isMobile ? 3.0 : 2.6) + count * 0.16, 2.6, isMobile ? 6.4 : 5.6);
  overviewDistance = dist;
  const height = isMobile ? 1.35 : 1.5;
  const targetPos = new THREE.Vector3(0, height, dist);
  const targetLook = sceneCenter.clone();
  if (instant) {
    camera.position.copy(targetPos);
    controls.target.copy(targetLook);
    controls.update();
  }
  return { targetPos, targetLook };
}

// ----------------------------------------------------------------------
// Quantity screen
// ----------------------------------------------------------------------
function refreshQtyUI() { el.qtyValue.textContent = app.quantity; }
el.qtyMinus.addEventListener('click', () => {
  app.quantity = Math.max(1, app.quantity - 1);
  refreshQtyUI();
  audio.tap();
});
el.qtyPlus.addEventListener('click', () => {
  app.quantity = Math.min(10, app.quantity + 1);
  refreshQtyUI();
  audio.tap();
});
el.makeBtn.addEventListener('click', onMakeThem);
refreshQtyUI();

el.retryBtn.addEventListener('click', () => window.location.reload());

async function onMakeThem() {
  if (!app.ready) return;
  audio.select();
  el.makeBtn.disabled = true;

  switchScreen(el.quantityScreen, el.sceneRoot);
  await new Promise(res => setTimeout(res, 200));

  generateChocolates(app.quantity);

  // cinematic dolly-in
  const { targetPos, targetLook } = recomputeOverviewCamera(false);
  const startPos = targetPos.clone().add(new THREE.Vector3(0, 1.4, 3.4));
  camera.position.copy(startPos);
  controls.target.copy(sceneCenter);
  controls.enabled = false;

  await tween(camera.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z }, {
    duration: 2200, easing: Easing.cubicOut,
  }).promise;
  controls.enabled = true;
  controls.target.copy(targetLook);

  el.hudTitle.textContent = 'choose one ♡';
  el.hint.textContent = 'drag to look around · tap a chocolate ♡';
  el.makeBtn.disabled = false;
}

function generateChocolates(count) {
  app.chocolates.forEach(c => { scene.remove(c.group); c.dispose(); });
  app.chocolates = [];

  const layout = layoutChocolates(count);
  for (let i = 0; i < count; i++) {
    const choc = new Chocolate(app.wrapperTexture, app.envMap);
    choc.setBasePosition(layout[i].pos, layout[i].rotY);
    const s = window.innerWidth < 720 ? 0.92 : 1.0;
    choc.baseScale = s;
    choc.group.scale.setScalar(s);
    scene.add(choc.group);
    app.chocolates.push(choc);
  }
}

// ----------------------------------------------------------------------
// Pointer interaction: tap vs. drag detection + raycasting
// ----------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let downPos = null;
let downTime = 0;
let lastHovered = null;

function setupPointerInteraction() {
  const domEl = renderer.domElement;

  domEl.addEventListener('pointerdown', (e) => {
    if (e.isPrimary && domEl.setPointerCapture) { try { domEl.setPointerCapture(e.pointerId); } catch (_) {} }
    downPos = { x: e.clientX, y: e.clientY };
    downTime = performance.now();
  }, { passive: true });

  domEl.addEventListener('pointerup', (e) => {
    if (!downPos) return;
    const dx = e.clientX - downPos.x, dy = e.clientY - downPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dt = performance.now() - downTime;
    downPos = null;
    if (dist < 8 && dt < 400) {
      handleTap(e.clientX, e.clientY);
    }
  }, { passive: true });

  domEl.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    updateHover(e.clientX, e.clientY);
  });

  domEl.addEventListener('pointerleave', () => {
    if (lastHovered) { lastHovered.setHovered(false); lastHovered = null; }
  });
}

function getInteractableMeshes() {
  const meshes = [];
  for (const choc of app.chocolates) {
    if (choc.state === 'wrapped') {
      meshes.push(...choc.wrapperMeshes);
    } else if (choc.state === 'opened' || choc.state === 'eating') {
      meshes.push(...choc.getRemainingPieceMeshes());
    }
  }
  return meshes;
}

function raycastAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  const meshes = getInteractableMeshes();
  const hits = raycaster.intersectObjects(meshes, false);
  return hits.length ? hits[0].object : null;
}

function updateHover(clientX, clientY) {
  const obj = raycastAt(clientX, clientY);
  const choc = obj ? obj.userData.chocolate : null;
  if (choc !== lastHovered) {
    if (lastHovered) lastHovered.setHovered(false);
    if (choc) choc.setHovered(true);
    lastHovered = choc;
    renderer.domElement.style.cursor = choc ? 'pointer' : 'grab';
  }
}

async function handleTap(clientX, clientY) {
  audio.unlock();
  if (app.busy) return;
  const obj = raycastAt(clientX, clientY);
  if (!obj) return;
  const choc = obj.userData.chocolate;
  if (choc.animating) return;

  if (obj.userData.isWrapper && choc.state === 'wrapped') {
    app.busy = true;
    await focusChocolate(choc, true);
    app.busy = false;
  } else if (obj.userData.pieceIndex !== undefined && (choc.state === 'opened' || choc.state === 'eating')) {
    if (choc === app.focused) {
      app.busy = true;
      await eatPieceFlow(choc, obj.userData.pieceIndex);
      app.busy = false;
    } else {
      app.busy = true;
      await focusChocolate(choc, false);
      app.busy = false;
    }
  }
}

async function focusChocolate(choc, shouldOpen) {
  if (app.focused === choc && !shouldOpen) return;
  app.focused = choc;
  choc.setSelected(true);
  app.chocolates.forEach(c => { if (c !== choc) c.setSelected(false); });

  el.backBtn.hidden = false;
  el.backBtn.style.opacity = '1';
  el.hudTitle.textContent = shouldOpen ? 'unwrapping for you…' : (choc.piecesRemaining > 0 ? 'pick a piece ♡' : 'all gone ♡');
  el.hint.textContent = 'drag to inspect · pinch or scroll to zoom';

  controls.enabled = false;
  const worldPos = new THREE.Vector3();
  choc.group.getWorldPosition(worldPos);
  // approach from whichever side the camera is already viewing from, so the
  // reveal never flips the chocolate around to face away from the user
  const dir = camera.position.clone().sub(worldPos).setY(0);
  if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
  dir.normalize();
  const camTargetPos = worldPos.clone().add(dir.clone().multiplyScalar(1.1)).add(new THREE.Vector3(0, 0.35, 0));
  const lookTarget = worldPos.clone().add(new THREE.Vector3(0, 0.05, 0));

  const camMove = tween(camera.position, { x: camTargetPos.x, y: camTargetPos.y, z: camTargetPos.z }, {
    duration: 1000, easing: Easing.cubicOut,
  }).promise;
  const targetMove = tween(controls.target, { x: lookTarget.x, y: lookTarget.y, z: lookTarget.z }, {
    duration: 1000, easing: Easing.cubicOut,
  }).promise;

  if (shouldOpen) {
    await Promise.all([camMove, targetMove, choc.playOpen()]);
    updatePiecesPill(choc);
    el.hudTitle.textContent = 'pick a piece ♡';
  } else {
    await Promise.all([camMove, targetMove]);
    if (choc.state === 'opened' || choc.state === 'eating') updatePiecesPill(choc);
    if (choc.state === 'completed') { updatePiecesPill(choc); }
  }
  controls.minDistance = 0.55;
  controls.enabled = true;
}

async function eatPieceFlow(choc, index) {
  await choc.eatPiece(index);
  updatePiecesPill(choc);
  if (choc.state === 'completed') {
    el.hudTitle.textContent = 'all gone ♡';
    showFinishedToast();
  }
}

function updatePiecesPill(choc) {
  el.piecesPill.hidden = false;
  el.piecesLabel.textContent = `${choc.piecesRemaining} / ${choc.piecesTotal} pieces left`;
}

function showFinishedToast() {
  el.finishedToast.hidden = false;
  requestAnimationFrame(() => el.finishedToast.classList.add('show'));
  setTimeout(() => {
    el.finishedToast.classList.remove('show');
    setTimeout(() => { el.finishedToast.hidden = true; }, 550);
  }, 2600);
}

el.backBtn.addEventListener('click', async () => {
  if (app.busy) return;
  app.busy = true;
  audio.tap();
  const choc = app.focused;
  if (choc) choc.setSelected(false);
  app.focused = null;
  el.backBtn.hidden = true;
  el.piecesPill.hidden = true;
  el.hudTitle.textContent = 'choose one ♡';
  el.hint.textContent = 'drag to look around · tap a chocolate ♡';

  controls.enabled = false;
  controls.minDistance = 0.9;
  const { targetPos, targetLook } = recomputeOverviewCamera(false);
  await Promise.all([
    tween(camera.position, { x: targetPos.x, y: targetPos.y, z: targetPos.z }, { duration: 900, easing: Easing.cubicInOut }).promise,
    tween(controls.target, { x: targetLook.x, y: targetLook.y, z: targetLook.z }, { duration: 900, easing: Easing.cubicInOut }).promise,
  ]);
  controls.enabled = true;
  app.busy = false;
});

// ----------------------------------------------------------------------
// Sound button
// ----------------------------------------------------------------------
let firstGestureHandled = false;
function unlockOnce() {
  if (firstGestureHandled) return;
  firstGestureHandled = true;
  audio.unlock();
}
document.addEventListener('pointerdown', unlockOnce, { once: true });
document.addEventListener('keydown', unlockOnce, { once: true });

el.soundBtn.addEventListener('click', async () => {
  await audio.unlock();
  const on = audio.toggleMusic();
  el.iconSoundOn.hidden = !on;
  el.iconSoundOff.hidden = on;
});

// ----------------------------------------------------------------------
// Render loop
// ----------------------------------------------------------------------
function renderLoop(nowMs) {
  const dt = clock.getDelta();
  const elapsed = clock.elapsedTime;

  stepTweens(nowMs);

  for (const choc of app.chocolates) choc.update(dt, elapsed);
  if (crumbSystem) crumbSystem.update(dt);

  if (dustPoints) {
    dustPoints.rotation.y = elapsed * 0.01;
    const pos = dustPoints.geometry.attributes.position;
    const base = dustPoints.userData.basePositions;
    for (let i = 0; i < pos.count; i++) {
      const by = base[i * 3 + 1];
      pos.array[i * 3 + 1] = by + Math.sin(elapsed * 0.3 + i) * 0.15;
    }
    pos.needsUpdate = true;
  }

  if (controls.enabled) controls.update();
  renderer.render(scene, camera);
}

// ----------------------------------------------------------------------
boot();
