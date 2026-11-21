// missions.js — the mission registry and the free-roam fallback.
//
// Builder 2 adds the story chain here: put each job in MISSION_DEFS with a
// `next` link, and NEW GAME will start the first def instead of free-roam.
// Contract every def follows:
//   { id, title, brief, reward, next,
//     start(game, ms)               — set up markers/state for the job
//     update(game, ms, dt)          — return 'done' | 'failed' | undefined
//     onEnemyDown(game, ms, enemy)  — optional, for shootout progress }
// Per-mission scratch lives in ms.current.state (a fresh {} per start).
// `completeCurrent` clears the mission state FIRST, then pays the reward,
// shows the banner, autosaves and chains to `def.next` — clearing first is
// what keeps a reward from ever paying out twice or every frame.

import { PIER } from './city.js';

export const MISSION_DEFS = {
  'free-roam': {
    id: 'free-roam',
    title: 'FREE ROAM',
    brief: 'Solmar Bay is yours. Visit the Solmar Pier to pick up a $50 bonus.',
    reward: 0,
    next: null,
    start(game, ms) {
      ms.current.state = { visited: false };
      game.missionMarker = { x: 3420, y: 1800 };
      game.missions.setObjective('FREE ROAM', 'Visit the Solmar Pier — $50 waiting there.');
    },
    update(game, ms, dt) {
      const p = game.player;
      const d = Math.hypot(p.x - 3420, p.y - 1800);
      if (d < 90 && !ms.pierPaid) {
        ms.pierPaid = true;
        game.player.cash += 50;
        if (game.effects) game.effects.floater(p.x, p.y - 20, '+$50', '#ffd54a');
        if (game.sfx) game.sfx('cash');
        if (game.hud) game.hud.banner('PIER BONUS', '+$50 — nice view, Dice', '#ffd54a');
        game.missionMarker = null;
        game.missions.setObjective('FREE ROAM', 'Solmar Bay is yours. Make something of it.');
      }
      return undefined;
    },
    onEnemyDown(game, ms, enemy) {},
  },
};

export function createMissions(game) {
  const ms = {
    current: null, // { def, state }
    currentId: null,
    completed: {},
    pierPaid: false,
  };

  function defById(id) {
    return MISSION_DEFS[id] || null;
  }

  function setObjective(title, text) {
    if (game.hud) game.hud.setObjective(title, text);
    game.objective = { title, text };
  }

  function start(id) {
    const def = defById(id);
    if (!def) return false;
    ms.current = { def, state: {} };
    ms.currentId = id;
    def.start(game, ms);
    if (game.hud) game.hud.banner(def.title, def.brief, '#ffd54a');
    return true;
  }

  // Clear state FIRST, then pay/banner/autosave/chain. Never the reverse:
  // effects run during the banner can re-enter update() while the old
  // mission is still "current", and a live mission would pay every frame.
  function completeCurrent() {
    const cur = ms.current;
    if (!cur) return;
    const def = cur.def;
    ms.current = null;
    ms.currentId = null;
    ms.completed[def.id] = true;
    if (def.reward > 0) {
      game.player.cash += def.reward;
      if (game.effects) game.effects.floater(game.player.x, game.player.y - 20, `+$${def.reward}`, '#ffd54a');
      if (game.sfx) game.sfx('cash');
    }
    if (game.hud) game.hud.banner('JOB DONE', `${def.title} — +$${def.reward}`, '#7fb069');
    if (game.saveGame) game.saveGame();
    if (def.next) start(def.next);
    else if (def.id !== 'free-roam') start('free-roam');
  }

  function failCurrent(reason) {
    const cur = ms.current;
    if (!cur) return;
    const def = cur.def;
    ms.current = null;
    ms.currentId = null;
    if (game.hud) game.hud.banner('JOB FAILED', reason || def.title, '#e57373');
    if (game.sfx) game.sfx('wasted');
  }

  function restartCurrent() {
    const id = ms.currentId || 'free-roam';
    ms.current = null;
    ms.currentId = null;
    start(id);
  }

  function update(dt) {
    if (!ms.current) return;
    const result = ms.current.def.update(game, ms, dt);
    if (result === 'done') completeCurrent();
    else if (result === 'failed') failCurrent();
  }

  function onEnemyDown(enemy) {
    if (!ms.current) return;
    const fn = ms.current.def.onEnemyDown;
    if (fn) fn(game, ms, enemy);
  }

  function list() {
    return Object.values(MISSION_DEFS).map((d) => ({
      id: d.id,
      title: d.title,
      brief: d.brief,
      reward: d.reward,
      done: !!ms.completed[d.id],
    }));
  }

  function serialize() {
    return {
      currentId: ms.currentId,
      completed: ms.completed,
      pierPaid: ms.pierPaid,
    };
  }

  function restore(data) {
    if (!data) return;
    ms.completed = data.completed || {};
    ms.pierPaid = !!data.pierPaid;
    if (data.currentId && defById(data.currentId)) start(data.currentId);
    else start('free-roam');
  }

  // Live views of the closure state: getters, not a snapshot — B2 reads
  // game.missions.current / currentId / pierPaid and must see updates.
  const api = {
    start,
    completeCurrent,
    failCurrent,
    restartCurrent,
    setObjective,
    onEnemyDown,
    update,
    list,
    isComplete: (id) => !!ms.completed[id],
    serialize,
    restore,
  };
  Object.defineProperties(api, {
    current: { get: () => ms.current },
    currentId: { get: () => ms.currentId },
    completed: { get: () => ms.completed },
    pierPaid: {
      get: () => ms.pierPaid,
      set: (v) => {
        ms.pierPaid = !!v;
      },
    },
  });
  return api;
}
