// hud.js — the DOM HUD (health, cash, wanted stars, objective, hints,
// speedometer, zone name) plus the round minimap canvas and banners.

import { clamp } from './util.js';
import { WORLD, zoneAt } from './city.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    hud: $('hud'),
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    cash: $('cash'),
    stars: $('stars'),
    zone: $('zone'),
    minimap: $('minimap'),
    speed: $('speed'),
    speedometer: $('speedometer'),
    carHealth: $('car-health'),
    objectiveTitle: $('objective-title'),
    objectiveText: $('objective-text'),
    hint: $('hint'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
  };
  const mm = els.minimap ? els.minimap.getContext('2d') : null;
  let bannerT = 0;

  function showHud(on) {
    if (els.hud) els.hud.style.display = on ? 'block' : 'none';
  }

  function banner(title, sub, color) {
    if (!els.banner) return;
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub || '';
    els.banner.style.borderColor = color || '#ffd54a';
    els.banner.style.display = 'block';
    bannerT = 3.2;
  }

  function setHint(text) {
    if (els.hint) els.hint.textContent = text || '';
  }

  function setObjective(title, text) {
    if (els.objectiveTitle) els.objectiveTitle.textContent = title;
    if (els.objectiveText) els.objectiveText.textContent = text;
  }

  function update(game, dt) {
    const p = game.player;
    if (els.healthFill) els.healthFill.style.width = `${clamp(p.health, 0, 100)}%`;
    if (els.healthText) els.healthText.textContent = `${Math.ceil(p.health)}`;
    if (els.cash) els.cash.textContent = `$${Math.floor(p.cash)}`;
    if (els.stars) {
      els.stars.textContent = '★'.repeat(game.wanted) + '☆'.repeat(5 - game.wanted);
      els.stars.style.color = game.wanted > 0 ? '#ff5252' : '#cfd8dc';
    }
    if (els.zone) els.zone.textContent = zoneAt(p.x, p.y);
    if (els.speedometer) {
      if (p.car) {
        els.speedometer.style.display = 'block';
        if (els.speed) els.speed.textContent = `${Math.round(Math.abs(p.car.speed || 0) * 0.36)}`;
        if (els.carHealth) els.carHealth.textContent = `CAR ${Math.max(0, Math.ceil(p.car.health))}`;
      } else {
        els.speedometer.style.display = 'none';
      }
    }
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0 && els.banner) els.banner.style.display = 'none';
    }
    drawMinimap(game);
  }

  function drawMinimap(game) {
    if (!mm || !els.minimap) return;
    const S = els.minimap.width;
    const scale = S / WORLD;
    mm.clearRect(0, 0, S, S);
    // Sea + sand on the east edge.
    mm.fillStyle = '#1b4a6b';
    mm.fillRect(S * (3440 / WORLD), 0, S, S);
    mm.fillStyle = '#d9c48a';
    mm.fillRect(S * (3100 / WORLD), 0, S * (340 / WORLD), S);
    // City ground.
    mm.fillStyle = '#2e3d2e';
    mm.fillRect(0, 0, S * (3100 / WORLD), S);
    // Roads.
    mm.strokeStyle = '#4a4a4a';
    mm.lineWidth = 1;
    for (let k = 0; k <= 12; k++) {
      const v = (k * 300 * scale);
      mm.beginPath();
      mm.moveTo(v, 0);
      mm.lineTo(v, S);
      mm.stroke();
      mm.beginPath();
      mm.moveTo(0, v);
      mm.lineTo(S, v);
      mm.stroke();
    }
    // Landmarks.
    for (const lm of Object.values(game.city.landmarkById)) {
      mm.fillStyle = '#ffd54a';
      mm.fillRect(lm.cx * scale - 2, lm.cy * scale - 2, 4, 4);
    }
    // Mission marker.
    if (game.missionMarker) {
      const mx = game.missionMarker.x * scale;
      const my = game.missionMarker.y * scale;
      mm.fillStyle = '#ffeb3b';
      mm.beginPath();
      mm.arc(mx, my, 4, 0, Math.PI * 2);
      mm.fill();
      mm.strokeStyle = '#ffeb3b';
      mm.beginPath();
      mm.arc(mx, my, 7 + Math.sin(game.time * 4) * 2, 0, Math.PI * 2);
      mm.stroke();
    }
    // Cops (blue) and cruisers (dark blue).
    mm.fillStyle = '#42a5f5';
    for (const e of game.enemies) {
      if (e.dead || e.type !== 'cop') continue;
      mm.fillRect(e.x * scale - 1.5, e.y * scale - 1.5, 3, 3);
    }
    for (const c of game.cars) {
      if (c.role !== 'cruiser' || c.dead) continue;
      mm.fillStyle = '#1565c0';
      mm.fillRect(c.x * scale - 1.5, c.y * scale - 1.5, 3, 3);
    }
    // Player: white dot with a dark ring.
    const px = game.player.x * scale;
    const py = game.player.y * scale;
    mm.fillStyle = '#fff';
    mm.beginPath();
    mm.arc(px, py, 3.5, 0, Math.PI * 2);
    mm.fill();
    mm.strokeStyle = '#111';
    mm.beginPath();
    mm.arc(px, py, 3.5, 0, Math.PI * 2);
    mm.stroke();
  }

  return { showHud, banner, setHint, setObjective, update, drawMinimap };
}
