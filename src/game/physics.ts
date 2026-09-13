import type Phaser from "phaser";
import { TUNING } from "./config.ts";

export type Point = { x: number; y: number };
export type ArcadeTypes = Pick<
  typeof Phaser.Physics.Arcade,
  "Body" | "StaticBody"
>;

// Rules use center coordinates and the original 60 Hz tuning units. This small
// boundary converts them to Arcade's top-left coordinates and pixels/second.
export class Body {
  position: Point;
  velocity: Point = { x: 0, y: 0 };
  width: number;
  height: number;
  fixed: boolean;
  frozen = false;
  headOnly = false;
  gravityScale = 1;
  ignoreWalls = false;
  // "top": 8x may stand on the lid; the volume is empty (pipes).
  passHuge: "volume" | "top" = "volume";
  motion?: {
    x: number;
    y: number;
    vertical: boolean;
    phase: number;
    time: number;
  };
  native?: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody;

  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    fixed = false,
  ) {
    this.position = { x, y };
    this.width = width;
    this.height = height;
    this.fixed = fixed;
  }
  get isStatic() {
    return this.fixed || this.frozen;
  }
  get bounds() {
    return {
      min: {
        x: this.position.x - this.width / 2,
        y: this.position.y - this.height / 2,
      },
      max: {
        x: this.position.x + this.width / 2,
        y: this.position.y + this.height / 2,
      },
    };
  }
  static setPosition(body: Body, point: Point) {
    Object.assign(body.position, point);
  }
  static setVelocity(body: Body, velocity: Point) {
    Object.assign(body.velocity, velocity);
  }
  static setFrozen(body: Body, frozen: boolean) {
    body.frozen = frozen;
    if (frozen) Body.setVelocity(body, { x: 0, y: 0 });
  }
  static scale(body: Body, x: number, y: number) {
    body.width *= x;
    body.height *= y;
  }
}

export function overlaps(body: Body, solids: Body[], tolerance = 0) {
  const a = body.bounds;
  return solids.filter((solid) => {
    if (solid.headOnly) return false;
    const b = solid.bounds;
    return (
      a.max.x - b.min.x > tolerance &&
      b.max.x - a.min.x > tolerance &&
      a.max.y - b.min.y > tolerance &&
      b.max.y - a.min.y > tolerance
    );
  });
}

// 8x volume-hold: ground, or a standable top under this body, not a neighbor.
export function hugeFloorAt(
  y: number,
  x: number,
  width: number,
  solids: Iterable<Body>,
) {
  if (Math.abs(y - TUNING.groundY) < 12) return true;
  for (const solid of solids) {
    if (!solid.fixed || solid.headOnly || solid.passHuge === "top") continue;
    if (Math.abs(solid.bounds.min.y - y) >= 12) continue;
    if (x + width <= solid.bounds.min.x || x >= solid.bounds.max.x) continue;
    return true;
  }
  return false;
}

export function rayBlocked(solids: Body[], start: Point, end: Point) {
  return solids.some((solid) => {
    if (solid.headOnly) return false;
    const box = solid.bounds;
    let near = 0,
      far = 1;
    for (const axis of ["x", "y"] as const) {
      const delta = end[axis] - start[axis];
      if (Math.abs(delta) < 1e-9) {
        if (start[axis] < box.min[axis] || start[axis] > box.max[axis])
          return false;
      } else {
        const first = (box.min[axis] - start[axis]) / delta;
        const last = (box.max[axis] - start[axis]) / delta;
        near = Math.max(near, Math.min(first, last));
        far = Math.min(far, Math.max(first, last));
        if (near > far) return false;
      }
    }
    return true;
  });
}

export class PhysicsWorld {
  bodies = new Set<Body>();
  world?: Phaser.Physics.Arcade.World;
  private classes?: ArcadeTypes;
  private order = new WeakMap<object, number>();
  private byNative = new WeakMap<object, Body>();
  private nextOrder = 0;

