// Glitch character controller — arcade physics with the movement feel a
// platformer/obby needs: acceleration, air control, coyote time, jump
// buffering and variable jump height. Slopes are supported where the physics
// backend supports them (heightfield terrain); box colliders are axis-aligned
// today, so there is no slope-limit sliding on rotated geometry yet.

import type { Rigidbody, Transform } from "../ecs/components.js";

export interface CharacterConfig {
  /** Ground walk speed (units/s). */
  speed: number;
  /** Take-off speed (units/s). */
  jumpSpeed: number;
  /** Ground acceleration (units/s²). */
  acceleration: number;
  /** Optional sprint speed; defaults to `speed`. */
  runSpeed?: number;
  /** Air acceleration; defaults to 35% of `acceleration`. */
  airAcceleration?: number;
  /** Deceleration when no input is held; defaults to `acceleration`. */
  deceleration?: number;
  /** Grace period after walking off a ledge (seconds). Default 0.12. */
  coyoteTime?: number;
  /** Remembered jump press while airborne (seconds). Default 0.15. */
  jumpBuffer?: number;
  /** Fraction of upward speed kept when the jump key is released early. 0..1, default 0.5. */
  jumpCut?: number;
  /** Downward speed cap (units/s, positive). 0 = uncapped. Default 40. */
  terminalVelocity?: number;
}

export interface CharacterInput {
  /** Camera-relative wish direction, typically magnitude <= 1. */
  x: number;
  z: number;
  /** True only on the frame the jump button went down. */
  jumpPressed?: boolean;
  /** Held state, used for variable jump height. Defaults to `jumpPressed`. */
  jumpHeld?: boolean;
  /** Sprint modifier. */
  run?: boolean;
}

export interface CharacterHooks {
  onJump?: () => void;
  /** Called when a fall ends; `impactSpeed` is the downward speed before landing. */
  onLand?: (impactSpeed: number) => void;
}

export interface CharacterState {
  grounded: boolean;
  /** Remaining coyote time (seconds). */
  coyote: number;
  /** Remaining buffered-jump time (seconds). */
  buffer: number;
  /** Time since the last grounded frame (seconds). */
  airTime: number;
  /** Downward speed remembered while airborne, for landing impacts. */
  fallSpeed: number;
  jumping: boolean;
}

/**
 * Rotate a raw (x, z) input into world space using the camera yaw.
 * +x is screen-right, +z is screen-forward. Matches the third-person
 * camera's yaw convention: yaw 0 looks down -X.
 */
export function cameraRelativeWish(ix: number, iz: number, yaw: number): { x: number; z: number } {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return { x: s * ix - c * iz, z: -c * ix - s * iz };
}

export function facingFromWish(x: number, z: number): number {
  return Math.atan2(x, z);
}

const DEFAULTS = {
  coyoteTime: 0.12,
  jumpBuffer: 0.15,
  jumpCut: 0.5,
  terminalVelocity: 40,
};

export class CharacterController {
  readonly config: Required<CharacterConfig>;
  readonly state: CharacterState = {
    grounded: false,
    coyote: 0,
    buffer: 0,
    airTime: 0,
    fallSpeed: 0,
    jumping: false,
  };

  constructor(config: CharacterConfig = { speed: 6, jumpSpeed: 8, acceleration: 40 }) {
    const airAccel = config.airAcceleration ?? config.acceleration * 0.35;
    this.config = {
      speed: config.speed,
      jumpSpeed: config.jumpSpeed,
      acceleration: config.acceleration,
      runSpeed: config.runSpeed ?? config.speed,
      airAcceleration: airAccel,
      deceleration: config.deceleration ?? config.acceleration,
      coyoteTime: config.coyoteTime ?? DEFAULTS.coyoteTime,
      jumpBuffer: config.jumpBuffer ?? DEFAULTS.jumpBuffer,
      jumpCut: Math.max(0, Math.min(1, config.jumpCut ?? DEFAULTS.jumpCut)),
      terminalVelocity: config.terminalVelocity ?? DEFAULTS.terminalVelocity,
    };
  }

