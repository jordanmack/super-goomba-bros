import type Phaser from "phaser";
import { TUNING } from "./config.ts";

export type Point = { x: number; y: number };
export type ArcadeTypes = Pick<typeof Phaser.Physics.Arcade, "Body" | "StaticBody">;

// Rules use center coordinates and the original 60 Hz tuning units. This small
// boundary converts them to Arcade's top-left coordinates and pixels/second.
export class Body {
  position: Point;
  velocity: Point = { x: 0, y: 0 };
  width: number;
  height: number;
  fixed: boolean;
  frozen = false;
  native?: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody;

  constructor(x: number, y: number, width: number, height: number, fixed = false) {
    this.position = { x, y }; this.width = width; this.height = height; this.fixed = fixed;
  }
  get isStatic() { return this.fixed || this.frozen; }
  get bounds() {
    return { min: { x: this.position.x - this.width / 2, y: this.position.y - this.height / 2 },
      max: { x: this.position.x + this.width / 2, y: this.position.y + this.height / 2 } };
  }
  static setPosition(body: Body, point: Point) { Object.assign(body.position, point); }
  static setVelocity(body: Body, velocity: Point) { Object.assign(body.velocity, velocity); }
  static setFrozen(body: Body, frozen: boolean) {
    body.frozen = frozen;
    if (frozen) Body.setVelocity(body, { x: 0, y: 0 });
  }
  static scale(body: Body, x: number, y: number) { body.width *= x; body.height *= y; }
}

export function overlaps(body: Body, solids: Body[], tolerance = 0) {
  const a = body.bounds;
  return solids.filter(solid => {
    const b = solid.bounds;
    return a.max.x - b.min.x > tolerance && b.max.x - a.min.x > tolerance &&
      a.max.y - b.min.y > tolerance && b.max.y - a.min.y > tolerance;
  });
}

export function rayBlocked(solids: Body[], start: Point, end: Point) {
  return solids.some(solid => {
    const box = solid.bounds;
    let near = 0, far = 1;
    for (const axis of ["x", "y"] as const) {
      const delta = end[axis] - start[axis];
      if (Math.abs(delta) < 1e-9) {
        if (start[axis] < box.min[axis] || start[axis] > box.max[axis]) return false;
      } else {
        const first = (box.min[axis] - start[axis]) / delta;
        const last = (box.max[axis] - start[axis]) / delta;
        near = Math.max(near, Math.min(first, last)); far = Math.min(far, Math.max(first, last));
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

  bind(world: Phaser.Physics.Arcade.World, classes: ArcadeTypes) {
    this.world = world; this.classes = classes;
    world.gravity.set(0, TUNING.gravity);
    world.fixedStep = false;
    for (const body of this.bodies) this.attach(body);
  }
  rectangle(x: number, y: number, width: number, height: number, fixed = false) {
    const body = new Body(x, y, width, height, fixed);
    this.bodies.add(body); this.attach(body); return body;
  }
  remove(body: Body) {
    if (body.native) { this.world?.remove(body.native); body.native.destroy(); body.native = undefined; }
    this.bodies.delete(body);
  }
  clear() { for (const body of this.bodies) this.remove(body); }
  private attach(body: Body) {
    if (!this.world || !this.classes || body.native) return;
    body.native = body.fixed ? new this.classes.StaticBody(this.world) : new this.classes.Body(this.world);
    if (!body.fixed) (body.native as Phaser.Physics.Arcade.Body).setAllowRotation(false);
    body.native.setSize(body.width, body.height);
    body.native.position.set(body.bounds.min.x, body.bounds.min.y);
    body.native.updateCenter();
    this.world.add(body.native);
  }
  step(dt: number) {
    if (!this.world) throw new Error("Arcade physics must be bound before the game starts");
    const dynamic: Phaser.Physics.Arcade.Body[] = [], terrain: Phaser.Physics.Arcade.StaticBody[] = [];
    for (const body of this.bodies) {
      const native = body.native!;
      if (body.fixed) { terrain.push(native as Phaser.Physics.Arcade.StaticBody); continue; }
      const moving = native as Phaser.Physics.Arcade.Body;
      moving.enable = !body.frozen;
      if (moving.width !== body.width || moving.height !== body.height) moving.setSize(body.width, body.height, false);
      moving.position.set(body.bounds.min.x, body.bounds.min.y);
      moving.velocity.set(body.velocity.x * 60, body.velocity.y * 60);
      moving.updateCenter(); dynamic.push(moving);
    }
    this.world.update(0, dt * 1000);
    this.world.collide(dynamic, terrain);
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
