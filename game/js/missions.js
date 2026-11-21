// missions.js — Vera's five-job story chain, the sports-car unlock and
// the hidden cash stashes.
//
// NEW GAME starts 'first-wheels' with $200 (see main.js resetGame). The
// chain pays $250 / $400 / $600 / $800 / $1,500 and ends in free-roam.
// Every reward is paid only by completeCurrent, which clears the current
// mission FIRST and only then pays, banners, autosaves and chains — so a
// reward can never fire twice or every frame. Stashes pay $300 each,
// exactly once, and the pier bonus stays once across reloads. All
// landmark coordinates are read at runtime from city.landmarkById, never
// hardcoded: a new seed reshuffles the city.

import { spawnEnemy } from './combat.js';
import { createCar } from './vehicles.js';
import { zoneAt } from './city.js';

export const GOLD = '#f1c40f';
export const STASH_REWARD = 300;

// Hidden cash stashes. Every spot was verified with collideCircle
// (0px push) against buildCity(7) before use — a stash on a road line
// can never sit inside a building, whatever the seed shuffle does.
export const STASHES = [
  { id: 'stash-1', x: 1050, y: 1500 },
  { id: 'stash-2', x: 2250, y: 900 },
  { id: 'stash-3', x: 2850, y: 2100 },
];

const KING_SPOTS_W1 = [
  { x: 3400, y: 1800 },
  { x: 3500, y: 1800 },
];
const KING_SPOTS_W2 = [
  { x: 3350, y: 1790 },
  { x: 3520, y: 1810 },
];

function lm(game, id) {
  return game.city.landmarkById[id];
}

function distTo(game, x, y) {
  return Math.hypot(game.player.x - x, game.player.y - y);
}

function liveKings(game) {
  return game.enemies.filter((e) => !e.dead && e.type === 'king');
}

function spawnWave(game, spots) {
  const out = [];
  for (const s of spots) out.push(spawnEnemy(game, s.x, s.y, 'king'));
  return out;
}

// The gold sports car Vera leaves for Dice after the third job. It parks
// on the road just south of her garage, in the eastbound lane. Matched by
// model + colour so a restore never spawns a second one.
export function sportsCarSpot(game) {
  const g = lm(game, 'garage');
  const southRoad = Math.ceil((g.cy + 1) / 300) * 300;
  return { x: g.cx, y: southRoad + 16, angle: 0 };
}

export function findSportsCar(game) {
  return game.cars.find((c) => !c.dead && c.model === 'sports' && c.color === GOLD) || null;
}

function ensureSportsCar(game, ms) {
  if (!ms.data.sportsUnlocked) return null;
  const existing = findSportsCar(game);
  if (existing) return existing;
  const spot = sportsCarSpot(game);
  const car = createCar(spot.x, spot.y, spot.angle, 'sports', 'parked');
  car.color = GOLD;
  game.cars.push(car);
  return car;
}

