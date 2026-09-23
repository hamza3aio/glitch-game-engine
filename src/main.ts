import { Engine } from "./core/engine.js";
import { Vec3 } from "./math/vec3.js";
import {
  makeRigidbody,
  makeTransform,
  type MeshRef,
  type PlayerTag,
  type Rigidbody,
  type Spin,
  type Transform,
} from "./ecs/components.js";
import type { Entity } from "./ecs/world.js";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const stats = document.getElementById("stats")!;
const startBtn = document.getElementById("start")!;

const engine = new Engine(canvas);
const { world, input, audio, physics, renderer } = engine;

function spawnBox(
  x: number, y: number, z: number,
  color: [number, number, number],
  opts: { static?: boolean; scale?: Vec3; spin?: number; player?: boolean } = {}
): Entity {
  const e = world.create();
  const t = makeTransform(x, y, z);
  if (opts.scale) t.scale = opts.scale;
  world.add(e, "transform", t);
  world.add<MeshRef>(e, "mesh", { meshId: "cube", color });
  world.add(e, "collider", {
    halfExtents: new Vec3(0.5, 0.5, 0.5),
    isStatic: opts.static ?? false,
  });
  if (opts.static) {
    world.add(e, "rigidbody", { velocity: new Vec3(), useGravity: false, mass: 0, grounded: true });
  } else {
    world.add(e, "rigidbody", makeRigidbody(true, 1));
  }
  if (opts.spin) world.add<Spin>(e, "spin", { speed: opts.spin });
  if (opts.player) world.add<PlayerTag>(e, "player", { speed: 6, jumpSpeed: 8 });
  return e;
}

// Ground (visual plane + static collider)
{
  const g = world.create();
  world.add(g, "transform", makeTransform(0, -0.51, 0));
  world.add<MeshRef>(g, "mesh", { meshId: "ground", color: [0.16, 0.35, 0.2] });
  world.add(g, "collider", {
    halfExtents: new Vec3(15, 0.5, 15),
    isStatic: true,
  });
}

// Platforms
spawnBox(3, 0.5, -2, [0.5, 0.5, 0.55], { static: true, scale: new Vec3(3, 1, 3) });
spawnBox(-3, 1.5, 2, [0.55, 0.4, 0.2], { static: true, scale: new Vec3(2, 1, 2) });
spawnBox(0, 2.5, -5, [0.3, 0.3, 0.6], { static: true, scale: new Vec3(2, 1, 2) });

// Player
const player = spawnBox(0, 2, 3, [0.2, 0.5, 1.0], { player: true });

// Spinning collectibles (no collision response needed — kinematic look)
const coins: Entity[] = [
  spawnBox(3, 2, -2, [1.0, 0.8, 0.2], { spin: 2.5 }),
  spawnBox(-3, 3, 2, [1.0, 0.8, 0.2], { spin: 2.5 }),
  spawnBox(0, 4, -5, [1.0, 0.8, 0.2], { spin: 3.0 }),
];
for (const c of coins) {
  world.remove(c, "collider");
  world.remove(c, "rigidbody");
  const t = world.get<Transform>(c, "transform")!;
  t.scale.set(0.5, 0.5, 0.5);
}

// --- Systems ---
engine.addSystem((dt) => {
  // Player movement, camera-relative
  const t = world.get<Transform>(player, "transform")!;
  const rb = world.get<Rigidbody>(player, "rigidbody")!;
  const tag = world.get<PlayerTag>(player, "player")!;
  const fwd = input.axis("KeyS", "KeyW");
  const strafe = input.axis("KeyA", "KeyD");
  const yaw = renderer.camera.yaw;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  // camera forward on ground plane
  const mx = (strafe * cos - fwd * sin) * tag.speed;
  const mz = (-fwd * cos - strafe * sin) * tag.speed;
  rb.velocity.x = mx;
  rb.velocity.z = mz;
  if (input.down("Space") && rb.grounded) {
    rb.velocity.y = tag.jumpSpeed;
    rb.grounded = false;
    audio.jump();
  }
  if (input.down("KeyR")) {
    t.position.set(0, 2, 3);
    rb.velocity.set(0, 0, 0);
  }

  // Spin collectibles + pickup check
  for (const c of [...coins]) {
    const ct = world.get<Transform>(c, "transform");
    const cs = world.get<Spin>(c, "spin");
    if (!ct || !cs) continue;
    ct.rotationY += cs.speed * dt;
    ct.position.y += Math.sin(performance.now() / 500 + c) * dt * 0.5;
    const d = ct.position.clone().sub(t.position).length();
    if (d < 1.0) {
      world.destroy(c);
      coins.splice(coins.indexOf(c), 1);
      audio.pickup();
    }
  }

  // Camera
  const drag = input.consumeDrag();
  renderer.camera.updateOrbit(drag.dx, drag.dy);
  renderer.camera.follow(t.position);
});

physics.onCollide = ({ a, b }) => {
  if (a === player && (b === -1 || b === -2)) {
    if (b === -1) audio.land();
  }
};

// HUD
let hudTimer = 0;
engine.addSystem((dt) => {
  hudTimer += dt;
  if (hudTimer > 0.25) {
    hudTimer = 0;
    stats.textContent = `${engine.loop.time.fps} fps · ${world.count()} entities · ${coins.length} coins`;
  }
});

startBtn.addEventListener("click", () => {
  audio.resume();
  startBtn.remove();
  canvas.focus();
});

engine.start();
