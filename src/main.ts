import { Engine } from "./core/engine.js";
import { LoadingScreen, nextFrame } from "./core/loading.js";
import { Vec3 } from "./math/vec3.js";
import { CharacterController } from "./physics/character.js";
import { InputActions } from "./input/actions.js";
import { skyAt } from "./rendering/sky.js";
import { hideBlob, makeBlob, stickBlob } from "./rendering/shadows.js";
import { paintAsphalt, paintBrick, paintGrass, paintNoiseNormal, paintRoof, paintSign } from "./rendering/proctex.js";
import { makePBR } from "./rendering/materials.js";
import { buildActor, poseActor, type ActorRig } from "./scene/actor.js";
import { ParticleSystem, type EmitterDef } from "./fx/particles.js";
import { loadScene } from "./scene/scene.js";
import { EditorOverlay } from "./editor/overlay.js";
import { car, crosswalk, dashes, house, pine, pole, shop, sidewalk, wireRun } from "./scene/citykit.js";
import {
  addNoise, createHeightmap, createSplat, extent, mulberry32, paintWhere,
  raise, sampleHeight, scatterSpots, slopeAt, smooth, splatToCanvas, terrainMesh,
} from "./world/terrain.js";
import { MainMenu } from "./ui/menu.js";
import { makeRigidbody, makeTransform, type MeshRef, type Rigidbody, type Transform } from "./ecs/components.js";
import type { Entity } from "./ecs/world.js";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const stats = document.getElementById("stats")!;
const toastEl = document.getElementById("toast")!;
const modalEl = document.getElementById("modal")!;

function showToast(text: string, ms = 2500) {
  toastEl.textContent = text;
  toastEl.style.display = "block";
  window.setTimeout(() => { toastEl.style.display = "none"; }, ms);
}

function showModal(title: string, body: string, buttons: { label: string; fn: () => void }[]) {
  modalEl.style.display = "flex";
  modalEl.innerHTML = "";
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `<h2>${title}</h2><div>${body}</div>`;
  for (const b of buttons) {
    const btn = document.createElement("button");
    btn.textContent = b.label;
    btn.onclick = () => { modalEl.style.display = "none"; modalEl.innerHTML = ""; b.fn(); };
    card.appendChild(btn);
  }
  modalEl.appendChild(card);
}

const engine = new Engine(canvas);
const { world, input, audio, renderer } = engine;
const actions = new InputActions(input);
const character = new CharacterController({ speed: 6, jumpSpeed: 8, acceleration: 40 });
const fx = new ParticleSystem(world, 256);

function spark(x: number, y: number, z: number, r: number, g: number, b: number, n = 14) {
  const def: EmitterDef = {
    rate: 0, burst: 0, duration: 0, looping: false,
    life: [0.4, 0.8], speed: [2, 4.5], direction: new Vec3(0, 1, 0), spread: 0.7,
    size: [0.1, 0.2], growth: -0.05,
    colorStart: [r, g, b], colorEnd: [r * 0.35, g * 0.35, b * 0.35],
    gravity: -6, drag: 1, bounce: 0.4, meshId: "cube",
  };
  fx.burst(def, x, y, z, n);
}
const loader = new LoadingScreen();
const params = new URLSearchParams(location.search);
const projectPath = params.get("project");

function tex(id: string, img: TexImageSource) {
  renderer.registerCanvas(id, img);
}

