import * as THREE from 'three';
import {
  buildPieceGeometry, carveBite, buildDrizzleGeometry, buildRoundedBoxGeometry,
  makeChocolateMaterial, makeDrizzleMaterial,
} from './chocolateFactory.js';
import { tween, Easing, delay } from './tween.js';
import { audio } from './audio.js';

const PIECE_COUNT = 4;
const PIECE_CENTERS_X = [-0.57, -0.19, 0.19, 0.57];
const PIECE_RX = 0.205, PIECE_RY = 0.165, PIECE_RZ = 0.165;

let uidCounter = 0;

export class Chocolate {
  /**
   * @param {THREE.Texture} wrapperTexture - shared, pre-loaded packaging texture
   * @param {THREE.Texture|null} envMap - environment map for reflections
   */
  constructor(wrapperTexture, envMap) {
    this.id = uidCounter++;
    this.state = 'wrapped'; // wrapped | opening | opened | eating | completed
    this.piecesTotal = PIECE_COUNT;
    this.piecesRemaining = PIECE_COUNT;
    this.piecesEaten = 0;
    this.wrapperOpen = false;
    this.selected = false;
    this.hovered = false;
    this.animating = false;

    this.group = new THREE.Group();
    this.group.userData.chocolate = this;

    this._basePosition = new THREE.Vector3();
    this._baseRotationY = 0;
    this._bobPhase = Math.random() * Math.PI * 2;
    this._bobSpeed = 0.6 + Math.random() * 0.3;
    this._liftOffset = 0; // animated hover/select lift, added on top of bob
    this.baseScale = 1; // set externally (e.g. shrink slightly on small screens)

    this._buildWrapper(wrapperTexture);
    this._buildBar(envMap);

    this.wrapperMeshes.forEach(m => { m.userData.chocolate = this; m.userData.isWrapper = true; });
    this.pieceMeshes.forEach((m, i) => { m.userData.chocolate = this; m.userData.pieceIndex = i; });
  }

  // ---------------------------------------------------------------- build

  _buildWrapper(wrapperTexture) {
    this.wrapperGroup = new THREE.Group();

    const leftTex = wrapperTexture.clone();
    leftTex.needsUpdate = true;
    leftTex.wrapS = leftTex.wrapT = THREE.ClampToEdgeWrapping;
    leftTex.repeat.set(0.5, 1);
    leftTex.offset.set(0.0, 0.0);
    leftTex.colorSpace = THREE.SRGBColorSpace;

    const rightTex = wrapperTexture.clone();
    rightTex.needsUpdate = true;
    rightTex.wrapS = rightTex.wrapT = THREE.ClampToEdgeWrapping;
    rightTex.repeat.set(0.5, 1);
    rightTex.offset.set(0.5, 0.0);
    rightTex.colorSpace = THREE.SRGBColorSpace;

    const foilColor = new THREE.Color(0x8a1520);

    const makeHalfMaterials = (tex) => ([
      new THREE.MeshPhysicalMaterial({ color: foilColor, roughness: 0.35, metalness: 0.55, clearcoat: 0.4 }), // +x
      new THREE.MeshPhysicalMaterial({ color: foilColor, roughness: 0.35, metalness: 0.55, clearcoat: 0.4 }), // -x
      new THREE.MeshPhysicalMaterial({ color: foilColor, roughness: 0.4, metalness: 0.4 }),  // +y
      new THREE.MeshPhysicalMaterial({ color: 0x3a0509, roughness: 0.6, metalness: 0.2 }),   // -y
      new THREE.MeshPhysicalMaterial({ map: tex, color: 0xffffff, roughness: 0.32, metalness: 0.25, clearcoat: 0.5, clearcoatRoughness: 0.25 }), // +z front
      new THREE.MeshPhysicalMaterial({ color: foilColor, roughness: 0.4, metalness: 0.5 }),  // -z back
    ]);

    const halfW = 0.82, h = 0.44, d = 0.42;
    const leftGeo = buildRoundedBoxGeometry(halfW, h, d, 0.05);
    const rightGeo = leftGeo.clone();

    this.leftHalf = new THREE.Mesh(leftGeo, makeHalfMaterials(leftTex));
    this.leftHalf.position.set(-halfW / 2 - 0.01, 0, 0);
    this.leftHalf.castShadow = true;
    this.leftHalf.receiveShadow = true;

    this.rightHalf = new THREE.Mesh(rightGeo, makeHalfMaterials(rightTex));
    this.rightHalf.position.set(halfW / 2 + 0.01, 0, 0);
    this.rightHalf.castShadow = true;
    this.rightHalf.receiveShadow = true;

    // Twisted candy-wrapper ends (small tapered cones) for a believable silhouette
    const twistGeo = new THREE.ConeGeometry(0.16, 0.22, 10);
    const twistMat = new THREE.MeshPhysicalMaterial({ color: foilColor, roughness: 0.4, metalness: 0.55 });
    this.twistLeft = new THREE.Mesh(twistGeo, twistMat);
    this.twistLeft.rotation.z = Math.PI / 2;
    this.twistLeft.position.set(-halfW - 0.08, 0, 0);
    this.twistLeft.castShadow = true;

    this.twistRight = new THREE.Mesh(twistGeo.clone(), twistMat);
    this.twistRight.rotation.z = -Math.PI / 2;
    this.twistRight.position.set(halfW + 0.08, 0, 0);
    this.twistRight.castShadow = true;

    this.wrapperGroup.add(this.leftHalf, this.rightHalf, this.twistLeft, this.twistRight);
    this.group.add(this.wrapperGroup);
    this.wrapperMeshes = [this.leftHalf, this.rightHalf, this.twistLeft, this.twistRight];
  }

