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

## v2.2 — Audit, hierarchy, tests, prefabs, IDs, migration

- `ENGINE_ARCHITECTURE.md` — full Phase-0 audit: systems, gaps, debt, roadmap
- `src/ecs/hierarchy.ts` — parent/child scene graph (world matrices, cycle
  guard, cascade destroy). Renderer/physics integration explicitly scheduled next
- `World.isAlive()` + prune physics `wasGrounded` / trigger `inside` on destroy
- `buildActor` marks rig identity itself (head `actor`, parts `actorPart`);
  `loadScene` falls back to a gray placeholder instead of dropping actors
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
## v2.3 — Frustum culling + GPU instancing (this change)

- `src/rendering/frustum.ts` — 6-plane extraction from P*V, rotation-proof
  sphere test (matches the yaw-only world)
- `src/rendering/instancing.ts` — pure `groupInstances`/`composeInstance`
  (matrix layout proven equal to the renderer chain in tests) + `InstancedMesh`
  (`drawElementsInstanced`, divisor setup, dispose)
- `INST_VERT/FRAG_SRC` kept as a separate pair: the proven single-draw
  shaders are byte-for-byte untouched (unified variant system is Phase-2 work)
- `Renderer.frame` culls, groups by mesh+texture, instances groups ≥ 4
  (chunked at 2048), singles keep the exact old path; `renderer.stats`
  exposes total/drawn/culled/instanced/regular (demo HUD shows it live)
- `tests/render.test.ts` — 7 tests; GL path itself is compile-verified and
  needs in-browser confirmation (no headless-GL in this environment)
- Known cost: instanced VAOs duplicate vertex data per mesh (fine at our
  mesh sizes); uniform re-upload on program switch is redundant but harmless

## v2.4 — Collision layers + sphere/capsule colliders (this change)

- `src/physics/layers.ts` — 32-bit layer/mask filtering (both-sides rule);
  missing components mean layer 0 + all-bits, so old worlds behave identically
- `SphereCollider` / `CapsuleCollider` (Y-axis, height includes caps):
  exact sphere-sphere/sphere-box/sphere-ground, segment-based capsule
  resolves (capsule-capsule exact for parallel segments; capsule-box is a
  documented 3-sample approximation), ground impact codes preserved
- `raycast.ts` — `{mask, ignore}` options, sphere hits, face normals;
  `rayVsBox` signature unchanged
- Triggers now see sphere/capsule bodies too (center test, as before)
- Box-box resolve path byte-for-byte preserved; rotation still ignored
- `tests/physics.test.ts` +7: layer pass-through, one-way masks, sphere/
  capsule resting, wall push-out, raycast mask/ignore/normals
- Open: editor physics UI, mesh colliders, CCD, dynamics-vs-dynamics

## v2.5 — PBR materials (this change)

- `src/rendering/materials.ts` — PBR data model (albedo/metallic/roughness/
  normal/AO/emission/opacity/alpha/cull), registry + presets + validation,
  `resolveMaterial` routing rule (unknown ids fall back to legacy shading)
- `src/rendering/pbr.ts` — CPU mirror of the shader BRDF; tests pin diffuse,
  metal cutoff, backlight zero, smooth/rough ratio, finiteness + energy
- `PBR_FRAG_SRC` — Cook-Torrance GGX + Schlick + Smith, derivative-frame
  normal mapping (no tangents needed), AO on ambient, emission, alpha
  mask/blend, fog; kept separate so legacy shaders are untouched
- `Renderer` PBR path (own program, 5 texture units, blend/cull handling),
  sky/ground ambient colors, PBR items excluded from instancing (documented)
- Editor material section: pick/duplicate + live metallic/roughness/emission/
  alpha/double-sided; library persistence still open (asset-DB work)
- Demo exercises it all: gold crates, emissive pad, mapped plinth, hologram
- Found by tests: epsilon choice inverted mirror peaks (fixed in TS + GLSL)

## v2.6 — Input actions (this change)

- `src/input/input.ts` — pressed/released edges + `endFrame()` (wired via a
  new optional `GameLoop` frameEnd hook), wheel deltas, touch tracking with
  single-finger orbit, pointer lock deltas, reversible `detach()`
- `src/input/actionmap.ts` — named buttons/1D axes/2D vectors, per-context
  bindings with global fallback, rebind/remove, JSON save/load with skipped-
  entry counts, gamepad buttons/axes with deadzone + invert via injectable
  pad source (headless-testable), strict errors for undefined actions
