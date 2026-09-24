# Glitch Game Engine v2.0

Minimal 3D web game engine (raw WebGL2, zero runtime deps). Launches with a
project browser (New / My / Sample projects), edits scenes in-app, and ships
a playable sample game. See `ROADMAP.md`.

## Run the engine

```bash
npm install
npm run dist:exe
```

Launch the app → project browser → **Sample Projects → Play**
(Dusk Street: Night Shift), or **New Project** and press **F9** to edit.

## Modules

- `src/math/` — `Vec3`, `Mat4`
- `src/core/` — `GameLoop` (fixed-step), `Time`, `Engine` (physics + triggers wired), `loading.ts` (staged loading screen)
- `src/ecs/` — `World`, `Transform/Rigidbody/BoxCollider/MeshRef(+texture)/Spin/PlayerTag`
- `src/rendering/` — `Renderer` (textured, multi-light, distance fog), `Camera`, `GpuMesh` (+UVs), `texture.ts`, `material.ts`, `lights.ts`, `obj.ts`, `sky.ts` (dawn/day/dusk/night palette), `proctex.ts` (procedural canvas textures: faces, cloth, brick, grass, asphalt, roof, water, wood)
- `src/physics/` — AABB `physics.ts`, `raycast.ts`, `trigger.ts`, `character.ts`
- `src/input/` — `input.ts` + `actions.ts` (move/jump/reset)
- `src/audio/` — `AudioEngine` (blips, positional, music loop)
- `src/scene/` — `prefab.ts` (box/platform/pickup/trigger), `scene.ts` (save/load JSON), `citykit.ts` (procedural street props: houses, pines, poles + wires, shops, gas stations, cars, fences, piers, scaffolds, mountains), `actor.ts` (cartoonish articulated characters: painted faces, walk-cycle posing, mesh hide/show)
- `src/assets/` — `loader.ts` (texture/OBJ/JSON with cache)
- `src/editor/` — `overlay.ts` (hierarchy + inspector + save/load, `?editor=1`)
- `src/examples/` — `second-level.ts`
- `src/ui/` — `hud.ts`, `menu.ts` (main-menu overlay with hooks)
- `src/net/` — `p2p.ts` (serverless player-hosted WebRTC: host authority, snapshots, requests, 4 max)

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. Click Start: `WASD` move, `Space` jump, drag orbit, `R` reset. Add `?editor=1` for the editor overlay. Reach the far platform to trigger the goal message.

## Authoring

```ts
import { Engine } from "./core/engine.js";
import { createPlatform, createPickup } from "./scene/prefab.js";
```

Build levels with prefabs, query with `world.query("transform", "mesh")`, save with `saveScene(world)`.
