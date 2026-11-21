// util.js — small math + seeded randomness + collision helpers for SOLMAR.
// Everything here is pure and deterministic: same seed in, same city out.

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

// Shortest signed difference between two angles, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

// Turn `angle` toward `target` by at most `maxStep` radians.
export function turnToward(angle, target, maxStep) {
  const d = angleDiff(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

// mulberry32: a tiny fast seeded PRNG. One stream per city seed.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Fisher–Yates shuffle on a copy; returns the shuffled copy.
export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// Circle vs axis-aligned rect: push the circle out, return the corrected
// position, or null when there is no overlap.
export function pushCircleOutOfRect(x, y, r, rect) {
  const nx = clamp(x, rect.x, rect.x + rect.w);
  const ny = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - nx;
  const dy = y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: nx + (dx / d) * r, y: ny + (dy / d) * r };
  }
  // Centre inside the rect: shove out along the shallowest side.
  const left = x - rect.x;
  const right = rect.x + rect.w - x;
  const top = y - rect.y;
  const bottom = rect.y + rect.h - y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y };
  if (m === right) return { x: rect.x + rect.w + r, y };
  if (m === top) return { x, y: rect.y - r };
  return { x, y: rect.y + rect.h + r };
}

// Does the segment (x1,y1)-(x2,y2) cross any rect in `rects`? Used for
// line-of-sight checks (shooting, police vision).
export function segmentHitsRects(x1, y1, x2, y2, rects) {
  for (const r of rects) {
    // Slab test against the rect, expanded by nothing (a wall blocks sight).
    const dx = x2 - x1;
    const dy = y2 - y1;
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    const slabs = [
      [dx, x1 - r.x],
      [-dx, r.x + r.w - x1],
      [dy, y1 - r.y],
      [-dy, r.y + r.h - y1],
    ];
    for (const [d, n] of slabs) {
      if (Math.abs(d) < 1e-9) {
        if (n < 0) {
          ok = false;
          break;
        }
      } else {
        const t = n / d;
        if (d < 0) {
          if (t > t1) {
            ok = false;
            break;
          }
          if (t > t0) t0 = t;
        } else {
          if (t < t0) {
            ok = false;
            break;
          }
          if (t < t1) t1 = t;
        }
      }
    }
    if (ok && t0 <= t1) return true;
  }
  return false;
}

// Point-in-rect test.
export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
