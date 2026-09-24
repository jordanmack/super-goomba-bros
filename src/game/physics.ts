import type Phaser from "phaser";
import { TUNING } from "./config.ts";

export type Point = { x: number; y: number };
export type HoldSpan = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};
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
  // "top": 8x may stand on the lid; the volume is empty until smash (pipes).
  passHuge: "volume" | "top" = "volume";
  // A rising graze on a wall face must not resolve as a ceiling.
  riseAlongWall = false;
  // Player keeps any non-overlapping approach. Mario and NPCs use 1:
  // a wider gap lets a ceiling corner count as a wall.
  wallRiseGap = Number.POSITIVE_INFINITY;
  // Feet Y, stood-on floor, and bound volume of an 8x volume-hold. Keeps
  // that merged wall+floor after the floor AABB overlap ends. Frozen spans
  // keep rebuild rematch on the original pair, not another column.
  volumeHoldY?: number;
  volumeHoldFloor?: Body;
  volumeHoldVolume?: Body;
  volumeHoldFloorSpan?: HoldSpan;
  volumeHoldVolumeSpan?: HoldSpan;
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

function standableHuge(solid: Body) {
  return solid.fixed && !solid.headOnly && solid.passHuge !== "top";
}

export function holdSpanOf(body: Body): HoldSpan {
  const b = body.bounds;
  return { minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y };
}

export function clearVolumeHold(body: Body) {
  body.volumeHoldY = undefined;
  body.volumeHoldFloor = undefined;
  body.volumeHoldVolume = undefined;
  body.volumeHoldFloorSpan = undefined;
  body.volumeHoldVolumeSpan = undefined;
}

function overlapX(
  minA: number,
  maxA: number,
  minB: number,
  maxB: number,
) {
  return Math.min(maxA, maxB) - Math.max(minA, minB);
}

function bodyOverlapsX(x: number, width: number, solid: Body) {
  return x + width > solid.bounds.min.x && x < solid.bounds.max.x;
}

function gapX(x: number, width: number, solid: Body) {
  const b = solid.bounds;
  if (x + width > b.min.x && x < b.max.x) return 0;
  if (x + width <= b.min.x) return b.min.x - (x + width);
  return x - b.max.x;
}

// Replacement that still covers the armed span. Prefer a solid the body
// overlaps; otherwise the nearest span remnant. A different pair at this Y
// does not match: it has no overlap with the frozen span. Volume remnants
// must still span the armed feet Y and touch the armed floor span; smash
// may change their top or bottom.
function rematchHold(
  saved: Body | undefined,
  solids: Iterable<Body>,
  span: HoldSpan | undefined,
  x: number | undefined,
  width: number | undefined,
  matchMinY: boolean,
  partner?: HoldSpan,
  holdY?: number,
) {
  if (!saved && !span) return;
  for (const solid of solids) {
    if (saved && solid === saved && standableHuge(solid)) return solid;
  }
  const sb = span ?? (saved ? holdSpanOf(saved) : undefined);
  if (!sb) return;
  let bestBody: Body | undefined;
  let bestBodyScore = -1;
  let bestNear: Body | undefined;
  let bestNearDist = Infinity;
  let bestNearSpan = -1;
  for (const solid of solids) {
    if (!standableHuge(solid)) continue;
    const b = solid.bounds;
    if (matchMinY && Math.abs(b.min.y - sb.minY) >= 12) continue;
    if (matchMinY && Math.abs(b.max.y - sb.maxY) >= 12) continue;
    if (!matchMinY) {
      const y = holdY ?? sb.minY;
      if (!(b.min.y < y - 6 && b.max.y >= y - 6)) continue;
    }
    const spanHit = overlapX(b.min.x, b.max.x, sb.minX, sb.maxX);
    if (spanHit <= 0) continue;
    if (partner && (b.max.x < partner.minX || b.min.x > partner.maxX)) continue;
    if (x !== undefined && width !== undefined && bodyOverlapsX(x, width, solid)) {
      const bodyHit = overlapX(x, x + width, b.min.x, b.max.x);
      const score = bodyHit + spanHit;
      if (score > bestBodyScore) {
        bestBody = solid;
        bestBodyScore = score;
      }
    }
    if (x === undefined || width === undefined) {
      if (spanHit > bestNearSpan) {
        bestNear = solid;
        bestNearSpan = spanHit;
      }
      continue;
    }
    const dist = gapX(x, width, solid);
    if (
      dist < bestNearDist ||
      (dist === bestNearDist && spanHit > bestNearSpan)
    ) {
      bestNear = solid;
      bestNearDist = dist;
      bestNearSpan = spanHit;
    }
  }
  return bestBody ?? bestNear;
}

