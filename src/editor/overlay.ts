import { World, type Entity } from "../ecs/world.js";
import { Vec3 } from "../math/vec3.js";
import { makeTransform, type MeshRef, type Transform } from "../ecs/components.js";
import { saveScene, loadScene } from "../scene/scene.js";
import { buildActor, poseActor } from "../scene/actor.js";
import type { MaterialDB } from "../rendering/materials.js";

export interface EditorHooks {
  addTex: (id: string, img: TexImageSource) => void;
  projectPath?: () => string | null;
  mats?: MaterialDB;
}

// Full in-engine editor: hierarchy + transform/color inspector,
// add box / static / trigger / actor, delete, play-pause, scene save/load.
// Save goes to the open project folder when hosted in the Glitch app,
// otherwise downloads JSON (plain browsers).
export class EditorOverlay {
  private panel: HTMLElement;
  private listEl: HTMLElement;
  private infoEl: HTMLElement;
  private paused = false;
  private pauseBtn!: HTMLElement;
  selected = -1;
  private actorSeq = 0;

  constructor(private world: World, private root: HTMLElement, private hooks?: EditorHooks) {
    this.panel = document.createElement("div");
    this.panel.style.cssText = "position:absolute;top:60px;right:12px;width:270px;max-height:78vh;overflow:auto;background:rgba(10,14,22,0.9);border:1px solid #2dd4bf;border-radius:8px;padding:10px;font-size:12px;z-index:20;";
    this.panel.innerHTML = "<strong>Glitch Editor</strong> <span style='opacity:0.6'>(F9)</span>";
    const mkBtn = (label: string, fn: () => void) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "flex:1;padding:4px;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:4px;cursor:pointer;";
      b.onclick = fn;
      return b;
    };
    const row1 = document.createElement("div");
    row1.style.cssText = "display:flex;gap:6px;margin:8px 0;";
    this.pauseBtn = mkBtn("Pause", () => {
      this.paused = !this.paused;
      this.pauseBtn.textContent = this.paused ? "Play" : "Pause";
    });
    row1.appendChild(this.pauseBtn);
    const saveB = mkBtn("Save", () => void this.save());
    row1.appendChild(saveB);
    const loadB = mkBtn("Load", () => this.pickLoad());
    row1.appendChild(loadB);
    this.panel.appendChild(row1);

    const row2 = document.createElement("div");
    row2.style.cssText = "display:flex;gap:6px;margin:0 0 8px 0;";
    row2.appendChild(mkBtn("+ Box", () => this.addBox(false)));
    row2.appendChild(mkBtn("+ Static", () => this.addBox(true)));
    row2.appendChild(mkBtn("+ Actor", () => this.addActor()));
    row2.appendChild(mkBtn("+ Trigger", () => this.addTrigger()));
    this.panel.appendChild(row2);