  _buildBar(envMap) {
    this.barGroup = new THREE.Group();
    this.barGroup.scale.setScalar(0.001);
    this.barGroup.visible = false;

    this.pieceMeshes = [];
    this.pieceWholeGeo = [];
    this.pieceEaten = [false, false, false, false];

    const drizzleMat = makeDrizzleMaterial();

    for (let i = 0; i < PIECE_COUNT; i++) {
      const geo = buildPieceGeometry(PIECE_RX, PIECE_RY, PIECE_RZ, 24, 16, i * 1.7);
      const mat = makeChocolateMaterial(envMap);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(PIECE_CENTERS_X[i], 0, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.baseScale = 1;

      const drizzleGeo = buildDrizzleGeometry(PIECE_RX, PIECE_RY, PIECE_RZ, i * 2.1);
      const drizzle = new THREE.Mesh(drizzleGeo, drizzleMat);
      mesh.add(drizzle);

      this.pieceWholeGeo.push(geo);
      this.pieceMeshes.push(mesh);
      this.barGroup.add(mesh);
    }

    this.group.add(this.barGroup);
  }

  // -------------------------------------------------------------- placement

  setBasePosition(pos, rotY) {
    this._basePosition.copy(pos);
    this._baseRotationY = rotY;
    this.group.position.copy(pos);
    this.group.rotation.y = rotY;
  }

  /** Called every frame for idle floating / hover-lift / selection glow. */
  update(dt, elapsed) {
    if (this.animating) return; // don't fight active tweens
    const bob = Math.sin(elapsed * this._bobSpeed + this._bobPhase) * 0.035;
    const targetLift = (this.hovered ? 0.045 : 0) + (this.selected ? 0.02 : 0);
    this._liftOffset += (targetLift - this._liftOffset) * Math.min(1, dt * 8);
    this.group.position.y = this._basePosition.y + bob + this._liftOffset;
    this.group.rotation.y = this._baseRotationY + Math.sin(elapsed * 0.15 + this._bobPhase) * 0.05;

    const scaleTarget = this.baseScale * (this.hovered ? 1.035 : 1);
    const cur = this.group.scale.x;
    const next = cur + (scaleTarget - cur) * Math.min(1, dt * 10);
    this.group.scale.setScalar(next);
  }

  setHovered(v) { if (this.state === 'wrapped' || this.state === 'opened' || this.state === 'eating') this.hovered = v; }
  setSelected(v) { this.selected = v; }

  // -------------------------------------------------------------- opening

  async playOpen() {
    if (this.state !== 'wrapped') return;
    this.state = 'opening';
    this.animating = true;
    audio.tap();
    const bs = this.baseScale;

    // 1. react slightly when touched
    await tween(this.group.scale, { x: bs * 1.08, y: bs * 1.08, z: bs * 1.08 }, { duration: 140, easing: Easing.quadOut }).promise;
    // 2 & 3. move toward camera + rotate naturally
    await Promise.all([
      tween(this.group.position, { y: this._basePosition.y + 0.12 }, { duration: 380, easing: Easing.cubicOut }).promise,
      tween(this.group.rotation, { y: this._baseRotationY + Math.PI * 0.12, z: 0.05 }, { duration: 420, easing: Easing.cubicOut }).promise,
      tween(this.group.scale, { x: bs, y: bs, z: bs }, { duration: 380, easing: Easing.quadOut }).promise,
    ]);

    audio.open();

    // 4. open/unwrap — halves peel apart and twist ends fly off
    this.barGroup.visible = true;
    const barScaleTween = tween(this.barGroup.scale, { x: 1, y: 1, z: 1 }, {
      duration: 700, easing: Easing.backOut, delay: 0.15,
    }).promise;

    const peel = Promise.all([
      tween(this.leftHalf.position, { x: this.leftHalf.position.x - 0.55, y: 0.28 }, { duration: 650, easing: Easing.cubicOut }).promise,
      tween(this.leftHalf.rotation, { z: 0.9, x: -0.3 }, { duration: 650, easing: Easing.cubicOut }).promise,
      tween(this.rightHalf.position, { x: this.rightHalf.position.x + 0.55, y: 0.28 }, { duration: 650, easing: Easing.cubicOut }).promise,
      tween(this.rightHalf.rotation, { z: -0.9, x: -0.3 }, { duration: 650, easing: Easing.cubicOut }).promise,
      tween(this.twistLeft.position, { x: this.twistLeft.position.x - 0.7, y: 0.05 }, { duration: 600, easing: Easing.cubicOut }).promise,
      tween(this.twistRight.position, { x: this.twistRight.position.x + 0.7, y: 0.05 }, { duration: 600, easing: Easing.cubicOut }).promise,
    ]);

    await Promise.all([barScaleTween, peel]);

    // 6 & 7. fade wrapper aside and leave chocolate in the scene
    const fadeMats = [];
    this.wrapperMeshes.forEach(m => {
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mm => {
        mm.transparent = true;
        fadeMats.push(mm);
      });
    });
    await tween({ o: 1 }, { o: 0 }, {
      duration: 420,
      onUpdate: (e, t) => { fadeMats.forEach(mm => mm.opacity = 1 - t); },
    }).promise;
    this.wrapperGroup.visible = false;

    // settle bar back to a neutral resting rotation for free inspection
    await tween(this.group.rotation, { y: this._baseRotationY, z: 0 }, { duration: 500, easing: Easing.quadInOut }).promise;

    this.state = 'opened';
    this.wrapperOpen = true;
    this.animating = false;
  }

