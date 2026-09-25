# Glitch Game Engine v2.7

Minimal 3D web game engine (raw WebGL2, zero runtime deps). Launches with a
project browser (New / My / Sample projects), edits scenes in-app, and ships
a playable sample game. See `ROADMAP.md`.

## Run the engine

```bash
npm install
npm run dist:exe
```

Tests: `npm test` (vitest, 85 tests: math, ECS, hierarchy, IDs, prefabs,
migration, rendering/culling/instancing, materials/PBR, physics, layers,
shapes, triggers, raycast, character, scene, sky, input/actions, audio,
samples/synth).

Launch the app → project browser → **Sample Projects → Play**
(Dusk Street: Night Shift), or **New Project** and press **F9** to edit.

## Modules

- `src/math/` — `Vec3`, `Mat4`
- `src/core/` — `GameLoop` (fixed-step), `Time`, `Engine` (physics + triggers wired), `loading.ts` (staged loading screen)
- `src/ecs/` — `World`, `Transform/Rigidbody/BoxCollider/SphereCollider/CapsuleCollider/MeshRef(+texture)/Spin/PlayerTag`, `hierarchy.ts` (parent/child, world matrices, destroy trees), `ids.ts` (opt-in stable UIDs)
- `src/rendering/` — `Renderer` (textured, multi-light, distance fog, frustum culling, instancing, PBR path, frame stats), `Camera`, `GpuMesh` (+UVs), `texture.ts`, `material.ts` (legacy Phong), `materials.ts` (PBR DB + presets), `pbr.ts` (CPU reference BRDF), `lights.ts`, `obj.ts`, `sky.ts` (dawn/day/dusk/night palette), `proctex.ts` (procedural canvas textures: faces, cloth, brick, grass, asphalt, roof, water, wood, signs, noise normals), `shadows.ts` (contact blobs), `frustum.ts` (planes + sphere test), `instancing.ts` (batching + instanced draws)
- `src/physics/` — AABB `physics.ts` (box/sphere/capsule, layers), `layers.ts` (32-bit layer/mask filtering), `raycast.ts` (mask/ignore/normals/spheres), `trigger.ts`, `character.ts`
- `src/input/` — `input.ts` (keys + pressed/released edges, wheel, touch, pointer lock, detach) + `actionmap.ts` (named buttons/axes/vectors, contexts, gamepad, rebind, JSON) + legacy `actions.ts` wrapper (unchanged API)
- `src/audio/` — `audio.ts` (clips, mixer groups, HRTF positional, listener, loop layers, volume persistence, `playSample` bridge, lookahead step sequencer), `sample.ts` (WAV codec + writer + mixdown), `synth.ts` (procedural notes + sequence timing), `sfx.ts` (procedural thump/noise/sweep/arp buffers), `volume.ts` (dB/gain/attenuation math)
- `src/scene/` — `prefab.ts` (box/platform/pickup/trigger), `scene.ts` (v3 save/load JSON + migration), `prefabs.ts` (GUID prefab assets: save/parse/instantiate), `citykit.ts` (procedural street props: houses, pines, poles + wires, shops, gas stations, cars, fences, piers, scaffolds, mountains), `actor.ts` (cartoonish articulated characters: painted faces, walk-cycle posing, mesh hide/show)
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
