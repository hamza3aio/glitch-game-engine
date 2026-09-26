# ENGINE_ARCHITECTURE.md — Glitch Game Engine (audit, 2026-09-25)

Authoritative audit of `hamza3aio/glitch-game-engine` at v2.1.0 (`b921b01`).
Produced before any new implementation (Phase 0). All paths relative to repo root.

---

## 1. Languages, build, runtime

- **Language:** TypeScript 5.9 (strict, `noEmit`), ES2020 target, `module: ESNext`, `moduleResolution: bundler`.
- **Runtime:** Browser + Electron. All rendering/DOM code assumes a browser env
  (`document`, `WebGL2RenderingContext`, `AudioContext`, `requestAnimationFrame`).
  Pure-logic modules (math, ECS store, physics step, scene JSON shapes, sky
  palette) are DOM-free at import time and run under Node.
- **Build:** Vite 6 (`root:. base:./ outDir:dist`), `npm run build = tsc --noEmit && vite build`.
- **Desktop:** Electron 44 + electron-builder 26, `electron/main.cjs` (launcher +
  game windows, project IPC, fs), `electron/preload.cjs` (contextBridge API),
  portable `.exe` to `release/`. `public/launcher.html` ships inside `dist/`.
- **Dependencies (ALL dev-only, zero runtime deps):**
  `electron ^44.4.5`, `electron-builder ^26.15.3`, `typescript ^5.6.0`,
  `vite ^6.0.0`. After this audit: `vitest` (tests).
- **Tests before this audit:** none. No runner, no CI, no workflows.
  Gate was `tsc --noEmit` + `vite build` + manual play.

## 2. Existing systems (what works today)

| Area | Files | Status |
|---|---|---|
| Math | `math/vec3.ts`, `math/mat4.ts` | Vec3 + column-major Mat4 (perspective, lookAt, compose); **rotationY only** in practice |
| ECS store | `ecs/world.ts`, `ecs/components.ts` | String-keyed component maps, AND queries. **Flat: no hierarchy** |
| Hierarchy | `ecs/hierarchy.ts` (NEW, v2.2) | Parent/child, world matrices, cycle guard, cascade destroy |
| Core loop | `core/{engine,loop,time,loading}.ts` | Fixed-step accumulator (1/60, 4-substep guard), FPS clock, staged DOM loading screen |
| Rendering | `rendering/renderer.ts` + `shader.ts` | Single Blinn-Phong WebGL2 program, 1 dir + ≤4 point lights, textured, distance fog; v2.3 adds frustum culling + instanced batches + frame stats |
| Meshes | `rendering/mesh.ts`, `obj.ts` | Cube/plane generators, minimal OBJ (`v/vn/f`), Uint16 indices |
| Materials | `rendering/material.ts`, `MeshRef` | Legacy Phong fields (color/texture/shininess). **No PBR** |
| Lights | `rendering/lights.ts` | Dir + point types (range unused by shader). No spots/shadows |
| Textures | `rendering/texture.ts`, `proctex.ts` | RGBA8 upload + procedural canvas painter (faces, cloth, brick, grass, …). DOM-only creation |
| Sky | `rendering/sky.ts` | Dawn/day/dusk/night palette lerp (colors only, no dome) |
| Shadows | `rendering/shadows.ts` | Blob quads only. **No shadow maps** |
| Physics | `physics/physics.ts` | Kinematic box/sphere/capsule vs static + ground plane, smallest-axis + normal-removal resolve, 32-bit layer/mask filtering. No dynamics-vs-dynamics |
| Triggers | `physics/trigger.ts` | Center-in-box enter/exit. No extents test, no layers |
| Raycast | `physics/raycast.ts` | Slab ray vs AABB, closest hit. No mask/normal |
| Character | `physics/character.ts` | Arcade velocity lerp + jump gate. No coyote/buffer/slopes |
| Input | `input/{input,actions}.ts` | Keyboard set + pointer drag + WASD/Space/R mapping. No pressed/released edges, remap, touch |
| Audio | `audio/*.ts` | Clips + mixer groups + HRTF positional + listener + loops + sequencer + volume persist; pure WAV codec, procedural notes/SFX, dB math |
| Scene | `scene/scene.ts` | JSON `{version, entities[]}` transforms+mesh+static+actors. **Writes v2, never migrates; lossy colliders** |
| Prefabs/kit | `scene/{prefab,citykit}.ts` | Spawn helpers + box-built street props. No GUIDs/instancing |
| Actors | `scene/actor.ts` | 7-box cartoon rigs, painted faces, sine walk pose. No skeleton |
| Assets | `assets/loader.ts` | Cached fetch for texture/OBJ/JSON. Not wired to editor |
| Editor | `editor/overlay.ts` | F9 panel: hierarchy list, transform/color inspector, add/delete, pause, project save / file fallback |
| UI | `ui/{menu,hud}.ts` | Main-menu overlay with hooks, FPS/message HUD |
| Net | `net/p2p.ts` | Serverless WebRTC listen-server (host authority, snapshots, 4 max). **Untested 2-machine** |
| Projects | `electron/*`, `project-template/` | Launcher (new/recents/samples/guide), scene.json projects |
| Sample | `main.ts`, `examples/` | Night Shift mini-game (collect/deliver, clock, win/lose) |

