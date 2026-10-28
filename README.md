# ASHFALL — Exploration & Tactical Combat (0.3.0)

A playable, single-player isometric post-apocalyptic browser RPG prototype. **No build step, account, backend, or paid services.** Open through GitHub Pages or a local static web server. Uses Canvas 2D, ES modules, and a deterministic, independently tested tactical simulation engine.

## Play

- Live site (when GitHub Pages is enabled): https://jessedudgeon.github.io/ashfall/
- Local: run `python3 -m http.server 5173`, then open http://localhost:5173/
- Run automated tests: `npm test` (requires Node.js, no dependencies to install).
- The `seed` query parameter selects a map: `?seed=3867` (default seed). Combat outcomes are deterministic for a given seed and sequence of actions.

## What to do

Start at camp with Mara (scout), Eli (medic), and Rook (engineer). Investigate the gold salvage markers, then approach the **Silent Relay** northeast of camp. Two raiders defend the area. When you get close, the game switches from real-time exploration to turn-based tactical combat.

Defeat the raiders with weapons, cover, positioning, and medkits. Surviving allies continue exploring afterward; the relay is then accessible. Combat awards +8 scrap. Downed allies bleed out after **three enemy phases** unless rescued with a medical kit. If your entire squad is incapacitated, the expedition fails and can be restarted. Full persistent saves and more encounters are still upcoming milestones.

## Controls

Use the action buttons or their keyboard shortcuts. Tab / Shift+Tab navigates buttons; Enter or Space activates the focused button. The Controls menu pauses exploration while open. Combat buttons show their AP costs and the prompt above them explains the next click.

### Exploration

- **Left click** terrain: pathfind and move; click a survivor to select.
- **WASD / arrows**: move the selected survivor.
- **C / Squad Follow**: choose whether companions follow or hold position. Follow starts ON. Turning it OFF immediately stops other survivors, including queued movement. Switch with Q or 1–3 to position survivors individually; the previous survivor stops when you switch. Turn it ON and move to lead the squad again. This applies to all exploration movement, including walking to sites; combat stays individually controlled. The choice lasts for the current session and is retained through combat.
- **Q / 1–3**: change selected survivor.
- **E**: investigate nearby salvage or relay.
- **Space**: pause/resume real-time exploration.
- **Mouse wheel / +/-**: zoom; **right-drag**: camera pan; **R**: recenter.

### Combat

- **Click a raider** to shoot with your selected survivor (when FIRE is active).
- **F**: FIRE mode (2 AP, uses one round of ammunition).
- **M**: MOVE mode, then click an accessible tile (3 tiles per AP).
- **G**: AIM (+15% accuracy to next shot, 1 AP).
- **L**: RELOAD (1 AP).
- **H**: MEDKIT mode, then click yourself or an adjacent ally (2 AP, one kit). Rescues downed allies.
- **Enter / END TURN**: hand the turn to the raiders. Your surviving allies refresh to 4 AP on the next player round.
- **Q / 1–3**: change selected active survivor at any time during your phase.

Ranged attacks check weapon range, line of sight, nearby cover, and shooter stats. Hover a raider to inspect accuracy. Clicked targets also show a detailed hit estimate in the right-side tactical briefing. Enemies pursue the nearest reachable survivor and attack when they have a valid shot.

## Files

- `index.html` — accessible menus and combat/exploration HUD.
- `style.css` — responsive post-apocalyptic interface.
- `core.mjs` — deterministic 30×30 world, isometric projection, routing/collisions.
- `combat.mjs` — tactical rules: action points, cover, LOS, shooting, injury/recovery, AI.
- `game.js` — Canvas renderer, input handling, combat UI, exploration-to-combat transition.
- `tests/core.test.mjs` — navigation/world tests.
- `tests/combat.test.mjs` — combat simulation tests.
- `tests/ui.test.mjs` — DOM/controller smoke tests with an in-process browser stub.

## Hosting

Publish the repository's `main` branch `/ (root)` using **Settings → Pages → Deploy from a branch**. Everything uses relative URLs, so deployment at `https://jessedudgeon.github.io/ashfall/` needs no separate build configuration. `index.html` cannot reliably be opened with `file://` because browsers restrict ES-module imports.

## Known prototype limitations

This is a tactical vertical slice, not the complete RPG: there is one encounter, generated terrain is still primarily decorative, characters have fixed starting weapons/abilities, enemies execute their turn instantly, battle animations are placeholders, saves are not persistent, and the game has no larger quest/settlement progression yet. Combat rules and UI have automated tests; a Chromium visual playthrough can be performed after deployment.
