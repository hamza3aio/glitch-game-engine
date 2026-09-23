import { Engine } from "./core/engine.js";
import { LoadingScreen, nextFrame } from "./core/loading.js";
import { Vec3 } from "./math/vec3.js";
import { CharacterController } from "./physics/character.js";
import { InputActions } from "./input/actions.js";
import { Texture2D } from "./rendering/texture.js";
import { skyAt } from "./rendering/sky.js";
import { paintAsphalt, paintBrick, paintGrass, paintRoof } from "./rendering/proctex.js";
import { buildActor, poseActor, type ActorRig } from "./scene/actor.js";
import { car, dashes, house, pine, pole, shop, sidewalk, wireRun } from "./scene/citykit.js";
import { MainMenu } from "./ui/menu.js";
import { makeRigidbody, makeTransform, type MeshRef, type Rigidbody, type Transform } from "./ecs/components.js";
import type { Entity } from "./ecs/world.js";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const stats = document.getElementById("stats")!;
const toast = document.getElementById("toast")!;

function showToast(text: string, ms = 2500) {
  toast.textContent = text;
  toast.style.display = "block";
  window.setTimeout(() => { toast.style.display = "none"; }, ms);
}

const engine = new Engine(canvas);
const { world, input, audio, renderer } = engine;
const actions = new InputActions(input);
const character = new CharacterController({ speed: 6, jumpSpeed: 8, acceleration: 40 });
const loader = new LoadingScreen();

function tex(id: string, img: TexImageSource) {
  const t = new Texture2D((renderer as unknown as { gl: WebGL2RenderingContext }).gl);
  t.fromImage(img);
  renderer.registerTexture(id, t);
}

// ---------- build the dusk-street vignette ----------
let player = 0 as Entity;
let rig: ActorRig;
let npcA: ActorRig;
let npcB: ActorRig;
let npcPhase = 0;
let timeMin = 17.5 * 60; // start at golden dusk
const menu = new MainMenu({
  onContinue: () => void enter(),
  onNew: () => void enter(),
  onSettings: () => showToast("Showcase settings: drag to orbit, WASD to walk."),
  onCredits: () => showToast("Glitch v1.2 — actors, proctex, sky, fog, citykit. All procedural, all original."),
  onQuit: () => window.close(),
});

async function build() {
  loader.show("GLITCH");
  loader.stage(0.1, "Painting textures…");
  await nextFrame();
  tex("grass", paintGrass());
  tex("asphalt", paintAsphalt());
  tex("brick", paintBrick([0.55, 0.3, 0.22]));
  tex("roof", paintRoof([0.3, 0.24, 0.2]));

  loader.stage(0.3, "Paving streets…");
  await nextFrame();
  // ground
  const g = world.create();
  world.add(g, "transform", makeTransform(0, -0.51, 0));
  world.add<MeshRef>(g, "mesh", { meshId: "ground", color: [0.5, 0.55, 0.45], textureId: "grass" });
  world.add(g, "collider", { halfExtents: new Vec3(70, 0.5, 70), isStatic: true });
  // road along x with dashes + sidewalks
  const road = world.create();
  const rt = makeTransform(0, 0.02, 0);
  rt.scale.set(120, 0.05, 7);
  world.add(road, "transform", rt);
  world.add<MeshRef>(road, "mesh", { meshId: "cube", color: [0.9, 0.9, 0.9], textureId: "asphalt", uvScale: 6 });
  dashes(world, 0, -54, 54, true);
  sidewalk(world, 0, -5.5, 120, 2.5);
  sidewalk(world, 0, 5.5, 120, 2.5);

  loader.stage(0.55, "Raising houses…");
  await nextFrame();
  house(world, -14, -14, 7, 7, 3.2, [0.62, 0.38, 0.28], [0.3, 0.24, 0.2]);
  house(world, 2, -15, 6, 6.5, 3, [0.55, 0.52, 0.46], [0.32, 0.2, 0.16]);
  shop(world, 18, -12, 9, 4.5, 7, [0.5, 0.46, 0.4], [0.2, 0.7, 0.9]);
  pine(world, -24, 10, 1.2);
  pine(world, -6, 12, 1.0);
  pine(world, 12, 11, 1.3);
  pine(world, 28, 10, 0.9);
  pole(world, -20, 4.5);
  wireRun(world, 20.5, -44, 20.5, 44);
  car(world, 8, -1.5, Math.PI / 2, [0.15, 0.35, 0.6]);

  loader.stage(0.75, "Waking actors…");
  await nextFrame();
  const addTex = (id: string, img: TexImageSource) => tex(id, img);
  // player: physics root (hidden) + cartoon rig
  player = world.create();
  {
    const t = makeTransform(0, 2, 8);
    t.scale.set(0.9, 2.0, 0.9);
    world.add(player, "transform", t);
    world.add<MeshRef>(player, "mesh", { meshId: "cube", color: [1, 1, 1] });
    const m = world.get<MeshRef>(player, "mesh")!;
    m.meshId = "player-hidden";
    world.add(player, "collider", { halfExtents: new Vec3(0.5, 0.5, 0.5), isStatic: false });
    world.add(player, "rigidbody", makeRigidbody(true, 1));
  }
  renderer.registerMesh("player-hidden", {
    positions: new Float32Array(0), normals: new Float32Array(0),
    uvs: new Float32Array(0), indices: new Uint16Array(0),
  });
  rig = buildActor(world, addTex, {
    skin: [0.95, 0.76, 0.6], shirt: [0.2, 0.5, 1.0], trim: [0.1, 0.2, 0.5],
    pants: [0.16, 0.18, 0.24], hair: [0.25, 0.16, 0.1], tag: "hero",
    face: { eye: "round", mouth: "smile", blush: true, beard: false },
  });
  npcA = buildActor(world, addTex, {
    skin: [0.72, 0.52, 0.38], shirt: [0.3, 0.7, 0.35], trim: [0.15, 0.35, 0.18],
    pants: [0.2, 0.2, 0.22], hair: [0.1, 0.1, 0.12], tag: "npcA",
    face: { eye: "happy", mouth: "smirk", blush: false, beard: false },
  });
  npcB = buildActor(world, addTex, {
    skin: [0.9, 0.7, 0.55], shirt: [0.15, 0.25, 0.7], trim: [0.1, 0.15, 0.4],
    pants: [0.12, 0.12, 0.16], hair: null, tag: "npcB",
    face: { eye: "stern", mouth: "flat", blush: false, beard: true },
  });

  loader.stage(0.9, "Lighting lamps…");
  await nextFrame();
  renderer.pointLights.push(
    { position: new Vec3(-8, 3.5, 4), color: [1.0, 0.85, 0.6], intensity: 0, range: 20 },
    { position: new Vec3(8, 3.5, 4), color: [1.0, 0.85, 0.6], intensity: 0, range: 20 },
  );
  await loader.hide();
  menu.show(true, "v1.2.0", "WASD walk · drag orbit · Space jump. Full day in 2 minutes.");
}

