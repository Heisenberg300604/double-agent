# Double Agent

A first-person spy shooter for the browser. Eight assassins in near-identical suits hide in a crowd of civilians inside a grand train station. Each one has a secret target and is hunted by someone they don't know. Acting human keeps you hidden. Acting like a killer gets you found.

Single player: you and 7 AI spies, plus 112 AI civilians, across a 156 m × 54 m station. It has a concourse with a gallery, a west waiting room and restaurant, shop corridors, and three 70 m platforms where trains arrive, dwell and depart. Everything is procedural: no model, texture or audio files.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check (strict) + production bundle in dist/
npm run preview    # serve the production build
npm test           # Vitest: unit tests + headless full-match simulation
```

Optional URL parameters: `?seed=123` replays a match with the same seed (the seed is printed to the console), and `?spies=10` sets the spy count (8–10).

## Controls

| Input | Action |
|---|---|
| WASD | Walk (2.2 m/s) |
| Shift | Run (5 m/s, suspicious) |
| C or Ctrl | Crouch |
| Space | Jump |
| Mouse | Look (click the game to capture the mouse) |
| Right mouse | Draw and aim (zooms in) |
| Left mouse | Fire |
| R | Reload |
| Q / E / F | Scanner / Disguise / Smoke |
| G | Interact: sit on a bench or café chair, read the paper, check the departures board, wait at a counter. Press again or move to stop. |
| Tab | Scoreboard |
| Esc | Pause |
| F3 | Debug overlay (FPS, frame time, draw calls, measured ticks/s and walking speed) |

Ctrl+W is the browser's close-tab shortcut, so C is the safer crouch key. The game asks for confirmation before the page closes during a match.

## Rules

- **The target chain.** All spies form one cycle, and each targets the next spy in it. When you kill someone, you inherit their target. The chain always stays valid through deaths and respawns.
- **Scoring.**

  | Kill | Points |
  |---|---|
  | Your target | +100 |
  | Your target, unseen (no other spy saw you in the last 2 s) | +50 extra |
  | Your target, headshot | +25 extra |
  | Your hunter | +50 |
  | Any other spy | −25 |
  | A civilian | −50, and every spy sees a red marker over you for 5 s |

- **Health.** You have 100 health, and it does not regenerate. A headshot does 100 damage and a body shot does 55. You respawn after 5 s, far from other spies.
- **Suspicion (0–100).** These actions raise it:
  - running: +25/s (less inside a panicking crowd)
  - weapon drawn: +15/s
  - aiming: +30/s
  - jumping: +10
  - staying within 1.2 m of another spy for more than 3 s: +10/s
  - firing: sets it to 100

  Walking, idling and crouching let it decay at 20/s. Above 60, your hunter sees you outlined in red. Likewise, you see your target outlined when they are exposed.
- **Blending in (G).** Sitting lets suspicion decay at 30/s, and a standing activity (newspaper, departures board, counter) at 26/s. Hunters also learn half as much from watching you while you do it. The bonus stops after 25 s in the same spot. You can draw and fire while seated, but you can't move; standing up takes 0.4 s. Drawing, firing or moving ends a standing activity. AI spies sit and read too, so sitting is not proof of innocence.
- **Gadgets.**

  | Gadget | Key | Cooldown | Effect |
  |---|---|---|---|
  | Scanner | Q | 20 s | Shows an arrow and a distance band to your target for 2 s, but emits a ripple and adds +20 suspicion. |
  | Disguise | E | 45 s | Changes your suit and hat for 20 s. AI hunters lose their lock on you. |
  | Smoke | F | 30 s | A 6 m cloud that blocks vision for 8 s. |

- **The round.** A round lasts 8 minutes, and the highest score wins.

## Architecture

```
src/
  main.ts          boot + game loop: fixed 60 Hz simulation, interpolated rendering
  config.ts        every gameplay number in one place
  core/            vector math, seeded RNG, object pool, spatial hash, fixed-step loop, input
  world/           map data (Grand Station), collision grid + ramps + raycasts, waypoint graph + A*
  sim/             World (authoritative state), movement, combat, suspicion, contracts,
                   gadgets, scoring, appearance
  ai/              civilian brain, spy brain, perception, path steering
  render/          renderer + quality, merged map meshes, instanced crowd shader, effects, viewmodel
  ui/              HUD, menus, settings (localStorage)
  audio/           procedural Web Audio engine
