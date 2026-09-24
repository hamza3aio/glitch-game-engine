import { Vec3 } from "../math/vec3.js";
import { World, type Entity } from "../ecs/world.js";
import type { MeshRef, Transform } from "../ecs/components.js";
import { buildActor, poseActor, type ActorOpts } from "./actor.js";

interface SerializedEntity {
  pos: [number, number, number];
  rotY: number;
  scale: [number, number, number];
  mesh?: MeshRef;
  static?: boolean;
  actor?: ActorOpts; // cartoon rig root (head entity carries this marker)
}

// Scene serialization: transforms + mesh + static colliders + actor rigs.
// Actor parts are skipped individually; the head entity stores the full opts.
export function saveScene(world: World): string {
  const arr: SerializedEntity[] = [];
  for (const e of world.query("transform")) {
    if (world.has(e, "actorPart")) continue;
    const t = world.get<Transform>(e, "transform")!;
    const actor = world.get<{ opts: ActorOpts; parts: Entity[] }>(e, "actor");
    arr.push({
      pos: [t.position.x, t.position.y, t.position.z],
      rotY: t.rotationY,
      scale: [t.scale.x, t.scale.y, t.scale.z],
      mesh: actor ? undefined : world.get<MeshRef>(e, "mesh") ? { ...world.get<MeshRef>(e, "mesh")! } : undefined,
      static: world.get<{ isStatic: boolean }>(e, "collider") ? world.get<{ isStatic: boolean }>(e, "collider")!.isStatic : undefined,
      actor: actor ? actor.opts : undefined,
    });
  }
  return JSON.stringify({ version: 2, entities: arr }, null, 2);
}

export function loadScene(world: World, json: string, addTex?: (id: string, img: TexImageSource) => void) {
  const data = JSON.parse(json) as { entities: SerializedEntity[] };
  for (const s of data.entities) {
    if (s.actor && addTex) {
      const rig = buildActor(world, addTex, s.actor);
      poseActor(world, rig, s.pos[0], s.pos[1], s.pos[2], s.rotY, 0, false);
      continue;
    }
    const e = world.create();
    world.add(e, "transform", {
      position: new Vec3(...s.pos),
      rotationY: s.rotY,
      scale: new Vec3(...s.scale),
    });
    if (s.mesh) world.add(e, "mesh", { ...s.mesh });
    if (s.static !== undefined) {
      world.add(e, "collider", { halfExtents: new Vec3(0.5, 0.5, 0.5), isStatic: s.static });
      world.add(e, "rigidbody", { velocity: new Vec3(), useGravity: !s.static, mass: s.static ? 0 : 1, grounded: s.static });
    }
  }
}
