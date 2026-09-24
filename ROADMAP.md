# Glitch Game Engine — Full Version Plan (v1.0)

## Phase 1 — Foundation (done, v0.1)
- `src/math/` Vec3, Mat4
- `src/core/` Time, GameLoop (fixed-step), Engine
- `src/ecs/` World, Transform/Rigidbody/BoxCollider/MeshRef/Spin/PlayerTag
- Demo in `src/main.ts`

## Phase 2 — Rendering Pro (this batch)
- `src/rendering/texture.ts` — procedural + image textures
- `src/rendering/material.ts` — color + texture + shininess
- `src/rendering/lights.ts` — ambient + directional + up to 4 point lights
- `src/rendering/obj.ts` — minimal OBJ parser → MeshData
- Upgrade `shader.ts` + `renderer.ts` — textured lit shader, multi-light uniforms, fallback for untextured meshes

## Phase 3 — Physics Pro
- `src/physics/raycast.ts` — Ray vs AABB, scene raycast
- `src/physics/trigger.ts` — Trigger volumes + enter/exit events
- `src/physics/character.ts` — CharacterController helper (move, jump, grounding)
- Extend `physics.ts` — layers/masks (lightweight), trigger pass

## Phase 4 — Gameplay Framework
- `src/scene/scene.ts` — save/load scene JSON
- `src/scene/prefab.ts` — createBox/Platform/Pickup/Trigger helpers
- `src/input/actions.ts` — action mapping (move/jump) over raw Input
- `src/ui/hud.ts` — HUD helper (fps line, center message)

## Phase 5 — Audio Pro
- Extend `src/audio/audio.ts` — positional blips, music loop, SFX pool (back-compat `blip/jump/land/pickup` kept)

## Phase 6 — Assets, Editor, Examples
- `src/assets/loader.ts` — loadTexture/loadOBJ/loadJSON with cache
- `src/editor/overlay.ts` — DOM hierarchy + inspector + play/pause + scene save/load
- `src/examples/` — keep `main.ts` demo; add `examples/second-level.ts` data
- Docs: README modules + controls + authoring guide

Acceptance: `npx tsc --noEmit` + `npx vite build` pass, demo still playable, new APIs usable from `main.ts` without breaking old components.

## v1.1 — Street-city + atmosphere + flow + P2P (synced from UNDERCITY)

- `src/rendering/shader.ts` + `renderer.ts` — distance fog uniforms (`fogColor/Near/Far`), 140-unit tiled ground
- `src/rendering/sky.ts` — dawn/day/dusk/night palette for sky, fog, sun, lamps
- `src/scene/citykit.ts` — procedural street props (houses, pines, poles + wires, shops, gas stations, cars, fences, piers, scaffolds, mountains, dashes, sidewalks)
- `src/core/loading.ts` — staged loading screen with tips
- `src/ui/menu.ts` — main-menu overlay (Continue/New/Settings/Credits/Quit) with hooks
- `src/net/p2p.ts` — serverless player-hosted WebRTC (host authority, snapshots, requests, 4 max)

## v1.2 — Cartoon actors + procedural textures + showcase demo

- `src/rendering/proctex.ts` — canvas-painted faces (eyes/mouths/blush/beards), shirts, brick, grass, asphalt, roof, water, wood
- `src/scene/actor.ts` — 7-part cartoon rigs with walk-cycle `poseActor()`, hide/show for first-person
- Demo rewritten: menu → loading → dusk-street vignette with a walkable cartoon player and two neighbors, full day in 2 minutes
- Sample game: Dusk Street Night Shift (collect + deliver before dawn, win/lose, restart)

## v2.0 — Launcher, projects, editor, sample game

- `electron/` launcher window: New Project (scaffolded template), My Projects (recents), Sample Projects, Guide — preload IPC bridge, no accounts/servers
- `project-template/` blank scene project (project.json + scene.json)
- `src/editor/overlay.ts` is now a full editor: hierarchy, transform/color inspector, add box/static/trigger/actor, delete, play/pause, save to project folder (or download)
- `src/scene/scene.ts` v2 format with actor rigs
- `src/glitch.d.ts` typed bridge for web fallbacks
- `src/rendering/proctex.ts` 256px textures + painted sign boards; `citykit` brick houses, sign textures, crosswalks

## v2.1 — Contact shadows

- `src/rendering/shadows.ts` — blob shadows that stick to actors, cars and crates; demo wires them everywhere

## v2.2 — Audit, hierarchy, tests (this change)

- `ENGINE_ARCHITECTURE.md` — full Phase-0 audit: systems, gaps, debt, roadmap
- `src/ecs/hierarchy.ts` — parent/child scene graph (world matrices, cycle
  guard, cascade destroy). Renderer/physics integration explicitly scheduled next
- `World.isAlive()` + prune physics `wasGrounded` / trigger `inside` on destroy
- `buildActor` marks rig identity itself (head `actor`, parts `actorPart`);
  `loadScene` falls back to a gray placeholder instead of dropping actors
## v2.2 — Prefabs, stable IDs, scene migration (this change)

- `ENGINE_ARCHITECTURE.md` — Phase-0 audit from the prior commit
- `src/ecs/hierarchy.ts` — parent/child scene graph (world matrices, cycle
  guard, cascade destroy). Renderer/physics integration explicitly scheduled next
- `World.isAlive()` + prune physics `wasGrounded` / trigger `inside` on destroy
- `src/ecs/ids.ts` — opt-in persistent UIDs (`assignUid/getUid/findByUid`);
  saves stay minimal + deterministic (only pre-assigned UIDs serialize)
- `src/scene/prefabs.ts` — GUID prefab assets (`savePrefab/parsePrefab/
  instantiatePrefab`); stamp semantics documented; colliding UIDs namespaced
  so one prefab instantiates N times; malformed JSON rejected with reasons
- `src/scene/scene.ts` — v3 format (full collider extents, UIDs, parent
  links), `loadEntities` core shared by scenes + prefabs, version migration
  (v1/v2 load; legacy boolean `static` defaults extents), malformed JSON
  throws descriptive errors, actor fallback placeholder kept
- `tests/identity.test.ts` — 7 tests: UID rules, prefab roundtrip + structure,
  double-instantiation, extents preservation, v1 migration, parent linking
- Renderer/physics hierarchy consumption explicitly still open (next)
