You are building an entry for make.fun bounty "threejs-fps-01" (rails onchain, $1000, deadline 23 Nov 2026 17:00 UTC).

Working directory: /home/azureuser/projects/threejs-fps (git repo, remote origin pushes to github.com/AdityaPratama0/threejs-fps).

Read these first, in this order:
1. ./RULES.txt  (the full competition rules, copied from the kit)
2. ~/projects/makefun/fpskit/threejs-fps-01-kit/  (the kit: cli/makefun.mjs, starter/, harness/)

Goal: a complete, original, round-based tactical FPS in the style of Counter-Strike, static files under game/, ES modules, no build step, three.js 0.187.0 vendored exactly as RULES.txt requires.

Requirements you must satisfy (from RULES.txt):
- game/ is plain files only, <=993 entries and <=48 MiB, index.html <=1 MiB, single importmap mapping "three" to the vendored three.module.min.js inside game/.
- no network loads: every reference relative or mapped, resolving to a regular file inside game/.
- first-person view with mouse look and keyboard movement, weapon that fires, reloads, runs out of ammo, opponents that move, see and shoot back, rounds that end and restart, HUD with health, ammo, round timer, score.
- gunplay: hits against bodies with headshot multiplier, recoil and spread that punish movement, movement with acceleration, crouch, collision.
- tactics: bomb plant/defuse objective, money per round, buy menu, more than one weapon, at least one grenade, bots that follow routes, hold positions, react to sight and sound.
- original map, art and names. Never copy Valve names, maps, weapons or assets.
- vendor/makefun-threejs.ts unchanged; main.ts at repo root writes /output (dossier.json + game/ + screenshots/) using buildDossier from vendor/makefun-threejs.ts; honour MAKEFUN_OUTPUT_DIR when set.
- screenshots/ 3 to 4 real renders of the game's own code, taken in a real browser, each <=256 KiB, long side <=1280, short side >=480.
- code quality: modules with one job each, fixed-step simulation separated from rendering, no per-frame allocations in hot loops, single state store, no dead code.

Process:
1. Inspect the kit's starter (it already vendors three.js and has main.ts, serve.ts, screenshots/). Keep the vendored three files byte for byte.
2. Implement the game incrementally under game/src/: state store, fixed-step sim, renderer, input, player, weapons (at least 3 with distinct behaviour), grenade, bots with navigation waypoints and perception, round/bomb logic, buy menu, HUD, audio via WebAudio (generated, no external files), map in a chosen original palette.
3. Test in a headless browser with the playwright chromium already installed at ~/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome: load game/index.html over a local static server, assert zero console errors, drive inputs, take screenshots into screenshots/ that are honest renders of the game.
4. Run the kit's checker from the kit directory: `node cli/makefun.mjs check` (use the competition slug threejs-fps-01) and fix every failing row until the gate is clean. Also run main.ts via the kit's tooling to confirm dossier_matches passes.
5. Commit and push to origin main with clear messages as you go.

Hard rules:
- Never put any API key, token, cookie or password in the repository or in any file you write.
- Do not modify vendor/makefun-threejs.ts.
- Do not fetch three.js from the network: use the vendored copy.
- Keep going until the gate passes and the repo is pushed.

Report at the end: what the game contains, the gate output, the commit sha, and anything still failing.
