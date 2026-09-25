import { Body, PhysicsWorld, overlaps } from "./physics.ts";
import {
  areaData,
  areaGaps,
  isCannonBarrel,
  isSolidTile,
  terrainRects,
} from "./levels.ts";
import type { Area } from "./levels.ts";
import { MAP_TOP, TUNING as T } from "./config.ts";
import type { Actor, Obstacle } from "./simulation.ts";
import { swimField } from "./navigation.ts";
import {
  initPlatformMotion,
  isNesPlatform,
  isOneWayLift,
  stepPlatformMotion,
  type PlatformMotion,
} from "./platform-motion.ts";
import type { Point } from "./physics.ts";
import {
  AXE_OPCODE,
  FIREBAR_TYPE,
  castleActorPos,
  isBowserType,
  isFirebarType,
  type Firebar,
} from "./castle.ts";

export type FlagClaim = "goomba" | "mario";
export type Flagpole = {
  x: number;
  top: number;
  bottom: number;
  claim: FlagClaim | null;
  raise: number;
};
export type Cannon = {
  column: number;
  row: number;
  x: number;
  y: number;
  // ProcessCannons index 0..5. Later barrels share a slot with an earlier one.
  slot: number;
  timer: number;
};

/** SMB1 enemy IDs from the bundled disassembly InitEnemyRoutines table. */
export const ENEMY_HAMMER_BRO = 5;
export const ENEMY_FISH = 7;
export const ENEMY_LAKITU = 17;
export const ENEMY_BALANCE_LIFT = 36;
export const ENEMY_RIGHT_LIFT = 42;
export const ENEMY_PLATFORM_MIN = 36;
export const ENEMY_PLATFORM_MAX = 44;
// L_UndergroundArea3: one-screen pipe coin rooms. Each screen spans columns
// 32k to 32k+16: a wall at 32k, the exit lip at 32k+15 and 32k+16, and
// ceiling brick on row 2. scripts/extract-levels.mjs fills the columns between.
export const COIN_ROOM_AREA = "42";

export type EnemyRole =
  | "hammer-bro"
  | "fish"
  | "lakitu"
  | "balance-lift"
  | "platform"
  | "firebar"
  | "bowser"
  | "other";

export function enemyRole(type: number): EnemyRole {
  if (type === ENEMY_HAMMER_BRO) return "hammer-bro";
  if (type === ENEMY_FISH) return "fish";
  if (type === ENEMY_LAKITU) return "lakitu";
  if (isFirebarType(type)) return "firebar";
  if (isBowserType(type)) return "bowser";
  if (type === ENEMY_BALANCE_LIFT) return "balance-lift";
  if (type >= ENEMY_PLATFORM_MIN && type <= ENEMY_PLATFORM_MAX) return "platform";
  return "other";
}

// One hanging rope of a balance lift, from under its pulley to the deck.
export type BalanceRope = { x: number; top: number; bottom: number };

// Vertical rope metatile $40 and the pulley ends $42 and $43.
export const ROPE_TILE = 64;
const PULLEY_TILES = new Set([66, 67]);

// RunLargePlatform draws six girder tiles, four in a castle (ShrinkPlatform),
// and the castle bounding box is 32 NES px. RunSmallPlatform draws three.
export function platformWidth(kind: number, area: Area) {
  if (kind >= 43) return 48;
  return area.type === "castle" ? 64 : 96;
}

export type Platform = {
  body: Body;
  origin: { x: number; y: number };
  kind: number;
  partner?: number;
  // Type 42 only. Speed stays 0 until the player stands on it, then $10.
  rightSpeed?: number;
  rightTravel?: number;
  // Types 37-41, 43, 44: SMB1 motion state, and a cached look-ahead path.
  motion?: PlatformMotion;
  path?: { frame: number; centers: Point[] };
  // Type 36 under a pulley: where its rope starts.
  ropeTop?: number;
};

// Frames a moving-platform look-ahead covers. The jump planner flies 140.
const PLATFORM_LOOKAHEAD = 140;

// Screen pixels are 2x NES pixels.
function platformCenter(origin: Point, motion: PlatformMotion): Point {
  return {
    x: origin.x + (motion.x256 / 256) * 2,
    y: MAP_TOP + motion.y * 2 + 8,
  };
}

