// Glitch third-person camera — orbit boom with wall collision, shoulder
// offset, smoothed follow and zoom. The collision probe is injected
// (`cast(origin, direction, maxDist) => distance | null`) so this file is
// pure math and testable under Node; the game supplies `raycastScene`.

import { Vec3 } from "../math/vec3.js";
import { Camera } from "./camera.js";

export type CameraRaycast = (origin: Vec3, direction: Vec3, maxDist: number) => number | null;

export interface ThirdPersonConfig {
  /** Resting boom length (units). */
  distance: number;
  minDistance: number;
  maxDistance: number;
  /** Vertical offset of the orbit pivot above the follow target. */
  height: number;
  /** Horizontal pivot offset, positive = over the right shoulder. */
  shoulder: number;
  /** Mouse radians per pixel. */
  sensitivity: number;
  minPitch: number;
  maxPitch: number;
  /** Pivot follow smoothing (1/s). 0 snaps. */
  followSmoothing: number;
  /** Boom extension smoothing (1/s) when moving away from a wall. */
  zoomOutSmoothing: number;
  /** Keep the near plane clear of the wall (units). */
  collisionMargin: number;
  /** Radians per second of automatic yaw drift (0 = off). */
  autoTurn: number;
}

const DEFAULTS: ThirdPersonConfig = {
  distance: 7,
  minDistance: 1.2,
  maxDistance: 14,
  height: 1.55,
  shoulder: 0.45,
  sensitivity: 0.005,
  minPitch: 0.08,
  maxPitch: 1.45,
  followSmoothing: 12,
  zoomOutSmoothing: 4,
  collisionMargin: 0.25,
  autoTurn: 0,
};

export interface ThirdPersonUpdate {
  /** Boom length actually used after the collision probe. */
  distance: number;
  /** Distance returned by the probe, or null when the boom was unobstructed. */
  obstruction: number | null;
  /** True when the collision probe shortened the boom. */
  pulledIn: boolean;
}

export class ThirdPersonCamera extends Camera {
  readonly tp: ThirdPersonConfig;
  /** Boom length requested by zoom (before collision). */
  desiredDistance: number;
  /** Boom length currently presented (after collision + smoothing). */
  appliedDistance: number;
  /** Last probe result; exposed for HUD/debug. */
  obstruction: number | null = null;
  /** Optional probe installed once by the game. */
  cast: CameraRaycast | null = null;
  private pivot = new Vec3();
  private started = false;
  private readonly dir = new Vec3();

  constructor(config: Partial<ThirdPersonConfig> = {}) {
    super();
    this.tp = { ...DEFAULTS, ...config };
    this.desiredDistance = this.tp.distance;
    this.appliedDistance = this.tp.distance;
    this.dist = this.tp.distance;
    this.pitch = Math.max(this.tp.minPitch, Math.min(this.tp.maxPitch, this.pitch));
  }

  /** Orbit from mouse/stick delta (pixels). */
  orbit(dx: number, dy: number): void {
    this.yaw -= dx * this.tp.sensitivity;
    this.pitch += dy * this.tp.sensitivity;
    this.pitch = Math.max(this.tp.minPitch, Math.min(this.tp.maxPitch, this.pitch));
  }

  /** Zoom from a wheel delta (positive scrolls out). */
  zoom(wheelDelta: number): void {
    this.desiredDistance = Math.max(
      this.tp.minDistance,
      Math.min(this.tp.maxDistance, this.desiredDistance * (1 + wheelDelta * 0.001))
    );
  }

  /** Snap to a target without smoothing (spawn/teleport). */
  snap(target: Vec3): void {
    this.started = false;
    this.update(target, 0, this.cast ?? undefined);
  }

  /**
   * Follow `target` (usually the player's feet). Call once per frame after
   * orbit/zoom input. `cast` may be passed per call or installed on `this.cast`.
   */
  update(target: Vec3, dt: number, cast?: CameraRaycast): ThirdPersonUpdate {
    const tp = this.tp;
    if (tp.autoTurn !== 0) this.yaw += tp.autoTurn * dt;
    const probe = cast ?? this.cast ?? null;
    const first = !this.started;

    // Desired pivot: above the target, shifted right in camera space.
    const rightX = Math.sin(this.yaw);
    const rightZ = -Math.cos(this.yaw);
    const wantX = target.x + rightX * tp.shoulder;
    const wantY = target.y + tp.height;
    const wantZ = target.z + rightZ * tp.shoulder;

    if (first || dt <= 0 || tp.followSmoothing <= 0) {
      this.pivot.set(wantX, wantY, wantZ);
    } else {
      const k = 1 - Math.exp(-tp.followSmoothing * dt);
      this.pivot.x += (wantX - this.pivot.x) * k;
      this.pivot.y += (wantY - this.pivot.y) * k;
      this.pivot.z += (wantZ - this.pivot.z) * k;
    }
    this.started = true;

    // Boom direction, matching Camera's orbit convention (position = pivot + dir * dist).
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.cos(this.yaw) * cp, Math.sin(this.pitch), Math.sin(this.yaw) * cp);

    let allowed = this.desiredDistance;
    this.obstruction = null;
    if (probe && this.desiredDistance > 1e-4) {
      const hit = probe(this.pivot.clone(), this.dir.clone(), this.desiredDistance);
      if (hit !== null && hit < allowed) {
        this.obstruction = hit;
        allowed = Math.max(tp.minDistance, hit - tp.collisionMargin);
      }
    }

    if (first || allowed < this.appliedDistance) {
      // Pull in immediately: never show through a wall.
      this.appliedDistance = allowed;
    } else if (dt > 0) {
      const k = tp.zoomOutSmoothing > 0 ? 1 - Math.exp(-tp.zoomOutSmoothing * dt) : 1;
      this.appliedDistance += (allowed - this.appliedDistance) * k;
    }
    // Re-clamp in case the wall moved toward the camera while easing out.
    this.appliedDistance = Math.min(this.appliedDistance, allowed);

    this.dist = this.appliedDistance;
    this.position.set(
      this.pivot.x + this.dir.x * this.appliedDistance,
      this.pivot.y + this.dir.y * this.appliedDistance,
      this.pivot.z + this.dir.z * this.appliedDistance
    );
    this.target.set(this.pivot.x, this.pivot.y, this.pivot.z);
    return {
      distance: this.appliedDistance,
      obstruction: this.obstruction,
      pulledIn: this.obstruction !== null && this.appliedDistance < this.desiredDistance - 1e-4,
    };
  }
}
