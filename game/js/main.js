// main.js — orchestration for SOLMAR.
//
// One `game` object for the whole session, reset in place — so
// window.__solmar.game never goes stale across NEW GAME / CONTINUE. The
// state machine is title / playing / paused / wasted / busted. The player
// walks (WASD, SHIFT to sprint), steals and drives cars (E, SPACE
// handbrake), shoots with the mouse, pays the hospital ($100) and the auto
// spa ($150 respray clears wanted), and the mission system drives the
// objective. URL params: ?seed=N for a deterministic city, ?autostart=1
// to skip the title screen (tests and screenshots).

import { buildCity, zoneAt, WORLD, collideCircle, PIER } from './city.js';
import { makeRng, clamp } from './util.js';
import {
  MODELS, createCar, driveCar, collideCars, damageCar,
  updateTraffic, spawnTrafficCar, spawnParkedCar, MODEL_KEYS,
} from './vehicles.js';
import { createPed, spawnPeds, updatePeds, knockDownPed } from './people.js';
import { shoot, updateEnemies, hasLineOfSight, spawnEnemy } from './combat.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { hasSave, saveGame, loadSave, clearSave } from './save.js';
import { createInput } from './input.js';
import { ensureAudio, sfx, updateEngine, updateSiren, stopAllLoops } from './audio.js';
import { createEffects } from './effects.js';
import { drawWorld } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const urlSeed = params.get('seed') ? parseInt(params.get('seed'), 10) : null;
const autostart = params.get('autostart') === '1';

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const hud = createHud();
const input = createInput(canvas);

// The single game object. resetGame() refills it; it is never replaced.
const game = {
  state: 'title',
  time: 0,
  seed: 7,
  city: null,
  rng: null,
  player: null,
  cars: [],
  peds: [],
  enemies: [],
  wanted: 0,
  missionMarker: null,
  objective: null,
  stats: { shots: 0 },
  cam: { x: 0, y: 0 },
  shootCd: 0,
  police: null,
  missions: null,
  effects: null,
  hud,
  sfx: (name) => {
    if (sfx[name]) sfx[name]();
  },
};

game.saveGame = () => saveGame(game);
game.onPlayerDown = () => showEndScreen('wasted');
game.onPlayerBusted = () => showEndScreen('busted');

function freshPlayer(x, y) {
  return {
    x, y,
    angle: -Math.PI / 2,
    aimAngle: 0,
    health: 100,
    cash: 200,
    car: null,
    invulnT: 0,
    lastHurtT: -99,
  };
}

function resetGame(seed) {
  game.seed = seed;
  game.rng = makeRng(seed);
  game.city = buildCity(seed);
  game.cars = [];
  game.peds = [];
  game.enemies = [];
  game.wanted = 0;
  game.time = 0;
  game.shootCd = 0;
  game.missionMarker = null;
  game.objective = null;
  game.stats = { shots: 0 };
  game.effects = createEffects();
  game.police = createPolice(game);
  game.missions = createMissions(game);

  const hideout = game.city.landmarkById.hideout;
  game.player = freshPlayer(hideout.cx, hideout.cy + 130);

  // The red sports car waiting in the eastbound lane of the road just
  // south of the hideout (right-hand lane: eastbound runs on the +y side).
  const southRoad = Math.ceil((hideout.cy + 1) / 300) * 300;
  const red = createCar(hideout.cx, southRoad + 16, 0, 'sports', 'parked');
  game.cars.push(red);

  for (let i = 0; i < 10; i++) spawnTrafficCar(game, game.player.x, game.player.y);
  for (let i = 0; i < 8; i++) {
    spawnParkedCar(game, 300 + game.rng() * 2800, 300 + game.rng() * 2800);
  }
  spawnPeds(game, 24);

  game.cam.x = clamp(game.player.x - canvas.width / 2, 0, Math.max(0, WORLD - canvas.width));
  game.cam.y = clamp(game.player.y - canvas.height / 2, 0, Math.max(0, WORLD - canvas.height));

  game.missions.start('first-wheels');
}

function startNewGame() {
  ensureAudio();
  const seed = urlSeed !== null && !Number.isNaN(urlSeed) ? urlSeed : Math.floor(Math.random() * 100000);
  resetGame(seed);
  game.state = 'playing';
  showScreen(null);
  hud.showHud(true);
  hud.banner('SOLMAR BAY', 'Danny "Dice" Marlow — Vera is waiting. Make something of it.', '#ffd54a');
}

