// people.js — pedestrians of Solmar Bay.
//
// Peds stroll the sidewalks, flee gunfire and speeding cars, and get knocked
// down when a car hits them. Only a knock-down caused BY the player raises
// the wanted level (traffic accidents are not the player's crime).

import { clamp, makeRng, randRange, randInt, pick } from './util.js';
import { collideCircle, nearestRoadPoint, WORLD } from './city.js';

const SHIRT_COLORS = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4db6ac', '#f06292', '#aed581'];

export function createPed(game, x, y) {
  const rng = game.rng;
  const p = nearestRoadPoint(game.city, x, y);
  const dir = rng() < 0.5 ? 1 : -1;
  return {
    x: p.x + (rng() - 0.5) * 40,
    y: p.y + (rng() - 0.5) * 40,
    angle: p.axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI,
    speed: randRange(rng, 45, 75),
    state: 'walk', // walk | flee | down
    downT: 0,
    fleeT: 0,
    color: pick(rng, SHIRT_COLORS),
    dead: false,
    wanderT: randRange(rng, 2, 6),
  };
}

export function spawnPeds(game, n) {
  for (let i = 0; i < n; i++) {
    const x = randRange(game.rng, 200, WORLD - 200);
    const y = randRange(game.rng, 200, WORLD - 200);
    const ped = createPed(game, x, y);
    // Keep peds off the beach sand; they belong on the streets.
    if (ped.x < 3050) game.peds.push(ped);
  }
}

// Scare every ped within `radius` of (x, y) into fleeing.
export function scarePeds(game, x, y, radius) {
  for (const ped of game.peds) {
    if (ped.dead || ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < radius) {
      ped.state = 'flee';
      ped.fleeT = 2.5;
      const away = Math.atan2(ped.y - y, ped.x - x);
      ped.angle = away;
    }
  }
}

export function knockDownPed(game, ped, byPlayer) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downT = 3;
  if (game.effects) game.effects.blood(ped.x, ped.y, 8);
  if (byPlayer && game.police) {
    game.police.addWanted(2);
    if (game.sfx) game.sfx('blip');
  }
}

export function updatePeds(game, dt) {
  const px = game.player.x;
  const py = game.player.y;
  for (const ped of game.peds) {
    if (ped.dead) continue;
    if (ped.state === 'down') {
      ped.downT -= dt;
      if (ped.downT <= 0) {
        ped.state = 'walk';
        ped.fleeT = 0;
      }
      continue;
    }
    // Fleeing: run away from the player at double speed, then calm down.
    let speed = ped.speed;
    if (ped.state === 'flee') {
      speed = ped.speed * 2.2;
      ped.fleeT -= dt;
      if (ped.fleeT <= 0) ped.state = 'walk';
      ped.angle = Math.atan2(ped.y - py, ped.x - px);
    } else {
      // Strolling: wander; occasionally pick a new heading.
      ped.wanderT -= dt;
      if (ped.wanderT <= 0) {
        ped.wanderT = randRange(game.rng, 3, 8);
        ped.angle += randRange(game.rng, -1.2, 1.2);
      }
      // A speeding car nearby makes peds scatter.
      if (game.player.car) {
        const car = game.player.car;
        const d = Math.hypot(ped.x - car.x, ped.y - car.y);
        if (d < 120 && Math.abs(car.speed || 0) > 200) {
          ped.state = 'flee';
          ped.fleeT = 2;
          ped.angle = Math.atan2(ped.y - car.y, ped.x - car.x);
        }
      }
    }
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    const res = collideCircle(game.city, ped.x, ped.y, 10);
    ped.x = res.x;
    ped.y = res.y;
    // Keep peds inside the city.
    ped.x = clamp(ped.x, 30, WORLD - 30);
    ped.y = clamp(ped.y, 30, WORLD - 30);
  }
}

export function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.rotate(ped.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 2, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.arc(5, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
