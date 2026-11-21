// city.js — the seeded procedural city of Solmar Bay.
//
// Layout (all coordinates in world pixels, origin top-left):
//   WORLD is 3600 x 3600. Roads run every 300px (a 64px-wide road centred on
//   each multiple of 300), so the city is a 12x12 grid of blocks. The east
//   edge is the coast: sand from x=3100, sea from x=3440, and the Solmar Pier
//   juts out over the water at y=1800. Nine named landmarks sit on block
//   centres picked by a seeded shuffle, so the same seed always rebuilds the
//   same city and a new seed reshuffles it.

import { makeRng, shuffle, randRange, randInt, clamp, pushCircleOutOfRect, pointInRect } from './util.js';

export const WORLD = 3600;
export const ROAD_EVERY = 300;
export const ROAD_W = 64;
export const BEACH_X = 3100;
export const SEA_X = 3440;
// The pier deck: a walkable boardwalk over the sea.
export const PIER = { x: 3300, y: 1770, w: 260, h: 60 };

// Landmark catalogue: id, display name, footprint, colour.
export const LANDMARKS = [
  { id: 'hideout', name: 'Dice Hideout', w: 150, h: 110, color: '#8a5a2b' },
  { id: 'diner', name: 'Vera Diner', w: 170, h: 110, color: '#b8455a' },
  { id: 'garage', name: 'Sunset Garage', w: 180, h: 120, color: '#4a6b8a' },
  { id: 'bank', name: 'Solmar National Bank', w: 170, h: 120, color: '#7a7f8a' },
  { id: 'docks', name: 'Solmar Docks', w: 190, h: 120, color: '#5a7a5a' },
  { id: 'spa', name: 'Sunset Auto Spa', w: 170, h: 110, color: '#3f8f7a' },
  { id: 'hospital', name: 'Solmar General', w: 180, h: 120, color: '#d8d3c3' },
  { id: 'hq', name: 'SBPD Headquarters', w: 180, h: 120, color: '#3a4a6b' },
  { id: 'pier', name: 'Solmar Pier', w: 260, h: 60, color: '#9a7a4a' },
];

function blockCentre(i, j) {
  return { x: ROAD_EVERY * i + ROAD_EVERY / 2, y: ROAD_EVERY * j + ROAD_EVERY / 2 };
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const buildings = [];
  const palms = [];
  const landmarkById = {};

  // Candidate blocks for landmarks: interior blocks, away from the beach
  // (columns 10-11) and away from the map rim, so every landmark has roads
  // around it. Pier is fixed on the coast and is not shuffled.
  const candidates = [];
  for (let i = 1; i <= 9; i++) {
    for (let j = 1; j <= 10; j++) {
      candidates.push({ i, j });
    }
  }
  const picked = shuffle(rng, candidates);
  const landmarkBlocks = {};
  const shuffledDefs = LANDMARKS.filter((l) => l.id !== 'pier');
  shuffledDefs.forEach((def, k) => {
    const b = picked[k];
    const c = blockCentre(b.i, b.j);
    const lm = {
      id: def.id,
      name: def.name,
      cx: c.x,
      cy: c.y,
      x: c.x - def.w / 2,
      y: c.y - def.h / 2,
      w: def.w,
      h: def.h,
      color: def.color,
    };
    landmarkById[def.id] = lm;
    landmarkBlocks[`${b.i},${b.j}`] = true;
    buildings.push({ ...lm, kind: 'landmark' });
  });
  // The pier landmark sits on the beach, fixed.
  landmarkById.pier = {
    id: 'pier',
    name: 'Solmar Pier',
    cx: 3420,
    cy: 1800,
    x: PIER.x,
    y: PIER.y,
    w: PIER.w,
    h: PIER.h,
    color: '#9a7a4a',
  };

  // Ordinary buildings: 1-2 per remaining block, kept inside the block
  // with a margin so streets stay clear.
  const roofPalette = ['#5a5f6e', '#6e5a4a', '#4a5a6e', '#7a6a5a', '#5a6e5a'];
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 12; j++) {
      if (i >= 10) continue; // beach columns: no buildings on the sand
      if (landmarkBlocks[`${i},${j}`]) continue;
      const c = blockCentre(i, j);
      const n = randInt(rng, 1, 2);
      for (let k = 0; k < n; k++) {
        const w = randRange(rng, 90, 170);
        const h = randRange(rng, 80, 140);
        const ox = randRange(rng, -50, 50);
        const oy = randRange(rng, -50, 50);
        buildings.push({
          x: c.x - w / 2 + ox,
          y: c.y - h / 2 + oy,
          w,
          h,
          kind: 'house',
          color: roofPalette[Math.floor(rng() * roofPalette.length)],
        });
      }
    }
  }

  // Palms: a thicket along the beach plus a scattering through the city.
  for (let k = 0; k < 90; k++) {
    palms.push({
      x: randRange(rng, BEACH_X - 40, SEA_X - 20),
      y: randRange(rng, 60, WORLD - 60),
      r: randRange(rng, 7, 11),
    });
  }
  for (let k = 0; k < 60; k++) {
    const c = blockCentre(randInt(rng, 0, 9), randInt(rng, 0, 11));
    palms.push({
      x: clamp(c.x + randRange(rng, -110, 110), 40, WORLD - 40),
      y: clamp(c.y + randRange(rng, -110, 110), 40, WORLD - 40),
      r: randRange(rng, 6, 9),
    });
  }

  return { seed, buildings, palms, landmarkById, roads: roadLines() };
}

