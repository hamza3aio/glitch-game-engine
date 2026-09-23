# Markley 3D Engine v0.1

Minimal 3D web game engine (raw WebGL2, zero runtime deps).

## Modules

- `src/math/` — `Vec3`, `Mat4` (perspective, lookAt, compose)
- `src/core/` — `GameLoop` (fixed-step physics + variable render), `Time`, `Engine`
- `src/ecs/` — `World` (entities + component stores + query), `components.ts`
- `src/rendering/` — WebGL2 `Renderer`, `Camera` (orbit/follow), `GpuMesh`, shaders, `cube`/`plane` primitives
- `src/physics/` — AABB integration, box-on-box resolve, ground plane, `onCollide` events
- `src/input/` — keyboard + pointer-drag orbit
- `src/audio/` — WebAudio blips (jump/land/pickup)

## Run

```bash
cd game-engine
npm install
npm run dev
```

Open http://localhost:5173. Click Start, then `WASD` move, `Space` jump, drag to orbit, `R` reset.

## Demo scene (`src/main.ts`)

Player cube with rigidbody, 3 static platforms, ground plane, 3 spinning pickups, follow camera, FPS HUD.

## Next steps

- glTF loader, textures, skybox
- capsule/raycast character controller, slopes
- shadow mapping, more lights
- editor UI / level serialization
- WASM physics (Rapier) swap