// ================= PROJECT MODE (opened from the launcher) =================
async function bootProject(path: string) {
  tex("grass", paintGrass());
  const g = world.create();
  world.add(g, "transform", makeTransform(0, -0.51, 0));
  world.add<MeshRef>(g, "mesh", { meshId: "ground", color: [0.5, 0.55, 0.45], textureId: "grass" });
  world.add(g, "collider", { halfExtents: new Vec3(70, 0.5, 70), isStatic: true });
  const frame = skyAt(17.5);
  renderer.clearColor = [...frame.sky];
  renderer.fogColor = [...frame.fog];
  renderer.lightIntensity = frame.sunI;
  const editor = new EditorOverlay(world, document.getElementById("ui")!, {
    addTex: (id, img) => tex(id, img),
    projectPath: () => path,
    mats: renderer.materials,
    fx: () => fx,
    viewport: () => ({
      view: renderer.camera.view(),
      proj: renderer.camera.projection(canvas.width / Math.max(1, canvas.height)),
      width: canvas.width,
      height: canvas.height,
    }),
  });
  if (!editor.visible) editor.toggle();
  try {
    const data = await window.glitch!.readScene(path);
    if (data.scene) {
      loadScene(world, data.scene, (id, img) => tex(id, img));
      showToast(`Project loaded: ${data.scene.length} bytes of scene.`);
    } else {
      showToast("Empty project — press F9 and build.");
    }
  } catch {
    showToast("Could not read scene.json — starting empty.");
  }
  engine.addSystem(() => {
    renderer.camera.yaw += 0; // static; user orbits with mouse
    const drag = input.consumeDrag();
    renderer.camera.updateOrbit(drag.dx, drag.dy);
    renderer.camera.follow(new Vec3(0, 2, 0));
    editor.update();
    if (!editor.isPaused()) fx.update(1 / 60);
  });
  engine.start();
}

// ================= SAMPLE GAME: Dusk Street Night Shift =================
let player = 0 as Entity;
let rig: ActorRig;
let npcA: ActorRig;
let npcB: ActorRig;
let npcPhase = 0;
let walkPhase = 0;
let entered = false;
let editor: EditorOverlay | null = null;
let blobHero = 0 as Entity;
let blobA = 0 as Entity;
let blobB = 0 as Entity;
const blobCrates: Entity[] = [];

// shift state: 22:00 -> 06:00 (8 game-hours), full day = 480s
const SHIFT_START = 22 * 60;
const SHIFT_LEN = 8 * 60;
let shiftT = 0; // elapsed game-minutes
let carried = 0;
let delivered = 0;
let over = false;
const crates: Entity[] = [];
let pad: Entity;
let holo: Entity;

const menu = new MainMenu({
  onContinue: () => void enter(),
  onNew: () => void enter(),
  onSettings: () => showToast("Drag to orbit, WASD to walk. F9 opens the world editor."),
  onCredits: () => showToast("Glitch v2.0 — Night Shift sample. All procedural, all original."),
  onQuit: () => window.close(),
});

