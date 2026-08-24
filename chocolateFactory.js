import * as THREE from 'three';

/**
 * Build a single "lobe" of chocolate as a squashed, slightly irregular ellipsoid.
 * Dimensions are baked directly into vertex positions (not mesh.scale) so later
 * bite-carving math works in real local units.
 */
export function buildPieceGeometry(rx, ry, rz, segW = 28, segH = 20, seed = 0) {
  const geo = new THREE.SphereGeometry(1, segW, segH);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // gentle organic noise so lobes don't look like perfect primitives
    const n = 0.02 * Math.sin(v.x * 7 + seed) * Math.cos(v.y * 5 + seed * 1.3) +
              0.015 * Math.sin(v.z * 9 - seed * 0.7);
    const nx = v.x * rx * (1 + n);
    const ny = v.y * ry * (1 + n);
    const nz = v.z * rz * (1 + n);
    pos.setXYZ(i, nx, ny, nz);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Carve a concave "bite" into a piece geometry by pulling any vertex that falls
 * inside a bite-sphere onto that sphere's surface. This produces a real
 * scooped-out indentation using pure vertex math (no CSG library required).
 */
export function carveBite(geometry, biteCenter, biteRadius, biteSquash = new THREE.Vector3(1, 0.85, 1)) {
  const geo = geometry.clone();
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const c = biteCenter;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const rel = new THREE.Vector3(
      (v.x - c.x) / biteSquash.x,
      (v.y - c.y) / biteSquash.y,
      (v.z - c.z) / biteSquash.z
    );
    const dist = rel.length();
    if (dist < biteRadius) {
      // small ragged edge via noise so the rim doesn't look perfectly circular
      const ragged = biteRadius * (1 + 0.06 * Math.sin(v.x * 40 + v.y * 31 + v.z * 17));
      const t = ragged / (dist || 0.0001);
      rel.multiplyScalar(t);
      const nx = c.x + rel.x * biteSquash.x;
      const ny = c.y + rel.y * biteSquash.y;
      const nz = c.z + rel.z * biteSquash.z;
      pos.setXYZ(i, nx, ny, nz);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** A thin wavy drizzle line following a random-ish path across a lobe's top surface. */
export function buildDrizzleGeometry(pieceRx, pieceRy, pieceRz, seed = 0) {
  const points = [];
  const N = 6;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = THREE.MathUtils.lerp(-pieceRx * 0.85, pieceRx * 0.85, t);
    const wobble = Math.sin(t * Math.PI * 2.4 + seed) * pieceRz * 0.55;
    const y = pieceRy * 0.98 + Math.sin(t * Math.PI + seed) * pieceRy * 0.05;
    points.push(new THREE.Vector3(x, y, wobble));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, 40, 0.028, 6, false);
}

/** Rounded, beveled box used for the wrapper "capsule" — built via a lathe-free box with soft edges. */
export function buildRoundedBoxGeometry(width, height, depth, radius = 0.06, segments = 3) {
  // Use a standard BoxGeometry with limited subdivisions and a bevel-ish shrink,
  // which reads well as a glossy foil-wrapped shape at this scale without extra deps.
  const geo = new THREE.BoxGeometry(width, height, depth, 6, 4, 2);
  const pos = geo.attributes.position;
  const hw = width / 2, hh = height / 2, hd = depth / 2;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nx = THREE.MathUtils.clamp(v.x / hw, -1, 1);
    const ny = THREE.MathUtils.clamp(v.y / hh, -1, 1);
    const nz = THREE.MathUtils.clamp(v.z / hd, -1, 1);
    // pull corners inward slightly to fake a bevel/round without extra geometry cost
    const cornerFactor = Math.pow(Math.abs(nx * ny * nz), 0.6);
    const pull = radius * cornerFactor;
    v.x -= Math.sign(v.x) * pull * 0.5;
    v.y -= Math.sign(v.y) * pull * 0.5;
    v.z -= Math.sign(v.z) * pull * 0.5;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function makeChocolateMaterial(envMap) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x3a2013),
    roughness: 0.32,
    metalness: 0.02,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
    envMap: envMap || null,
    envMapIntensity: 0.9,
    sheen: 0.15,
    sheenColor: new THREE.Color(0x7a4a2a),
  });
}

export function makeDrizzleMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x1d0f08),
    roughness: 0.25,
    metalness: 0.0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
  });
}