// 8x volume-hold: ground, or a standable top under this body, not a neighbor.
export function hugeFloorAt(
  y: number,
  x: number,
  width: number,
  solids: Iterable<Body>,
) {
  if (Math.abs(y - TUNING.groundY) < 12) return true;
  return hugeFloorSolid(y, x, width, solids) !== undefined;
}

export function hugeFloorSolid(
  y: number,
  x: number,
  width: number,
  solids: Iterable<Body>,
) {
  let best: Body | undefined;
  let bestDist = Infinity;
  for (const solid of solids) {
    if (!standableHuge(solid)) continue;
    const dist = Math.abs(solid.bounds.min.y - y);
    if (dist >= 12) continue;
    if (!bodyOverlapsX(x, width, solid)) continue;
    if (dist < bestDist) {
      best = solid;
      bestDist = dist;
    }
  }
  return best;
}

// Bound volume at y that is flush with this stood-on floor (same bottom,
// touching or overlapping). Another column on the same floor is not a match
// unless it is this volume.
export function hugeFlushWithFloor(
  y: number,
  x: number,
  width: number,
  solids: Iterable<Body>,
  floor: Body,
  volume?: Body,
) {
  if (!standableHuge(floor)) return false;
  const fb = floor.bounds;
  if (Math.abs(fb.min.y - y) >= 12) return false;
  const candidates = volume ? [volume] : solids;
  for (const vol of candidates) {
    if (!standableHuge(vol)) continue;
    const vb = vol.bounds;
    if (!bodyOverlapsX(x, width, vol)) continue;
    if (!(vb.min.y < y - 6 && vb.max.y >= y - 6)) continue;
    if (Math.abs(vb.max.y - fb.max.y) >= 12) continue;
    if (vb.max.x < fb.min.x || vb.min.x > fb.max.x) continue;
    return true;
  }
  return false;
}

// Overlapping wall flush with this floor. Picks the strongest x-overlap,
// not the first solid in iteration order. The floor top itself is not a volume.
export function hugeFlushVolume(
  y: number,
  x: number,
  width: number,
  solids: Iterable<Body>,
  floor: Body,
) {
  if (!standableHuge(floor)) return;
  const fb = floor.bounds;
  if (Math.abs(fb.min.y - y) >= 12) return;
  let best: Body | undefined;
  let bestHit = -1;
  for (const vol of solids) {
    if (vol === floor || !standableHuge(vol)) continue;
    const vb = vol.bounds;
    if (!bodyOverlapsX(x, width, vol)) continue;
    if (!(vb.min.y < y - 6 && vb.max.y >= y - 6)) continue;
    if (Math.abs(vb.max.y - fb.max.y) >= 12) continue;
    if (vb.max.x < fb.min.x || vb.min.x > fb.max.x) continue;
    const hit = overlapX(x, x + width, vb.min.x, vb.max.x);
    if (hit > bestHit) {
      best = vol;
      bestHit = hit;
    }
  }
  return best;
}

// The stood-on floor Body, or a replacement that shares the original floor
// span after terrain rebuild. A different pair at this Y, including an
// abutting neighbor, is not a match.
export function hugeHoldFloor(
  saved: Body | undefined,
  solids: Iterable<Body>,
  x?: number,
  width?: number,
  span?: HoldSpan,
) {
  return rematchHold(saved, solids, span, x, width, true);
}

// The bound wall/volume, or a remnant that still covers the original span
// and still touches the armed floor. Wall top or bottom may change after smash.
export function hugeHoldVolume(
  saved: Body | undefined,
  solids: Iterable<Body>,
  x?: number,
  width?: number,
  span?: HoldSpan,
  floorSpan?: HoldSpan,
  holdY?: number,
) {
  return rematchHold(
    saved,
    solids,
    span,
    x,
    width,
    false,
    floorSpan,
    holdY,
  );
}

