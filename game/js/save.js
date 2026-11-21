// save.js — localStorage persistence for SOLMAR.
//
// The save stores the city seed, so CONTINUE rebuilds the exact same city
// the player left — a save without the seed would shuffle the landmarks and
// strand the player somewhere new.

export const SAVE_KEY = 'solmar-save-v1';

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function saveGame(game) {
  const p = game.player;
  const data = {
    v: 1,
    seed: game.city.seed,
    cash: Math.floor(p.cash),
    health: Math.round(p.health),
    x: Math.round(p.x),
    y: Math.round(p.y),
    angle: p.angle,
    wanted: game.wanted,
    car: p.car
      ? {
          model: p.car.model,
          color: p.car.color || null,
          x: Math.round(p.car.x),
          y: Math.round(p.car.y),
          angle: p.car.angle,
          health: Math.round(p.car.health),
        }
      : null,
    missions: game.missions ? game.missions.serialize() : null,
    stats: game.stats || {},
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || typeof data.seed !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