function continueGame() {
  const data = loadSave();
  if (!data) return;
  ensureAudio();
  resetGame(data.seed);
  const p = game.player;
  p.x = data.x;
  p.y = data.y;
  p.angle = data.angle || 0;
  p.cash = data.cash;
  p.health = data.health;
  game.wanted = data.wanted || 0;
  game.stats = data.stats || { shots: 0 };
  if (data.car) {
    const car = createCar(data.car.x, data.car.y, data.car.angle, data.car.model, 'player');
    car.health = data.car.health;
    if (data.car.color) car.color = data.car.color;
    game.cars.push(car);
    p.car = car;
  }
  if (data.missions) game.missions.restore(data.missions);
  game.state = 'playing';
  showScreen(null);
  hud.showHud(true);
  hud.banner('WELCOME BACK', 'Same city, same Dice. Pick up where you left off.', '#ffd54a');
}

// --- Screens ----------------------------------------------------------------

function showScreen(name) {
  for (const id of ['title-screen', 'pause-screen', 'wasted-screen', 'busted-screen']) {
    const el = document.getElementById(id);
    if (el) el.style.display = id === `${name}-screen` ? 'flex' : 'none';
  }
  if (name === 'title') {
    const cont = document.getElementById('continue-btn');
    if (cont) cont.style.display = hasSave() ? 'block' : 'none';
  }
}

function showEndScreen(kind) {
  game.state = kind;
  stopAllLoops();
  game.sfx('wasted');
  showScreen(kind);
  hud.showHud(false);
  const fine = kind === 'wasted' ? 100 : 150;
  const el = document.getElementById(kind === 'wasted' ? 'wasted-fine' : 'busted-fine');
  if (el) el.textContent = `Fine: $${fine} — cash $${Math.max(0, Math.floor(game.player.cash - fine))} left.`;
}

function respawnAfterEnd() {
  const kind = game.state;
  const fine = kind === 'wasted' ? 100 : 150;
  const p = game.player;
  p.cash = Math.max(0, p.cash - fine);
  p.health = 100;
  p.invulnT = 2;
  game.wanted = 0;
  if (game.police) game.police.clearWanted();
  if (p.car) {
    p.car.role = 'parked';
    p.car.vx = 0;
    p.car.vy = 0;
    p.car = null;
  }
  const hospital = game.city.landmarkById.hospital;
  p.x = hospital.cx;
  p.y = hospital.cy + 130;
  game.state = 'playing';
  showScreen(null);
  hud.showHud(true);
  hud.banner('BACK ON YOUR FEET', kind === 'wasted' ? 'The hospital patched you up.' : 'Bail paid. Stay out of trouble.', '#7fb069');
  game.saveGame();
}

// --- Player actions ----------------------------------------------------------

