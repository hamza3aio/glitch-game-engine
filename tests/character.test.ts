import { describe, expect, it } from "vitest";
import {
  CharacterController, cameraRelativeWish, facingFromWish,
} from "../src/physics/character.js";
import { makeRigidbody, makeTransform, type Rigidbody, type Transform } from "../src/ecs/components.js";

function body(grounded = false): { t: Transform; rb: Rigidbody } {
  const t = makeTransform(0, 1, 0);
  const rb = makeRigidbody(true, 1);
  rb.grounded = grounded;
  return { t, rb };
}

const base = { speed: 6, jumpSpeed: 8, acceleration: 40 };

describe("CharacterController", () => {
  it("accelerates toward the wish velocity and jumps on a grounded press", () => {
    const { t, rb } = body(true);
    const ctl = new CharacterController(base);
    for (let i = 0; i < 60; i++) ctl.update(t, rb, { x: 1, z: 0 }, 1 / 60);
    expect(rb.velocity.x).toBeCloseTo(6, 1);
    ctl.update(t, rb, { x: 0, z: 0, jumpPressed: true, jumpHeld: true }, 1 / 60);
    expect(rb.velocity.y).toBe(8);
    expect(ctl.state.jumping).toBe(true);
  });

  it("jumps during the coyote window after walking off a ledge", () => {
    const { t, rb } = body(true);
    const ctl = new CharacterController(base);
    ctl.update(t, rb, { x: 0, z: 0 }, 1 / 60); // grounded frame
    rb.grounded = false;
    ctl.update(t, rb, { x: 0, z: 0 }, 0.05); // still inside 0.12s
    ctl.update(t, rb, { x: 0, z: 0, jumpPressed: true }, 1 / 60);
    expect(rb.velocity.y).toBe(8);
    expect(ctl.state.coyote).toBe(0);
  });

  it("does not jump after the coyote window expires", () => {
    const { t, rb } = body(true);
    const ctl = new CharacterController(base);
    ctl.update(t, rb, { x: 0, z: 0 }, 1 / 60);
    rb.grounded = false;
    ctl.update(t, rb, { x: 0, z: 0 }, 0.3);
    ctl.update(t, rb, { x: 0, z: 0, jumpPressed: true }, 1 / 60);
    expect(rb.velocity.y).toBe(0);
  });

  it("buffers a jump pressed just before landing", () => {
    const { t, rb } = body(false);
    const ctl = new CharacterController(base);
    ctl.update(t, rb, { x: 0, z: 0, jumpPressed: true }, 0.05); // airborne press
    expect(rb.velocity.y).toBe(0);
    rb.grounded = true;
    ctl.update(t, rb, { x: 0, z: 0 }, 0.05); // land inside the 0.15s buffer
    expect(rb.velocity.y).toBe(8);
  });

  it("cuts the jump arc when the button is released early", () => {
    const { t, rb } = body(true);
    const ctl = new CharacterController({ ...base, jumpCut: 0.4 });
    ctl.update(t, rb, { jumpPressed: true, jumpHeld: true, x: 0, z: 0 }, 1 / 60);
    expect(rb.velocity.y).toBe(8);
    ctl.update(t, rb, { jumpHeld: false, x: 0, z: 0 }, 1 / 60);
    expect(rb.velocity.y).toBeCloseTo(3.2, 5);
  });

  it("has less horizontal control in the air than on the ground", () => {
    const ground = body(true);
    const air = body(false);
    const ctlG = new CharacterController(base);
    const ctlA = new CharacterController(base);
    ctlG.update(ground.t, ground.rb, { x: 1, z: 0 }, 1 / 60);
    ctlA.update(air.t, air.rb, { x: 1, z: 0 }, 1 / 60);
    expect(air.rb.velocity.x).toBeGreaterThan(0);
    expect(air.rb.velocity.x).toBeLessThan(ground.rb.velocity.x);
  });

  it("uses the run speed and normalises diagonal input", () => {
    const { t, rb } = body(true);
    const ctl = new CharacterController({ ...base, runSpeed: 9 });
    ctl.update(t, rb, { x: 1, z: 0, run: true }, 1);
    expect(rb.velocity.x).toBeCloseTo(9, 5);
    const d = body(true);
    const ctl2 = new CharacterController(base);
    ctl2.update(d.t, d.rb, { x: 1, z: 1 }, 1);
    expect(Math.hypot(d.rb.velocity.x, d.rb.velocity.z)).toBeCloseTo(6, 5);
  });

  it("caps terminal fall speed and reports landing impacts", () => {
    const { t, rb } = body(false);
    const ctl = new CharacterController(base);
    rb.velocity.y = -100;
    ctl.update(t, rb, { x: 0, z: 0 }, 1 / 60);
    expect(rb.velocity.y).toBe(-40);
    rb.grounded = true;
    let impact = 0;
    ctl.update(t, rb, { x: 0, z: 0 }, 1 / 60, { onLand: (v) => { impact = v; } });
    expect(impact).toBe(40);
  });
});

describe("cameraRelativeWish", () => {
  it("maps forward to the camera's look direction and right to screen-right", () => {
    const f = cameraRelativeWish(0, 1, 0);
    expect(f.x).toBeCloseTo(-1, 6);
    expect(f.z).toBeCloseTo(0, 6);
    const r = cameraRelativeWish(1, 0, 0);
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.z).toBeCloseTo(-1, 6);
    const turned = cameraRelativeWish(0, 1, Math.PI / 2);
    expect(turned.x).toBeCloseTo(0, 6);
    expect(turned.z).toBeCloseTo(-1, 6);
  });

  it("derives actor facing from the wish direction", () => {
    expect(facingFromWish(-1, 0)).toBeCloseTo(-Math.PI / 2, 6);
    expect(facingFromWish(0, -1)).toBeCloseTo(Math.PI, 6);
  });
});