let entered = false;
let walkPhase = 0;
async function enter() {
  menu.hide();
  entered = true;
  showToast("Dusk Street — meet the neighbors. Time lapses overhead.");
}

engine.addSystem((dt) => {
  // sky clock: full day in 120s
  timeMin += dt * (24 * 60 / 120);
  if (timeMin >= 24 * 60) timeMin -= 24 * 60;
  const frame = skyAt(timeMin / 60);
  renderer.clearColor = [...frame.sky];
  renderer.fogColor = [...frame.fog];
  renderer.lightIntensity = frame.sunI;
  if (renderer.pointLights.length >= 2) {
    renderer.pointLights[0].intensity = frame.lamp * 1.1;
    renderer.pointLights[1].intensity = frame.lamp * 1.1;
  }

  const t = world.get<Transform>(player, "transform");
  const rb = world.get<Rigidbody>(player, "rigidbody");
  if (!t || !rb) return;

  if (entered) {
    const move = actions.move();
    const yaw = renderer.camera.yaw;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const wishX = move.x * cos - move.z * sin;
    const wishZ = -move.z * cos - move.x * sin;
    const wasAir = !rb.grounded;
    character.move(t, rb, wishX, wishZ, actions.jump(), dt, () => audio.jump());
    if (wasAir && rb.grounded) audio.land();
    if (actions.reset()) { t.position.set(0, 2, 8); rb.velocity.set(0, 0, 0); }
    const moving = Math.abs(wishX) + Math.abs(wishZ) > 0.1;
    if (moving) {
      t.rotationY = Math.atan2(wishX, wishZ);
      walkPhase += dt * 9;
    }
    poseActor(world, rig, t.position.x, Math.max(0, t.position.y - 1.0), t.position.z, t.rotationY, walkPhase, moving);
    const drag = input.consumeDrag();
    renderer.camera.updateOrbit(drag.dx, drag.dy);
    renderer.camera.follow(t.position);
  } else {
    // menu backdrop: slow orbit
    renderer.camera.yaw += dt * 0.06;
    renderer.camera.dist = 20;
    poseActor(world, rig, t.position.x, t.position.y - 1.0, t.position.z, t.rotationY, 0, false);
  }

  // neighbors: A paces, B stands stern
  npcPhase += dt * 1.2;
  const ax = -8 + Math.sin(npcPhase * 0.35) * 5;
  poseActor(world, npcA, ax, 0, 6, Math.cos(npcPhase * 0.35) > 0 ? Math.PI / 2 : -Math.PI / 2, npcPhase * 4, true);
  poseActor(world, npcB, 6, 0, -6, Math.PI, npcPhase, false);

  const hh = Math.floor(timeMin / 60), mm = Math.floor(timeMin % 60);
  stats.textContent = `${engine.loop.time.fps} fps · ${world.count()} entities · ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
});

const unlock = () => audio.resume();
window.addEventListener("pointerdown", unlock, { once: true });
window.addEventListener("keydown", unlock, { once: true });

engine.start();
void build();
