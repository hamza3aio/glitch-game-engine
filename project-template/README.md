# My Glitch Game

Glitch scene project. You don't compile anything by hand:

1. Open the **Glitch Engine** app → **My Projects** → **Browse** → pick this folder.
2. The world opens in the editor. Press **F9** for hierarchy, inspector, add/delete, play/pause.
3. **Save** writes back to `scene.json` in this folder.

Files:

- `project.json` — project metadata (name, engine version).
- `scene.json` — the world: entities with transforms, meshes, colliders, actors.

To build a full coded game instead, use the engine TypeScript modules
(`src/core, ecs, rendering, physics, scene, net, ui`) and ship with
`npm run dist:exe`.
