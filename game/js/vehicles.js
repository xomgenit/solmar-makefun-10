// vehicles.js — car models, arcade driving, traffic and parked cars.
//
// Driving model: a velocity vector in world space. The engine pushes along
// the car's heading; lateral velocity is damped hard (grip) and lightly
// when the handbrake is held (drift). Collisions are circle pairs with a
// per-car damage cooldown so one rear-end does not wreck a car in a frame.

import { clamp, angleDiff, turnToward, TAU, makeRng, pick, randRange } from './util.js';
import { collideCircle, WORLD, ROAD_EVERY, nearestRoadPoint } from './city.js';

export const MODELS = {
  sedan: { name: 'Sedan', len: 52, wid: 26, top: 330, accel: 300, color: '#c8c8d0' },
  sports: { name: 'Sports', len: 50, wid: 24, top: 560, accel: 460, color: '#d23b3b' },
  taxi: { name: 'Taxi', len: 52, wid: 26, top: 320, accel: 300, color: '#e8b820' },
  van: { name: 'Van', len: 62, wid: 28, top: 260, accel: 230, color: '#7a8a9a' },
  pickup: { name: 'Pickup', len: 56, wid: 27, top: 300, accel: 280, color: '#4a7a4a' },
  cruiser: { name: 'Police Cruiser', len: 54, wid: 26, top: 480, accel: 420, color: '#223a6b' },
};

export const MODEL_KEYS = ['sedan', 'sports', 'taxi', 'van', 'pickup'];

export function createCar(x, y, angle, model, role = 'traffic') {
  const m = MODELS[model];
  return {
    x, y, angle,
    vx: 0, vy: 0,
    model, role,
    health: 100,
    hitCd: 0,
    wrecked: false,
    // Traffic state: which lane the car follows and where it is headed.
    lane: null,
    turnAt: null,
    noTurn: false,
    speed: 0,
    dead: false,
  };
}

// Arcade drive step. `ctl` = { throttle: -1..1, steer: -1..1, handbrake }.
// throttle 1 = gas, -1 = brake/reverse. Returns nothing; mutates the car.
export function driveCar(game, car, ctl, dt) {
  if (car.wrecked) return;
  const m = MODELS[car.model];
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  // Forward speed along the heading.
  let fwd = car.vx * fx + car.vy * fy;
  // Lateral speed across the heading.
  let lat = -car.vx * fy + car.vy * fx;

  const engine = ctl.throttle * m.accel;
  fwd += engine * dt;
  // Drag + rolling resistance; reverse is capped low.
  fwd -= fwd * 0.55 * dt;
  if (fwd < -120) fwd = -120;
  if (fwd > m.top) fwd = m.top;
  // Steering bites harder the faster we go, but never at a standstill.
  const steerAuthority = clamp(Math.abs(fwd) / 160, 0, 1);
  car.angle += ctl.steer * 2.1 * steerAuthority * dt * (fwd < 0 ? -1 : 1);
  // Grip: lateral velocity decays fast, slowly with the handbrake (drift).
  const grip = ctl.handbrake ? 1.2 : 5.0;
  lat *= Math.exp(-grip * dt);
  if (ctl.handbrake) fwd *= Math.exp(-0.35 * dt);

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * fwd - nfy * lat;
  car.vy = nfy * fwd + nfx * lat;
  car.speed = Math.abs(fwd);

  car.x += car.vx * dt;
  car.y += car.vy * dt;
  const res = collideCircle(game.city, car.x, car.y, m.len / 2 - 4);
  if (res.hit) {
    // Bounced off a wall: kill most of the speed, keep a little slide.
    car.x = res.x;
    car.y = res.y;
    car.vx *= 0.25;
    car.vy *= 0.25;
    if (Math.abs(fwd) > 180) damageCar(game, car, 4);
  }
  if (car.hitCd > 0) car.hitCd -= dt;
}

export function damageCar(game, car, amount) {
  if (car.wrecked || car.hitCd > 0) return;
  car.hitCd = 0.6;
  car.health -= amount;
  if (game.effects) game.effects.sparks(car.x, car.y, 6);
  if (game.sfx) game.sfx('crash');
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    if (game.effects) game.effects.smoke(car.x, car.y, 14);
  }
}

