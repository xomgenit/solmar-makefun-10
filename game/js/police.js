// police.js — the wanted system of Solmar Bay.
//
// Wanted runs 0-5. Crimes raise it; being unseen cools it back down.
// Foot cops answer when the player is on foot; cruisers answer when the
// player is driving. Fresh heat counts as "seen" for 3 seconds, so a new
// response always arrives — but after that, units only spawn while the
// player is actually seen, which is what lets heat cool when unseen.
// At wanted 0 every unit stands down and is removed.

import { clamp } from './util.js';
import { spawnEnemy, hasLineOfSight } from './combat.js';
import { createCar, driveCar } from './vehicles.js';
import { nearestRoadPoint } from './city.js';

export function createPolice(game) {
  const state = {
    coolT: 0, // seconds the player has been continuously unseen
    freshT: 0, // seconds left of "fresh heat counts as seen"
    spawnT: 0,
    bustT: 0, // cumulative seconds a cop has been within bust range
  };

  function wanted() {
    return game.wanted;
  }

  // Is any witness watching the player right now?
  function isSeen() {
    if (state.freshT > 0) return true;
    const p = game.player;
    for (const e of game.enemies) {
      if (e.dead || e.type !== 'cop') continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < 500 && hasLineOfSight(game, e.x, e.y, p.x, p.y)) return true;
    }
    for (const c of game.cars) {
      if (c.role !== 'cruiser' || c.dead) continue;
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < 550) return true;
    }
    // A ped close enough to watch the crime counts as a witness.
    for (const ped of game.peds) {
      if (ped.dead || ped.state === 'down') continue;
      if (Math.hypot(p.x - ped.x, p.y - ped.y) < 260) return true;
    }
    return false;
  }

  function spawnFootCop() {
    const p = game.player;
    const ang = game.rng() * Math.PI * 2;
    const r = 420 + game.rng() * 160;
    const x = p.x + Math.cos(ang) * r;
    const y = p.y + Math.sin(ang) * r;
    spawnEnemy(game, x, y, 'cop');
  }

  function spawnCruiser() {
    const p = game.player;
    const pt = nearestRoadPoint(game.city, p.x + (game.rng() - 0.5) * 900, p.y + (game.rng() - 0.5) * 900);
    const car = createCar(pt.x, pt.y, game.rng() * Math.PI * 2, 'cruiser', 'cruiser');
    car.cruise = 420;
    game.cars.push(car);
    return car;
  }

  function countUnits() {
    let cops = 0;
    let cruisers = 0;
    for (const e of game.enemies) if (!e.dead && e.type === 'cop') cops++;
    for (const c of game.cars) if (!c.dead && c.role === 'cruiser') cruisers++;
    return { cops, cruisers };
  }

  function update(dt) {
    const w = wanted();
    if (state.freshT > 0) state.freshT -= dt;

    if (w <= 0) {
      // Stand down: remove every cop and cruiser.
      for (const e of game.enemies) if (e.type === 'cop') e.dead = true;
      game.cars = game.cars.filter((c) => c.role !== 'cruiser');
      state.coolT = 0;
      state.bustT = 0;
      return;
    }

    const seen = isSeen();
    if (seen) {
      state.coolT = 0;
    } else {
      state.coolT += dt;
      // Unseen for a while: one star cools off, then the timer restarts.
      if (state.coolT > 9) {
        state.coolT = 0;
        game.wanted = Math.max(0, w - 1);
        if (game.hud) game.hud.banner('HEAT COOLING', 'The law lost your trail', '#7fb069');
      }
    }

    // Reinforcements arrive only while the player is seen (or fresh heat),
    // up to the number the wanted level calls for.
    const driving = !!game.player.car;
    const wantCops = driving ? 0 : Math.min(w, 4);
    const wantCruisers = driving ? Math.min(w, 3) : 0;
    const { cops, cruisers } = countUnits();
    state.spawnT -= dt;
    if (state.spawnT <= 0 && seen) {
      state.spawnT = 2.2;
      if (cops < wantCops) spawnFootCop();
      else if (cruisers < wantCruisers) spawnCruiser();
    }

    // Cruisers: road-following pursuit with ramming + stuck recovery.
    const p = game.player;
    for (const car of game.cars) {
      if (car.role !== 'cruiser' || car.dead) continue;
      const d = Math.hypot(p.x - car.x, p.y - car.y);
      if (d > 2100) {
        car.dead = true;
        continue;
      }
      const targetAngle = Math.atan2(p.y - car.y, p.x - car.x);
      const steer = clamp(
        ((targetAngle - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
        -1,
        1,
      );
      const throttle = d > 60 ? 1 : 0.4;
      driveCar(game, car, { throttle, steer, handbrake: false }, dt);
      // Ram the player's car on contact.
      if (p.car && d < 60) {
        p.car.vx += Math.cos(targetAngle) * 60 * dt * 10;
        p.car.vy += Math.sin(targetAngle) * 60 * dt * 10;
      }
    }

    // Bust: a cop standing within 42px of a player on foot, 1.1s total.
    // The timer is per-frame (one flag), not per-cop, so two cops cannot
    // reset each other's progress.
    let nearBust = false;
    if (!driving) {
      for (const e of game.enemies) {
        if (e.dead || e.type !== 'cop') continue;
        if (Math.hypot(p.x - e.x, p.y - e.y) < 42) {
          nearBust = true;
          break;
        }
      }
    }
    if (nearBust) {
      state.bustT += dt;
      if (state.bustT >= 1.1 && game.onPlayerBusted) game.onPlayerBusted();
    } else {
      state.bustT = 0;
    }
  }

  return {
    addWanted(n) {
      game.wanted = clamp(game.wanted + n, 0, 5);
      state.freshT = 3;
      state.coolT = 0;
    },
    clearWanted() {
      game.wanted = 0;
      state.coolT = 0;
      state.freshT = 0;
    },
    setWanted(n) {
      game.wanted = clamp(n, 0, 5);
      state.freshT = 3;
      state.coolT = 0;
    },
    update,
    isSeen,
    _state: state,
  };
}