export const MISSION_DEFS = {
  'first-wheels': {
    id: 'first-wheels',
    title: 'FIRST WHEELS',
    brief: 'Vera needs wheels. Steal any car, then bring it to her garage.',
    reward: 250,
    next: 'the-pickup',
    start(game, ms) {
      ms.current.state = { hasCar: false };
      const g = lm(game, 'garage');
      game.missionMarker = { x: g.cx, y: g.cy };
      game.missions.setObjective('FIRST WHEELS', 'Steal a car (E), then drive it to Vera\u2019s Garage.');
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      const p = game.player;
      const g = lm(game, 'garage');
      if (!st.hasCar && p.car) {
        st.hasCar = true;
        game.missions.setObjective('FIRST WHEELS', 'Nice ride. Now drive it to Vera\u2019s Garage.');
        if (game.hud) game.hud.banner('WHEELS ACQUIRED', 'Now get it to the garage.', '#ffd54a');
      }
      if (st.hasCar && p.car && distTo(game, g.cx, g.cy) < 200) return 'done';
      return undefined;
    },
    onEnemyDown(game, ms, enemy) {},
  },

  'the-pickup': {
    id: 'the-pickup',
    title: 'THE PICKUP',
    brief: 'A package is waiting at East Harbour Docks. Bring it to Vera\u2019s Diner.',
    reward: 400,
    next: 'hot-delivery',
    start(game, ms) {
      ms.current.state = { picked: false };
      const d = lm(game, 'docks');
      game.missionMarker = { x: d.cx, y: d.cy };
      game.missions.setObjective('THE PICKUP', 'Pick up the package at East Harbour Docks.');
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      const p = game.player;
      const d = lm(game, 'docks');
      const diner = lm(game, 'diner');
      if (!st.picked) {
        if (distTo(game, d.cx, d.cy) < 120) {
          st.picked = true;
          game.missionMarker = { x: diner.cx, y: diner.cy };
          game.missions.setObjective('THE PICKUP', 'Package secured. Deliver it to Vera\u2019s Diner.');
          if (game.effects) game.effects.floater(p.x, p.y - 20, 'PACKAGE', '#ffd54a');
          if (game.sfx) game.sfx('blip');
        }
        return undefined;
      }
      if (distTo(game, diner.cx, diner.cy) < 200) return 'done';
      return undefined;
    },
    onEnemyDown(game, ms, enemy) {},
  },

  'hot-delivery': {
    id: 'hot-delivery',
    title: 'HOT DELIVERY',
    brief: 'Ninety seconds. The Docks are waiting — and so is Vera\u2019s temper.',
    reward: 600,
    next: 'payback-pier',
    start(game, ms) {
      ms.current.state = { t: 90 };
      const d = lm(game, 'docks');
      game.missionMarker = { x: d.cx, y: d.cy };
      game.missions.setObjective('HOT DELIVERY', 'Deliver to the Docks — 90s left.');
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      const d = lm(game, 'docks');
      st.t -= dt;
      if (st.t <= 0) {
        // Too slow: the job restarts in place, the chain intact, $0 paid.
        if (game.hud) game.hud.banner('TOO SLOW', 'Vera is not impressed. Run it again.', '#e57373');
        game.missions.restartCurrent();
        return undefined;
      }
      game.missions.setObjective('HOT DELIVERY', `Deliver to the Docks — ${Math.ceil(st.t)}s left.`);
      if (distTo(game, d.cx, d.cy) < 200) return 'done';
      return undefined;
    },
    onEnemyDown(game, ms, enemy) {},
  },

  'payback-pier': {
    id: 'payback-pier',
    title: 'PAYBACK AT THE PIER',
    brief: 'The Harbor Kings jumped one of Vera\u2019s drivers. Settle it on the pier.',
    reward: 800,
    next: 'solmar-score',
    start(game, ms) {
      ms.current.state = { wave: 1, kills: 0 };
      ensureSportsCar(game, ms);
      const pier = lm(game, 'pier');
      game.missionMarker = { x: pier.cx, y: pier.cy };
      spawnWave(game, KING_SPOTS_W1);
      game.missions.setObjective('PAYBACK AT THE PIER', 'Take down the Harbor Kings (0/4).');
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      if (st.kills >= 4) return 'done';
      // Anti-stall: if the current wave is gone but the count is short,
      // the wave comes back. Wave-2 detection reads state.wave, never the
      // live king count — one burst can kill across waves.
      if (liveKings(game).length === 0) {
        spawnWave(game, st.wave === 2 ? KING_SPOTS_W2 : KING_SPOTS_W1);
      }
      return undefined;
    },
    onEnemyDown(game, ms, enemy) {
      const st = ms.current.state;
      st.kills += 1;
      game.missions.setObjective(
        'PAYBACK AT THE PIER',
        `Take down the Harbor Kings (${Math.min(st.kills, 4)}/4).`,
      );
      if (st.kills === 2 && st.wave === 1) {
        st.wave = 2;
        spawnWave(game, KING_SPOTS_W2);
        if (game.hud) game.hud.banner('REINFORCEMENTS', 'More Kings on the pier!', '#e57373');
      }
    },
  },

  'solmar-score': {
    id: 'solmar-score',
    title: 'THE SOLMAR SCORE',
    brief: 'Crack the vault at Solmar National Bank — then lose the heat.',
    reward: 1500,
    next: null,
    start(game, ms) {
      ms.current.state = { phase: 'channel', progress: 0 };
      ensureSportsCar(game, ms);
      // Normalise heat first: stray heat from the pier never stacks on
      // top of the vault alarm, and no king survives into the score.
      if (game.police) game.police.clearWanted();
      for (const e of game.enemies) if (e.type === 'king') e.dead = true;
      const bank = lm(game, 'bank');
      game.missionMarker = { x: bank.cx, y: bank.cy };
      game.missions.setObjective('THE SOLMAR SCORE', 'Crack the vault — stay at the bank.');
    },
    update(game, ms, dt) {
      const st = ms.current.state;
      const bank = lm(game, 'bank');
      if (st.phase === 'channel') {
        if (distTo(game, bank.cx, bank.cy) < 200) {
          st.progress += dt;
          const pct = Math.min(100, Math.floor((st.progress / 5) * 100));
          game.missions.setObjective('THE SOLMAR SCORE', `Cracking the vault — ${pct}%. Stay close.`);
          if (st.progress >= 5) {
            st.phase = 'escape';
            if (game.police) game.police.addWanted(2);
            if (game.hud) game.hud.banner('ALARM TRIPPED', 'The vault is open — now lose the heat!', '#e57373');
            game.missionMarker = null;
            game.missions.setObjective('THE SOLMAR SCORE', 'Lose the heat — get unseen, or respray at the spa.');
          }
        } else {
          // Stepping away resets the channel.
          if (st.progress > 0) {
            st.progress = 0;
            game.missions.setObjective('THE SOLMAR SCORE', 'Crack the vault — stay at the bank.');
          }
        }
        return undefined;
      }
      // Escape phase: the job is done once the heat is gone.
      game.missions.setObjective(
        'THE SOLMAR SCORE',
        `Lose the heat — ${game.wanted} star${game.wanted === 1 ? '' : 's'} left.`,
      );
      if (game.wanted === 0) return 'done';
      return undefined;
    },
    onEnemyDown(game, ms, enemy) {},
  },

  'free-roam': {
    id: 'free-roam',
    title: 'FREE ROAM',
    brief: 'Solmar Bay is yours. Visit the Solmar Pier to pick up a $50 bonus.',
    reward: 0,
    next: null,
    start(game, ms) {
      ms.current.state = { visited: false };
      ensureSportsCar(game, ms);
      const pier = lm(game, 'pier');
      game.missionMarker = { x: pier.cx, y: pier.cy };
      game.missions.setObjective('FREE ROAM', 'Visit the Solmar Pier — $50 waiting there.');
    },
    update(game, ms, dt) {
      const p = game.player;
      const pier = lm(game, 'pier');
      const d = Math.hypot(p.x - pier.cx, p.y - pier.cy);
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
    // Persistent across the save: the gold-car unlock and the stashes.
    data: { sportsUnlocked: false, stashesTaken: [] },
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
    // Finishing the third job earns the gold sports car.
    if (def.id === 'hot-delivery') {
      ms.data.sportsUnlocked = true;
      ensureSportsCar(game, ms);
      if (game.hud) {
        game.hud.banner('JOB DONE', `${def.title} — +$${def.reward}. Vera left you a gold sports car by her garage.`, '#f1c40f');
      }
    }
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

  // A hidden stash pays $300, exactly once, wherever the player is.
  function checkStashes() {
    const p = game.player;
    for (const s of STASHES) {
      if (ms.data.stashesTaken.includes(s.id)) continue;
      if (Math.hypot(p.x - s.x, p.y - s.y) < 45) {
        ms.data.stashesTaken.push(s.id);
        game.player.cash += STASH_REWARD;
        if (game.effects) game.effects.floater(p.x, p.y - 20, `+$${STASH_REWARD} STASH`, '#7cf29a');
        if (game.sfx) game.sfx('cash');
        if (game.hud) game.hud.banner('HIDDEN STASH', `+$${STASH_REWARD} — ${zoneAt(s.x, s.y)}`, '#7cf29a');
        if (game.saveGame) game.saveGame();
      }
    }
  }

  function update(dt) {
    checkStashes();
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
      data: {
        sportsUnlocked: ms.data.sportsUnlocked,
        stashesTaken: [...ms.data.stashesTaken],
      },
    };
  }

  function restore(data) {
    if (!data) return;
    ms.completed = data.completed || {};
    ms.pierPaid = !!data.pierPaid;
    if (data.data) {
      ms.data.sportsUnlocked = !!data.data.sportsUnlocked;
      ms.data.stashesTaken = [...(data.data.stashesTaken || [])];
    }
    if (data.currentId && defById(data.currentId)) start(data.currentId);
    else start('free-roam');
    ensureSportsCar(game, ms);
  }

  // Fresh NEW GAME: wipe everything the chain remembers.
  function reset() {
    ms.current = null;
    ms.currentId = null;
    ms.completed = {};
    ms.pierPaid = false;
    ms.data = { sportsUnlocked: false, stashesTaken: [] };
  }

  // Live views of the closure state: getters, not a snapshot — callers
  // read game.missions.current / currentId / pierPaid and must see updates.
  const api = {
    start,
    completeCurrent,
    failCurrent,
    restartCurrent,
    reset,
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
    data: { get: () => ms.data },
    stashes: {
      get: () =>
        STASHES.map((s) => ({ ...s, taken: ms.data.stashesTaken.includes(s.id) })),
    },
  });
  return api;
}