function roadLines() {
  const lines = [];
  for (let k = 0; k <= 12; k++) lines.push(ROAD_EVERY * k);
  return lines;
}

// Is this point on a road (within the road half-width of a grid line)?
export function onRoad(x, y) {
  const half = ROAD_W / 2 + 6;
  const rx = x % ROAD_EVERY;
  const ry = y % ROAD_EVERY;
  const nearX = Math.min(rx, ROAD_EVERY - rx) <= half;
  const nearY = Math.min(ry, ROAD_EVERY - ry) <= half;
  return nearX || nearY;
}

// Snap to the nearest road centre line (used to place traffic/peds).
export function nearestRoadPoint(city, x, y) {
  const snap = (v) => Math.round(v / ROAD_EVERY) * ROAD_EVERY;
  const dx = Math.abs(snap(x) - x);
  const dy = Math.abs(snap(y) - y);
  if (dx <= dy) return { x: snap(x), y, axis: 'v' };
  return { x, y: snap(y), axis: 'h' };
}

// Push a circle (player, car, ped) out of buildings, the map edge and the
// sea. The pier deck is walkable over the water. Returns {x, y, hit}.
export function collideCircle(city, x, y, r) {
  let hit = false;
  let px = clamp(x, r, WORLD - r);
  let py = clamp(y, r, WORLD - r);
  if (px !== x || py !== y) hit = true;
  for (const b of city.buildings) {
    const out = pushCircleOutOfRect(px, py, r, b);
    if (out) {
      px = out.x;
      py = out.y;
      hit = true;
    }
  }
  // The sea blocks movement, except on the pier deck itself.
  const onPier = pointInRect(px, py, PIER);
  if (!onPier && px > SEA_X - r) {
    px = SEA_X - r;
    hit = true;
  }
  return { x: px, y: py, hit };
}

// The solid rects that block line of sight (buildings only).
export function losBlockers(city) {
  return city.buildings;
}

export function zoneAt(x, y) {
  if (x >= BEACH_X) return 'PALMA BEACH';
  if (x >= 2400 && y < 1800) return 'EAST HARBOUR';
  if (x < 1200 && y >= 2400) return 'OLD TOWN';
  if (y < 900) return 'NORTHSIDE';
  if (x >= 1200 && x < 2400 && y >= 900 && y < 2400) return 'DOWNTOWN';
  if (y >= 2400) return 'SOUTHSIDE';
  return 'WEST END';
}