export class Room {
  data: Area;
  offset: number;
  obstacles: Obstacle[] = [];
  solids: Body[] = [];
  smashedTiles = new Set<string>();
  gaps: [number, number][];
  goalX: number;
  flagpole?: Flagpole;
  platforms: Platform[] = [];
  cannons: Cannon[] = [];
  // Next shared barrel to try when several map to one LSFR slot.
  cannonTurn: number[] = [0, 0, 0, 0, 0, 0];
  balanceRopes: BalanceRope[] = [];
  // Level rope tiles above a balance lift. The rope is drawn to the deck.
  ropeTiles = new Set<string>();
  spawnedActors = false;
  // Type 17 is a spawn point for the one cloud Lakitu, not a ground NPC.
  lakituPoints: { x: number; y: number }[] = [];
  lakituUsed: boolean[] = [];
  firebars: Firebar[] = [];
  bowserSpawn?: { x: number; y: number };
  axe?: { x: number; y: number };
  bridgeDropped = false;
  private platformElapsed?: number;
  private platformFrame?: number;
  private swimFields = new Map<string, (point: Point) => Point[]>();
  coins: { x: number; y: number; collected: boolean }[] = [];

  constructor(
    physics: PhysicsWorld,
    id: string,
    offset: number,
    firstId: number,
  ) {
    this.data = areaData(id);
    this.offset = offset;
    this.gaps = areaGaps(this.data, offset);
    this.goalX =
      offset + (this.data.goal?.column ?? this.data.width - 3) * 32 + 16;
    const pole = this.data.objects.find((o) => o.opcode === 35);
    if (pole)
      this.flagpole = {
        x: offset + pole.column * 32 + 16,
        top: MAP_TOP + 3 * 32 + 16,
        bottom: MAP_TOP + 11 * 32 + 16,
        claim: null,
        raise: 0,
      };
    this.data.tiles.forEach((row, y) =>
      row.forEach((tile, x) => {
        if (tile === 194 || tile === 195)
          this.coins.push({
            x: offset + x * 32 + 16,
            y: MAP_TOP + y * 32 + 16,
            collected: false,
          });
        if (isCannonBarrel(tile))
          this.cannons.push({
            column: x,
            row: y,
            x: offset + x * 32 + 16,
            y: MAP_TOP + y * 32 + 16,
            slot: this.cannons.length % T.cannonSelectMax,
            // One $0e before the first shot. Later reloads are Cannon_Timer,
            // counted only when ProcessCannons selects this slot.
            timer: T.cannonReload + ((x * 13 + y * 7) % T.cannonReload),
          });
      }),
    );
    for (const rect of terrainRects(this.data, offset))
      this.solids.push(
        physics.rectangle(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          rect.width,
          rect.height,
          true,
        ),
      );
    for (const pipe of this.data.pipes) {
      const x = offset + (pipe.column + pipe.width / 2) * 32;
      const top = MAP_TOP + pipe.row * 32,
        height = pipe.height * 32;
      const body = physics.rectangle(
        x,
        top + height / 2,
        pipe.width * 32,
        height,
        true,
      );
      body.passHuge = "top";
      this.solids.push(body);
      this.obstacles.push({
        id: firstId++,
        x,
        y: top + height - 18,
        height,
        kind: "pipe",
        broken: false,
        used: false,
        bounce: 0,
        body,
      });
    }
    for (const block of [...this.data.blocks].sort(
      (a, b) => Number(a.kind === "question") - Number(b.kind === "question"),
    )) {
      const x = offset + block.column * 32 + 16,
        y = MAP_TOP + block.row * 32 + 16;
      const body = physics.rectangle(x, y, 32, 32, true);
      body.headOnly = block.hidden;
      this.solids.push(body);
      this.obstacles.push({
        id: firstId++,
        x,
        y,
        kind: "brick",
        question: block.kind === "question",
        hidden: block.hidden,
        content: block.content ?? undefined,
        coinsLeft: block.content === "coins" ? T.multiCoinCount : undefined,
        broken: false,
        used: false,
        bounce: 0,
        body,
      });
    }
    for (const enemy of this.data.enemies) {
      const role = enemyRole(enemy.type);
      if (role === "lakitu") {
        this.lakituPoints.push({
          x: offset + enemy.column * 32 + 16,
          y: MAP_TOP + enemy.row * 32 + 16,
        });
        continue;
      }
      if (role === "platform" || role === "balance-lift") {
        const width = platformWidth(enemy.type, this.data);
        const origin = {
          x: offset + enemy.column * 32 + width / 2,
          y: MAP_TOP + enemy.row * 32 + 8,
        };
        const body = physics.rectangle(origin.x, origin.y, width, 16, true);
        this.solids.push(body);
        this.platforms.push({
          body,
          origin,
          kind: enemy.type,
          ...(enemy.type === ENEMY_RIGHT_LIFT
            ? { rightSpeed: 0, rightTravel: 0 }
            : {}),
        });
        continue;
      }
      if (role === "firebar" && isFirebarType(enemy.type)) {
        const spec = FIREBAR_TYPE[enemy.type];
        const pos = castleActorPos(offset, enemy.column, enemy.row, 32, 32);
        this.firebars.push({
          x: pos.x,
          y: pos.y,
          type: enemy.type,
          length: spec.length,
          nesSpeed: spec.nesSpeed,
          clockwise: spec.clockwise,
        });
        continue;
      }
      if (role === "bowser") {
        this.bowserSpawn = castleActorPos(
          offset,
          enemy.column,
          enemy.row,
          T.bowserWidth,
          T.bowserHeight,
        );
      }
    }
    this.lakituPoints.sort((a, b) => a.x - b.x);
    this.lakituUsed = this.lakituPoints.map(() => false);
    this.pairBalanceLifts();
    for (const platform of this.platforms)
      if (platform.kind === ENEMY_BALANCE_LIFT) this.hangRope(platform);
    this.refreshBalanceRopes();
    const axe = this.data.objects.find((o) => o.opcode === AXE_OPCODE);
    if (axe) {
      const x = offset + axe.column * 32 + 16;
      this.axe = { x, y: this.axeStandY(axe.column) - 16 };
    }
  }