export function hugeHoldAt(
  y: number,
  x: number,
  width: number,
  solids: Iterable<Body>,
  body: Body,
) {
  if (hugeFloorAt(y, x, width, solids)) return true;
  if (body.volumeHoldY === undefined) return false;
  const holdFloor = hugeHoldFloor(
    body.volumeHoldFloor,
    solids,
    x,
    width,
    body.volumeHoldFloorSpan,
  );
  const holdVolume = hugeHoldVolume(
    body.volumeHoldVolume,
    solids,
    x,
    width,
    body.volumeHoldVolumeSpan,
    body.volumeHoldFloorSpan,
    body.volumeHoldY,
  );
  return (
    holdFloor !== undefined &&
    holdVolume !== undefined &&
    Math.abs(y - body.volumeHoldY) < 12 &&
    hugeFlushWithFloor(
      body.volumeHoldY,
      x,
      width,
      solids,
      holdFloor,
      holdVolume,
    )
  );
}

// Phaser separates on Y first while gravity is vertical. Rising into a wall
// the body was not already under then resolves that side as a ceiling and
// cancels the jump. Push the body back out on X and skip the vertical
// separation. A head that already meets a ceiling, including the next tile
// of a low overhang, still takes the normal bonk.
const SIDE_FACE = 0.01;

type ArcadeBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  checkCollision: { up: boolean; down: boolean; left: boolean; right: boolean };
};

type ArcadeMover = ArcadeBox & {
  prev: { x: number; y: number };
  velocity: { x: number; y: number };
  updateCenter(): void;
};

function asArcadeBox(value: object): ArcadeBox | undefined {
  const box = value as Partial<ArcadeBox>;
  if (
    typeof box.x !== "number" ||
    typeof box.y !== "number" ||
    typeof box.width !== "number" ||
    typeof box.height !== "number" ||
    !box.checkCollision
  )
    return undefined;
  return box as ArcadeBox;
}

function headMeetsCeiling(mover: ArcadeMover, solid: ArcadeBox) {
  if (!solid.checkCollision.up || !solid.checkCollision.down) return false;
  const prevTop = mover.prev.y;
  const prevBottom = prevTop + mover.height;
  const prevLeft = mover.prev.x;
  const prevRight = prevLeft + mover.width;
  const overlapX =
    Math.min(prevRight, solid.x + solid.width) - Math.max(prevLeft, solid.x);
  if (overlapX <= SIDE_FACE) return false;
  const underside = solid.y + solid.height;
  // A floor or tall volume reaches the feet. That underside is not a ceiling.
  if (underside >= prevBottom - 1) return false;
  const rise = prevTop - mover.y;
  if (prevTop > underside + Math.max(rise, 0) + SIDE_FACE) return false;
  return prevBottom > solid.y;
}