## 3. Missing systems (vs the Unity-class target)

P0 (blocks everything above): **hierarchy** (done v2.2), **tests** (done v2.2),
prefab assets with GUIDs, stable entity IDs, scene migration.
P1: PBR material workflow, shadow mapping, ~~instancing + frustum culling~~ (done v2.3),
collision layers/masks, sphere/capsule colliders, input actions/rebinding,
audio samples + 3D pan, asset DB with import settings, undo/redo + gizmos.
P2: skeletal animation, particles, terrain, navmesh, scripting (Lua vs C#
decision), post-processing stack, profilers, package manager, 2D renderer.

## 4. Technical debt (acknowledged, scheduled)

1. Renderer consumes flat `Transform`; `hierarchy.ts` world matrices not yet
   consumed by renderer/physics (explicit follow-up, not silent).
2. `saveScene` lossy (collider extents, velocity, Spin/Trigger) + no migration.
3. `query()` O(n·m) per call per frame; no archetypes/caching.
4. Entity IDs monotonic, never recycled, no versioning.
5. Shader: wrong normal matrix under non-uniform scale; spec not tinted.
6. Leak fixes applied v2.2: physics `wasGrounded` + trigger `inside` maps now
   pruned on destroy (via new `World.isAlive`).
7. `proctex` needs DOM (no headless baking); `Math.random()` nondeterministic.
8. Net code never tested with 2 machines; no host migration.
9. `loading.ts` tips are game-specific (should move to game repo).
10. `createTrigger` duplicates `makeTrigger`; `Material` unused by renderer.

## 5. Dependency graph (imports)

```
main/demo → core/engine → { ecs/world, rendering/renderer, physics/*, input, audio }
rendering/renderer → ecs/world, math/*, rendering/{shader,mesh,texture,lights,camera}
scene/scene → ecs/*, math, scene/actor → rendering/proctex
scene/citykit → ecs/*, math
editor/overlay → ecs/*, scene/scene, scene/actor
net/p2p → (none, DOM WebRTC only)
tests/*.test.ts → math, ecs/*, physics/*, scene/*, rendering/sky, input/actions
```

No cycles. `proctex`/`actor` are leaf-ward (safe for Node import in tests).

## 6. Recommended architecture (evolution, not rewrite)

- Keep the string-keyed `World` store; grow it (hierarchy → prefabs → IDs),
  don't replace it without measured cause.
- Renderer stays single-forward-pass until profiling demands more; next real
  steps: frustum culling → instancing → shadow maps → PBR (in that order).
- Physics stays custom AABB until a game needs spheres/capsules/layers; only
  then evaluate Rapier (WASM) vs extensions, per rule 13.
- Scripting decision deferred until editor + prefabs exist (Lua via
  WebAssembly is the likely fit for a browser-first engine; C# needs a
  host toolchain this environment cannot verify).
- Every subsystem ships with `vitest` coverage for its pure logic and a
  runner-visible proof (demo scene usage or test output).

## 7. Roadmap mapping (their 27 phases → reality)

Done: audit (0), core loop/ECS (1 partial), forward renderer (2 partial),
editor foundations (5 partial), scene JSON (6 partial), bank of samples (26 partial),
win portable export (20 partial).
Next 3 subsystems in priority order:
  1. ~~Prefab assets + stable entity IDs + scene migration~~ DONE (v2.2)
  2. ~~Frustum culling + mesh instancing~~ DONE (v2.3; GL path needs browser confirmation)
  3. ~~Collision layers + sphere/capsule colliders~~ DONE (v2.4)
  4. ~~PBR materials~~ DONE (v2.5; GL path needs browser confirmation)
  5. ~~Input actions~~ DONE (v2.6; live pads/sticks need browser confirmation)
  6. ~~Audio samples~~ DONE (v2.7; WebAudio graph needs browser confirmation)
  7. ~~Gizmos + undo~~ DONE (v2.8; drag interaction needs browser confirmation)
  8. ~~Particles~~ DONE (v2.9; visual look needs browser confirmation)
  9. ~~Terrain~~ DONE (v2.10; GL path needs browser confirmation)
  10. ~~Navigation + AI~~ DONE (v2.11; live crowd needs browser confirmation)
Then scripting decision (C# vs Lua), post-processing, profilers.
Deferred until demanded by a real game: deferred rendering, GI, terrain,
navmesh, particles GPU, C#/Lua scripting, packages, consoles/mobile.