// Circle-pair collisions between all cars in game.cars.
export function collideCars(game, dt) {
  const cars = game.cars;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.dead) continue;
    const ra = MODELS[a.model].len / 2 - 2;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.dead) continue;
      const rb = MODELS[b.model].len / 2 - 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = ra + rb;
      if (d >= min || d < 0.001) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (min - d) / 2;
      // Parked cars do not move; the other car takes the whole shove.
      const aMoves = a.role !== 'parked' && !a.wrecked;
      const bMoves = b.role !== 'parked' && !b.wrecked;
      if (aMoves) {
        a.x -= nx * push * (bMoves ? 1 : 2);
        a.y -= ny * push * (bMoves ? 1 : 2);
      }
      if (bMoves) {
        b.x += nx * push * (aMoves ? 1 : 2);
        b.y += ny * push * (aMoves ? 1 : 2);
      }
      const relSpeed = Math.abs((b.vx - a.vx) * nx + (b.vy - a.vy) * ny);
      if (relSpeed > 90) {
        if (aMoves) damageCar(game, a, Math.min(14, relSpeed / 40));
        if (bMoves) damageCar(game, b, Math.min(14, relSpeed / 40));
        if (game.effects) game.effects.sparks((a.x + b.x) / 2, (a.y + b.y) / 2, 5);
      }
    }
  }
}

// --- Traffic ----------------------------------------------------------------

// Spawn one traffic car on a road near (x, y), driving along the road.
export function spawnTrafficCar(game, x, y) {
  const rng = game.rng;
  const p = nearestRoadPoint(game.city, x + (rng() - 0.5) * 600, y + (rng() - 0.5) * 600);
  const model = pick(rng, MODEL_KEYS);
  const dir = rng() < 0.5 ? 1 : -1;
  const laneOff = 16;
  let cx = p.x;
  let cy = p.y;
  let angle;
  if (p.axis === 'v') {
    cx += dir > 0 ? laneOff : -laneOff;
    angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    cy += dir > 0 ? laneOff : -laneOff;
    angle = dir > 0 ? 0 : Math.PI;
  }
  const car = createCar(cx, cy, angle, model, 'traffic');
  car.lane = { axis: p.axis, line: p.axis === 'v' ? p.x : p.y, dir };
  car.cruise = randRange(rng, 130, 190);
  game.cars.push(car);
  return car;
}