function releaseRisingSide(
  mover: ArcadeMover,
  solidValue: object,
  nearby: readonly object[],
  maxGap: number,
) {
  const solid = asArcadeBox(solidValue);
  if (!solid) return false;
  const dy = mover.y - mover.prev.y;
  if (dy >= 0) return false;
  const dx = mover.x - mover.prev.x;
  if (dx === 0) return false;
  const prevLeft = mover.prev.x;
  const prevRight = prevLeft + mover.width;
  const solidLeft = solid.x;
  const solidRight = solid.x + solid.width;
  const prevOverlap =
    Math.min(prevRight, solidRight) - Math.max(prevLeft, solidLeft);
  if (prevOverlap > SIDE_FACE) return false;
  const fromLeft = dx > 0 && prevRight <= solidLeft + SIDE_FACE;
  const fromRight = dx < 0 && prevLeft >= solidRight - SIDE_FACE;
  if (fromLeft && !solid.checkCollision.left) return false;
  if (fromRight && !solid.checkCollision.right) return false;
  if (!fromLeft && !fromRight) return false;
  // Mario and NPCs only release when already on the face. A wider approach
  // lets a head climb a ceiling corner. The player max gap stays unlimited.
  const gap = fromLeft ? solidLeft - prevRight : prevLeft - solidRight;
  if (gap > maxGap) return false;
  // A body whose center has crossed the face is entering under a ceiling.
  const center = mover.x + mover.width / 2;
  if (fromLeft && center >= solidLeft) return false;
  if (fromRight && center <= solidRight) return false;
  if (
    nearby.some((other) => {
      const box = asArcadeBox(other);
      return !!box && box !== solid && headMeetsCeiling(mover, box);
    })
  )
    return false;
  if (fromLeft) {
    mover.x = solidLeft - mover.width;
    if (mover.velocity.x > 0) mover.velocity.x = 0;
  } else {
    mover.x = solidRight;
    if (mover.velocity.x < 0) mover.velocity.x = 0;
  }
  mover.updateCenter();
  return true;
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
      if (nearby.length) {
        this.world.collide(native, nearby, undefined, (_actor, solid) => {
          if (!wrapper.ignoreWalls) {
            if (
              wrapper.riseAlongWall &&
              releaseRisingSide(native, solid, nearby, wrapper.wallRiseGap)
            )
              return false;
            return true;
          }
          const top = (solid as Phaser.Physics.Arcade.StaticBody).y;
          return (
            native.velocity.y >= 0 && native.prev.y + native.height <= top + 6
          );
        });
      }
      if (!wrapper.ignoreWalls) {
        clearVolumeHold(wrapper);
        continue;
      }
      // Merged wall+floor AABBs have a high top, so the lid test above will
      // not keep the floor in the same rectangle. Hold at every standable floor.
      // Keep that hold after the floor AABB overlap ends while the body is
      // still on that same merged pair. Jump does not drop the latch.
      const prevFeet = native.prev.y + native.height;
      const inVolume = nearby.some((solid) => {
        const other = this.byNative.get(solid);
        if (!other || other.headOnly || other.passHuge === "top") return false;
        const box = solid as Phaser.Physics.Arcade.StaticBody;
        if (native.x + native.width <= box.x || native.x >= box.x + box.width)
          return false;
        return box.y < prevFeet - 6 && box.y + box.height >= prevFeet - 6;
      });
      const floor = hugeFloorSolid(
        prevFeet,
        native.x,
        native.width,
        this.bodies,
      );
      const onFloor = hugeFloorAt(prevFeet, native.x, native.width, this.bodies);
      const holdFloor = hugeHoldFloor(
        wrapper.volumeHoldFloor,
        this.bodies,
        native.x,
        native.width,
        wrapper.volumeHoldFloorSpan,
      );
      if (holdFloor && holdFloor !== wrapper.volumeHoldFloor)
        wrapper.volumeHoldFloor = holdFloor;
      const holdVolume = hugeHoldVolume(
        wrapper.volumeHoldVolume,
        this.bodies,
        native.x,
        native.width,
        wrapper.volumeHoldVolumeSpan,
        wrapper.volumeHoldFloorSpan,
        wrapper.volumeHoldY,
      );
      if (holdVolume && holdVolume !== wrapper.volumeHoldVolume)
        wrapper.volumeHoldVolume = holdVolume;
      const onOur =
        holdFloor !== undefined &&
        holdVolume !== undefined &&
        wrapper.volumeHoldY !== undefined &&
        hugeFlushWithFloor(
          wrapper.volumeHoldY,
          native.x,
          native.width,
          this.bodies,
          holdFloor,
          holdVolume,
        );
      if (!onFloor && !onOur) clearVolumeHold(wrapper);
      if (native.velocity.y < 0) continue;
      const persist =
        wrapper.volumeHoldY !== undefined &&
        Math.abs(prevFeet - wrapper.volumeHoldY) < 12 &&
        onOur;
      if (inVolume && persist && holdFloor) {
        native.position.y = holdFloor.bounds.min.y - native.height;
        native.velocity.y = 0;
        wrapper.volumeHoldY = holdFloor.bounds.min.y;
      } else if (inVolume && onFloor) {
        native.position.y = native.prev.y;
        native.velocity.y = 0;
        if (floor) {
          let vol = wrapper.volumeHoldVolume;
          if (
            !vol ||
            vol === floor ||
            !hugeFlushWithFloor(
              wrapper.volumeHoldY ?? floor.bounds.min.y,
              native.x,
              native.width,
              this.bodies,
              floor,
              vol,
            )
          ) {
            vol = hugeFlushVolume(
              floor.bounds.min.y,
              native.x,
              native.width,
              this.bodies,
              floor,
            );
          }
          if (!vol) {
            clearVolumeHold(wrapper);
            continue;
          }
          const sameFloor = wrapper.volumeHoldFloor === floor;
          wrapper.volumeHoldY = floor.bounds.min.y;
          wrapper.volumeHoldFloor = floor;
          if (!sameFloor) wrapper.volumeHoldFloorSpan = holdSpanOf(floor);
          const sameVolume = wrapper.volumeHoldVolume === vol;
          wrapper.volumeHoldVolume = vol;
          if (!sameFloor || !sameVolume || !wrapper.volumeHoldVolumeSpan)
            wrapper.volumeHoldVolumeSpan = holdSpanOf(vol);
        } else {
          clearVolumeHold(wrapper);
        }
      } else if (!inVolume) {
        clearVolumeHold(wrapper);
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
