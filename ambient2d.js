// Soft drifting embers/dust behind the pre-3D screens. Cheap 2D canvas, no deps.

export function startAmbient2D(canvasId) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  let w, h, dpr;
  let particles = [];
  let running = true;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeParticles() {
    const count = Math.min(70, Math.floor((w * h) / 18000));
    particles = new Array(count).fill(0).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.8 + 0.4,
      speedY: -(Math.random() * 10 + 4),
      speedX: (Math.random() - 0.5) * 6,
      hue: Math.random() > 0.5 ? 'gold' : 'rose',
      alpha: Math.random() * 0.5 + 0.15,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  resize();
  makeParticles();
  window.addEventListener('resize', () => { resize(); makeParticles(); });

  let last = performance.now();
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.phase += dt * 0.6;
      p.y += p.speedY * dt;
      p.x += p.speedX * dt + Math.sin(p.phase) * 0.15;
      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;

      const color = p.hue === 'gold' ? `217,168,96` : `198,90,106`;
      const flicker = 0.6 + 0.4 * Math.sin(p.phase * 2);
      ctx.beginPath();
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      grad.addColorStop(0, `rgba(${color},${p.alpha * flicker})`);
      grad.addColorStop(1, `rgba(${color},0)`);
      ctx.fillStyle = grad;
      ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { stop() { running = false; } };
}