function nearestCar(maxD) {
  let best = null;
  let bestD = maxD;
  for (const car of game.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - game.player.x, car.y - game.player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function stealCar() {
  const car = nearestCar(85);
  if (!car) return;
  if (car.wrecked) {
    hud.setHint('That wreck is going nowhere.');
    return;
  }
  const p = game.player;
  p.car = car;
  car.role = 'player';
  car.vx = 0;
  car.vy = 0;
  p.x = car.x;
  p.y = car.y;
  game.sfx('steal');
  if (game.police.isSeen()) {
    game.police.addWanted(1);
    hud.banner('STOLEN IN BROAD DAYLIGHT', 'Someone saw that. +1 wanted.', '#e57373');
  } else {
    hud.setHint('');
  }
}

function exitCar() {
  const p = game.player;
  const car = p.car;
  if (!car) return;
  car.role = 'parked';
  car.vx = 0;
  car.vy = 0;
  p.x = car.x - Math.sin(car.angle) * 42;
  p.y = car.y + Math.cos(car.angle) * 42;
  p.car = null;
  const res = collideCircle(game.city, p.x, p.y, 12);
  p.x = res.x;
  p.y = res.y;
}

function tryService() {
  const p = game.player;
  const spa = game.city.landmarkById.spa;
  const hospital = game.city.landmarkById.hospital;
  if (p.car && Math.hypot(p.car.x - spa.cx, p.car.y - spa.cy) < 170) {
    if (p.cash < 150) {
      hud.banner('NOT ENOUGH CASH', 'Respray costs $150.', '#e57373');
      return;
    }
    p.cash -= 150;
    game.police.clearWanted();
    p.car.health = 100;
    game.sfx('heal');
    hud.banner('RESPRAYED', 'New paint, clean slate. Wanted cleared.', '#7fb069');
    return;
  }
  if (!p.car && Math.hypot(p.x - hospital.cx, p.y - hospital.cy) < 170) {
    if (p.health >= 100) {
      hud.setHint('You are already at full health.');
      return;
    }
    if (p.cash < 100) {
      hud.banner('NOT ENOUGH CASH', 'Treatment costs $100.', '#e57373');
      return;
    }
    p.cash -= 100;
    p.health = 100;
    game.sfx('heal');
    hud.banner('PATCHED UP', 'Solmar General — good as new.', '#7fb069');
  }
}

function updatePlayer(dt) {
  const p = game.player;
  if (p.invulnT > 0) p.invulnT -= dt;
  // Slow health regen after 8s without taking damage.
  if (p.health < 100 && game.time - p.lastHurtT > 8) {
    p.health = Math.min(100, p.health + 3 * dt);
  }

  if (p.car) {
    const car = p.car;
    if (car.wrecked) {
      exitCar();
      hud.banner('CAR WRECKED', 'That ride is finished.', '#e57373');
      return;
    }
    const throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) + (input.down('KeyS') || input.down('ArrowDown') ? -1 : 0);
    const steer = (input.down('KeyA') || input.down('ArrowLeft') ? -1 : 0) + (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0);
    const handbrake = input.down('Space');
    driveCar(game, car, { throttle, steer, handbrake }, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    // Skid marks while drifting.
    if (handbrake && Math.abs(car.speed || 0) > 120 && game.rng() < 0.5) {
      game.effects.skid(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, car.angle);
    }
    if (input.wasPressed('KeyE')) exitCar();
    if (input.wasPressed('KeyF')) tryService();
    return;
  }

  // On foot.
  let mx = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
  let my = (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0) - (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0);
  const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = sprint ? 300 : 170;
  if (mx !== 0 || my !== 0) {
    const len = Math.hypot(mx, my);
    mx /= len;
    my /= len;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    p.angle = Math.atan2(my, mx);
    const res = collideCircle(game.city, p.x, p.y, 12);
    p.x = res.x;
    p.y = res.y;
    // Shove out of cars.
    for (const car of game.cars) {
      if (car.dead) continue;
      const m = MODELS[car.model];
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      const min = m.len / 2;
      if (d < min && d > 0.01) {
        p.x = car.x - ((car.x - p.x) / d) * min;
        p.y = car.y - ((car.y - p.y) / d) * min;
      }
    }
  }

  // Aim with the mouse (world position = camera + cursor).
  const aimX = game.cam.x + input.mouse.x;
  const aimY = game.cam.y + input.mouse.y;
  p.aimAngle = Math.atan2(aimY - p.y, aimX - p.x);

  // Shoot on click, rate-limited.
  game.shootCd -= dt;
  if (input.mouse.clicked && game.shootCd <= 0) {
    game.shootCd = 0.18;
    game.stats.shots++;
    game.sfx('shoot');
    shoot(game, p.x, p.y, p.aimAngle, { fromPlayer: true });
    game.effects.addShake(1.5);
    scareNearbyPeds();
  }

  if (input.wasPressed('KeyE')) stealCar();
  if (input.wasPressed('KeyF')) tryService();
}

function scareNearbyPeds() {
  const p = game.player;
  for (const ped of game.peds) {
    if (ped.dead || ped.state === 'down') continue;
    if (Math.hypot(ped.x - p.x, ped.y - p.y) < 320) {
      ped.state = 'flee';
      ped.fleeT = 2.5;
      ped.angle = Math.atan2(ped.y - p.y, ped.x - p.x);
    }
  }
}

// Cars (player or traffic) running peds over.
function carPedCollisions() {
  for (const car of game.cars) {
    if (car.dead) continue;
    const spd = Math.hypot(car.vx, car.vy);
    if (spd < 60) continue;
    for (const ped of game.peds) {
      if (ped.dead || ped.state === 'down') continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26) {
        knockDownPed(game, ped, car.role === 'player');
      }
    }
  }
}

function updateHint() {
  const p = game.player;
  const spa = game.city.landmarkById.spa;
  const hospital = game.city.landmarkById.hospital;
  if (p.car) {
    if (Math.hypot(p.car.x - spa.cx, p.car.y - spa.cy) < 170 && (game.wanted > 0 || p.car.health < 100)) {
      hud.setHint('F — Respray $150 (clears wanted, repairs car)');
      return;
    }
    hud.setHint('E — Exit car · SPACE — Handbrake');
    return;
  }
  const car = nearestCar(85);
  if (car && !car.wrecked) {
    hud.setHint('E — Steal car');
    return;
  }
  if (Math.hypot(p.x - hospital.cx, p.y - hospital.cy) < 170 && p.health < 100) {
    hud.setHint('F — Heal $100');
    return;
  }
  hud.setHint('WASD — Move · SHIFT — Sprint · Click — Shoot · E — Steal car');
}

// --- Main loop ---------------------------------------------------------------

let lastT = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  // postUpdate runs in `finally`: if an update ever throws, the pressed-key
  // edges are still cleared, so a stale KeyE cannot steal-and-instantly-exit
  // a car on the next frame.
  try {
    frameInner(dt);
  } finally {
    input.postUpdate();
  }
}

