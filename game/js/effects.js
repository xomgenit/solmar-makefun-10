// effects.js — particles, tracers, floating text, skid marks and screen
// shake. All effects are transient: they live a fraction of a second and
// are drawn in world space by render.js.

export function createEffects() {
  const particles = [];
  const tracers = [];
  const floaters = [];
  const skids = [];
  let shake = 0;

  function addParticle(x, y, vx, vy, life, size, color) {
    particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
  }

  return {
    burst(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 40 + Math.random() * 120;
        addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + Math.random() * 0.3, 2 + Math.random() * 2, color);
      }
    },
    sparks(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 80 + Math.random() * 220;
        addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.2, 1.5, '#ffd54a');
      }
    },
    smoke(x, y, n) {
      for (let i = 0; i < n; i++) {
        addParticle(
          x + (Math.random() - 0.5) * 20,
          y + (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 30,
          -30 - Math.random() * 40,
          0.8 + Math.random() * 0.6,
          5 + Math.random() * 6,
          'rgba(120,120,120,0.5)',
        );
      }
    },
    blood(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 30 + Math.random() * 90;
        addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + Math.random() * 0.25, 2 + Math.random() * 2, '#c62828');
      }
    },
    tracer(x1, y1, x2, y2) {
      tracers.push({ x1, y1, x2, y2, life: 0.09, maxLife: 0.09 });
    },
    muzzle(x, y) {
      addParticle(x, y, 0, 0, 0.06, 7, '#ffe082');
    },
    floater(x, y, text, color) {
      floaters.push({ x, y, text, color: color || '#fff', life: 1.1, maxLife: 1.1 });
    },
    skid(x, y, angle) {
      skids.push({ x, y, angle, life: 2.5 });
      if (skids.length > 220) skids.splice(0, skids.length - 220);
    },
    addShake(amount) {
      shake = Math.min(14, shake + amount);
    },
    update(dt) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) tracers.splice(i, 1);
      }
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.life -= dt;
        f.y -= 28 * dt;
        if (f.life <= 0) floaters.splice(i, 1);
      }
      for (let i = skids.length - 1; i >= 0; i--) {
        skids[i].life -= dt;
        if (skids[i].life <= 0) skids.splice(i, 1);
      }
      if (shake > 0) shake = Math.max(0, shake - 30 * dt);
    },
    drawSkids(ctx) {
      // Skid marks first (under everything else).
      for (const s of skids) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.fillStyle = `rgba(20,20,20,${0.35 * (s.life / 2.5)})`;
        ctx.fillRect(-9, -2, 18, 4);
        ctx.restore();
      }
    },
    draw(ctx) {
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const t of tracers) {
        ctx.strokeStyle = `rgba(255, 240, 160, ${t.life / t.maxLife})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const f of floaters) {
        ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    },
    shakeAmount() {
      return shake;
    },
  };
}

// Module-level helpers kept for the old call shape used by main.js.
export function updateEffects(fx, dt) {
  fx.update(dt);
}

export function drawEffects(fx, ctx) {
  fx.draw(ctx);
}
