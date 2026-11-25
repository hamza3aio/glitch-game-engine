import { describe, expect, it } from "vitest";
import { ThirdPersonCamera, type ThirdPersonConfig } from "../src/rendering/thirdperson.js";
import { Vec3 } from "../src/math/vec3.js";

function cam(overrides: Partial<ThirdPersonConfig> = {}) {
  return new ThirdPersonCamera({
    distance: 6,
    height: 1,
    shoulder: 0,
    followSmoothing: 0,
    zoomOutSmoothing: 0,
    ...overrides,
  });
}

const at = (x = 0, y = 0, z = 0) => new Vec3(x, y, z);

describe("ThirdPersonCamera", () => {
  it("places the boom behind the pivot at rest", () => {
    const c = cam();
    c.yaw = 0;
    c.pitch = 0;
    c.update(at(0, 0, 0), 0);
    expect(c.position.x).toBeCloseTo(6, 5);
    expect(c.position.y).toBeCloseTo(1, 5);
    expect(c.position.z).toBeCloseTo(0, 5);
    expect(c.target.y).toBeCloseTo(1, 5);
  });

  it("offsets the pivot over the requested shoulder", () => {
    const c = cam({ shoulder: 0.5 });
    c.yaw = 0;
    c.pitch = 0;
    c.update(at(0, 0, 0), 0);
    // yaw 0 right vector is -Z.
    expect(c.position.z).toBeCloseTo(-0.5, 5);
    expect(c.target.z).toBeCloseTo(-0.5, 5);
  });

  it("pulls the boom in when a wall is closer than the desired distance", () => {
    const c = cam({ collisionMargin: 0.25 });
    c.yaw = 0;
    c.pitch = 0;
    const result = c.update(at(0, 0, 0), 0, (_o, _d, max) => {
      expect(max).toBeCloseTo(6, 5);
      return 2;
    });
    expect(result.obstruction).toBe(2);
    expect(result.pulledIn).toBe(true);
    expect(result.distance).toBeCloseTo(1.75, 5);
  });

  it("never goes inside the minimum boom length", () => {
    const c = cam({ minDistance: 1.2, collisionMargin: 0.25 });
    const result = c.update(at(0, 0, 0), 0, () => 0.05);
    expect(result.distance).toBeCloseTo(1.2, 5);
  });

  it("eases the boom back out once the wall is gone", () => {
    const c = cam({ zoomOutSmoothing: 4 });
    c.update(at(0, 0, 0), 0, () => 2);
    const pulled = c.appliedDistance;
    expect(pulled).toBeCloseTo(1.75, 5);
    const mid = c.update(at(0, 0, 0), 1 / 60, () => null).distance;
    expect(mid).toBeGreaterThan(pulled);
    expect(mid).toBeLessThan(6);
    for (let i = 0; i < 600; i++) c.update(at(0, 0, 0), 1 / 60, () => null);
    expect(c.appliedDistance).toBeCloseTo(6, 2);
  });

  it("smooths the follow target but snaps on the first update", () => {
    const c = cam({ followSmoothing: 10 });
    c.update(at(0, 0, 0), 0);
    const moved = c.update(at(100, 0, 0), 1 / 60);
    // The pivot is eased toward the new target, so it must lag behind it.
    expect(moved.distance).toBeGreaterThan(0);
    expect(c.target.x).toBeGreaterThan(0);
    expect(c.target.x).toBeLessThan(100);
  });

  it("clamps zoom and pitch", () => {
    const c = cam({ minDistance: 1, maxDistance: 12 });
    c.zoom(1e6);
    expect(c.desiredDistance).toBe(12);
    c.zoom(-1e6);
    expect(c.desiredDistance).toBe(1);
    c.orbit(0, 1e6);
    expect(c.pitch).toBeCloseTo(1.45, 5);
    c.orbit(0, -1e6);
    expect(c.pitch).toBeCloseTo(0.08, 5);
  });
});