  reset(): void {
    this.state.grounded = false;
    this.state.coyote = 0;
    this.state.buffer = 0;
    this.state.airTime = 0;
    this.state.fallSpeed = 0;
    this.state.jumping = false;
  }

  /**
   * Advance the controller one frame. Call before the physics step: jumps
   * are written into `rb.velocity` and integrated by physics.
   */
  update(
    t: Transform,
    rb: Rigidbody,
    input: CharacterInput,
    dt: number,
    hooks: CharacterHooks = {}
  ): CharacterState {
    void t;
    const cfg = this.config;
    const s = this.state;
    const grounded = rb.grounded;
    const wasGrounded = s.grounded;

    if (grounded) {
      s.coyote = cfg.coyoteTime;
      s.airTime = 0;
    } else {
      s.coyote = Math.max(0, s.coyote - dt);
      s.airTime += dt;
    }

    if (grounded && !wasGrounded) {
      const impact = s.fallSpeed;
      s.fallSpeed = 0;
      s.jumping = false;
      if (impact > 0.5) hooks.onLand?.(impact);
    }
    s.grounded = grounded;

    // Jump input: buffer presses made slightly early, honour coyote time.
    if (input.jumpPressed) s.buffer = cfg.jumpBuffer;
    if (s.buffer > 0) s.buffer = Math.max(0, s.buffer - dt);
    const canJump = grounded || s.coyote > 0;
    let jumpedThisFrame = false;
    if (s.buffer > 0 && canJump) {
      rb.velocity.y = cfg.jumpSpeed;
      rb.grounded = false;
      s.grounded = false;
      s.coyote = 0;
      s.buffer = 0;
      s.jumping = true;
      jumpedThisFrame = true;
      hooks.onJump?.();
    }

    // Variable jump height: releasing early cuts the arc once. A jump that
    // fires from the buffer on landing is never cut on its first frame.
    const held = input.jumpHeld ?? input.jumpPressed ?? false;
    if (!jumpedThisFrame && s.jumping && !held && rb.velocity.y > 0) {
      rb.velocity.y = Math.min(rb.velocity.y, cfg.jumpSpeed * cfg.jumpCut);
      s.jumping = false;
    }
    if (rb.velocity.y <= 0) s.jumping = false;

    // Horizontal motion. Normalise diagonal input so it is not faster.
    let ix = input.x, iz = input.z;
    const mag = Math.hypot(ix, iz);
    if (mag > 1) { ix /= mag; iz /= mag; }
    const maxSpeed = input.run ? cfg.runSpeed : cfg.speed;
    const targetX = ix * maxSpeed;
    const targetZ = iz * maxSpeed;
    const wantsMove = mag > 0.001;
    const rate = !wantsMove
      ? cfg.deceleration
      : grounded
        ? cfg.acceleration
        : cfg.airAcceleration;
    const k = Math.min(1, Math.max(0, rate * dt));
    rb.velocity.x += (targetX - rb.velocity.x) * k;
    rb.velocity.z += (targetZ - rb.velocity.z) * k;

    if (cfg.terminalVelocity > 0 && rb.velocity.y < -cfg.terminalVelocity) {
      rb.velocity.y = -cfg.terminalVelocity;
    }
    // Remember the fall speed after clamping so landing impacts report the
    // speed the player actually hit the ground with.
    if (!grounded && rb.velocity.y < 0) s.fallSpeed = -rb.velocity.y;
    return s;
  }

  /**
   * Legacy API kept for existing games: held jump behaves as a repeated
   * press, matching the original controller's bunny-hop behaviour.
   */
  move(
    t: Transform,
    rb: Rigidbody,
    wishX: number,
    wishZ: number,
    jump: boolean,
    dt: number,
    onJump?: () => void
  ): void {
    this.update(t, rb, {
      x: wishX, z: wishZ,
      jumpPressed: jump,
      jumpHeld: jump,
    }, dt, onJump ? { onJump } : {});
  }
}