  private axeStandY(column: number) {
    for (let row = 3; row <= 13; row++) {
      const tile = this.data.tiles[row]?.[column] ?? 0;
      const above = this.data.tiles[row - 1]?.[column] ?? 0;
      if (isSolidTile(tile) && !isSolidTile(above)) return MAP_TOP + row * 32;
    }
    return T.groundY;
  }

  private spawnKind(solid: Body) {
    if (solid.headOnly) return;
    const platform = this.platforms.find((p) => p.body === solid);
    // Balance pairs tip, and one-way lifts wrap off the screen, so neither
    // takes a spawn.
    if (platform)
      return platform.kind === ENEMY_BALANCE_LIFT || isOneWayLift(platform.kind)
        ? "lift"
        : "platform";
    const obstacle = this.obstacles.find((o) => o.body === solid);
    if (!obstacle || obstacle.hidden) return;
    if (obstacle.kind === "brick" || obstacle.kind === "pipe")
      return obstacle.kind;
  }

  private supportsAt(x: number, half: number) {
    return this.solids.filter(
      (s) =>
        !s.headOnly &&
        x + half > s.bounds.min.x &&
        x - half < s.bounds.max.x &&
        s.bounds.min.y >= MAP_TOP + 80,
    );
  }

  place(
    actor: Actor,
    desiredX: number,
    support: "low" | "brick" | "lid" = "low",
    occupied?: Set<string>,
  ) {
    const half = actor.body.width / 2,
      height = actor.body.height;
    const raised = support !== "low";
    const attempts = raised
      ? Math.round(T.elevatedSpawnNear / 32) * 2 + 1
      : this.data.width;
    const matches = (solid: Body) => {
      const kind = this.spawnKind(solid);
      if (kind === "lift") return false;
      if (support === "brick") return kind === "brick";
      if (support === "lid") return kind === "pipe" || kind === "platform";
      return true;
    };
    for (let attempt = 0; attempt < attempts; attempt++) {
      const x = Math.max(
        this.offset + half + 1,
        Math.min(
          this.goalX - 48,
          desiredX + (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * 32,
        ),
      );
      let supports = this.supportsAt(x, half).filter(matches);
      if (support === "low") {
        const floor = supports.filter((solid) => !this.spawnKind(solid));
        if (floor.length) supports = floor;
      }
      supports.sort((a, b) => b.bounds.min.y - a.bounds.min.y);
      for (const solid of supports) {
        const minX = solid.bounds.min.x + half,
          maxX = solid.bounds.max.x - half;
        if (raised && minX > maxX + 0.01) continue;
        const px = raised
          ? Math.max(
              minX,
              Math.min(maxX, Math.floor(x / 32) * 32 + 16),
            )
          : x;
        const top = Math.round(solid.bounds.min.y);
        const cells: string[] = [];
        for (
          let col = Math.floor((px - half) / 32);
          col <= Math.floor((px + half - 0.01) / 32);
          col++
        )
          cells.push(`${col}:${top}`);
        if (occupied && cells.some((cell) => occupied.has(cell))) continue;
        Body.setPosition(actor.body, {
          x: px,
          y: solid.bounds.min.y - height / 2,
        });
        if (!overlaps(actor.body, this.solids, 0.01).length) {
          Body.setVelocity(actor.body, { x: 0, y: 0 });
          actor.homeX = px;
          actor.grounded = true;
          if (occupied) for (const cell of cells) occupied.add(cell);
          return true;
        }
      }
    }
    if (raised) return false;
    throw new Error(`No safe entrance in area ${this.data.id} at ${desiredX}`);
  }

  // One x only. Nearby search would let hunter Mario pop on-camera.
  /** Interior of the coin-room screen around x, or undefined elsewhere. */
  coinScreenAt(x: number) {
    if (this.data.id !== COIN_ROOM_AREA) return undefined;
    const wall = Math.floor((x - this.offset) / (32 * 32)) * 32;
    return {
      left: this.offset + (wall + 1) * 32,
      right: this.offset + (wall + 15) * 32,
      top: MAP_TOP + 3 * 32,
    };
  }

  standOnFloor(actor: Actor, x: number) {
    const half = actor.body.width / 2,
      height = actor.body.height;
    const floor = this.supportsAt(x, half).filter(
      (solid) => !this.spawnKind(solid),
    );
    floor.sort((a, b) => b.bounds.min.y - a.bounds.min.y);
    for (const solid of floor) {
      Body.setPosition(actor.body, {
        x,
        y: solid.bounds.min.y - height / 2,
      });
      if (!overlaps(actor.body, this.solids, 0.01).length) {
        Body.setVelocity(actor.body, { x: 0, y: 0 });
        actor.homeX = x;
        actor.grounded = true;
        return true;
      }
    }
    return false;
  }

  dropOnto(actor: Actor, x: number) {
    const half = actor.body.width / 2,
      height = actor.body.height;
    x = Math.max(
      this.offset + half + 1,
      Math.min(this.goalX - 48, x),
    );
    const supports = this.supportsAt(x, half).sort(
      (a, b) => b.bounds.min.y - a.bounds.min.y,
    );
    for (const support of supports) {
      Body.setPosition(actor.body, {
        x,
        y: support.bounds.min.y - height / 2,
      });
      if (!overlaps(actor.body, this.solids, 0.01).length) {
        Body.setVelocity(actor.body, { x: 0, y: 0 });
        actor.homeX = x;
        actor.grounded = true;
        return;
      }
    }
    Body.setPosition(actor.body, { x, y: T.groundY - height / 2 });
    Body.setVelocity(actor.body, { x: 0, y: 0 });
    actor.homeX = x;
    actor.grounded = true;
  }

  private pairBalanceLifts() {
    const lifts: number[] = [];
    for (let i = 0; i < this.platforms.length; i++)
      if (this.platforms[i].kind === ENEMY_BALANCE_LIFT) lifts.push(i);
    for (let i = 0; i + 1 < lifts.length; i += 2) {
      const a = lifts[i]!,
        b = lifts[i + 1]!;
      this.platforms[a]!.partner = b;
      this.platforms[b]!.partner = a;
    }
  }

  private ridersOn(platform: Platform, actors: Actor[]) {
    const body = platform.body;
    return actors.filter((a) => {
      const footMin = a.body.bounds.min.x;
      const footMax = a.body.bounds.max.x;
      return (
        a.alive &&
        !a.saved &&
        a.body.velocity.y >= 0 &&
        Math.abs(a.body.bounds.max.y - body.bounds.min.y) < 3 &&
        footMax > body.bounds.min.x &&
        footMin < body.bounds.max.x
      );
    });
  }

  private carryRiders(riders: Actor[], dx: number, dy: number) {
    for (const actor of riders)
      Body.setPosition(actor.body, {
        x: actor.body.position.x + dx,
        y: actor.body.position.y + dy,
      });
  }

  private updateBalancePair(
    a: Platform,
    b: Platform,
    dt: number,
    actors: Actor[],
  ) {
    const minY = MAP_TOP + 80;
    const maxY = T.groundY - 8;
    const ridersA = this.ridersOn(a, actors);
    const ridersB = this.ridersOn(b, actors);
    const wA = ridersA.length,
      wB = ridersB.length;
    let dy: number;
    if (wA !== wB) {
      dy = Math.sign(wA - wB) * T.platformSpeed * dt;
    } else {
      const remain = a.origin.y - a.body.position.y;
      dy =
        Math.abs(remain) < 0.5
          ? 0
          : Math.sign(remain) *
            Math.min(T.platformSpeed * dt, Math.abs(remain));
    }
    const lo = Math.max(minY - a.body.position.y, b.body.position.y - maxY);
    const hi = Math.min(maxY - a.body.position.y, b.body.position.y - minY);
    dy = Math.min(hi, Math.max(lo, dy));
    const beforeA = { ...a.body.position };
    const beforeB = { ...b.body.position };
    a.body.position.x = a.origin.x;
    b.body.position.x = b.origin.x;
    a.body.position.y += dy;
    b.body.position.y -= dy;
    a.body.motion = undefined;
    b.body.motion = undefined;
    this.carryRiders(
      ridersA,
      a.body.position.x - beforeA.x,
      a.body.position.y - beforeA.y,
    );
    this.carryRiders(
      ridersB,
      b.body.position.x - beforeB.x,
      b.body.position.y - beforeB.y,
    );
  }

  // The level draws a pulley end ($42 or $43) in the lift's center column
  // and rope ($40) under it to where the lift starts. DrawEraseRope redraws
  // that rope as the lift moves, so it is drawn live instead.
  private hangRope(platform: Platform) {
    const column = Math.floor((platform.origin.x - this.offset) / 32);
    const liftRow = Math.floor((platform.origin.y - MAP_TOP) / 32);
    const tiles = this.data.tiles;
    for (let row = liftRow - 1; row >= 0; row--) {
      if (!PULLEY_TILES.has(tiles[row]?.[column] ?? 0)) continue;
      platform.ropeTop = MAP_TOP + (row + 1) * 32;
      for (let r = row + 1; tiles[r]?.[column] === ROPE_TILE; r++)
        this.ropeTiles.add(`${column},${r}`);
      return;
    }
  }

  refreshBalanceRopes() {
    this.balanceRopes = this.platforms
      .filter((p) => p.ropeTop !== undefined)
      .map((p) => ({
        x: p.body.position.x,
        top: p.ropeTop!,
        bottom: p.body.bounds.min.y,
      }));
  }

  private updateRightLift(
    platform: Platform,
    dt: number,
    actors: Actor[],
    player?: Actor,
  ) {
    const { body, origin } = platform;
    const before = { x: body.position.x, y: body.position.y };
    const riding = this.ridersOn(platform, actors);
    const speed = platform.rightSpeed ?? 0;
    platform.rightTravel = (platform.rightTravel ?? 0) + speed * dt * 60;
    body.motion = undefined;
    body.position.x = origin.x + platform.rightTravel;
    body.position.y = origin.y;
    if (player && riding.includes(player))
      platform.rightSpeed = T.rightLiftSpeed;
    this.carryRiders(
      riding,
      body.position.x - before.x,
      body.position.y - before.y,
    );
  }

  updatePlatforms(elapsed: number, actors: Actor[], player?: Actor) {
    const dt =
      this.platformElapsed === undefined
        ? 0
        : Math.max(0, elapsed - this.platformElapsed);
    this.platformElapsed = elapsed;
    const frame = Math.round(elapsed * 60);
    const fromFrame = this.platformFrame ?? frame;
    this.platformFrame = frame;
    const moved = new Set<Platform>();
    for (const platform of this.platforms) {
      if (moved.has(platform)) continue;
      if (
        platform.kind === ENEMY_BALANCE_LIFT &&
        platform.partner != null
      ) {
        const partner = this.platforms[platform.partner]!;
        this.updateBalancePair(platform, partner, dt, actors);
        moved.add(platform);
        moved.add(partner);
        continue;
      }
      if (platform.kind === ENEMY_BALANCE_LIFT) continue;
      if (platform.kind === ENEMY_RIGHT_LIFT) {
        this.updateRightLift(platform, dt, actors, player);
        continue;
      }
      if (!isNesPlatform(platform.kind)) continue;
      this.updateNesPlatform(platform, fromFrame, frame, actors, player);
    }
    this.refreshBalanceRopes();
  }

  // Types 37-41, 43, and 44 step their own SMB1 motion one frame at a time.
  private updateNesPlatform(
    platform: Platform,
    fromFrame: number,
    frame: number,
    actors: Actor[],
    player?: Actor,
  ) {
    const { body, origin } = platform;
    // The origin is the center of a 16px body on the enemy row.
    const motion = (platform.motion ??= initPlatformMotion(
      platform.kind,
      (origin.y - 8 - MAP_TOP) / 2,
    ));
    const before = { ...body.position };
    const riding = this.ridersOn(platform, actors);
    const playerOn = !!player && riding.includes(player);
    for (let f = fromFrame + 1; f <= frame; f++)
      stepPlatformMotion(motion, f, playerOn);
    const at = platformCenter(origin, motion);
    body.position.x = at.x;
    body.position.y = at.y;
    const dy = at.y - before.y;
    // A lift that wraps past the bottom of the screen leaves its riders.
    if (Math.abs(dy) < 256) this.carryRiders(riding, at.x - before.x, dy);
    body.motion = { at: (ahead) => this.platformAhead(platform, ahead) };
  }

  // Where the platform will be `ahead` frames from now, with no player on it.
  private platformAhead(platform: Platform, ahead: number) {
    const frame = this.platformFrame ?? 0;
    if (!platform.path || platform.path.frame !== frame) {
      const m = { ...platform.motion! };
      const centers = [platformCenter(platform.origin, m)];
      for (let f = 1; f <= PLATFORM_LOOKAHEAD; f++) {
        stepPlatformMotion(m, frame + f, false);
        centers.push(platformCenter(platform.origin, m));
      }
      platform.path = { frame, centers };
    }
    const centers = platform.path.centers;
    return centers[Math.max(0, Math.min(centers.length - 1, Math.round(ahead)))]!;
  }
  springAt(actor: Actor) {
    const half = actor.body.width / 2;
    return this.data.objects.find(
      (o) =>
        o.opcode === 33 &&
        !this.smashedTiles.has(`${o.column},${o.row}`) &&
        !this.smashedTiles.has(`${o.column},${o.row + 1}`) &&
        Math.abs(actor.body.position.x - this.offset - o.column * 32 - 16) <
          Math.max(28, half + 16) &&
        Math.abs(actor.body.bounds.max.y - MAP_TOP - o.row * 32) < 12,
    );
  }
  onSpring(actor: Actor) {
    return !!this.springAt(actor);
  }
  swimPath(actor: Actor, target?: Point) {
    target ??= {
      x: this.goalX - 16 - actor.body.width / 2 + 1,
      y: MAP_TOP + (this.data.goal?.row ?? 8) * 32 + 32,
    };
    const key = `${actor.body.width},${actor.body.height},${Math.round(target.x / 16)},${Math.round(target.y / 16)}`;
    let field = this.swimFields.get(key);
    if (!field) {
      field = swimField(
        this.solids,
        this.offset,
        this.data.width * 32,
        actor.body,
        target,
      );
      if (this.swimFields.size > 12) this.swimFields.clear();
      this.swimFields.set(key, field);
    }
    return field(actor.body.position);
  }
  clearNavigation() {
    this.swimFields.clear();
  }
  atDoor(actor: Actor) {
    const goal = this.data.goal;
    return (
      !!goal &&
      goal.kind !== "pipe" &&
      actor.body.position.x >= this.goalX &&
      actor.body.bounds.max.y >= MAP_TOP + (goal.row - 1) * 32 &&
      actor.body.bounds.min.y < T.groundY + 16
    );
  }
}