function frameInner(dt) {
  if (game.state === 'title') {
    // Attract mode: slow pan across the city behind the title screen.
    game.time += dt;
    const t = game.time * 0.05;
    game.cam.x = clamp(1800 + Math.cos(t) * 900 - canvas.width / 2, 0, Math.max(0, WORLD - canvas.width));
    game.cam.y = clamp(1800 + Math.sin(t * 0.7) * 700 - canvas.height / 2, 0, Math.max(0, WORLD - canvas.height));
    drawWorld(game, ctx, game.cam, canvas.width, canvas.height);
    return;
  }

  if (game.state === 'paused' || game.state === 'wasted' || game.state === 'busted') {
    // Esc resumes from pause (wasted/busted need their buttons).
    if (game.state === 'paused' && input.wasPressed('Escape')) {
      game.state = 'playing';
      showScreen(null);
      hud.showHud(true);
    }
    drawWorld(game, ctx, game.cam, canvas.width, canvas.height);
    return;
  }

  // Playing.
  game.time += dt;
  ensureAudio();

  if (input.wasPressed('Escape')) {
    game.state = 'paused';
    showScreen('pause');
    hud.showHud(false);
    stopAllLoops();
    return;
  }

  updatePlayer(dt);
  updateTraffic(game, dt);
  updatePeds(game, dt);
  updateEnemies(game, dt);
  if (game.police) game.police.update(dt);
  if (game.missions) game.missions.update(dt);
  collideCars(game, dt);
  carPedCollisions();
  game.effects.update(dt);
  updateHint();

  // Camera follows the player, with shake.
  const shake = game.effects.shakeAmount();
  const sx = shake > 0 ? (game.rng() - 0.5) * shake : 0;
  const sy = shake > 0 ? (game.rng() - 0.5) * shake : 0;
  game.cam.x = clamp(game.player.x - canvas.width / 2 + sx, 0, Math.max(0, WORLD - canvas.width));
  game.cam.y = clamp(game.player.y - canvas.height / 2 + sy, 0, Math.max(0, WORLD - canvas.height));

  // Engine + siren loops.
  const driving = !!game.player.car;
  updateEngine(driving, driving ? Math.abs(game.player.car.speed || 0) / 560 : 0);
  const anyCruiser = game.cars.some((c) => c.role === 'cruiser' && !c.dead);
  updateSiren(anyCruiser && game.wanted > 0);

  hud.update(game, dt);
  drawWorld(game, ctx, game.cam, canvas.width, canvas.height);
}

// --- Menu wiring -------------------------------------------------------------

document.getElementById('new-game-btn')?.addEventListener('click', () => {
  game.sfx('click');
  startNewGame();
});
document.getElementById('continue-btn')?.addEventListener('click', () => {
  game.sfx('click');
  continueGame();
});
document.getElementById('howto-btn')?.addEventListener('click', () => {
  const el = document.getElementById('howto');
  if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
});
document.getElementById('resume-btn')?.addEventListener('click', () => {
  game.state = 'playing';
  showScreen(null);
  hud.showHud(true);
});
document.getElementById('save-btn')?.addEventListener('click', () => {
  if (game.saveGame()) hud.banner('SAVED', 'Progress saved. Come back any time.', '#7fb069');
});
document.getElementById('restart-mission-btn')?.addEventListener('click', () => {
  if (game.missions) game.missions.restartCurrent();
  game.state = 'playing';
  showScreen(null);
  hud.showHud(true);
});
document.getElementById('quit-btn')?.addEventListener('click', () => {
  game.state = 'title';
  hud.showHud(false);
  showScreen('title');
});
document.getElementById('respawn-btn')?.addEventListener('click', respawnAfterEnd);
document.getElementById('bail-btn')?.addEventListener('click', respawnAfterEnd);

// --- Boot --------------------------------------------------------------------

resetGame(urlSeed !== null && !Number.isNaN(urlSeed) ? urlSeed : 7);
game.state = 'title';
showScreen('title');
hud.showHud(false);

if (autostart) startNewGame();

// Debug hooks for tests and screenshots. Teleport also zeroes car velocity
// so the player does not slide away after the jump.
window.__solmar = {
  game,
  teleport(x, y) {
    const p = game.player;
    p.x = x;
    p.y = y;
    if (p.car) {
      p.car.x = x;
      p.car.y = y;
      p.car.vx = 0;
      p.car.vy = 0;
    }
    game.cam.x = clamp(x - canvas.width / 2, 0, Math.max(0, WORLD - canvas.width));
    game.cam.y = clamp(y - canvas.height / 2, 0, Math.max(0, WORLD - canvas.height));
  },
  setWanted(n) {
    if (game.police) game.police.setWanted(n);
  },
  giveCash(n) {
    game.player.cash += n;
  },
  zone() {
    return zoneAt(game.player.x, game.player.y);
  },
  los(x1, y1, x2, y2) {
    return hasLineOfSight(game, x1, y1, x2, y2);
  },
};

requestAnimationFrame(frame);
