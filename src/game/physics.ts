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
    this.world.add(body.native);
  }
  step(dt: number) {
    if (!this.world)
      throw new Error("Arcade physics must be bound before the game starts");
    const dynamic: Phaser.Physics.Arcade.Body[] = [];
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
      moving.position.set(body.bounds.min.x, body.bounds.min.y);
      moving.velocity.set(body.velocity.x * 60, body.velocity.y * 60);
      moving.updateCenter();
      dynamic.push(moving);
    }
    this.world.update(0, dt * 1000);
    for (const body of dynamic) {
      if (!body.enable) continue;
      const nearby = this.world.staticTree
        .search({
          minX: Math.min(body.position.x, body.prev.x) - 4,
          minY: Math.min(body.position.y, body.prev.y) - 4,
          maxX: Math.max(body.position.x, body.prev.x) + body.width + 4,
          maxY: Math.max(body.position.y, body.prev.y) + body.height + 4,
        })
        .sort((a, b) => this.order.get(a)! - this.order.get(b)!);
      if (nearby.length) this.world.collide(body, nearby);
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
