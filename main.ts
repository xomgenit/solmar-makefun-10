// SOLMAR — Streets of the Sun: entrypoint for the make.fun gta6-01 bounty.
//
// What this file does, in plain terms: it takes the playable game in game/
// and the screenshots in screenshots/, lays them out in the output folder
// the grader reads (/output, or $MAKEFUN_OUTPUT_DIR when set), and writes
// dossier.json — the summary the judge reads — using the vendored make.fun
// helper. The game itself is plain static files (game/index.html plus ES
// modules, no libraries, no network requests), so a desktop browser can
// play it offline straight from the output folder.
//
// Run it locally with:  MAKEFUN_OUTPUT_DIR=out node main.ts
// Play it locally with: node serve.ts   (then http://localhost:8080)

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where this file lives, and where the grader expects the entry.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps, mirrored from the competition's gate so this program
// refuses an entry the scorer would refuse instead of handing in junk:
// at most 4 screenshots, each at most 256 KiB; at most 993 files in game/
// totalling at most 48 MiB, with no game/ path over 1000 bytes; and the
// dossier text itself capped at 160 KiB.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function isImage(name) {
  return /\.(png|jpe?g)$/i.test(name);
}

// Pre-flight: the entry is not submittable without a playable game and at
// least one screenshot, so fail loudly here instead of writing a dossier
// the scorer would refuse.
function preflight() {
  const gameSrc = join(repoRoot, 'game');
  if (!existsSync(join(gameSrc, 'index.html'))) {
    throw new Error('game/index.html is missing — nothing playable to hand in');
  }
  const shotsSrc = join(repoRoot, 'screenshots');
  const shots = existsSync(shotsSrc) ? readdirSync(shotsSrc).filter(isImage) : [];
  if (shots.length === 0) {
    console.warn('SOLMAR: WARNING — screenshots/ holds no image yet; the dossier step will refuse this entry.');
  }
  return { gameSrc, shotsSrc, shots };
}

function countFiles(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir, { withFileTypes: true }).reduce(
    (n, e) => n + (e.isDirectory() ? countFiles(join(dir, e.name)) : 1),
    0,
  );
}

function main() {
  const { gameSrc, shotsSrc, shots } = preflight();
  mkdirSync(outDir, { recursive: true });

  cpSync(gameSrc, join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  if (existsSync(shotsSrc)) cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });

  const copied = countFiles(join(outDir, 'game'));
  console.log(`SOLMAR: copied ${copied} game files and ${shots.length} screenshot(s) to ${outDir}`);

  // The dossier: the judge's summary of the entry.
  const dossierPath = join(outDir, 'dossier.json');
  writeFileSync(dossierPath, buildDossier(outDir, DOSSIER_CAPS));
  console.log(`SOLMAR: dossier.json written (${statSync(dossierPath).size} bytes).`);
}

main();