  // -------------------------------------------------------------- eating

  getRemainingPieceMeshes() {
    return this.pieceMeshes.filter((m, i) => !this.pieceEaten[i]);
  }

  async eatPiece(index) {
    if (this.state !== 'opened' && this.state !== 'eating') return;
    if (this.pieceEaten[index]) return;
    this.state = 'eating';
    this.animating = true;

    const mesh = this.pieceMeshes[index];
    const origPos = mesh.position.clone();
    const origScale = mesh.scale.clone();

    audio.tap();
    // 1. highlight
    mesh.material.emissive = new THREE.Color(0xd9a860);
    await tween(mesh.material, { emissiveIntensity: 0.5 }, { duration: 150 }).promise;

    // 2 & 3. move toward camera + rotate naturally
    const worldDir = new THREE.Vector3(0, 0.08, 0.35);
    await Promise.all([
      tween(mesh.position, { x: origPos.x + worldDir.x, y: origPos.y + worldDir.y, z: origPos.z + worldDir.z },
        { duration: 380, easing: Easing.cubicOut }).promise,
      tween(mesh.rotation, { y: mesh.rotation.y + 0.6, x: 0.15 }, { duration: 380, easing: Easing.cubicOut }).promise,
      tween(mesh.scale, { x: origScale.x * 1.25, y: origScale.y * 1.25, z: origScale.z * 1.25 },
        { duration: 380, easing: Easing.backOut }).promise,
    ]);

    // 4. a bite is taken from it — swap in a carved geometry
    audio.bite();
    const biteCenter = new THREE.Vector3(PIECE_CENTERS_X[index] + PIECE_RX * 0.5, PIECE_RY * 0.5, 0);
    const bitten = carveBite(this.pieceWholeGeo[index], biteCenter, PIECE_RX * 0.85);
    mesh.geometry.dispose();
    mesh.geometry = bitten;

    // small camera-facing "punch" so the bite reads clearly
    await tween(mesh.scale, { x: origScale.x * 1.1, y: origScale.y * 1.1, z: origScale.z * 1.1 }, { duration: 90, easing: Easing.quadOut }).promise;

    // 5 & 6. a small piece disappears + crumbs fall
    audio.crumbs();
    this._spawnCrumbs(mesh);

    await delay(0.12);

    // 7. shrink away (fully consumed) and move back conceptually — then hide
    await tween(mesh.scale, { x: 0.001, y: 0.001, z: 0.001 }, { duration: 320, easing: Easing.backIn }).promise;
    mesh.visible = false;

    this.pieceEaten[index] = true;
    this.piecesRemaining -= 1;
    this.piecesEaten += 1;

    if (this.piecesRemaining <= 0) {
      this.state = 'completed';
      audio.complete();
    } else {
      this.state = 'opened';
    }
    this.animating = false;
  }

  _spawnCrumbs(pieceMesh) {
    const worldPos = new THREE.Vector3();
    pieceMesh.getWorldPosition(worldPos);
    const parent = this.group.parent; // scene
    if (!parent || !parent.userData.crumbSystem) return;
    parent.userData.crumbSystem.burst(worldPos);
  }

  dispose() {
    [...this.pieceMeshes, this.leftHalf, this.rightHalf, this.twistLeft, this.twistRight].forEach(m => {
      if (!m) return;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(mm => mm?.dispose?.());
    });
  }
}

export { PIECE_COUNT };