  bind(world: Phaser.Physics.Arcade.World, classes: ArcadeTypes) {
    this.world = world;
    this.classes = classes;
    world.gravity.set(0, TUNING.gravity);
    world.fixedStep = false;
    for (const body of this.bodies) this.attach(body);
  }
  rectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    fixed = false,
  ) {
    const body = new Body(x, y, width, height, fixed);
    this.bodies.add(body);
    this.attach(body);
    return body;
  }
  remove(body: Body) {
    if (body.native) {
      this.world?.remove(body.native);
      body.native.destroy();
      body.native = undefined;
    }
    this.bodies.delete(body);
  }
  clear() {
    for (const body of this.bodies) this.remove(body);
  }
  private attach(body: Body) {
    if (!this.world || !this.classes || body.native) return;
    body.native = body.fixed
      ? new this.classes.StaticBody(this.world)
      : new this.classes.Body(this.world);
    if (!body.fixed)
      (body.native as Phaser.Physics.Arcade.Body).setAllowRotation(false);
    body.native.setSize(body.width, body.height);
    body.native.position.set(body.bounds.min.x, body.bounds.min.y);
    body.native.updateCenter();
    this.order.set(body.native, this.nextOrder++);
    this.byNative.set(body.native, body);
    this.world.add(body.native);
  }
  step(dt: number) {
    if (!this.world)
      throw new Error("Arcade physics must be bound before the game starts");
    const movers: {
      wrapper: Body;
      native: Phaser.Physics.Arcade.Body;
    }[] = [];
    for (const body of this.bodies) {
      const native = body.native!;
      if (body.fixed) {
        const fixed = native as Phaser.Physics.Arcade.StaticBody;
        fixed.checkCollision.up =
          fixed.checkCollision.left =
          fixed.checkCollision.right =
            !body.headOnly;
        const x = body.position.x - body.width / 2,
          y = body.position.y - body.height / 2;
        if (fixed.position.x !== x || fixed.position.y !== y) {
          this.world.remove(fixed);
          fixed.position.set(x, y);
          fixed.updateCenter();
          this.world.add(fixed);
        }
        continue;
      }
      const moving = native as Phaser.Physics.Arcade.Body;
      moving.enable = !body.frozen;
      moving.gravity.y = TUNING.gravity * (body.gravityScale - 1);
      if (moving.width !== body.width || moving.height !== body.height)
        moving.setSize(body.width, body.height, false);
      const walls = !body.ignoreWalls;
      moving.checkCollision.left = walls;
      moving.checkCollision.right = walls;
      moving.checkCollision.up = walls;
      moving.checkCollision.down = true;
      moving.position.set(body.bounds.min.x, body.bounds.min.y);
      moving.velocity.set(body.velocity.x * 60, body.velocity.y * 60);
      moving.updateCenter();
      movers.push({ wrapper: body, native: moving });
    }
    this.world.update(0, dt * 1000);
    for (const { wrapper, native } of movers) {
      if (!native.enable) continue;
      const nearby = this.world.staticTree
        .search({
          minX: Math.min(native.position.x, native.prev.x) - 4,
          minY: Math.min(native.position.y, native.prev.y) - 4,
          maxX: Math.max(native.position.x, native.prev.x) + native.width + 4,
          maxY: Math.max(native.position.y, native.prev.y) + native.height + 4,
        })
        .sort((a, b) => this.order.get(a)! - this.order.get(b)!);
      if (!nearby.length) continue;
      this.world.collide(native, nearby, undefined, (_actor, solid) => {
        if (!wrapper.ignoreWalls) return true;
        const top = (solid as Phaser.Physics.Arcade.StaticBody).y;
        return (
          native.velocity.y >= 0 && native.prev.y + native.height <= top + 6
        );
      });
      if (!wrapper.ignoreWalls || native.velocity.y < 0) continue;
      // Merged wall+floor AABBs have a high top, so the lid test above will
      // not keep the floor in the same rectangle. Hold at every standable floor.
      const prevFeet = native.prev.y + native.height;
      if (!hugeFloorAt(prevFeet, native.x, native.width, this.bodies)) continue;
      const hold = nearby.some((solid) => {
        const other = this.byNative.get(solid);
        if (!other || other.headOnly || other.passHuge === "top") return false;
        const box = solid as Phaser.Physics.Arcade.StaticBody;
        if (native.x + native.width <= box.x || native.x >= box.x + box.width)
          return false;
        return box.y < prevFeet - 6 && box.y + box.height >= prevFeet - 6;
      });
      if (hold) {
        native.position.y = native.prev.y;
        native.velocity.y = 0;
      }
    }
    this.world.postUpdate();
    for (const body of this.bodies) {
      if (body.fixed || body.frozen) continue;
      const native = body.native as Phaser.Physics.Arcade.Body;
      body.position.x = native.position.x + body.width / 2;
      body.position.y = native.position.y + body.height / 2;
      body.velocity.x = native.velocity.x / 60;
      body.velocity.y = native.velocity.y / 60;
    }
  }
}