function clockText(): string {
  const t = (SHIFT_START + shiftT) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

function resetShift() {
  shiftT = 0; carried = 0; delivered = 0; over = false;
  const spots: [number, number][] = [[-18, 6], [-4, -8], [10, 7], [24, -6], [14, 12]];
  crates.forEach((c, i) => {
    const t = world.get<Transform>(c, "transform")!;
    t.position.set(spots[i][0], 0.5, spots[i][1]);
  });
  const t = world.get<Transform>(player, "transform")!;
  const rb = world.get<Rigidbody>(player, "rigidbody")!;
  t.position.set(0, 2, 8);
  rb.velocity.set(0, 0, 0);
}

async function build() {
  loader.show("GLITCH");
  loader.stage(0.1, "Painting textures…");
  await nextFrame();
  tex("grass", paintGrass());
  tex("asphalt", paintAsphalt());
  tex("brick", paintBrick([0.55, 0.3, 0.22]));
  tex("roof", paintRoof([0.3, 0.24, 0.2]));
  tex("sign-mart", paintSign("MART", [0.5, 0.1, 0.1], [1.0, 0.8, 0.2]));
  tex("sign-fuels", paintSign("FUELS", [0.9, 0.45, 0.1], [0.1, 0.1, 0.12]));
  tex("pave-normal", paintNoiseNormal(128, 11, 2));
  renderer.materials.register("pad-glow", makePBR("Pad", {
    emissive: [0.2, 0.9, 0.3], emissiveIntensity: 1.5, roughness: 0.6,
  }));
  renderer.materials.register("plinth", makePBR("Plinth", {
    albedoMap: "brick", normalMap: "pave-normal", aoMap: "brick", aoStrength: 0.8, roughness: 0.85,
  }));
  renderer.materials.register("holo", makePBR("Hologram", {
    emissive: [0.3, 0.9, 1.0], emissiveIntensity: 1.2, opacity: 0.35,
    alphaMode: "blend", doubleSided: true, metallic: 0, roughness: 0.2,
  }));

  loader.stage(0.3, "Paving streets…");
  await nextFrame();
  const g = world.create();
  world.add(g, "transform", makeTransform(0, -0.51, 0));
  world.add<MeshRef>(g, "mesh", { meshId: "ground", color: [0.5, 0.55, 0.45], textureId: "grass" });
  world.add(g, "collider", { halfExtents: new Vec3(70, 0.5, 70), isStatic: true });
  const road = world.create();
  const rt = makeTransform(0, 0.02, 0);
  rt.scale.set(120, 0.05, 7);
  world.add(road, "transform", rt);
  world.add<MeshRef>(road, "mesh", { meshId: "cube", color: [0.9, 0.9, 0.9], textureId: "asphalt", uvScale: 6 });
  dashes(world, 0, -54, 54, true);
  crosswalk(world, -10, 0, false);
  crosswalk(world, 20, 0, false);
  sidewalk(world, 0, -5.5, 120, 2.5);
  sidewalk(world, 0, 5.5, 120, 2.5);

  loader.stage(0.55, "Raising houses…");
  await nextFrame();
  house(world, -14, -14, 7, 7, 3.2, [0.62, 0.38, 0.28], [0.3, 0.24, 0.2], 0, "brick", "roof");
  house(world, 2, -15, 6, 6.5, 3, [0.55, 0.52, 0.46], [0.32, 0.2, 0.16], 0, "brick", "roof");
  shop(world, 18, -12, 9, 4.5, 7, [0.5, 0.46, 0.4], [0.5, 0.1, 0.1], 0, "brick", "sign-mart");
  // fuel totem with painted sign
  {
    const e = world.create();
    const t = makeTransform(28, 3, -8);
    t.scale.set(0.5, 6, 0.5);
    world.add(e, "transform", t);
    world.add<MeshRef>(e, "mesh", { meshId: "cube", color: [0.2, 0.2, 0.22] });
    const s = world.create();
    const st = makeTransform(28, 5.4, -8);
    st.scale.set(2.6, 1.4, 0.4);
    world.add(s, "transform", st);
    world.add<MeshRef>(s, "mesh", { meshId: "cube", color: [1, 1, 1], textureId: "sign-fuels" });
  }
  pine(world, -24, 10, 1.2);
  pine(world, -6, 12, 1.0);
  pine(world, 12, 11, 1.3);
  // terrain hill showcase: sculpted, slope-painted, walkable, pine-dotted
  {
    const hill = createHeightmap(13, 2);
    raise(hill, 0, 0, 11, 4);
    addNoise(hill, 5, 1.1, 9);
    smooth(hill);
    const HX = -34, HZ = 24;
    const splat = createSplat(64);
    paintWhere(splat, extent(hill), 1, (x, z) => slopeAt(hill, x, z) > 0.5);
    tex("hill-splat", splatToCanvas(splat));
    renderer.registerMesh("hill", terrainMesh(hill, 1, 1));
    const he = world.create();
    world.add(he, "transform", makeTransform(HX, 0, HZ));
    world.add<MeshRef>(he, "mesh", {
      meshId: "hill", color: [1, 1, 1],
      terrain: { splat: "hill-splat", detailA: "grass", detailB: "brick", detailC: "asphalt", detailScale: 5 },
    });
    world.add(he, "terrain", { size: hill.size, cell: hill.cell, heights: [...hill.heights] });
    for (const s of scatterSpots(hill, mulberry32(21), 0, 0, 9, 7, 0.45)) {
      pine(world, HX + s.x, HZ + s.z, 0.9, sampleHeight(hill, s.x, s.z) - 0.2);
    }
  }
  car(world, 8, -1.5, Math.PI / 2, [0.15, 0.35, 0.6]);
  stickBlob(world, makeBlob(world, 3.2), 8, 0, -1.5);
  pole(world, -20, 4.5);
  wireRun(world, 20.5, -44, 20.5, 44);

  // deliver pad (emissive PBR) at the shop door + hologram marker (blend)
  pad = world.create();
  {
    const t = makeTransform(18, 0.06, -7.5);
    t.scale.set(3, 0.08, 2);
    world.add(pad, "transform", t);
    world.add<MeshRef>(pad, "mesh", { meshId: "cube", color: [1, 1, 1], materialId: "pad-glow" });
  }
  holo = world.create();
  {
    const t = makeTransform(18, 1.6, -7.5);
    t.scale.set(1.4, 2.4, 1.4);
    world.add(holo, "transform", t);
    world.add<MeshRef>(holo, "mesh", { meshId: "cube", color: [1, 1, 1], materialId: "holo" });
  }
  // mapped plinth: albedo + normal + AO textures on one PBR material
  {
    const p = world.create();
    const t = makeTransform(4, 1, 10);
    t.scale.set(1.6, 2, 1.6);
    world.add(p, "transform", t);
    world.add<MeshRef>(p, "mesh", { meshId: "cube", color: [1, 1, 1], materialId: "plinth", uvScale: 2 });
    world.add(p, "collider", { halfExtents: new Vec3(0.5, 0.5, 0.5), isStatic: true });
  }
  // supply crates (gold metal PBR)
  for (let i = 0; i < 5; i++) {
    const c = world.create();
    world.add(c, "transform", makeTransform(0, -10, 0));
    const ct = world.get<Transform>(c, "transform")!;
    ct.scale.set(0.55, 0.55, 0.55);
    world.add<MeshRef>(c, "mesh", { meshId: "cube", color: [1, 1, 1], materialId: "gold" });
    crates.push(c);
    blobCrates.push(makeBlob(world, 0.8));
  }

  loader.stage(0.75, "Waking actors…");
  await nextFrame();
  const addTex = (id: string, img: TexImageSource) => tex(id, img);
  player = world.create();
  {
    const t = makeTransform(0, 2, 8);
    t.scale.set(0.9, 2.0, 0.9);
    world.add(player, "transform", t);
    world.add<MeshRef>(player, "mesh", { meshId: "cube", color: [1, 1, 1] });
    world.get<MeshRef>(player, "mesh")!.meshId = "player-hidden";
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
  blobHero = makeBlob(world, 1.3);
  blobA = makeBlob(world, 1.3);
  blobB = makeBlob(world, 1.3);

  loader.stage(0.9, "Lighting lamps…");
  await nextFrame();
  renderer.pointLights.push(
    { position: new Vec3(-8, 3.5, 4), color: [1.0, 0.85, 0.6], intensity: 1.0, range: 20 },
    { position: new Vec3(8, 3.5, 4), color: [1.0, 0.85, 0.6], intensity: 1.0, range: 20 },
  );
  resetShift();
  if (params.has("editor")) {
    editor = new EditorOverlay(world, document.getElementById("ui")!, {
      addTex, projectPath: () => params.get("project"), mats: renderer.materials,
      fx: () => fx,
      viewport: () => ({
        view: renderer.camera.view(),
        proj: renderer.camera.projection(canvas.width / Math.max(1, canvas.height)),
        width: canvas.width,
        height: canvas.height,
      }),
    });
    if (!editor.visible) editor.toggle();
  }
  await loader.hide();
  menu.show(true, "v2.0.0", "Night Shift: deliver 5 crates before 06:00. WASD + drag mouse.");
}

async function enter() {
  menu.hide();
  entered = true;
  showToast("Night Shift: grab gold crates, deliver at the green pad by 06:00.");
}

function endShift(won: boolean) {
  over = true;
  audio.pickup();
  if (won) {
    const t = world.get<Transform>(player, "transform");
    const px = t ? t.position.x : 0;
    const pz = t ? t.position.z : 0;
    spark(px, 2, pz, 1.0, 0.85, 0.3, 40);
    spark(px + 1, 2.5, pz - 1, 0.4, 0.8, 1.0, 30);
    spark(px - 1, 2.5, pz + 1, 1.0, 0.4, 0.8, 30);
  }
  showModal(
    won ? "SHIFT COMPLETE" : "SHIFT FAILED",
    won
      ? `All 5 crates delivered with ${clockText()} on the clock. The street eats because of you.`
      : `Dawn broke with crates still out there. The street forgets fast.`,
    [{ label: won ? "Work another shift (R)" : "Try again (R)", fn: () => { resetShift(); } }]
  );
}

engine.addSystem((dt) => {
  editor?.update();
  if (editor?.isPaused()) return;
  fx.update(dt);

  // shift clock: full day = 480s
  if (entered && !over) {
    shiftT += dt * (24 * 60 / 480);
    if (shiftT >= SHIFT_LEN) endShift(delivered >= 5);
  }
  const frame = skyAt((SHIFT_START + shiftT) / 60);
  renderer.clearColor = [...frame.sky];
  renderer.fogColor = [...frame.fog];
  renderer.lightIntensity = frame.sunI;

  const t = world.get<Transform>(player, "transform");
  const rb = world.get<Rigidbody>(player, "rigidbody");
  if (!t || !rb) return;

  if (entered && !over) {
    const move = actions.move();
    const yaw = renderer.camera.yaw;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const wishX = move.x * cos - move.z * sin;
    const wishZ = -move.z * cos - move.x * sin;
    const wasAir = !rb.grounded;
    character.move(t, rb, wishX, wishZ, actions.jump(), dt, () => audio.jump());
    if (wasAir && rb.grounded) audio.land();
    if (actions.reset()) resetShift();
    const moving = Math.abs(wishX) + Math.abs(wishZ) > 0.1;
    if (moving) {
      t.rotationY = Math.atan2(wishX, wishZ);
      walkPhase += dt * 9;
    }
    poseActor(world, rig, t.position.x, Math.max(0, t.position.y - 1.0), t.position.z, t.rotationY, walkPhase, moving);
    stickBlob(world, blobHero, t.position.x, 0, t.position.z);

    // crates: touch to collect, green pad to deliver
    crates.forEach((c, i) => {
      const ct = world.get<Transform>(c, "transform")!;
      if (ct.position.y < -5) return;
      ct.rotationY += dt * 2;
      stickBlob(world, blobCrates[i], ct.position.x, 0, ct.position.z);
      if (Math.hypot(t.position.x - ct.position.x, t.position.z - ct.position.z) < 1.3) {
        ct.position.set(0, -10, 0);
        hideBlob(world, blobCrates[i]);
        carried++;
        audio.blip(700, 0.1, "sine", 0.07);
        spark(ct.position.x, 1, ct.position.z, 1.0, 0.75, 0.2);
        showToast(`Crate ${carried}/5 — deliver at the green pad.`);
      }
    });
    const pt = world.get<Transform>(pad, "transform")!;
    if (carried > 0 && Math.hypot(t.position.x - pt.position.x, t.position.z - pt.position.z) < 2.2) {
      delivered += carried;
      carried = 0;
      audio.trigger();
      spark(pt.position.x, 1, pt.position.z, 0.3, 1.0, 0.4, 20);
      if (delivered >= 5) endShift(true);
      else showToast(`Delivered ${delivered}/5.`);
    }

    const drag = input.consumeDrag();
    renderer.camera.updateOrbit(drag.dx, drag.dy);
    renderer.camera.follow(t.position);
  } else if (!entered) {
    renderer.camera.yaw += dt * 0.06;
    renderer.camera.dist = 20;
    poseActor(world, rig, t.position.x, t.position.y - 1.0, t.position.z, t.rotationY, 0, false);
  }

  // neighbors
  npcPhase += dt * 1.2;
  const ax = -8 + Math.sin(npcPhase * 0.35) * 5;
  poseActor(world, npcA, ax, 0, 6, Math.cos(npcPhase * 0.35) > 0 ? Math.PI / 2 : -Math.PI / 2, npcPhase * 4, true);
  poseActor(world, npcB, 6, 0, -6, Math.PI, npcPhase, false);
  const ht = world.get<Transform>(holo, "transform");
  if (ht) ht.rotationY += dt * 1.5;
  stickBlob(world, blobA, ax, 0, 6);
  stickBlob(world, blobB, 6, 0, -6);

  stats.textContent = `${engine.loop.time.fps} fps · crates ${carried + delivered}/5 · delivered ${delivered}/5 · draw ${renderer.stats.drawn}/${renderer.stats.total} culled ${renderer.stats.culled} inst ${renderer.stats.instancedDraws} fx ${fx.aliveCount} · ${clockText()}`;
});

const unlock = () => audio.resume();
window.addEventListener("pointerdown", unlock, { once: true });
window.addEventListener("keydown", unlock, { once: true });
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR" && entered && (e.target as HTMLElement).tagName !== "INPUT") resetShift();
});

engine.start();
if (projectPath && window.glitch) void bootProject(projectPath);
else void build();