- `src/input/actions.ts` — legacy WASD/Space/R wrapper reimplemented on the
  map with byte-identical keyboard behavior (+ `update()` passthrough)
- `tests/input.test.ts` — 11 tests; real finding: `tsc` caught the
  Set-vs-method `pressed` clash between `Input` and the first `RawState` draft
- Open: touch joysticks/game-side gestures, rumble, multi-pad arbitration

## v2.7 — Audio samples (this change)

- `src/audio/volume.ts` — dB/gain conversion, inverse-distance attenuation
  (matches the panner model), gain clamping
- `src/audio/sfx.ts` — procedural sample buffers (thump/noise/sweep/arp):
  pure renderers with injectable rand, envelope-shaped, peak-limited
- `src/audio/audio.ts` — clip cache + async decode, `playTone`/`playClip`
  with mixer groups + HRTF panners + listener pose, loop layers, volume
  persistence; legacy `blip/positional/jump/land/pickup/trigger/music`
  behavior preserved
- `tests/audio.test.ts` — 8 tests
- `src/audio/sample.ts` — WAV codec (PCM 8/16/24/32 int + float32, any channels, chunk-skipping) + writer + mixdown; fixed real header-offset bug found by tests
- `src/audio/synth.ts` — procedural notes (ADSR-ish, peak-normalized) + pure step-sequencer timing + rms/peak helpers
- `src/audio/audio.ts` — `playSample` bridge (WeakMap buffer cache) + lookahead `playSequence`/`stopSequence` music player
- `tests/sample.test.ts` — 9 tests: decode values, stereo roundtrip, malformed files, mixdown/clamp/rates, note shape, sequence timing
- Open: true streaming (needs hosted files, future asset work), doppler
  velocities (plumbed, browser-dependent)

## v2.8 — Gizmos + undo (this change)

- `src/math/mat4.ts` — `invert()` via Gauss-Jordan with partial pivoting
  (replaced a mistranscribed cofactor formula the tests disproved)
- `src/editor/history.ts` — command-pattern undo/redo (cap, truncation, labels)
- `src/editor/gizmo.ts` — world→screen, unproject/screen-ray, ray-axis drag
  math, segment distance, snapping (all pure + tested)
- `src/editor/overlay.ts` — undo/redo buttons + Ctrl+Z/Y, command-based
  transform/color/material/delete/add, SVG move gizmo with snap toggle,
  click-to-select via raycast picking
- Demo wires the viewport hook; `tests/editor.test.ts` (11) +
  `tests/editor-dom.test.ts` (7, real jsdom) + 3 invert tests
- Found by tests: broken 4-arg/3-arg inspector wiring, stale button labels,
  cofactor inverse wrong on rotations
- Open: rotate/scale gizmos, multi-select, duplicate, parenting UI

## v2.9 — Particle systems (this change)

- `src/fx/particles.ts` — pooled CPU particles as plain entities (culling +
  instancing apply for free): rate/burst/duration emitters, cone sampling,
  gravity/drag/ground bounce, color + size over life, entity follow, stable
  emitter ids, `fountainDef()` preset, per-frame {emitted, alive} stats
- Editor "+ FX" button (undoable attach), demo bursts on pickup/deliver/win,
  HUD alive counter
- `tests/fx.test.ts` — 10 tests; found a real bug (pool never filled)
- Open: trails, sub-emitters, GPU particles, collision beyond ground

## v2.10 — Terrain (this change)

- `src/world/terrain.ts` — heightfields (plain-array, JSON-safe), sculpt/
  smooth/noise/flatten brushes, bilinear sampling, slope, grid meshes with
  computed normals + stride LOD, deterministic slope scatter, splat painting
  (pure data + one canvas call)
- `TERRAIN_FRAG_SRC` — splat-mapped matte surfacing (3 details, fog, points);
  renderer terrain path; `MeshRef.terrain`; `TerrainCollider` component with
  real heightfield grounding in physics (all shapes, layers honored)
- `tests/terrain.test.ts` — 17 tests incl. winding orientation, LOD counts,
  hilltop resting, patch bounds, JSON round-trip
- Demo hill: sculpted + noise, slope-painted rock, walkable, pine-dotted
- Open: chunked streaming LOD, editor sculpt tools, terrain texture import
