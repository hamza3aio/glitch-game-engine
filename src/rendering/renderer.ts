import { Mat4 } from "../math/mat4.js";
import { Vec3 } from "../math/vec3.js";
import { FRAG_SRC, VERT_SRC, createProgram } from "./shader.js";
import { GpuMesh, cubeData, planeData } from "./mesh.js";
import type { Entity } from "../ecs/world.js";
import { World } from "../ecs/world.js";
import type { MeshRef, Transform } from "../ecs/components.js";
import { Camera } from "./camera.js";

export class Renderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private meshes = new Map<string, GpuMesh>();
  camera = new Camera();
  lightDir = new Vec3(-0.5, -1, -0.3);
  private loc: Record<string, WebGLUniformLocation | null> = {};

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("WebGL2 not supported in this browser.");
    this.gl = gl;
    this.program = createProgram(gl, VERT_SRC, FRAG_SRC);
    for (const name of ["uModel", "uView", "uProj", "uColor", "uLightDir", "uCamPos"]) {
      this.loc[name] = gl.getUniformLocation(this.program, name);
    }
    this.meshes.set("cube", new GpuMesh(gl, cubeData(1)));
    this.meshes.set("ground", new GpuMesh(gl, planeData(30)));
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr) || Math.floor(window.innerWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr) || Math.floor(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  frame(world: World) {
    const gl = this.gl;
    this.resize();
    gl.clearColor(0.07, 0.09, 0.14, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const view = this.camera.view();
    const proj = this.camera.projection(aspect);
    gl.uniformMatrix4fv(this.loc.uView, false, view.elements);
    gl.uniformMatrix4fv(this.loc.uProj, false, proj.elements);
    gl.uniform3fv(this.loc.uLightDir, this.lightDir.toArray() as unknown as Float32List);
    gl.uniform3fv(this.loc.uCamPos, this.camera.position.toArray() as unknown as Float32List);

    for (const e of world.query("transform", "mesh") as Entity[]) {
      const t = world.get<Transform>(e, "transform")!;
      const m = world.get<MeshRef>(e, "mesh")!;
      const gpu = this.meshes.get(m.meshId);
      if (!gpu) continue;
      const model = new Mat4().translate(t.position).rotateY(t.rotationY).scale(t.scale);
      gl.uniformMatrix4fv(this.loc.uModel, false, model.elements);
      gl.uniform3fv(this.loc.uColor, m.color as unknown as Float32List);
      gpu.draw();
    }
  }
}
