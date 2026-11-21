// combat.js — shooting and the enemies who shoot back.
//
// Shooting is mouse-aim hitscan: a ray from the shooter picks the nearest
// thing it crosses (enemy, ped, car) within range and behind no building.
// Cops chase and shoot; Harbor Kings hold their ground and shoot. Cop kills
// raise the wanted level; king kills report to the mission system.

import { clamp, segmentHitsRects } from './util.js';
import { losBlockers } from './city.js';
import { MODELS, damageCar } from './vehicles.js';
import { knockDownPed } from './people.js';

export const SHOOT_RANGE = 520;
export const PLAYER_DAMAGE = 34;

export function spawnEnemy(game, x, y, type) {
  const e = {
    x, y,
    angle: 0,
    type, // 'cop' | 'king'
    health: type === 'cop' ? 60 : 80,
    shootCd: 1 + game.rng() * 1.5,
    speed: type === 'cop' ? 150 : 0,
    dead: false,
  };
  game.enemies.push(e);
  return e;
}

export function hasLineOfSight(game, x1, y1, x2, y2) {
  return !segmentHitsRects(x1, y1, x2, y2, losBlockers(game.city));
}

// Fire one hitscan shot from (x, y) along `angle`. Returns what was hit:
// { kind: 'enemy'|'ped'|'car'|'wall', target?, x, y } or null on a clean miss.
export function shoot(game, x, y, angle, { fromPlayer = true } = {}) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = null;
  let bestD = SHOOT_RANGE;

  const consider = (tx, ty, radius, kind, target) => {
    const rx = tx - x;
    const ry = ty - y;
    const along = rx * dx + ry * dy;
    if (along < 0 || along > bestD) return;
    const perp = Math.abs(-rx * dy + ry * dx);
    if (perp > radius + 4) return;
    bestD = along;
    best = { kind, target, x: tx, y: ty };
  };

  for (const e of game.enemies) {
    if (e.dead) continue;
    if (fromPlayer || e !== undefined) consider(e.x, e.y, 13, 'enemy', e);
  }
  for (const ped of game.peds) {
    if (ped.dead || ped.state === 'down') continue;
    consider(ped.x, ped.y, 9, 'ped', ped);
  }
  for (const car of game.cars) {
    if (car.dead) continue;
    const m = MODELS[car.model];
    const relx = car.x - x;
    const rely = car.y - y;
    const along = relx * dx + rely * dy;
    if (along < 0 || along > bestD) continue;
    const perp = Math.abs(-relx * dy + rely * dx);
    if (perp > m.wid / 2 + 4) continue;
    bestD = along;
    best = { kind: 'car', target: car, x: car.x, y: car.y };
  }

  // A wall cuts the shot short.
  const endX = x + dx * bestD;
  const endY = y + dy * bestD;
  const blocked = segmentHitsRects(x, y, endX, endY, losBlockers(game.city));
  if (game.effects) {
    game.effects.tracer(x, y, endX, endY);
    game.effects.muzzle(x + dx * 16, y + dy * 16);
  }

  if (blocked && !best) return { kind: 'wall', x: endX, y: endY };
  if (!best) return null;

  if (best.kind === 'enemy') {
    hurtEnemy(game, best.target, fromPlayer ? PLAYER_DAMAGE : 20);
  } else if (best.kind === 'ped') {
    knockDownPed(game, best.target, fromPlayer);
  } else if (best.kind === 'car') {
    damageCar(game, best.target, fromPlayer ? 12 : 6);
    if (game.effects) game.effects.sparks(best.x, best.y, 4);
  }
  return best;
}

export function hurtEnemy(game, enemy, dmg) {
  if (enemy.dead) return;
  enemy.health -= dmg;
  if (game.effects) game.effects.blood(enemy.x, enemy.y, 5);
  if (enemy.health <= 0) killEnemy(game, enemy);
}

export function killEnemy(game, enemy) {
  if (enemy.dead) return;
  enemy.dead = true;
  if (game.effects) {
    game.effects.blood(enemy.x, enemy.y, 14);
    game.effects.floater(enemy.x, enemy.y - 14, '+$0', '#fff');
  }
  if (enemy.type === 'cop' && game.police) game.police.addWanted(1);
  if (enemy.type === 'king' && game.missions) game.missions.onEnemyDown(enemy);
  if (game.sfx) game.sfx('blip');
}

export function hurtPlayer(game, dmg) {
  const p = game.player;
  if (p.invulnT > 0 || game.state !== 'playing') return;
  p.health -= dmg;
  p.lastHurtT = game.time;
  if (game.effects) game.effects.blood(p.x, p.y, 4);
  if (p.health <= 0) {
    p.health = 0;
    if (game.onPlayerDown) game.onPlayerDown();
  }
}

export function updateEnemies(game, dt) {
  const p = game.player;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    const sees = d < 460 && hasLineOfSight(game, e.x, e.y, p.x, p.y);
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    if (e.type === 'cop') {
      // Cops close in until they are near enough to shoot.
      if (d > 130) {
        const step = e.speed * dt;
        const nx = e.x + Math.cos(e.angle) * step;
        const ny = e.y + Math.sin(e.angle) * step;
        e.x = nx;
        e.y = ny;
      }
      if (sees && d < 380) {
        e.shootCd -= dt;
        if (e.shootCd <= 0) {
          e.shootCd = 0.9 + game.rng() * 0.7;
          shoot(game, e.x, e.y, e.angle, { fromPlayer: false });
          hurtPlayer(game, 7);
        }
      }
    } else {
      // Kings stand their ground and open fire inside 380px.
      if (sees && d < 380) {
        e.shootCd -= dt;
        if (e.shootCd <= 0) {
          e.shootCd = 1.1 + game.rng() * 0.8;
          shoot(game, e.x, e.y, e.angle, { fromPlayer: false });
          hurtPlayer(game, 9);
        }
      }
    }
  }
  // Prune the dead so the array does not grow forever.
  if (game.enemies.length > 40) game.enemies = game.enemies.filter((e) => !e.dead);
}

export function drawEnemy(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 2, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = e.type === 'cop' ? '#223a6b' : '#a02020';
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = e.type === 'cop' ? '#d8d8d8' : '#e8c39a';
  ctx.beginPath();
  ctx.arc(5, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  // Gun barrel.
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -1.5, 10, 3);
  ctx.restore();
  // Health bar.
  if (e.health < (e.type === 'cop' ? 60 : 80)) {
    const max = e.type === 'cop' ? 60 : 80;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(e.x - 14, e.y - 20, 28, 4);
    ctx.fillStyle = '#f44336';
    ctx.fillRect(e.x - 14, e.y - 20, 28 * clamp(e.health / max, 0, 1), 4);
  }
}
