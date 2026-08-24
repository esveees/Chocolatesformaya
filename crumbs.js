import * as THREE from 'three';

const MAX_CRUMBS = 200;

export class CrumbSystem {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BoxGeometry(0.014, 0.014, 0.014);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a160c, roughness: 0.8 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_CRUMBS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.scene.add(this.mesh);

    this.particles = [];
    this.dummy = new THREE.Object3D();
    this.free = [];
    for (let i = 0; i < MAX_CRUMBS; i++) this.free.push(i);
    scene.userData.crumbSystem = this;
  }

  burst(worldPos, count = 14) {
    for (let i = 0; i < count; i++) {
      if (this.free.length === 0) return;
      const idx = this.free.pop();
      const speed = 0.4 + Math.random() * 0.6;
      const angle = Math.random() * Math.PI * 2;
      const upSpeed = 0.3 + Math.random() * 0.5;
      this.particles.push({
        idx,
        pos: worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05)),
        vel: new THREE.Vector3(Math.cos(angle) * speed * 0.3, upSpeed, Math.sin(angle) * speed * 0.3),
        life: 0,
        maxLife: 0.9 + Math.random() * 0.5,
        rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        scale: 0.6 + Math.random() * 0.8,
      });
    }
  }

  update(dt) {
    if (this.particles.length === 0) { this.mesh.count = 0; return; }
    const gravity = -1.6;
    let writeIndex = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) { this.free.push(p.idx); continue; }
      p.vel.y += gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0) { p.pos.y = 0; p.vel.y *= -0.25; p.vel.x *= 0.6; p.vel.z *= 0.6; }

      const fade = 1 - p.life / p.maxLife;
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(p.rot.x * p.life, p.rot.y * p.life, p.rot.z * p.life);
      this.dummy.scale.setScalar(p.scale * Math.max(0.05, fade));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(writeIndex, this.dummy.matrix);
      writeIndex++;
      this.particles[writeIndex - 1] = p;
    }
    this.particles.length = writeIndex;
    this.mesh.count = writeIndex;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