```

- **Simulation is separate from rendering.** The simulation (`sim/`, `ai/`, `world/`) never imports Three.js. It mutates plain data and emits events. The render layer reads that state each frame and interpolates between ticks. A Node server can run `World` unchanged, feeding it `SpyIntent`s from the network instead of the keyboard.
- **AI thinks at 10 Hz.** Updates are staggered so that each tick only updates one sixth of the agents.
  - **Civilians** wander between points of interest (kiosks, benches, café seats, the info board, platform edges, chat circles), linger there, and panic away from gunshots and bodies.
  - **Spies** keep a belief weight for each agent they observe. Weights come from scanner pulses, visible suspicion (the red outline), hearing, and watching their target up close. Confidence above 0.7 within 25 m moves a spy from Search to Stalk and then Strike. Each bot has its own reaction time and accuracy, and they sometimes shoot the wrong person.
- **Rendering performance.**
  - Every human is drawn in a single instanced draw call. A jointed rig (hips, knees, shoulders, elbows, neck, waist) runs in the vertex shader: walking and running, sitting, crouching, aiming, death, and idle activities (talking, reading a newspaper, phoning, waiting) with breathing and glances.
  - The static level is merged into about 13 meshes by material *group*, with colours and baked ambient occlusion in vertex colours. The floor, brass and train paint reflect a small procedural environment map.
  - The departure board, station clocks and platform LED displays are live canvas textures.
  - Atmosphere effects (lamp halos, light pools, light shafts from the high windows, drifting dust) are one draw call each.
  - Train doors open on announcements.
  - Lighting uses no shadow maps: blob shadows go under each character, plus 3 point lights and fog.
  - Effects are pooled buffers, one draw call each.
  - The auto-quality scaler lowers the render scale (1.0 → 0.85 → 0.7) when the 2 s average FPS drops below 50, and raises it again after 5 s above 58.
- **Trains.** Train movement runs inside the simulation (`sim/trains.ts`), deterministic per seed. Each track cycles through away → arriving (constant deceleration to the buffers) → dwell (doors open) → departing. Moving cars block sight and bullets. Movement-only guards keep people off the track beds without blocking sight lines across them. Announcements, door beeps, braking and horns are driven by the train events.
- **Collision.** Agents are circles with a height, tested against AABBs in a 4 m uniform grid. Stairs are ramps. Shooting uses a hitscan raycast against head spheres, body boxes and the AABB grid. It never touches render meshes.

## Measured

These numbers come from Chrome on Apple-silicon macOS:

| Metric | Value |
|---|---|
| Frame rate | Locked to 60 FPS (vsync) |
| Simulation time | ≈0.6 ms per frame (120 agents) |
| Render CPU time | ≈1 ms per frame |
| Draw calls | 17–28 |
| Triangles | ≈131k |
| Bundle size | 180 KB gzipped |
| Time to title screen | ≈0.3 s (production build) |
| Full 8-minute headless match (bots only) | ≈2 s |

## Developer scripts

| Command | What it does |
|---|---|
| `npm run sim -- <seed>` | Runs one bot-only match headless and prints kills, AI state time and scores. |
| `npm run balance` | Measures how long a passive player survives across 6 seeds. |
| `npx vite-node scripts/navcheck.ts` | Prints nav-graph statistics. |
| `npx vite-node scripts/crowdcheck.ts` | Reports crowd spread across areas and the longest time any agent was stuck. |
| `npx vite-node scripts/zfight.ts` | Lists coplanar overlapping faces (z-fighting candidates) in the map. |
