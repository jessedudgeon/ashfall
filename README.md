# ASHFALL — Exploration Prototype (0.1.0)

A playable, single-player isometric wasteland exploration prototype. No accounts, npm install, backend, or paid services required. The first release uses native Canvas 2D and ES modules for immediate static hosting; the independent simulation can be moved to Phaser/React when tactical combat and complex UI are implemented.

## Play

Serve this directory with any static HTTP server:

```bash
python3 -m http.server 5173
```

Visit http://localhost:5173/ in a browser. `npm test` also runs five deterministic simulation/pathfinding tests (requires Node.js). Opening `index.html` directly as a `file://` URL may fail because browsers restrict JavaScript modules.

## Controls

- **Left click:** Move to a tile; click a survivor to select them.
- **WASD / arrow keys:** Move one grid step; companions follow.
- **Tab or 1–3:** Switch selected survivor.
- **E:** Investigate a nearby salvage site or the radio terminal.
- **Space:** Pause/resume.
- **Mouse wheel / +/-:** Zoom in/out.
- **Right-drag:** Pan the camera. **R:** Recenter on selected survivor.

Find the Silent Relay and investigate the two marked salvage sites. The player can explore but there is **no combat, full character creation, or persistent campaign saving yet**.

## Publish with GitHub Pages

1. Push these files to the repository's `main` branch.
2. In **Settings → Pages**, set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Visit `https://jessedudgeon.github.io/ashfall/` after Pages finishes publishing.
4. Optionally configure a custom domain, `ashfall.dudgeon.io`, and DNS CNAME `ashfall -> jessedudgeon.github.io`.

## Code layout

- `index.html`: HUD and browser entry point.
- `style.css`: responsive retro-futuristic interface.
- `core.mjs`: deterministic world generation, projection, A* routing, collision helpers.
- `game.js`: Canvas renderer, controls, interaction, camera, follower behavior.
- `tests/core.test.mjs`: seed, navigation, obstacle, projection, and occupancy tests.

## Next milestone

Tactical encounters: action points, cover, line of sight, target selection, and combat transitions. No server or account infrastructure is required for this milestone.