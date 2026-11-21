// render.js — draws the whole world to the canvas: ground, beach and sea,
// roads with lane dashes and crosswalks, buildings with rooftops, palms,
// the pier, zone labels, the mission beacon, cars, peds, enemies, the
// player, and effects. The camera is centred on the player.

import { WORLD, ROAD_EVERY, ROAD_W, BEACH_X, SEA_X, PIER, zoneAt } from './city.js';
import { drawCar } from './vehicles.js';
import { drawPed } from './people.js';
import { drawEnemy } from './combat.js';

function drawGround(ctx, city, cam, vw, vh) {
  // Base grass.
  ctx.fillStyle = '#3d5a34';
  ctx.fillRect(cam.x, cam.y, vw, vh);
  // City blocks: slightly lighter green between roads.
  ctx.fillStyle = '#46683c';
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      const bx = i * ROAD_EVERY + ROAD_W / 2;
      const by = j * ROAD_EVERY + ROAD_W / 2;
      ctx.fillRect(bx, by, ROAD_EVERY - ROAD_W, ROAD_EVERY - ROAD_W);
    }
  }
  // Beach sand, then the sea.
  ctx.fillStyle = '#d9c48a';
  ctx.fillRect(Math.max(BEACH_X, cam.x), cam.y, Math.min(SEA_X, cam.x + vw) - Math.max(BEACH_X, cam.x), vh);
  const seaGrad = ctx.createLinearGradient(SEA_X, 0, SEA_X + 300, 0);
  seaGrad.addColorStop(0, '#2a6a8a');
  seaGrad.addColorStop(1, '#1b4a6b');
  ctx.fillStyle = seaGrad;
  ctx.fillRect(Math.max(SEA_X, cam.x), cam.y, cam.x + vw - Math.max(SEA_X, cam.x), vh);
  // Animated wave lines on the sea edge.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 4; k++) {
    const wy = cam.y + ((k * 173 + Math.floor(performance.now() / 900) * 40) % Math.max(1, vh + 100)) - 50;
    ctx.beginPath();
    ctx.moveTo(SEA_X + 6, wy);
    ctx.lineTo(SEA_X + 60, wy + 8);
    ctx.stroke();
  }
}

function drawRoads(ctx, cam, vw, vh) {
  ctx.fillStyle = '#33363b';
  for (let k = 0; k <= 12; k++) {
    const v = k * ROAD_EVERY;
    ctx.fillRect(v - ROAD_W / 2, cam.y, ROAD_W, vh);
    ctx.fillRect(cam.x, v - ROAD_W / 2, vw, ROAD_W);
  }
  // Centre dashes.
  ctx.strokeStyle = '#c8b45a';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  for (let k = 0; k <= 12; k++) {
    const v = k * ROAD_EVERY;
    ctx.beginPath();
    ctx.moveTo(v, cam.y);
    ctx.lineTo(v, cam.y + vh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cam.x, v);
    ctx.lineTo(cam.x + vw, v);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i <= 12; i++) {
    for (let j = 0; j <= 12; j++) {
      const cx = i * ROAD_EVERY;
      const cy = j * ROAD_EVERY;
      if (cx < cam.x - 80 || cx > cam.x + vw + 80 || cy < cam.y - 80 || cy > cam.y + vh + 80) continue;
      for (let s = -3; s <= 3; s++) {
        ctx.fillRect(cx - 26 + s * 8, cy - ROAD_W / 2 + 4, 4, 10);
        ctx.fillRect(cx - 26 + s * 8, cy + ROAD_W / 2 - 14, 4, 10);
      }
    }
  }
}

function drawBuildings(ctx, city, cam, vw, vh) {
  for (const b of city.buildings) {
    if (b.x > cam.x + vw || b.x + b.w < cam.x || b.y > cam.y + vh || b.y + b.h < cam.y) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(b.x + 4, b.y + 5, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Rooftop detail: a lighter inset + a skylight block.
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.3, b.w * 0.2, b.h * 0.2);
    if (b.kind === 'landmark') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2 + 5);
    }
  }
}