    this.listEl = document.createElement("div");
    this.infoEl = document.createElement("div");
    this.panel.appendChild(this.listEl);
    this.panel.appendChild(this.infoEl);
    this.panel.style.display = "none";
    root.appendChild(this.panel);
    window.addEventListener("keydown", (e) => {
      if (e.code === "F9" && (e.target as HTMLElement).tagName !== "INPUT") this.toggle();
      if ((e.code === "Delete" || e.code === "Backspace") && this.panel.style.display !== "none" && (e.target as HTMLElement).tagName !== "INPUT") {
        if (this.selected >= 0) { this.world.destroy(this.selected); this.selected = -1; }
      }
    });
  }

  toggle() {
    this.panel.style.display = this.panel.style.display === "none" ? "block" : "none";
  }

  get visible() { return this.panel.style.display !== "none"; }

  isPaused() { return this.paused; }

  private async save() {
    const json = saveScene(this.world);
    const pp = this.hooks?.projectPath?.();
    if (pp && window.glitch) {
      try {
        await window.glitch.writeScene(pp, json);
        return;
      } catch { /* fall through to download */ }
    }
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "glitch-scene.json";
    a.click();
  }

  private pickLoad() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      void f.text().then((t) => loadScene(this.world, t, this.hooks?.addTex));
    };
    input.click();
  }

  private addBox(solid: boolean) {
    const e = this.world.create();
    this.world.add(e, "transform", makeTransform(0, 2, 0));
    this.world.add<MeshRef>(e, "mesh", { meshId: "cube", color: [0.6, 0.6, 0.65] });
    if (solid) {
      this.world.add(e, "collider", { halfExtents: new Vec3(0.5, 0.5, 0.5), isStatic: true });
      this.world.add(e, "rigidbody", { velocity: new Vec3(), useGravity: false, mass: 0, grounded: true });
    }
    this.selected = e;
  }

  private addTrigger() {
    const e = this.world.create();
    this.world.add(e, "transform", makeTransform(0, 1, 0));
    this.world.add(e, "trigger", { halfExtents: new Vec3(1.5, 1.5, 1.5), entered: false });
    this.selected = e;
  }

  private addActor() {
    if (!this.hooks) return;
    const tag = `actor-${Date.now() % 100000}-${this.actorSeq++}`;
    const opts = {
      skin: [0.92, 0.74, 0.58] as [number, number, number],
      shirt: [0.3, 0.6, 0.5] as [number, number, number],
      trim: [0.18, 0.35, 0.3] as [number, number, number],
      pants: [0.2, 0.2, 0.24] as [number, number, number],
      hair: [0.2, 0.14, 0.1] as [number, number, number],
      face: { eye: "round" as const, mouth: "smile" as const, blush: false, beard: false },
      tag,
    };
    const rig = buildActor(this.world, this.hooks.addTex, opts);
    poseActor(this.world, rig, 0, 0, 2, 0, 0, false);
    this.selected = rig.head;
  }

  update() {
    if (!this.visible) return;
    const entities = this.world.query("transform");
    this.listEl.innerHTML = `<div style="opacity:0.7;margin:4px 0;">${entities.length} entities (Del removes)</div>`;
    for (const e of entities.slice(0, 80)) {
      const b = document.createElement("button");
      const isActor = this.world.has(e, "actor");
      b.textContent = isActor ? `#${e} actor` : `#${e}`;
      b.style.cssText = `margin:2px;padding:2px 6px;background:${e === this.selected ? "#0f766e" : "#0f172a"};color:#fff;border:1px solid #334155;border-radius:4px;cursor:pointer;`;
      b.onclick = () => { this.selected = e; this.renderInspector(); };
      this.listEl.appendChild(b);
    }
    this.renderInspector();
  }

  private num(label: string, get: () => number, set: (v: number) => void): HTMLElement {
    const wrap = document.createElement("span");
    wrap.innerHTML = `<span style="opacity:0.6">${label}</span> `;
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = "0.5";
    inp.value = get().toFixed(2);
    inp.style.cssText = "width:64px;background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;";
    inp.onchange = () => { const v = Number(inp.value); if (isFinite(v)) set(v); };
    wrap.appendChild(inp);
    return wrap;
  }

  private renderInspector() {
    if (this.selected < 0) { this.infoEl.innerHTML = "<div style='opacity:0.6'>No selection</div>"; return; }
    const t = this.world.get<Transform>(this.selected, "transform");
    if (!t) { this.infoEl.innerHTML = "<div>Entity removed</div>"; this.selected = -1; return; }
    this.infoEl.innerHTML = `<div style="margin-top:8px;border-top:1px solid #334155;padding-top:6px;"><div>Entity #${this.selected}</div></div>`;
    const box = document.createElement("div");
    box.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;";
    box.appendChild(this.num("x", () => t.position.x, (v) => { t.position.x = v; }));
    box.appendChild(this.num("y", () => t.position.y, (v) => { t.position.y = v; }));
    box.appendChild(this.num("z", () => t.position.z, (v) => { t.position.z = v; }));
    box.appendChild(this.num("ry", () => t.rotationY, (v) => { t.rotationY = v; }));
    box.appendChild(this.num("sx", () => t.scale.x, (v) => { t.scale.x = v; }));
    box.appendChild(this.num("sy", () => t.scale.y, (v) => { t.scale.y = v; }));
    box.appendChild(this.num("sz", () => t.scale.z, (v) => { t.scale.z = v; }));
    this.infoEl.appendChild(box);
    const m = this.world.get<MeshRef>(this.selected, "mesh");
    if (m) {
      const crow = document.createElement("div");
      crow.style.cssText = "margin-top:6px;";
      crow.innerHTML = `<span style="opacity:0.6">color</span> `;
      const ci = document.createElement("input");
      ci.type = "color";
      const toHex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
      ci.value = `#${toHex(m.color[0])}${toHex(m.color[1])}${toHex(m.color[2])}`;
      ci.onchange = () => {
        const h = ci.value;
        m.color = [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
      };
      crow.appendChild(ci);
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.style.cssText = "margin-left:8px;padding:2px 8px;background:#7f1d1d;color:#fff;border:1px solid #991b1b;border-radius:4px;cursor:pointer;";
      del.onclick = () => { this.world.destroy(this.selected); this.selected = -1; this.update(); };
      crow.appendChild(del);
      this.infoEl.appendChild(crow);
      this.renderMaterialSection(m);
    }
  }

  private slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void): HTMLElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin-top:4px;";
    wrap.innerHTML = `<span style="opacity:0.6">${label} </span>`;
    const val = document.createElement("span");
    val.textContent = get().toFixed(2);
    const inp = document.createElement("input");
    inp.type = "range";
    inp.min = String(min); inp.max = String(max); inp.step = String(step);
    inp.value = String(get());
    inp.style.cssText = "width:130px;vertical-align:middle;";
    inp.oninput = () => { const v = Number(inp.value); if (isFinite(v)) { set(v); val.textContent = v.toFixed(2); } };
    wrap.appendChild(inp);
    wrap.appendChild(val);
    return wrap;
  }

  // Material workflow: pick a registered material (or Duplicate-then-edit so
  // shared presets stay pristine), tune the key PBR knobs live.
  private renderMaterialSection(m: MeshRef) {
    const db = this.hooks?.mats;
    const sec = document.createElement("div");
    sec.style.cssText = "margin-top:8px;border-top:1px solid #334155;padding-top:6px;";
    if (!db) {
      sec.innerHTML = `<div style="opacity:0.6">materials: no library bound</div>`;
      this.infoEl.appendChild(sec);
      return;
    }
    sec.innerHTML = `<div><span style="opacity:0.6">material</span></div>`;
    const sel = document.createElement("select");
    sel.style.cssText = "background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;margin-top:4px;";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "(legacy shading)";
    sel.appendChild(none);
    for (const id of db.ids()) {
      const op = document.createElement("option");
      op.value = id;
      op.textContent = id;
      if (m.materialId === id) op.selected = true;
      sel.appendChild(op);
    }
    sel.onchange = () => {
      m.materialId = sel.value === "" ? undefined : sel.value;
      this.renderInspector();
    };
    sec.appendChild(sel);
    const mat = m.materialId ? db.get(m.materialId) : undefined;
    if (mat) {
      sec.appendChild(this.slider("metallic", 0, 1, 0.05, () => mat.metallic, (v) => { mat.metallic = v; }));
      sec.appendChild(this.slider("roughness", 0, 1, 0.05, () => mat.roughness, (v) => { mat.roughness = v; }));
      sec.appendChild(this.slider("emission", 0, 4, 0.1, () => mat.emissiveIntensity, (v) => { mat.emissiveIntensity = v; }));
      const row = document.createElement("div");
      row.style.cssText = "margin-top:4px;display:flex;gap:6px;align-items:center;";
      const modes: ["opaque", "mask", "blend"] = ["opaque", "mask", "blend"];
      const ms = document.createElement("select");
      ms.style.cssText = "background:#0f172a;color:#fff;border:1px solid #475569;border-radius:4px;";
      for (const mode of modes) {
        const op = document.createElement("option");
        op.value = mode;
        op.textContent = mode;
        if (mat.alphaMode === mode) op.selected = true;
        ms.appendChild(op);
      }
      ms.onchange = () => { mat.alphaMode = ms.value as "opaque" | "mask" | "blend"; };
      row.appendChild(ms);
      const ds = document.createElement("label");
      ds.style.cssText = "font-size:11px;opacity:0.8;";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = mat.doubleSided;
      cb.onchange = () => { mat.doubleSided = cb.checked; };
      ds.appendChild(cb);
      ds.appendChild(document.createTextNode(" double-sided"));
      row.appendChild(ds);
      const dup = document.createElement("button");
      dup.textContent = "Duplicate";
      dup.style.cssText = "padding:2px 8px;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:4px;cursor:pointer;";
      dup.onclick = () => {
        const id = `${m.materialId}-copy`;
        try {
          db.duplicate(m.materialId!, id);
          m.materialId = id;
          this.renderInspector();
        } catch {
          m.materialId = id + "-" + Date.now().toString(36);
          db.duplicate(sel.value, m.materialId);
          this.renderInspector();
        }
      };
      row.appendChild(dup);
      sec.appendChild(row);
    }
    this.infoEl.appendChild(sec);
  }
}