export function updateTraffic(game, dt) {
  const px = game.player.x;
  const py = game.player.y;
  for (const car of game.cars) {
    if (car.role !== 'traffic' || car.dead || car.wrecked) continue;
    // Recycle cars that drifted far from the player.
    if (Math.hypot(car.x - px, car.y - py) > 1600) {
      const p = nearestRoadPoint(game.city, px + (game.rng() - 0.5) * 1400, py + (game.rng() - 0.5) * 1400);
      const dir = game.rng() < 0.5 ? 1 : -1;
      const laneOff = 16;
      if (p.axis === 'v') {
        car.x = p.x + (dir > 0 ? laneOff : -laneOff);
        car.y = p.y;
        car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.x = p.x;
        car.y = p.y + (dir > 0 ? laneOff : -laneOff);
        car.angle = dir > 0 ? 0 : Math.PI;
      }
      car.lane = { axis: p.axis, line: p.axis === 'v' ? p.x : p.y, dir };
      car.vx = 0;
      car.vy = 0;
      continue;
    }
    const lane = car.lane;
    if (!lane) continue;
    // At an intersection, sometimes turn onto the cross street.
    const onAxisPos = lane.axis === 'v' ? car.y : car.x;
    const nearestCross = Math.round(onAxisPos / ROAD_EVERY) * ROAD_EVERY;
    const distCross = Math.abs(onAxisPos - nearestCross);
    if (distCross < 8 && !car.noTurn && game.rng() < 0.004) {
      const newDir = game.rng() < 0.5 ? 1 : -1;
      const newAxis = lane.axis === 'v' ? 'h' : 'v';
      const newLine = nearestCross;
      const laneOff = 16;
      if (newAxis === 'v') {
        car.x = newLine + (newDir > 0 ? laneOff : -laneOff);
        car.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.y = newLine + (newDir > 0 ? laneOff : -laneOff);
        car.angle = newDir > 0 ? 0 : Math.PI;
      }
      car.lane = { axis: newAxis, line: newLine, dir: newDir };
      car.vx = 0;
      car.vy = 0;
    }
    // Gentle steering back onto the lane centre.
    const targetAngle =
      lane.axis === 'v' ? (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : lane.dir > 0 ? 0 : Math.PI;
    car.angle = turnToward(car.angle, targetAngle, 1.4 * dt);
    // Slow down for an obstacle ahead (the player, another car, a ped).
    let slow = false;
    const ax = Math.cos(car.angle);
    const ay = Math.sin(car.angle);
    for (const other of game.cars) {
      if (other === car || other.dead) continue;
      const relx = other.x - car.x;
      const rely = other.y - car.y;
      const ahead = relx * ax + rely * ay;
      const side = Math.abs(-relx * ay + rely * ax);
      if (ahead > 0 && ahead < 110 && side < 40) {
        slow = true;
        break;
      }
    }
    const target = slow ? 0 : car.cruise || 150;
    const cur = car.vx * ax + car.vy * ay;
    const throttle = clamp((target - cur) / 120, -1, 1);
    driveCar(game, car, { throttle, steer: 0, handbrake: false }, dt);
  }
}

// Park a car on a road near (x, y) — stealable, handbrake on.
export function spawnParkedCar(game, x, y, model) {
  const rng = game.rng;
  const p = nearestRoadPoint(game.city, x, y);
  const dir = rng() < 0.5 ? 1 : -1;
  const laneOff = 16;
  let cx = p.x;
  let cy = p.y;
  let angle;
  if (p.axis === 'v') {
    cx += dir > 0 ? laneOff : -laneOff;
    angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    cy += dir > 0 ? laneOff : -laneOff;
    angle = dir > 0 ? 0 : Math.PI;
  }
  const car = createCar(cx, cy, angle, model || pick(rng, MODEL_KEYS), 'parked');
  game.cars.push(car);
  return car;
}

// --- Drawing ----------------------------------------------------------------

export function drawCar(ctx, car) {
  const m = MODELS[car.model];
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const halfL = m.len / 2;
  const halfW = m.wid / 2;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(-halfL + 2, -halfW + 2, m.len, m.wid);
  // Body.
  ctx.fillStyle = car.wrecked ? '#3a3a3a' : m.color;
  ctx.beginPath();
  ctx.roundRect(-halfL, -halfW, m.len, m.wid, 7);
  ctx.fill();
  // Cabin / windshield.
  ctx.fillStyle = car.wrecked ? '#222' : '#1c2733';
  ctx.beginPath();
  ctx.roundRect(-halfL * 0.45, -halfW + 5, m.len * 0.42, m.wid - 10, 4);
  ctx.fill();
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(halfL - 3, -halfW + 3, 3, 5);
  ctx.fillRect(halfL - 3, halfW - 8, 3, 5);
  // Taxi checker / police markings.
  if (car.model === 'taxi') {
    ctx.fillStyle = '#111';
    for (let i = 0; i < 5; i++) ctx.fillRect(-halfL + 6 + i * 8, -2, 4, 4);
  }
  if (car.model === 'cruiser') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-halfL + 8, -halfW + 2, m.len - 16, 4);
    ctx.fillStyle = '#e33';
    ctx.fillRect(-2, -halfW - 2, 5, 5);
    ctx.fillStyle = '#36c';
    ctx.fillRect(-2, halfW - 3, 5, 5);
  }
  // Health bar for damaged cars.
  if (car.health < 100 && !car.wrecked) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-halfL, -halfW - 9, m.len, 4);
    ctx.fillStyle = car.health > 50 ? '#4caf50' : car.health > 25 ? '#ff9800' : '#f44336';
    ctx.fillRect(-halfL, -halfW - 9, m.len * (car.health / 100), 4);
  }
  ctx.restore();
}