function drawPier(ctx, cam, vw, vh) {
  if (PIER.x > cam.x + vw || PIER.x + PIER.w < cam.x || PIER.y > cam.y + vh || PIER.y + PIER.h < cam.y) return;
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(PIER.x, PIER.y, PIER.w, PIER.h);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  for (let x = PIER.x + 10; x < PIER.x + PIER.w; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, PIER.y);
    ctx.lineTo(x, PIER.y + PIER.h);
    ctx.stroke();
  }
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(PIER.x + PIER.w - 8, PIER.y - 30, 8, 30);
  ctx.fillRect(PIER.x + PIER.w - 8, PIER.y + PIER.h, 8, 30);
}

function drawPalms(ctx, city, cam, vw, vh) {
  for (const p of city.palms) {
    if (p.x < cam.x - 20 || p.x > cam.x + vw + 20 || p.y < cam.y - 20 || p.y > cam.y + vh + 20) continue;
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    ctx.fillStyle = '#2f7a33';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(p.x - 2, p.y - 2, p.r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawZoneLabels(ctx, cam, vw, vh) {
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  const spots = [
    [600, 450, 'WEST END'],
    [1800, 450, 'NORTHSIDE'],
    [2750, 750, 'EAST HARBOUR'],
    [1800, 1650, 'DOWNTOWN'],
    [600, 2850, 'OLD TOWN'],
    [1800, 3150, 'SOUTHSIDE'],
    [3250, 900, 'PALMA BEACH'],
  ];
  for (const [x, y, label] of spots) {
    if (x < cam.x - 200 || x > cam.x + vw + 200 || y < cam.y - 100 || y > cam.y + vh + 100) continue;
    ctx.fillText(label, x, y);
  }
}

function drawBeacon(ctx, game) {
  if (!game.missionMarker) return;
  const m = game.missionMarker;
  const pulse = 18 + Math.sin(game.time * 4) * 5;
  ctx.strokeStyle = 'rgba(255, 235, 59, 0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(m.x, m.y, pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffeb3b';
  ctx.beginPath();
  ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
  ctx.fill();
  // A light pillar so the marker is visible from a distance.
  const grad = ctx.createLinearGradient(m.x, m.y - 160, m.x, m.y);
  grad.addColorStop(0, 'rgba(255,235,59,0)');
  grad.addColorStop(1, 'rgba(255,235,59,0.35)');
  ctx.fillStyle = grad;
  ctx.fillRect(m.x - 6, m.y - 160, 12, 160);
}

function drawPlayer(ctx, game) {
  const p = game.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.aimAngle);
  // Shadow + body.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b820';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.arc(4, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  // Gun barrel when aiming with the mouse held or recently fired.
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(8, -2, 12, 4);
  ctx.restore();
  // Aim line (short, subtle).
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(p.aimAngle) * 20, p.y + Math.sin(p.aimAngle) * 20);
  ctx.lineTo(p.x + Math.cos(p.aimAngle) * 46, p.y + Math.sin(p.aimAngle) * 46);
  ctx.stroke();
}

export function drawWorld(game, ctx, cam, vw, vh) {
  const p = game.player;
  drawGround(ctx, game.city, cam, vw, vh);
  drawRoads(ctx, cam, vw, vh);
  drawPier(ctx, cam, vw, vh);
  drawBuildings(ctx, game.city, cam, vw, vh);
  drawPalms(ctx, game.city, cam, vw, vh);
  drawZoneLabels(ctx, cam, vw, vh);
  drawBeacon(ctx, game);
  // Skid marks under the actors; particles/tracers/floaters on top.
  if (game.effects) game.effects.drawSkids(ctx);
  for (const car of game.cars) {
    if (!car.dead) drawCar(ctx, car);
  }
  for (const ped of game.peds) {
    if (!ped.dead) drawPed(ctx, ped);
  }
  for (const e of game.enemies) {
    if (!e.dead) drawEnemy(ctx, e);
  }
  if (!game.player.car) drawPlayer(ctx, game);
  // Health bar over the player when hurt.
  if (p.health < 100 && !p.car) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(p.x - 16, p.y - 24, 32, 5);
    ctx.fillStyle = p.health > 50 ? '#4caf50' : p.health > 25 ? '#ff9800' : '#f44336';
    ctx.fillRect(p.x - 16, p.y - 24, 32 * (p.health / 100), 5);
  }
  // Particles, tracers and floating text on top of everything.
  if (game.effects) game.effects.draw(ctx);
}
