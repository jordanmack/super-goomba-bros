import {
  Body,
  PhysicsWorld,
  clearVolumeHold,
  hugeFloorAt,
  hugeFlushWithFloor,
  hugeHoldAt,
  hugeHoldFloor,
  hugeHoldVolume,
  overlaps,
  rayBlocked,
} from "./physics.ts";
import {
  BOWSER_PHRASES,
  MAP_TOP,
  PHRASES,
  TUNING as T,
  VIEW_HEIGHT,
  blockDrawY,
  jumpArc,
} from "./config.ts";
import { firebarBalls, firebarHits } from "./castle.ts";
import {
  areaData,
  CAMPAIGN,
  isSmashExemptTile,
  isSolidTile,
  stageTimer,
  terrainRects,
  vineDestination,
  vineExitColumn,
} from "./levels.ts";
import { Room, enemyRole } from "./room.ts";
import { enclosedWell, planJump } from "./navigation.ts";
import { firstEmptySpawnCell } from "./spawn-cell.ts";

export type Input = {
  left: boolean;
  right: boolean;
  up: boolean;
  jump: boolean;
  fire: boolean;
  down: boolean;
  run: boolean;
};
export const emptyInput = (): Input => ({
  left: false,
  right: false,
  up: false,
  jump: false,
  fire: false,
  down: false,
  run: false,
});
export type PipeClip = { x: number; y: number; w: number; h: number };
export function pipeClip(
  roomOffset: number,
  roomWidthPx: number,
  pipe: { column: number; row: number; width: number; height: number },
  dir: "down" | "up" | "right" | "left",
): PipeClip {
  const mouthX = roomOffset + pipe.column * 32;
  const mouthY = MAP_TOP + pipe.row * 32;
  if (dir === "down" || dir === "up")
    return { x: roomOffset, y: 0, w: roomWidthPx, h: Math.max(1, mouthY) };
  return {
    x: roomOffset,
    y: 0,
    w: Math.max(1, mouthX - roomOffset),
    h: VIEW_HEIGHT,
  };
}
export type Mode =
  | "title"
  | "intro"
  | "playing"
  | "dead"
  | "finishing"
  | "won"
  | "gameover";
export type Obstacle = {
  id: number;
  x: number;
  y: number;
  kind: "pipe" | "brick";
  broken: boolean;
  body?: Body;
  height?: number;
  question?: boolean;
  hidden?: boolean;
  used: boolean;
  bounce: number;
  content?: string | null;
  coinsLeft?: number;
};
export type Vine = {
  id: number;
  x: number;
  bottomY: number;
  height: number;
  maxHeight: number;
  destArea?: string;
  destPage: number;
  areaId: string;
  block?: Obstacle;
};
export type Actor = {
  id: number;
  body: Body;
  kind: "goomba" | "koopa" | "mario" | "fish";
  alive: boolean;
  saved: boolean;
  warned: boolean;
  fear: number;
  reaction: number;
  speed: number;
  state: "idle" | "run";
  wait: number;
  facing: number;
  grounded: boolean;
  homeX: number;
  idleWait: number;
  idleWalking: boolean;
  idleDrop?: { airborne: boolean };
  scale: number;
  transformLeft: number;
  transformFrom: number;
  starLeft: number;
  hugeLeft: number;
  exclaimLeft: number;
  flower: boolean;
  shell: "none" | "stopped" | "moving";
  wakeLeft: number;
  kickIgnore: number;
  shellKicker: number;
  blockedFor: number;
  lastX: number;
  areaId?: string;
  climbing?: Vine;
  vineIgnore?: number;
  vineReturn?: { area: string; page: number };
  pipeWait?: number;
  pipeEscapeTried?: string;
  pipeTravel?: {
    phase: "enter" | "exit";
    dir: "down" | "up" | "right" | "left";
    remaining: number;
    destArea: string;
    destPage: number;
    arrival?: "rise" | "fall" | "stand" | "drop" | "warp";
    destLevel?: number;
    clip?: PipeClip;
    escape?: boolean;
  };
  navVx?: number;
  navDelay?: number;
  navHoldX?: number;
  navRetry?: number;
  navBackoff?: { x: number; vx: number; delay: number };
  navDetourBelow?: number;
  navDrop?: { x: number; vx: number; delay: number };
  jumpHeld?: boolean;
  jumpHoldG?: number;
  jumpFallG?: number;
  swimPath?: { x: number; y: number }[];
  swimSize?: number;
  swimRepath?: number;
};
export type Shout = {
  id: number;
  text: string;
  left: number;
  x: number;
  y: number;
};
export type TallyPhase =
  | ""
  | "time"
  | "warned"
  | "saved"
  | "died"
  | "flag"
  | "mario"
  | "ending";
export type GameEvent =
  | "jump"
  | "bump"
  | "warn"
  | "saved"
  | "death"
  | "marioDeath"
  | "pipe"
  | "coin"
  | "fire"
  | "break"
  | "power"
  | "shrink"
  | "splat"
  | "kick"
  | "win"
  | "oneUp"
  | "gameover"
  | "appear"
  | "tally"
  | "hurry"
  | "ending"
  | "firework";
export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  settled: boolean;
  blood: boolean;
  firework?: boolean;
};
export type Fireball = {
  id: number;
  x: number;
  y: number;
  vx: number;
  age: number;
  owner?: "player" | "mario";
  vy?: number;
  scale?: number;
};
export type BulletBill = {
  id: number;
  x: number;
  y: number;
  vx: number;
  areaId: string;
  cannonX: number;
};
export type Bowser = {
  id: number;
  areaId: string;
  x: number;
  y: number;
  facing: number;
  alive: boolean;
  fireWait: number;
  shoutWait: number;
  blockWait: number;
  minX: number;
  maxX: number;
};
export type BowserFlame = {
  id: number;
  areaId: string;
  x: number;
  y: number;
  vx: number;
  age: number;
};
export type MushroomKind = "mushroom" | "mushroom3x" | "mushroom8x";
export type ItemKind = "star" | "flower" | "oneUp" | MushroomKind;
export const isMushroom = (kind: ItemKind): kind is MushroomKind =>
  kind === "mushroom" || kind === "mushroom3x" || kind === "mushroom8x";
export const mushroomScale = (kind: MushroomKind) =>
  kind === "mushroom8x"
    ? T.hugeScale
    : kind === "mushroom3x"
      ? T.giantScale
      : T.mushroomScale;
export const fireballScaleFor = (scale: number) => scale;
export const itemSpriteSize = (kind: ItemKind) =>
  kind === "mushroom8x" ? 48 : 32;
/** Draw Y so a larger sprite shares the 32px item's visible bottom. */
export function itemDrawY(item: { kind: ItemKind; body: Body }) {
  return item.body.position.y - (itemSpriteSize(item.kind) - 32) / 2;
}
export function itemHoldHidden(item: { hold: number; age: number }) {
  return item.hold > 0 && Math.floor(item.age * T.transformBlinkHz) % 2 === 1;
}
export type Item = {
  id: number;
  kind: ItemKind;
  body: Body;
  emerge: number;
  originY: number;
  direction: number;
  age: number;
  hold: number;
  drop?: boolean;
  block?: Obstacle;
  clip?: { x: number; y: number; w: number; h: number };
  smash?: boolean;
  ignoreActor?: Actor;
};
export type CoinPop = { x: number; y: number; age: number };
const TALLY_LINES: Exclude<TallyPhase, "" | "time" | "ending">[] = [
  "warned",
  "saved",
  "died",
  "flag",
  "mario",
];

export class Simulation {
  physics: PhysicsWorld;
  levelIndex = 0;
  rooms = new Map<string, Room>();
  private terrainId = 0;
  get level() {
    return CAMPAIGN[this.levelIndex];
  }
  get activeRoom() {
    return this.roomFor(this.player);
  }
  get goalX() {
    return this.activeRoom.goalX;
  }
  roomFor(actor: Actor) {
    return this.rooms.get(actor.areaId ?? this.level.main)!;
  }
  nextLevel() {
    if (this.levelIndex < CAMPAIGN.length - 1) {
      this.levelIndex++;
      this.reset("intro");
    }
  }
  private inPipe(actor: Actor) {
    return !!actor.pipeTravel;
  }
  private onVine(actor: Actor) {
    return !!actor.climbing;
  }
  private pipeVisual(actor: Actor) {
    const mario = actor === this.mario;
    return {
      w: mario && this.marioStage === 0 ? 32 : 32 * actor.scale,
      h: (actor.kind === "koopa" ? 48 : mario ? 64 : 32) * actor.scale,
    };
  }
  private pipeOnPage(room: Room, page: number) {
    const start = page * 16,
      end = start + 16,
      spawn = this.pipeSpawnX(room, page);
    const onPage = room.data.pipes.filter(
      (p) => p.column >= start && p.column < end && !p.direction,
    );
    if (!onPage.length) return;
    return onPage.reduce((best, pipe) => {
      const x = room.offset + (pipe.column + pipe.width / 2) * 32,
        bestX = room.offset + (best.column + best.width / 2) * 32;
      return Math.abs(x - spawn) < Math.abs(bestX - spawn) ? pipe : best;
    });
  }
  private pipeSpawnX(room: Room, page: number) {
    return room.offset + page * 512 + 100;
  }
  private pipeFallX(room: Room, page: number, actor: Actor) {
    // Two-tile ceiling shafts sit on page columns 1-2 (SMB1 $18/$28).
    const pageLeft = room.offset + page * 512;
    const shaftLeft = pageLeft + 32,
      shaftRight = pageLeft + 96,
      mid = pageLeft + 64,
      half = actor.body.width / 2;
    if (half * 2 >= shaftRight - shaftLeft) return mid;
    return Math.min(shaftRight - half, Math.max(shaftLeft + half, mid));
  }
  private warpLevelFor(destination: { area: string; page: number }) {
    if (destination.page !== 0) return;
    const index = CAMPAIGN.findIndex(
      (level) => level.main === destination.area && level.stage === 1,
    );
    if (index < 0 || CAMPAIGN[index]!.world === this.level.world) return;
    return index;
  }
  private headerArrival(id: string): "fall" | "stand" | "drop" {
    const entrance = areaData(id).header.entrance;
    if (entrance === 2) return "stand";
    if (entrance === 3) return "drop";
    return "fall";
  }
  private enterablePipe(actor: Actor, down: boolean, right: boolean) {
    if ((actor.pipeWait ?? 0) > 0 || this.inPipe(actor)) return;
    const room = this.roomFor(actor),
      p = actor.body.position;
    const pipe = room.data.pipes.find((pipe) => {
      const left = room.offset + pipe.column * 32,
        top = MAP_TOP + pipe.row * 32;
      if (pipe.direction === "down")
        return (
          down &&
          Math.abs(p.x - left - pipe.width * 16) < 24 &&
          Math.abs(actor.body.bounds.max.y - top) < 10
        );
      return (
        pipe.direction === "right" &&
        (right || down) &&
        actor.body.bounds.max.x >= left - 5 &&
        p.x < left + pipe.width * 32 &&
        p.y >= top - actor.body.height / 2 &&
        p.y < top + 64
      );
    });
    if (!pipe) return;
    const mouthX = room.offset + (pipe.column + pipe.width / 2) * 32;
    const mouth = room.obstacles.find(
      (c) => c.kind === "pipe" && Math.abs(c.x - mouthX) < 1,
    );
    if (mouth?.broken) return;
    if (this.isHuge(actor) && !(mouth && this.isGoalPipe(room, mouth)))
      return;
    const destination =
      pipe.destinations.find((d) => d.world === this.level.world) ??
      (room.data.id === "29" ? { area: this.level.main, page: 0 } : undefined);
    if (!destination) return;
    if (this.warpLevelFor(destination) !== undefined && actor !== this.player)
      return;
    return pipe;
  }
  private isGoalPipeData(
    room: Room,
    pipe: { column: number; row: number },
  ) {
    const goal = room.data.goal;
    return (
      goal?.kind === "pipe" &&
      goal.column === pipe.column &&
      goal.row === pipe.row
    );
  }
  private aboveExitCeiling(a: Actor) {
    const room = this.roomFor(a);
    const goal = room.data.goal;
    if (goal?.kind !== "pipe") return false;
    if (Math.abs(a.body.position.x - room.goalX) >= 512) return false;
    const opening = MAP_TOP + goal.row * 32;
    const feet = a.body.bounds.max.y;
    if (feet >= opening - 40) return false;
    const support = this.solids.find(
      (s) =>
        !s.headOnly &&
        a.body.bounds.max.x > s.bounds.min.x &&
        a.body.bounds.min.x < s.bounds.max.x &&
        Math.abs(s.bounds.min.y - feet) < 3,
    );
    if (!support) return false;
    const ceilingTop = MAP_TOP + 2 * 32;
    return (
      Math.abs(support.bounds.min.y - ceilingTop) < 8 ||
      support.bounds.max.y < opening
    );
  }
  private npcCanDrop(a: Actor) {
    return (
      this.roomFor(a).data.type === "castle" || this.aboveExitCeiling(a)
    );
  }
  private tryNpcPipeEscape(n: Actor) {
    if (!n.warned) return false;
    const room = this.roomFor(n);
    const pipe = this.enterablePipe(n, true, true);
    if (!pipe) {
      n.pipeEscapeTried = undefined;
      return false;
    }
    if (this.isGoalPipeData(room, pipe)) return false;
    const key = `${room.data.id}:${pipe.column}:${pipe.row}`;
    if (n.pipeEscapeTried === key) return false;
    n.pipeEscapeTried = key;
    const roll = (this.pipeEscapeRandom ?? this.random)();
    if (roll >= T.npcPipeEscapeChance) return false;
    return this.tryPipe(n, true, true, true);
  }
  private tryPipe(
    actor: Actor,
    down: boolean,
    right: boolean,
    escape = false,
  ) {
    const pipe = this.enterablePipe(actor, down, right);
    if (!pipe) return false;
    const room = this.roomFor(actor);
    const destination =
      pipe.destinations.find((d) => d.world === this.level.world) ??
      (room.data.id === "29" ? { area: this.level.main, page: 0 } : undefined);
    if (!destination) return false;
    if (this.warpLevelFor(destination) !== undefined && actor !== this.player)
      return false;
    const wasHuge = this.isHuge(actor);
    if (wasHuge) this.expireHuge(actor);
    const dir = pipe.direction === "down" ? "down" : "right";
    const vis = this.pipeVisual(actor);
    const left = room.offset + pipe.column * 32;
    const destLevel = this.warpLevelFor(destination);
    // Side pipes and castle down pipes set AltEntranceControl=2 (rise).
    // Other down pipes use the destination header.entrance. Warp pipes skip
    // worlds and spawn at that world's first stage (HandlePipeEntry).
    const arrival =
      destLevel !== undefined
        ? "warp"
        : dir === "right" || room.data.type === "castle"
          ? "rise"
          : this.headerArrival(destination.area);
    if (dir === "down")
      Body.setPosition(actor.body, {
        x: left + pipe.width * 16,
        y: MAP_TOP + pipe.row * 32 - actor.body.height / 2,
      });
    Body.setVelocity(actor.body, { x: 0, y: 0 });
    Body.setFrozen(actor.body, true);
    actor.pipeTravel = {
      phase: "enter",
      dir,
      remaining:
        dir === "down"
          ? vis.h
          : Math.max(vis.w, left + vis.w / 2 - actor.body.position.x),
      destArea: destination.area,
      destPage: destination.page,
      arrival,
      destLevel,
      clip: pipeClip(room.offset, room.data.width * 32, pipe, dir),
      escape: escape || undefined,
    };
    actor.idleDrop = undefined;
    actor.facing = dir === "down" ? actor.facing : 1;
    actor.navVx = undefined;
    actor.navDelay = undefined;
    actor.navHoldX = undefined;
    actor.navBackoff = undefined;
    actor.swimPath = undefined;
    if (actor === this.player && !wasHuge) this.events.push("pipe");
    return true;
  }
  private updatePipeTravel(dt: number) {
    const step = T.pipeSpeed * dt * 60;
    for (const actor of [this.player, ...this.npcs, this.mario]) {
      const travel = actor.pipeTravel;
      if (!travel) continue;
      const move = Math.min(step, travel.remaining);
      const p = actor.body.position;
      if (travel.dir === "down")
        Body.setPosition(actor.body, { x: p.x, y: p.y + move });
      else if (travel.dir === "up")
        Body.setPosition(actor.body, { x: p.x, y: p.y - move });
      else if (travel.dir === "right")
        Body.setPosition(actor.body, { x: p.x + move, y: p.y });
      else Body.setPosition(actor.body, { x: p.x - move, y: p.y });
      travel.remaining -= move;
      if (travel.remaining > 0) continue;
      if (travel.phase === "enter" && travel.escape) {
        actor.pipeTravel = undefined;
        this.save(actor);
        continue;
      }
      if (travel.phase === "enter") {
        this.beginPipeExit(actor, travel);
        if (this.mode !== "playing" && this.mode !== "finishing") return;
      } else this.endPipeTravel(actor);
    }
  }
  private beginPipeExit(
    actor: Actor,
    travel: NonNullable<Actor["pipeTravel"]>,
  ) {
    if (
      travel.arrival === "warp" &&
      actor === this.player &&
      travel.destLevel !== undefined
    ) {
      this.warpTo(travel.destLevel);
      return;
    }
    if (travel.arrival === "warp") travel = { ...travel, arrival: "stand" };
    const target = this.loadRoom(travel.destArea);
    actor.areaId = target.data.id;
    const vis = this.pipeVisual(actor);
    const height = actor.body.height;
    if (travel.arrival === "rise") {
      const dest = this.pipeOnPage(target, travel.destPage);
      if (dest) {
        const left = target.offset + dest.column * 32,
          top = MAP_TOP + dest.row * 32,
          clip = pipeClip(
            target.offset,
            target.data.width * 32,
            dest,
            "up",
          );
        Body.setPosition(actor.body, {
          x: left + dest.width * 16,
          y: top + vis.h - height / 2,
        });
        actor.pipeTravel = {
          phase: "exit",
          dir: "up",
          remaining: vis.h,
          destArea: travel.destArea,
          destPage: travel.destPage,
          arrival: travel.arrival,
          clip,
        };
        if (actor === this.player) this.events.push("pipe");
        return;
      }
      this.standAt(actor, target, this.pipeSpawnX(target, travel.destPage));
      this.finishPipeArrival(actor, true);
      if (actor === this.player) this.events.push("pipe");
      return;
    }
    const spawnX =
      travel.arrival === "stand"
        ? this.pipeSpawnX(target, travel.destPage)
        : this.pipeFallX(target, travel.destPage, actor);
    if (travel.arrival === "stand") {
      this.standAt(actor, target, spawnX);
      this.finishPipeArrival(actor, true);
      if (actor === this.player) this.events.push("pipe");
      return;
    }
    const top =
      travel.arrival === "drop" ? MAP_TOP + 0x50 * 2 : MAP_TOP - 48;
    Body.setPosition(actor.body, {
      x: spawnX,
      y: top + height / 2,
    });
    actor.facing = 1;
    this.finishPipeArrival(actor, false);
    if (actor === this.player) this.events.push("pipe");
  }
  private standAt(actor: Actor, room: Room, x: number) {
    if (!room.standOnFloor(actor, x)) room.dropOnto(actor, x);
    actor.facing = 1;
  }
  private warpTo(levelIndex: number) {
    const flower = this.player.flower,
      scale = this.player.scale,
      starLeft = this.player.starLeft;
    this.levelIndex = levelIndex;
    this.reset("intro");
    if (scale !== this.player.scale) this.resize(this.player, scale, false);
    this.player.flower = flower;
    this.player.starLeft = starLeft;
  }
  private finishPipeArrival(actor: Actor, grounded: boolean) {
    actor.pipeTravel = undefined;
    actor.pipeWait = T.pipeCooldown;
    actor.homeX = actor.body.position.x;
    actor.grounded = grounded;
    Body.setFrozen(actor.body, false);
    Body.setVelocity(actor.body, { x: 0, y: 0 });
    if (actor === this.player && actor.areaId === this.level.main)
      this.endPipeIntro();
  }
  private endPipeTravel(actor: Actor) {
    this.finishPipeArrival(actor, true);
  }
  private endPipeIntro() {
    if (!this.pipeIntro) return;
    this.pipeIntro = false;
    for (const npc of this.npcs) Body.setFrozen(npc.body, false);
  }
  private hostRoom(block: Obstacle) {
    for (const room of this.rooms.values())
      if (room.obstacles.includes(block)) return room;
  }
  private sproutVine(block: Obstacle) {
    if (this.vines.some((vine) => vine.block === block)) return;
    const room = this.hostRoom(block);
    if (!room) return;
    const column = Math.round((block.x - room.offset - 16) / 32);
    const dest = vineDestination(room.data, column, this.level.world);
    const bottomY = block.y - T.brickSize / 2;
    this.vines.push({
      id: this.nextId++,
      x: block.x,
      bottomY,
      height: 0,
      maxHeight: Math.max(T.brickSize, bottomY - MAP_TOP),
      destArea: dest?.area,
      destPage: dest?.page ?? 0,
      areaId: room.data.id,
      block,
    });
  }
  private ensureDestVine(room: Room) {
    const existing = this.vines.find(
      (vine) => vine.areaId === room.data.id && !vine.block,
    );
    if (existing) return existing;
    const x = room.offset + vineExitColumn(room.data) * 32 + 16;
    const bottomY = MAP_TOP + 16 * 32;
    const top = MAP_TOP + 10 * 32;
    const vine: Vine = {
      id: this.nextId++,
      x,
      bottomY,
      height: bottomY - top,
      maxHeight: bottomY - top,
      destPage: 0,
      areaId: room.data.id,
    };
    this.vines.push(vine);
    return vine;
  }
  private beginClimb(actor: Actor, vine: Vine) {
    actor.climbing = vine;
    actor.idleDrop = undefined;
    Body.setFrozen(actor.body, true);
    Body.setPosition(actor.body, { x: vine.x, y: actor.body.position.y });
  }
  private endClimb(actor: Actor) {
    actor.climbing = undefined;
    Body.setFrozen(actor.body, false);
  }
  private jumpOffVine(actor: Actor, input: Input) {
    this.endClimb(actor);
    actor.vineIgnore = T.vineIgnore;
    const dx = Number(input.right) - Number(input.left);
    if (dx) actor.facing = dx;
    const vx = dx * (input.run ? T.runSpeed : T.walkSpeed);
    const arc = jumpArc(vx);
    actor.jumpHoldG = arc.hold;
    actor.jumpFallG = arc.fall;
    Body.setVelocity(actor.body, { x: vx, y: -arc.impulse });
    actor.grounded = false;
    actor.jumpHeld = true;
    if (actor === this.player) this.events.push("jump");
  }
  private enterVineDest(actor: Actor, vine: Vine) {
    if (!vine.destArea) return;
    const from = this.roomFor(actor);
    actor.vineReturn = {
      area: from.data.id,
      page: Math.max(0, Math.floor((actor.body.position.x - from.offset) / 512)),
    };
    const target = this.loadRoom(vine.destArea);
    actor.areaId = target.data.id;
    const dest = this.ensureDestVine(target);
    actor.climbing = dest;
    Body.setPosition(actor.body, {
      x: dest.x,
      y: dest.bottomY - actor.body.height / 2 - 8,
    });
  }
  private updateVines(dt: number) {
    const grow = T.vineGrowSpeed * dt * 60;
    for (const vine of this.vines)
      vine.height = Math.min(vine.maxHeight, vine.height + grow);
  }
  private updateClimb(actor: Actor, input: Input, dt: number) {
    const vine = actor.climbing;
    if (!vine) return;
    if (vine.areaId !== this.roomFor(actor).data.id || this.isHuge(actor)) {
      this.endClimb(actor);
      return;
    }
    const step = T.vineClimbSpeed * dt * 60;
    let y = actor.body.position.y;
    if (input.up) y -= step;
    else if (input.down) y += step;
    const top = vine.bottomY - vine.height + actor.body.height / 2;
    const bottom = vine.bottomY - actor.body.height / 2;
    y = bottom >= top ? Math.min(bottom, Math.max(top, y)) : bottom;
    Body.setPosition(actor.body, { x: vine.x, y });
    const jumpEdge = input.jump && !this.jumped;
    const upEdge = input.up && !this.wasUp;
    if (jumpEdge && !(input.up && upEdge)) this.jumpOffVine(actor, input);
    else if (
      bottom >= top &&
      actor.climbing?.destArea &&
      actor.body.bounds.min.y <= MAP_TOP + 0.5
    )
      this.enterVineDest(actor, vine);
  }
  private tryGrabVine(actor: Actor) {
    if (
      actor !== this.player ||
      this.onVine(actor) ||
      this.inPipe(actor) ||
      (actor.vineIgnore ?? 0) > 0 ||
      this.isHuge(actor) ||
      !actor.alive ||
      actor.saved
    )
      return;
    const room = this.roomFor(actor);
    for (const vine of this.vines) {
      if (vine.areaId !== room.data.id || vine.height < 8) continue;
      if (
        !vine.block &&
        actor.body.bounds.max.y > MAP_TOP + 13 * 32 + 8
      )
        continue;
      if (Math.abs(actor.body.position.x - vine.x) > T.brickSize / 2 + 6)
        continue;
      const top = vine.bottomY - vine.height;
      if (actor.body.bounds.max.y < top - 2) continue;
      if (actor.body.bounds.min.y > vine.bottomY + 2) continue;
      this.beginClimb(actor, vine);
      return;
    }
  }
  private returnFromBonus(actor: Actor) {
    const room = this.roomFor(actor);
    if (room.data.goal) return false;
    const dest =
      room.data.destinations
        .filter((d) => d.world === this.level.world)
        .at(-1) ?? actor.vineReturn;
    if (!dest) return false;
    if (this.onVine(actor)) this.endClimb(actor);
    const target = this.loadRoom(dest.area);
    actor.areaId = target.data.id;
    const x = target.offset + dest.page * 512 + 100;
    target.dropOnto(actor, x);
    Body.setFrozen(actor.body, false);
    actor.pipeWait = T.pipeCooldown;
    return true;
  }
  loadRoom(id: string) {
    let room = this.rooms.get(id);
    if (room) return room;
    room = new Room(
      this.physics,
      id,
      this.rooms.size * T.areaSpacing,
      this.terrainId,
    );
    this.terrainId += room.obstacles.length;
    this.rooms.set(id, room);
    this.solids.push(...room.solids);
    this.obstacles.push(...room.obstacles);
    if (this.npcs.length) this.spawnLevelActors(room);
    this.spawnBowser(room);
    return room;
  }

  private spawnBowser(room: Room) {
    const spawn = room.bowserSpawn;
    if (!spawn || this.bowsers.some((b) => b.areaId === room.data.id)) return;
    let minX = spawn.x - 80,
      maxX = spawn.x + 80;
    for (let column = 0; column < room.data.width; column++)
      for (let row = 0; row < room.data.height; row++)
        if (room.data.tiles[row][column] === 137) {
          const x = room.offset + column * 32 + 16;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
    this.bowsers.push({
      id: this.nextId++,
      areaId: room.data.id,
      x: spawn.x,
      y: spawn.y,
      facing: -1,
      alive: true,
      fireWait: T.bowserFlamePeriod * 0.4,
      shoutWait: 0,
      blockWait: 0,
      minX: minX + T.bowserWidth / 2,
      maxX: maxX - T.bowserWidth / 2,
    });
  }
  solids: Body[] = [];
  player!: Actor;
  npcs: Actor[] = [];
  mario!: Actor;
  obstacles: Obstacle[] = [];
  fireballs: Fireball[] = [];
  bulletBills: BulletBill[] = [];
  bowsers: Bowser[] = [];
  bowserFlames: BowserFlame[] = [];
  items: Item[] = [];
  vines: Vine[] = [];
  particles: Particle[] = [];
  events: GameEvent[] = [];
  mode: Mode = "title";
  elapsed = 0;
  warned = 0;
  saved = 0;
  coins = 0;
  score = 0;
  phase = 0;
  cooldown = 0;
  audible = 0;
  shouts: Shout[] = [];
  get bubble() {
    return this.shouts.at(-1)?.text ?? "";
  }
  get bubbleLeft() {
    return this.shouts.at(-1)?.left ?? 0;
  }
  timeLeft = 0;
  hurry = false;
  marioKills = 0;
  tallyPhase: TallyPhase = "";
  tallyHold = 0;
  fireworksTotal = 0;
  private fireworksLeft = 0;
  private fireworkWait = 0;
  private fireworksArmed = false;
  private finishElapsed = 0;
  deadLeft = 0;
  marioActive = false;
  marioEntered = false;
  marioReturn = T.firstMarioAt as number;
  marioDecision = 0;
  marioChase = 0;
  marioIgnore = 0;
  marioTarget: number | null = null;
  marioAim = 0;
  marioReaction = 0;
  marioLook = 0;
  marioSeenAgo = 0;
  marioJumpWait = 0;
  marioPause = 0;
  marioRunning = false;
  marioCrowd = 0;
  marioPressure = 0;
  marioStun = 0;
  marioDeath: { x: number; y: number; vy: number; age: number } | null = null;
  playerDeath: { x: number; y: number; vy: number; age: number } | null = null;
  marioStage: 0 | 1 | 2 = 0;
  brickTarget: number | null = null;
  cameraX = 0;
  cameraY = 0;
  cameraZoom = 1;
  viewWidth = 960;
  private flagPrevPlayerX = 0;
  private flagPrevMarioX = 0;
  lives: number = T.startingLives;
  introLeft = 0;
  gameoverLeft = 0;
  coinPops: CoinPop[] = [];
  pipeIntro = false;
  private spawnedLevelIndex = -1;
  private retrySpawn = false;
  private nextId = 1;
  private jumped = false;
  private wasUp = false;
  private playerPace = T.walkSpeed as number;
  private bouncedNpcs = new Set<Actor>();
  private shellStomps = new Set<Actor>();
  private timerAcc = 0;
  private timerStarted = false;
  private awarded = { warned: 0, saved: 0, died: 0, flag: false, mario: 0 };
  random: () => number;
  pipeEscapeRandom?: () => number;

  constructor(random = Math.random, physics = new PhysicsWorld()) {
    this.physics = physics;
    this.random = random;
    this.reset("title");
  }

  reset(mode: Mode = "playing") {
    const keepCampaign =
      mode === "intro" && this.mode !== "title" && this.mode !== "gameover";
    const score = keepCampaign ? this.score : 0;
    const coins = keepCampaign ? this.coins : 0;
    this.physics.clear();
    this.nextId = 1;
    this.solids = [];
    this.obstacles = [];
    this.rooms.clear();
    this.npcs = [];
    this.terrainId = 0;
    this.bowsers = [];
    this.bowserFlames = [];
    const retry =
      mode !== "title" &&
      this.retrySpawn &&
      this.spawnedLevelIndex === this.levelIndex;
    const hasStrip = this.level.route[0] !== this.level.main;
    const skipStrip = retry && hasStrip;
    this.pipeIntro = hasStrip && !skipStrip && mode !== "title";
    this.spawnedLevelIndex = this.levelIndex;
    this.retrySpawn = mode !== "title";
    const main = this.loadRoom(this.level.main);
    this.player = this.actor(100, "goomba");
    const entry = this.loadRoom(
      skipStrip ? this.level.main : this.level.route[0],
    );
    this.loadStageWaterRooms();
    this.player.areaId = entry.data.id;
    entry.place(this.player, entry.offset + 100);
    this.npcs = [];
    if (mode !== "title") {
      const occupied = new Set<string>();
      let raisedLeft = Math.round(T.population * T.elevatedSpawnShare);
      this.npcs = Array.from({ length: T.population }, (_, i) => {
        const x =
          main.offset +
          390 +
          i * ((main.goalX - main.offset - 650) / T.population) +
          this.random() * 65;
        return this.actor(x, i % 3 === 1 ? "koopa" : "goomba");
      });
      for (const actor of this.npcs) {
        if (raisedLeft && main.place(actor, actor.homeX, "brick", occupied))
          raisedLeft--;
      }
      for (const actor of this.npcs) {
        if (
          !actor.grounded &&
          raisedLeft &&
          main.place(actor, actor.homeX, "lid", occupied)
        )
          raisedLeft--;
      }
      for (const actor of this.npcs) {
        if (!actor.grounded) main.place(actor, actor.homeX, "low", occupied);
      }
    }
    for (const room of this.rooms.values()) this.spawnLevelActors(room);
    if (this.pipeIntro)
      for (const npc of this.npcs) Body.setFrozen(npc.body, true);
    this.mario = this.actor(entry.offset - 200, "mario");
    this.mario.areaId = entry.data.id;
    this.setMarioStage(1);
    Body.setFrozen(this.mario.body, true);
    this.mode = mode;
    this.elapsed =
      this.warned =
      this.saved =
      this.phase =
      this.cooldown =
      this.audible =
        0;
    this.shouts = [];
    this.score = score;
    this.coins = coins;
    this.deadLeft = 0;
    this.timeLeft = stageTimer(main.data);
    this.timerAcc = 0;
    this.timerStarted = false;
    this.hurry = false;
    this.marioKills = 0;
    this.tallyPhase = "";
    this.tallyHold = 0;
    this.fireworksTotal = 0;
    this.fireworksLeft = 0;
    this.fireworkWait = 0;
    this.fireworksArmed = false;
    this.finishElapsed = 0;
    this.awarded = { warned: 0, saved: 0, died: 0, flag: false, mario: 0 };
    this.introLeft = mode === "intro" ? T.introSeconds : 0;
    this.gameoverLeft = 0;
    this.marioActive = false;
    this.marioEntered = false;
    this.marioReturn = T.firstMarioAt;
    this.marioDecision = this.marioChase = this.marioIgnore = 0;
    this.brickTarget = null;
    this.marioCrowd = this.marioPressure = 0;
    this.marioRunning = false;
    this.marioStun = 0;
    this.marioDeath = this.playerDeath = null;
    this.marioStage = 1;
    this.marioTarget = null;
    this.marioAim =
      this.marioReaction =
      this.marioLook =
      this.marioSeenAgo =
      this.marioJumpWait =
      this.marioPause =
        0;
    this.cameraX = 0;
    this.cameraY = 0;
    this.cameraZoom = 1;
    this.fireballs = [];
    this.bulletBills = [];
    this.items = [];
    this.vines = [];
    this.coinPops = [];
    this.particles = [];
    this.events = [];
    this.jumped = false;
    this.wasUp = false;
    this.playerPace = T.walkSpeed;
    this.bouncedNpcs.clear();
    this.flagPrevPlayerX = this.player.body.position.x;
    this.flagPrevMarioX = this.mario.body.position.x;
    this.shellStomps.clear();
  }

  private loadStageWaterRooms() {
    const world = this.level.world;
    for (const room of [...this.rooms.values()]) {
      for (const dest of room.data.destinations) {
        if (dest.world !== world) continue;
        if (areaData(dest.area).type === "water") this.loadRoom(dest.area);
      }
    }
  }

  private spawnLevelActors(room: Room) {
    if (room.spawnedActors) return;
    room.spawnedActors = true;
    if (room.data.type !== "water") return;
    for (const enemy of room.data.enemies) {
      if (enemyRole(enemy.type) !== "fish") continue;
      const x = room.offset + enemy.column * 32 + 16;
      const y = MAP_TOP + enemy.row * 32 + 16;
      const fish = this.actor(x, "fish");
      fish.areaId = room.data.id;
      Body.setPosition(fish.body, { x, y });
      Body.setVelocity(fish.body, { x: 0, y: 0 });
      fish.homeX = x;
      fish.grounded = false;
      if (overlaps(fish.body, room.solids, 0.01).length) this.fitActor(fish);
      for (let nudge = 0; nudge < 4; nudge++) {
        if (!this.npcs.some((other) => this.overlapActors(fish, other))) break;
        Body.setPosition(fish.body, {
          x: fish.body.position.x + 32,
          y: fish.body.position.y,
        });
        fish.homeX = fish.body.position.x;
        if (overlaps(fish.body, room.solids, 0.01).length) this.fitActor(fish);
      }
      this.npcs.push(fish);
    }
  }

  private actor(x: number, kind: Actor["kind"]): Actor {
    const body = this.physics.rectangle(
      x,
      T.groundY - 18,
      24,
      kind === "mario" ? 38 : 28,
      false,
    );
    return {
      id: this.nextId++,
      areaId: this.level.main,
      body,
      kind,
      alive: true,
      saved: false,
      warned: false,
      fear: this.random(),
      reaction: 0.15 + this.random() * 0.75,
      speed: 2.1 + this.random() * 0.85,
      state: "idle",
      wait: 0,
      facing: 1,
      grounded: false,
      homeX: x,
      idleWait: 1 + (this.nextId % 4) * 0.3,
      idleWalking: true,
      scale: 1,
      transformLeft: 0,
      transformFrom: 1,
      starLeft: 0,
      hugeLeft: 0,
      exclaimLeft: 0,
      flower: false,
      shell: "none",
      wakeLeft: 0,
      kickIgnore: 0,
      vineIgnore: 0,
      vineReturn: undefined,
      shellKicker: 0,
      blockedFor: 0,
      lastX: x,
    };
  }

  position(a: Actor) {
    return a.body.position;
  }
  living() {
    return this.npcs.filter((n) => n.alive && !n.saved).length;
  }
  died() {
    return this.npcs.length - this.saved - this.living();
  }
  private ground(a: Actor) {
    const bottom = a.body.bounds.max.y;
    const onLid = this.solids.some(
      (s) =>
        !s.headOnly &&
        a.body.bounds.max.x > s.bounds.min.x + 0.01 &&
        a.body.bounds.min.x < s.bounds.max.x - 0.01 &&
        Math.abs(bottom - s.bounds.min.y) < 12,
    );
    const holdFloor = hugeHoldFloor(
      a.body.volumeHoldFloor,
      this.solids,
      a.body.bounds.min.x,
      a.body.width,
      a.body.volumeHoldFloorSpan,
    );
    const holdVolume = hugeHoldVolume(
      a.body.volumeHoldVolume,
      this.solids,
      a.body.bounds.min.x,
      a.body.width,
      a.body.volumeHoldVolumeSpan,
      a.body.volumeHoldFloorSpan,
      a.body.volumeHoldY,
    );
    const persist =
      a.body.volumeHoldY !== undefined &&
      holdFloor !== undefined &&
      holdVolume !== undefined &&
      Math.abs(bottom - a.body.volumeHoldY) < 12 &&
      hugeFlushWithFloor(
        a.body.volumeHoldY,
        a.body.bounds.min.x,
        a.body.width,
        this.solids,
        holdFloor,
        holdVolume,
      );
    const inVolume =
      a.body.ignoreWalls &&
      (hugeFloorAt(bottom, a.body.bounds.min.x, a.body.width, this.solids) ||
        persist) &&
      this.solids.some(
        (s) =>
          !s.headOnly &&
          s.passHuge !== "top" &&
          a.body.bounds.max.x > s.bounds.min.x + 0.01 &&
          a.body.bounds.min.x < s.bounds.max.x - 0.01 &&
          s.bounds.min.y < bottom - 6 &&
          s.bounds.max.y >= bottom - 6,
      );
    a.grounded = (onLid || inVolume) && Math.abs(a.body.velocity.y) < 1;
  }
  private move(a: Actor, vx: number) {
    if (a !== this.player && !a.grounded && a.navVx !== undefined) {
      // Keep the planned launch velocity so a reverse takeoff is not flipped.
      if ((a.navDelay ?? 0) > 0) vx = 0;
      else vx = a.navVx;
    }
    Body.setVelocity(a.body, { x: vx, y: a.body.velocity.y });
    if (vx) a.facing = Math.sign(vx);
  }
  private wallAhead(a: Actor, direction: number, solids: Body[] = this.solids) {
    if (a.body.ignoreWalls) return false;
    const p = a.body.position,
      feet = a.body.bounds.max.y,
      half = a.body.width / 2;
    return solids.some(
      (s) =>
        !s.headOnly &&
        p.x + direction * (half + 30) > s.bounds.min.x &&
        p.x + direction * (half + 30) < s.bounds.max.x &&
        feet > s.bounds.min.y + 5 &&
        a.body.bounds.min.y < s.bounds.max.y,
    );
  }
  private launchJump(a: Actor, vx: number, impulse: number, delay = 0) {
    a.navVx = vx;
    a.navDelay = delay;
    if (delay > 0) a.navHoldX = a.body.position.x;
    this.move(a, vx);
    this.jump(a, impulse);
    this.move(a, delay > 0 ? 0 : vx);
  }
  setMarioStage(stage: 0 | 1 | 2, blink = false) {
    if (!this.mario) {
      this.marioStage = stage;
      return;
    }
    this.marioStage = stage;
    this.mario.flower = stage === 2;
    if (this.isHuge(this.mario)) return;
    this.resize(this.mario, stage === 0 ? 0.5 : 1, blink);
  }
  private runSpeedFor(a: Actor) {
    if (a === this.player || a === this.mario) return T.runSpeed;
    return T.runSpeed;
  }
  private jump(a: Actor, impulse?: number) {
    const water = this.roomFor(a).data.type === "water";
    if (!a.grounded && !water) return;
    const arc = jumpArc(a.body.velocity.x);
    if (a === this.player || a === this.mario) {
      a.jumpHoldG = arc.hold;
      a.jumpFallG = arc.fall;
    } else {
      a.jumpHoldG = T.jumpHoldGravity;
      a.jumpFallG = T.npcJumpFallGravity;
    }
    Body.setVelocity(a.body, {
      x: a.body.velocity.x,
      y: -(water
        ? T.swimImpulse
        : (impulse ?? arc.impulse)),
    });
    a.grounded = false;
    if (!water) a.jumpHeld = true;
    if (a === this.player) this.events.push("jump");
  }
  private autoJump(a: Actor, direction: number) {
    if (!a.grounded) return;
    const p = a.body.position,
      feet = a.body.bounds.max.y;
    const half = a.body.width / 2;
    const ahead = p.x + direction * (half + 8);
    const solids = this.solids.filter(
      (s) =>
        !s.headOnly && s.bounds.max.x > p.x - 400 && s.bounds.min.x < p.x + 400,
    );
    const support = solids.find(
      (s) =>
        p.x + half > s.bounds.min.x &&
        p.x - half < s.bounds.max.x &&
        Math.abs(s.bounds.min.y - feet) < 3,
    );
    const inWell =
      !!support && !support.motion && enclosedWell(solids, support.bounds);
    const supported = solids.some(
      (s) =>
        ahead > s.bounds.min.x &&
        ahead < s.bounds.max.x &&
        ((s.bounds.min.y >= feet - 5 &&
          s.bounds.min.y <= feet + 32 &&
          (a === this.mario || !enclosedWell(solids, s.bounds))) ||
          (a.body.ignoreWalls &&
            s.passHuge !== "top" &&
            hugeHoldAt(feet, ahead, 1, this.solids, a.body) &&
            s.bounds.min.y < feet - 5 &&
            s.bounds.max.y >= feet - 5)),
    );
    const wall = this.wallAhead(a, direction, solids);
    if (a !== this.mario && this.firebarSoon(a, direction)) {
      this.move(a, 0);
      return;
    }
    if (supported && !wall && (a === this.mario || !inWell)) return;
    if (a === this.mario) {
      if (wall) {
        // Collision zeros vx against a flush wall, so a standing hop cannot clear it.
        const pace = this.runSpeedFor(a);
        const impulse = this.roomFor(a).onSpring(a)
          ? T.springImpulse
          : T.runJumpSpeed;
        const arc = jumpArc(pace);
        const gravity = { hold: arc.hold, fall: arc.fall };
        const launch =
          planJump(
            a.body,
            solids,
            direction,
            pace,
            impulse,
            undefined,
            false,
            gravity,
          ) ??
          planJump(
            a.body,
            solids,
            -direction,
            pace,
            impulse,
            undefined,
            false,
            gravity,
          );
        if (launch) this.launchJump(a, launch.vx, impulse, launch.delay);
        else this.move(a, -direction * pace);
        return;
      }
      this.jump(a);
      return;
    }
    const safeDrop = solids.some(
      (s) =>
        ahead > s.bounds.min.x &&
        ahead < s.bounds.max.x &&
        s.bounds.min.y > feet &&
        s.bounds.min.y <= T.groundY &&
        !enclosedWell(solids, s.bounds),
    );
    const dropDown = this.npcCanDrop(a);
    if (!supported && !wall && dropDown) {
      if (support) {
        const x =
          direction > 0
            ? support.bounds.max.x + half + 0.5
            : support.bounds.min.x - half - 0.5;
        const probe = new Body(x, p.y, a.body.width, a.body.height);
        const drop = planJump(
          probe,
          solids,
          direction,
          this.runSpeedFor(a),
          0,
          (landing) => landing.y > p.y + 16,
          true,
        );
        if (drop && Math.abs(x - p.x) < a.body.width + 40) {
          a.navDrop = { x, vx: drop.vx, delay: drop.delay };
          return;
        }
      }
    }
    if ((dropDown || a.navDetourBelow) && !wall && safeDrop && !supported)
      return;
    if ((a.navRetry ?? 0) > 0 && !inWell) {
      if (!supported) this.move(a, 0);
      return;
    }
    const pace = this.runSpeedFor(a);
    const impulse = this.roomFor(a).onSpring(a)
      ? T.springImpulse
      : jumpArc(pace).impulse;
    const launch = planJump(
      a.body,
      solids,
      direction,
      pace,
      impulse,
      (landing) =>
        a === this.mario ||
        !this.firebarBlocks(
          this.roomFor(a),
          landing.x,
          landing.y,
          half,
          a.body.height / 2,
        ),
      dropDown,
    );
    if (launch) {
      this.launchJump(a, launch.vx, impulse, launch.delay);
    } else if (inWell) {
      const reverse = planJump(
        a.body,
        solids,
        -direction,
        pace,
        impulse,
        (landing) => landing.y < p.y - 24,
      );
      if (reverse) {
        this.launchJump(a, reverse.vx, impulse, reverse.delay);
      } else {
        this.launchJump(a, direction * this.runSpeedFor(a), impulse, 18);
      }
    } else if (a.body.ignoreWalls) return;
    else {
      if (!wall && (safeDrop || a.navDetourBelow)) {
        const drop = planJump(
          a.body,
          solids,
          direction,
          this.runSpeedFor(a),
          0,
        );
        if (drop) {
          this.move(a, drop.vx);
          a.navVx = drop.vx;
          a.navDelay = 0;
          return;
        }
      }
      a.navRetry = 0.15;
      if (support && !support.motion && !this.roomFor(a).onSpring(a)) {
        const fromX =
          direction > 0
            ? Math.min(p.x, support.bounds.max.x - half - 1)
            : Math.max(p.x, support.bounds.min.x + half + 1);
        for (let distance = 32; distance <= 256; distance += 32) {
          const x = fromX - direction * distance;
          if (
            x - half < support.bounds.min.x ||
            x + half > support.bounds.max.x
          )
            break;
          const probe = new Body(x, p.y, a.body.width, a.body.height);
          if (overlaps(probe, solids, 0.1).some((s) => s !== support)) continue;
          if (
            solids.some(
              (s) =>
                s !== support &&
                x + half > s.bounds.min.x &&
                x - half < s.bounds.max.x &&
                s.bounds.max.y < feet - 2 &&
                s.bounds.min.y > p.y - 240,
            )
          )
            continue;
          const retry = planJump(probe, solids, direction, pace, impulse);
          if (
            retry &&
            ((retry.x - p.x) * direction > 24 || retry.y < p.y - 32)
          ) {
            a.navBackoff = { x, vx: retry.vx, delay: retry.delay };
            break;
          }
        }
      }
      if (!a.navBackoff && !a.navDetourBelow) {
        const reverse = planJump(
          a.body,
          solids,
          -direction,
          pace,
          impulse,
          (landing) => landing.y < p.y - 24,
        );
        if (reverse) {
          this.launchJump(a, reverse.vx, impulse, reverse.delay);
          return;
        }
        const barrier = solids.find(
          (s) =>
            p.x + direction * (half + 30) > s.bounds.min.x &&
            p.x + direction * (half + 30) < s.bounds.max.x &&
            feet > s.bounds.min.y + 5 &&
            a.body.bounds.min.y < s.bounds.max.y,
        );
        if (
          support &&
          barrier &&
          support.bounds.max.y < T.groundY &&
          barrier.bounds.max.y < T.groundY
        )
          a.navDetourBelow =
            Math.max(support.bounds.max.y, barrier.bounds.max.y) +
            a.body.height;
      }
      if (!supported) this.move(a, 0);
    }
  }
  warn() {
    if (this.mode !== "playing") return;
    this.cooldown = T.warningCooldown;
    this.audible = T.warningSound;
    const p = this.player.body.position;
    this.shouts.push({
      id: this.nextId++,
      text: PHRASES[Math.floor(this.random() * PHRASES.length)],
      left: T.bubbleTime,
      x: p.x,
      y: p.y - 42 * this.player.scale,
    });
    this.events.push("warn");
    for (const n of this.npcs) {
      if (
        !n.alive ||
        n.saved ||
        n.warned ||
        this.bouncedNpcs.has(n) ||
        (this.player.body.velocity.y > 0.2 &&
          this.fallingOntoNpc(n, this.player.body.bounds.max.y)) ||
        !this.withinWarningRange(n)
      )
        continue;
      n.warned = true;
      n.exclaimLeft = T.exclaimTime;
      n.idleDrop = undefined;
      n.wait = n.reaction;
      this.warned++;
    }
    if (this.marioActive) {
      const d = Math.abs(p.x - this.mario.body.position.x);
      if (d < T.hearingRange && this.random() < 1 - d / T.hearingRange)
        this.investigate(this.player, 2);
    }
  }

  kill(a: Actor, bloody = true) {
    if (!a.alive || a.saved || (a === this.player && this.mode !== "playing"))
      return;
    if (this.inPipe(a)) this.endPipeTravel(a);
    if (this.onVine(a)) this.endClimb(a);
    a.alive = false;
    if (bloody) {
      this.burst(a.body.position.x, a.body.position.y, true);
      this.events.push("splat");
    }
    this.physics.remove(a.body);
    if (a === this.player) {
      this.mode = "dead";
      this.deadLeft = T.deathSequenceSeconds;
      this.shouts = [];
      this.lives = Math.max(0, this.lives - 1);
      this.events.push("death");
      const pit = a.body.position.y > 640;
      this.playerDeath = {
        x: a.body.position.x,
        y: a.body.position.y,
        vy: pit ? 0 : -T.deathHopSpeed,
        age: pit ? T.deathHopDelay : 0,
      };
    }
  }

  invincible(a: Actor) {
    return a.starLeft > 0;
  }

  private isHuge(a: Actor) {
    return a.scale >= T.hugeScale;
  }

  displayScale(a: Actor) {
    if (a.transformLeft <= 0) return a.scale;
    const shown = T.transformSeconds - a.transformLeft;
    return Math.floor(shown * T.transformBlinkHz) % 2
      ? a.transformFrom
      : a.scale;
  }

  private resize(a: Actor, nextScale: number, blink: boolean) {
    const previous = a.scale;
    if (previous === nextScale) return;
    const feet = a.body.bounds.max.y;
    Body.scale(a.body, nextScale / previous, nextScale / previous);
    a.scale = nextScale;
    Body.setPosition(a.body, {
      x: a.body.position.x,
      y: feet - a.body.height / 2,
    });
    if (blink) {
      a.transformFrom = previous;
      a.transformLeft = T.transformSeconds;
    } else a.transformLeft = 0;
  }

  private shrinking(a: Actor) {
    // Damage i-frames only. 8x expiry blinks from hugeScale and stays hitable.
    return (
      a.transformLeft > 0 &&
      a.transformFrom > a.scale &&
      a.transformFrom < T.hugeScale
    );
  }

  private hurt(a: Actor) {
    if (
      !a.alive ||
      a.saved ||
      a.starLeft > 0 ||
      this.isHuge(a) ||
      this.shrinking(a)
    )
      return false;
    if (a.scale > 1) {
      a.flower = false;
      this.setGoombaScale(a, 1, true);
      this.events.push("shrink");
      return true;
    }
    this.kill(a);
    return true;
  }

  hitBlock(c: Obstacle, hitter: Actor) {
    if (c.broken || c.kind !== "brick" || c.bounce > 0) return;
    this.collectCoinsOnBlock(c, hitter);
    this.bumpActorsOnBlock(c, hitter);
    const prize =
      c.content === "1-up" ||
      c.content === "vine" ||
      (c.hidden && c.content === "coin");
    if (
      !c.question &&
      !prize &&
      (hitter === this.mario || (hitter === this.player && hitter.scale > 1))
    ) {
      this.breakBrick(c);
      return;
    }
    c.bounce = T.blockBounceSeconds;
    if (c.used) {
      this.events.push("bump");
      return;
    }
    if (c.hidden && c.content === "coin") {
      this.reveal(c);
      this.popCoin(hitter, c.x, c.y);
      return;
    }
    if (c.content === "1-up") {
      this.reveal(c);
      this.events.push("bump");
      this.spawnItem(c, "oneUp", hitter.facing);
      return;
    }
    if (c.content === "vine") {
      this.reveal(c);
      this.sproutVine(c);
      this.events.push("bump");
      return;
    }
    this.events.push("bump");
    if (c.question) this.grantQuestionPrize(c, hitter, false);
  }

  private reveal(c: Obstacle) {
    c.used = true;
    if (c.body) c.body.headOnly = false;
  }

  dropCheatItem(kind: ItemKind) {
    if (this.mode !== "playing" || this.inPipe(this.player)) return null;
    const room = this.activeRoom;
    const p = this.player.body.position;
    const cell = firstEmptySpawnCell(
      room.solids,
      room.offset,
      room.data.width,
      p.x,
      p.y,
      0,
    );
    if (!cell) return null;
    const body = this.physics.rectangle(cell.x, cell.y, 24, 28, false);
    Body.setFrozen(body, true);
    const item: Item = {
      id: this.nextId++,
      kind,
      body,
      emerge: 0,
      originY: cell.y,
      direction: this.player.facing || 1,
      age: 0,
      hold: T.cheatDropHold,
      drop: true,
    };
    this.items.push(item);
    this.events.push("appear");
    return item;
  }

  private spawnItem(
    c: Obstacle,
    kind: ItemKind,
    facing: number,
    instant = false,
  ) {
    const body = this.physics.rectangle(c.x, c.y, 24, 28, false);
    Body.setFrozen(body, !instant);
    const item: Item = {
      id: this.nextId++,
      kind,
      body,
      emerge: instant ? 0 : 0.45,
      originY: c.y,
      direction: facing || 1,
      age: 0,
      hold: 0,
      block: c,
      smash: instant,
    };
    if (instant)
      Body.setVelocity(body, {
        x: item.direction * (kind === "star" ? 2.8 : 1.8),
        y: -8,
      });
    else this.setEmergeClip(item);
    this.items.push(item);
    return item;
  }

  private setEmergeClip(item: Item) {
    if (item.emerge <= 0) {
      item.clip = undefined;
      return;
    }
    const bouncedY = item.block
      ? blockDrawY(item.block.y, item.block.bounce)
      : item.originY;
    const top = bouncedY - T.brickSize / 2;
    const size = itemSpriteSize(item.kind);
    item.clip = {
      x: item.body.position.x - size / 2,
      y: 0,
      w: size,
      h: Math.max(1, top),
    };
  }

  private addPlayerCoin() {
    this.score += T.coinScore;
    this.coins++;
    this.events.push("coin");
    if (this.coins >= T.coinsForLife) {
      this.coins -= T.coinsForLife;
      this.lives++;
      this.events.push("oneUp");
    }
  }

  private creditCoin(owner: Actor) {
    if (owner === this.player) this.addPlayerCoin();
    else this.events.push("coin");
  }

  private popCoin(owner: Actor, x: number, y: number) {
    this.creditCoin(owner);
    this.coinPops.push({ x, y, age: 0 });
  }

  private collectCoin(coin: { collected: boolean }, collector: Actor) {
    if (coin.collected || !collector.alive || collector.saved) return;
    coin.collected = true;
    this.creditCoin(collector);
  }

  private collectCoinsOnBlock(block: Obstacle, collector: Actor) {
    const half = T.brickSize / 2;
    for (const room of this.rooms.values())
      for (const coin of room.coins) {
        if (
          coin.collected ||
          Math.abs(coin.x - block.x) >= half ||
          Math.abs(coin.y - (block.y - T.brickSize)) >= half
        )
          continue;
        this.collectCoin(coin, collector);
        if (!coin.collected) continue;
        this.coinPops.push({ x: coin.x, y: coin.y, age: 0 });
      }
  }

  private actorOnBlock(a: Actor, block: Obstacle) {
    const half = T.brickSize / 2;
    const top = block.y - half;
    return (
      a.body.bounds.max.y >= top - 2 &&
      a.body.bounds.max.y <= top + 8 &&
      a.body.bounds.max.x > block.x - half &&
      a.body.bounds.min.x < block.x + half
    );
  }

  private bumpActorsOnBlock(block: Obstacle, hitter: Actor) {
    for (const n of this.npcs) {
      if (!n.alive || n.saved || this.inPipe(n) || !this.actorOnBlock(n, block))
        continue;
      if (hitter === this.mario) {
        if (n.starLeft <= 0 && !this.isHuge(n)) this.kill(n);
        continue;
      }
      Body.setVelocity(n.body, {
        x: n.body.velocity.x,
        y: -T.stompBounce,
      });
      n.grounded = false;
    }
  }

  collect(a: Actor, item: Item) {
    if (!a.alive || a.saved || (a === this.mario && !this.marioActive)) return;
    if (item.kind === "oneUp") {
      this.physics.remove(item.body);
      this.items = this.items.filter((i) => i !== item);
      if (a !== this.mario) {
        this.lives++;
        this.events.push("oneUp");
      }
      return;
    }
    if (item.kind === "star") a.starLeft = T.starSeconds;
    if (a === this.mario) {
      if (item.kind === "flower") this.setMarioStage(2, this.marioStage === 0);
      if (isMushroom(item.kind)) {
        if (item.kind === "mushroom8x" && !this.isHuge(this.mario))
          this.setMarioHuge();
        else if (this.isHuge(this.mario) || this.marioStage !== 0)
          this.score += T.mushroomScore;
        else this.setMarioStage(1, true);
      }
    } else if (item.kind === "flower") a.flower = true;
    if (a !== this.mario && isMushroom(item.kind)) {
      const next = mushroomScale(item.kind);
      if (next > a.scale) this.setGoombaScale(a, next, true);
      else if (a === this.player) this.score += T.mushroomScore;
    }
    this.physics.remove(item.body);
    this.items = this.items.filter((i) => i !== item);
    this.events.push("power");
  }

  private rollMushroom(): MushroomKind {
    const roll = this.random();
    if (roll >= 1 - T.mushroom8xChance) return "mushroom8x";
    if (roll >= 1 - T.mushroom8xChance - T.mushroom3xChance) return "mushroom3x";
    return "mushroom";
  }

  private rollItem(): ItemKind {
    const kind = (["star", "mushroom", "flower"] as const)[
      Math.min(2, Math.floor(this.random() * 3))
    ];
    if (kind !== "mushroom") return kind;
    return this.rollMushroom();
  }

  private rollQuestionPrize(): ItemKind | "coin" {
    const kind = (["coin", "star", "mushroom", "flower"] as const)[
      Math.min(3, Math.floor(this.random() * 4))
    ];
    if (kind !== "mushroom") return kind;
    return this.rollMushroom();
  }

  private grantQuestionPrize(c: Obstacle, hitter: Actor, instant: boolean) {
    this.reveal(c);
    const prize = this.rollQuestionPrize();
    if (prize === "coin") {
      this.popCoin(hitter, c.x, c.y);
      return;
    }
    const item = this.spawnItem(c, prize, hitter.facing, instant);
    if (instant) item.ignoreActor = hitter;
    else this.events.push("appear");
  }

  private setGoombaScale(a: Actor, scale: number, blink = false) {
    this.resize(a, scale, blink);
    a.body.ignoreWalls = scale >= T.hugeScale;
    a.hugeLeft = scale >= T.hugeScale ? T.hugeSeconds : 0;
    if (scale < T.hugeScale) this.fitActor(a);
    else this.smashHuge(a);
  }

  private setMarioHuge() {
    if (this.marioStage === 0) this.marioStage = 1;
    this.resize(this.mario, T.hugeScale, true);
    this.mario.body.ignoreWalls = true;
    this.mario.hugeLeft = T.hugeSeconds;
    this.smashHuge(this.mario);
  }

  private expireHuge(a: Actor, fx = true) {
    if (!this.isHuge(a)) return;
    if (fx) this.events.push("shrink");
    if (a === this.mario) {
      a.hugeLeft = 0;
      a.body.ignoreWalls = false;
      this.marioStage = 1;
      this.mario.flower = false;
      this.resize(this.mario, 1, fx);
      this.fitActor(this.mario);
      return;
    }
    this.setGoombaScale(a, T.giantScale, fx);
  }

  private fitActor(a: Actor) {
    // Growing or shrinking must not leave the body embedded in scenery.
    for (let i = 0; i < 16; i++) {
      const hits = overlaps(a.body, this.solids, 0.1);
      if (!hits.length) return;
      const top = Math.min(...hits.map((hit) => hit.bounds.min.y));
      Body.setPosition(a.body, {
        x: a.body.position.x,
        y: top - a.body.height / 2 - 0.1,
      });
    }
    const originX = a.body.position.x;
    for (const dir of [1, -1]) {
      for (let step = 1; step <= 12; step++) {
        Body.setPosition(a.body, {
          x: originX + dir * step * 16,
          y: a.body.position.y,
        });
        if (!overlaps(a.body, this.solids, 0.1).length) return;
      }
    }
    Body.setPosition(a.body, { x: originX, y: a.body.position.y });
  }

  private smashHuge(a: Actor) {
    if (
      a.scale < T.hugeScale ||
      !a.alive ||
      a.saved ||
      this.inPipe(a) ||
      this.onVine(a)
    )
      return;
    const room = this.roomFor(a);
    for (const c of [...this.obstacles]) {
      if (c.broken || !c.body) continue;
      if (c.hidden && !c.used) continue;
      if (this.isGoalPipe(room, c)) continue;
      if (!this.smashContact(a, c)) continue;
      this.yieldSmashPrize(c, a);
      if (c.content === "vine") continue;
      this.breakSolid(c);
    }
    this.smashHugeTerrain(a, room);
  }

  private smashContact(a: Actor, c: Obstacle) {
    if (!c.body) return false;
    if (overlaps(a.body, [c.body], 0.1).length) return true;
    if (c.kind !== "pipe") return false;
    const top = c.body.bounds.min.y;
    return (
      Math.abs(a.body.bounds.max.y - top) < 12 &&
      a.body.bounds.max.x > c.body.bounds.min.x + 0.01 &&
      a.body.bounds.min.x < c.body.bounds.max.x - 0.01
    );
  }

  private isGoalPipe(room: Room, c: Obstacle) {
    const goal = room.data.goal;
    if (c.kind !== "pipe" || goal?.kind !== "pipe") return false;
    const pipe = room.data.pipes.find(
      (p) => p.column === goal.column && p.row === goal.row,
    );
    if (!pipe) return false;
    const x = room.offset + (pipe.column + pipe.width / 2) * 32;
    return Math.abs(c.x - x) < 1;
  }

  private yieldSmashPrize(c: Obstacle, hitter: Actor) {
    if (c.kind !== "brick" || c.broken) return;
    if (c.content === "vine") {
      if (!c.used) {
        this.sproutVine(c);
        this.reveal(c);
      }
      return;
    }
    if (c.used) return;
    this.collectCoinsOnBlock(c, hitter);
    if (c.content === "coins") {
      const n = c.coinsLeft ?? T.multiCoinCount;
      for (let i = 0; i < n; i++) this.popCoin(hitter, c.x, c.y);
      c.coinsLeft = 0;
      c.used = true;
      return;
    }
    if (c.content === "1-up") {
      this.reveal(c);
      this.spawnItem(c, "oneUp", hitter.facing, true).ignoreActor = hitter;
      return;
    }
    if (c.content === "star") {
      this.reveal(c);
      this.spawnItem(c, "star", hitter.facing, true).ignoreActor = hitter;
      return;
    }
    if (c.question) {
      this.grantQuestionPrize(c, hitter, true);
      return;
    }
    if (c.content === "power-up") {
      this.reveal(c);
      this.spawnItem(c, this.rollItem(), hitter.facing, true).ignoreActor =
        hitter;
    }
  }

  private smashHugeTerrain(a: Actor, room: Room) {
    const keep = this.keptSolids(room);
    if (!overlaps(a.body, room.solids.filter((s) => !keep.has(s)), 0.1).length)
      return;
    const feet = a.body.bounds.max.y;
    const box = a.body.bounds;
    const smashed: string[] = [];
    const col0 = Math.floor((box.min.x - room.offset) / 32);
    const col1 = Math.floor((box.max.x - room.offset - 0.01) / 32);
    const row0 = Math.floor((box.min.y - MAP_TOP) / 32);
    const row1 = Math.floor((box.max.y - MAP_TOP - 0.01) / 32);
    for (let column = col0; column <= col1; column++) {
      if (column < 0 || column >= room.data.width) continue;
      for (let row = row0; row <= row1; row++) {
        if (row < 2 || row > 14) continue;
        const key = `${column},${row}`;
        if (
          room.smashedTiles.has(key) ||
          !this.smashableTerrain(room, column, row, feet)
        )
          continue;
        const x = room.offset + column * 32 + 16;
        const y = MAP_TOP + row * 32 + 16;
        if (
          box.max.x <= x - 16 + 0.1 ||
          box.min.x >= x + 16 - 0.1 ||
          box.max.y <= y - 16 + 0.1 ||
          box.min.y >= y + 16 - 0.1
        )
          continue;
        smashed.push(key);
        this.burst(x, y, false);
      }
    }
    if (!smashed.length) return;
    for (const key of smashed) room.smashedTiles.add(key);
    this.rebuildTerrain(room);
    this.events.push("break");
  }

  private smashableTerrain(
    room: Room,
    column: number,
    row: number,
    feet: number,
  ) {
    if (row >= 13) return false;
    const tile = room.data.tiles[row]?.[column] ?? 0;
    if (!isSolidTile(tile) || isSmashExemptTile(tile)) return false;
    if (room.data.blocks.some((b) => b.column === column && b.row === row))
      return false;
    if (
      room.data.pipes.some(
        (p) =>
          column >= p.column &&
          column < p.column + p.width &&
          row >= p.row &&
          row < p.row + p.height,
      )
    )
      return false;
    if (room.data.objects.some((o) => o.opcode === 35 && o.column === column))
      return false;
    const top = MAP_TOP + row * 32;
    const above = room.data.tiles[row - 1]?.[column] ?? 0;
    const standableTop = row === 0 || !isSolidTile(above);
    if (Math.abs(feet - top) < 12 && standableTop) return false;
    return true;
  }

  private keptSolids(room: Room) {
    const keep = new Set<Body>();
    for (const o of room.obstacles) if (o.body && !o.broken) keep.add(o.body);
    for (const p of room.platforms) keep.add(p.body);
    return keep;
  }

  private rebuildTerrain(room: Room) {
    const keep = this.keptSolids(room);
    const removed = room.solids.filter((s) => !keep.has(s));
    const gone = new Set(removed);
    for (const s of removed) this.physics.remove(s);
    room.solids = room.solids.filter((s) => keep.has(s));
    this.solids = this.solids.filter((s) => !removed.includes(s));
    const created: Body[] = [];
    for (const rect of terrainRects(room.data, room.offset, room.smashedTiles)) {
      const body = this.physics.rectangle(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        rect.width,
        rect.height,
        true,
      );
      created.push(body);
      room.solids.push(body);
      this.solids.push(body);
    }
    this.remapVolumeHolds(gone, created);
    room.clearNavigation();
  }

  private remapVolumeHolds(gone: Set<Body>, created: Body[]) {
    if (!gone.size) return;
    for (const a of [this.player, ...this.npcs, this.mario]) {
      const b = a.body;
      if (!b.volumeHoldFloor && !b.volumeHoldVolume) continue;
      const floorGone = !!(b.volumeHoldFloor && gone.has(b.volumeHoldFloor));
      const volumeGone = !!(b.volumeHoldVolume && gone.has(b.volumeHoldVolume));
      if (!floorGone && !volumeGone) continue;
      const live = (saved?: Body) =>
        saved && this.solids.includes(saved) ? saved : undefined;
      const floor = floorGone
        ? hugeHoldFloor(
            b.volumeHoldFloor,
            created,
            b.bounds.min.x,
            b.width,
            b.volumeHoldFloorSpan,
          )
        : live(b.volumeHoldFloor);
      const volume = volumeGone
        ? hugeHoldVolume(
            b.volumeHoldVolume,
            created,
            b.bounds.min.x,
            b.width,
            b.volumeHoldVolumeSpan,
            b.volumeHoldFloorSpan,
            b.volumeHoldY,
          )
        : live(b.volumeHoldVolume);
      if (!floor || !volume) {
        clearVolumeHold(b);
        continue;
      }
      b.volumeHoldFloor = floor;
      b.volumeHoldY = floor.bounds.min.y;
      b.volumeHoldVolume = volume;
    }
  }

  private updateItems(dt: number) {
    for (const item of [...this.items]) {
      item.age += dt;
      if (item.hold > 0) {
        item.hold = Math.max(0, item.hold - dt);
        if (item.hold === 0) Body.setFrozen(item.body, false);
        continue;
      }
      if (item.emerge > 0) {
        item.emerge = Math.max(0, item.emerge - dt);
        Body.setPosition(item.body, {
          x: item.body.position.x,
          y: item.originY - 32 * (1 - item.emerge / 0.45),
        });
        if (item.emerge === 0) Body.setFrozen(item.body, false);
        this.setEmergeClip(item);
        continue;
      }
      item.clip = undefined;
      const p = item.body.position;
      const halfW = item.body.width / 2,
        halfH = item.body.height / 2;
      const floor = this.solids.some(
        (s) =>
          !s.headOnly &&
          p.x + halfW > s.bounds.min.x &&
          p.x - halfW < s.bounds.max.x &&
          Math.abs(p.y + halfH - s.bounds.min.y) < 5,
      );
      const wall = this.solids.some(
        (s) =>
          p.x + item.direction * 15 > s.bounds.min.x &&
          p.x + item.direction * 15 < s.bounds.max.x &&
          p.y > s.bounds.min.y &&
          p.y < s.bounds.max.y,
      );
      if (wall && !item.drop) item.direction *= -1;
      const falling = !!item.drop && !floor;
      Body.setVelocity(item.body, {
        x:
          falling || (item.kind === "flower" && (!item.smash || floor))
            ? 0
            : item.direction * (item.kind === "star" ? 2.8 : 1.8),
        y:
          item.kind === "star" && floor && item.body.velocity.y >= 0
            ? -7.5
            : item.body.velocity.y,
      });
      if (item.drop && floor) item.drop = false;
      if (!item.drop) {
        for (const a of [this.player, ...this.npcs, this.mario]) {
          if (
            !a.alive ||
            a.saved ||
            this.inPipe(a) ||
            (a === this.mario && !this.marioActive) ||
            !this.overlapBody(a.body, item.body)
          )
            continue;
          if (item.ignoreActor === a) continue;
          this.collect(a, item);
          break;
        }
      }
      if (
        item.ignoreActor &&
        !this.overlapBody(item.ignoreActor.body, item.body)
      )
        item.ignoreActor = undefined;
      if (p.y > 640 || item.age > 40) {
        this.physics.remove(item.body);
        this.items = this.items.filter((i) => i !== item);
      }
    }
  }

  private stepDeathHop(
    death: { x: number; y: number; vy: number; age: number },
    dt: number,
  ) {
    death.age += dt;
    if (death.age > T.deathHopDelay) {
      death.vy += T.deathFallGravity * dt;
      death.y += death.vy * dt;
    }
  }

  private defeatMario(byPlayer = false) {
    if (!this.marioActive) return;
    if (byPlayer) this.marioKills++;
    this.burst(this.mario.body.position.x, this.mario.body.position.y, true);
    this.events.push("marioDeath");
    this.marioDeath = {
      x: this.mario.body.position.x,
      y: this.mario.body.position.y,
      vy: -T.deathHopSpeed,
      age: 0,
    };
    this.marioActive = this.mario.alive = false;
    this.mario.navVx = undefined;
    this.mario.navDelay = undefined;
    this.mario.navHoldX = undefined;
    this.mario.starLeft = 0;
    this.mario.hugeLeft = 0;
    this.mario.body.ignoreWalls = false;
    if (this.isHuge(this.mario)) {
      this.resize(this.mario, 1, false);
      this.fitActor(this.mario);
    }
    this.setMarioStage(0);
    this.marioReturn = T.marioDefeatSeconds;
    this.marioTarget = null;
    this.marioChase = this.marioStun = 0;
    Body.setFrozen(this.mario.body, true);
    this.fireballs = this.fireballs.filter((f) => f.owner === "player");
  }

  private hitMarioByFireball(byPlayer = true) {
    if (!this.marioActive || this.mario.starLeft > 0 || this.isHuge(this.mario))
      return;
    if (this.marioStage === 2) {
      this.setMarioStage(1, true);
      this.marioStun = T.marioStunSeconds;
      this.events.push("shrink");
    } else if (this.marioStage === 1) {
      this.setMarioStage(0, true);
      this.marioStun = T.marioStunSeconds;
      this.events.push("shrink");
    } else this.defeatMario(byPlayer);
  }

  private withinWarningRange(n: Actor) {
    const p = this.player.body,
      q = n.body;
    const dx = Math.max(
      0,
      Math.abs(p.position.x - q.position.x) - (p.width + q.width) / 2,
    );
    const dy = Math.max(
      0,
      Math.abs(p.position.y - q.position.y) - (p.height + q.height) / 2,
    );
    return Math.hypot(dx, dy) <= T.warningRange;
  }

  private npcTop(n: Actor) {
    return n.body.bounds.min.y;
  }

  private overlapNpcX(n: Actor) {
    return (
      Math.abs(this.player.body.position.x - n.body.position.x) <
      (this.player.body.width + n.body.width) / 2
    );
  }

  private fallingOntoNpc(n: Actor, playerBottom: number, top = this.npcTop(n)) {
    return (
      n.alive &&
      !n.saved &&
      this.overlapNpcX(n) &&
      playerBottom <= top
    );
  }

  private pruneBouncedNpcs() {
    for (const n of this.bouncedNpcs) {
      if (!n.alive || n.saved || !this.overlapNpcX(n))
        this.bouncedNpcs.delete(n);
    }
  }

  private autoWarn() {
    if (this.mode !== "playing" || this.inPipe(this.player)) return;
    const playerBottom = this.player.body.bounds.max.y;
    const falling = this.player.body.velocity.y > 0.2;
    const nearby = this.npcs.some(
      (n) =>
        n.alive &&
        !n.saved &&
        !n.warned &&
        !this.bouncedNpcs.has(n) &&
        !(falling && this.fallingOntoNpc(n, playerBottom)) &&
        this.withinWarningRange(n),
    );
    if (nearby) {
      this.warn();
      // The automatic voice cue should not delay the player's next action.
      this.audible = 0;
    }
  }

  private bouncePlayerOffNpcs(
    playerBottom: number,
    playerFalling: boolean,
    prevNpcTops: Map<Actor, number>,
  ) {
    if (
      !playerFalling ||
      !this.player.alive ||
      this.player.saved ||
      this.mode !== "playing" ||
      this.inPipe(this.player)
    )
      return;
    for (const n of this.npcs) {
      const prevTop = prevNpcTops.get(n);
      if (
        prevTop !== undefined &&
        !this.inPipe(n) &&
        this.fallingOntoNpc(n, playerBottom, prevTop) &&
        this.player.body.bounds.max.y >= this.npcTop(n)
      ) {
        this.bouncedNpcs.add(n);
        if (n.kind === "koopa" && !this.isHuge(n)) this.koopaStomp(n, this.player);
      }
    }
  }

  private overlapBody(a: Body, b: Body) {
    return (
      Math.abs(a.position.x - b.position.x) < (a.width + b.width) / 2 &&
      Math.abs(a.position.y - b.position.y) < (a.height + b.height) / 2
    );
  }

  private overlapActors(a: Actor, b: Actor) {
    return this.overlapBody(a.body, b.body);
  }

  private overlapFireball(a: Actor, x: number, y: number, radius: number) {
    return (
      Math.abs(a.body.position.x - x) < a.body.width / 2 + radius &&
      Math.abs(a.body.position.y - y) < a.body.height / 2 + radius
    );
  }

  private stompMario(stomper: Actor) {
    if (this.marioStun !== 0) return;
    this.hitMarioByFireball();
    Body.setVelocity(stomper.body, {
      x: stomper.body.velocity.x,
      y: -T.stompBounce,
    });
  }

  private resolveMarioContact(playerBottom: number, playerFalling: boolean) {
    if (!this.marioActive) return;
    for (const a of [this.player, ...this.npcs]) {
      if (
        !this.marioActive ||
        !a.alive ||
        a.saved ||
        this.inPipe(a) ||
        this.inPipe(this.mario)
      )
        continue;
      if (!this.overlapActors(a, this.mario)) continue;
      if (a.starLeft > 0) {
        if (this.mario.starLeft <= 0) {
          this.defeatMario(a === this.player);
          return;
        }
        continue;
      }
      const actorHuge = this.isHuge(a);
      const marioHuge = this.isHuge(this.mario);
      if (actorHuge && marioHuge) continue;
      if (actorHuge) {
        if (this.marioStun === 0) this.hitMarioByFireball(a === this.player);
        continue;
      }
      if (marioHuge) {
        this.hurt(a);
        continue;
      }
      if (a !== this.player) continue;
      if (!a.grounded && !this.mario.grounded) {
        const dy = a.body.bounds.max.y - this.mario.body.bounds.max.y;
        if (Math.abs(dy) <= 0.5) continue;
        if (dy < 0) {
          if (a.scale > 1 && this.mario.starLeft <= 0) this.stompMario(a);
        } else if (this.marioStun === 0) this.hurt(a);
        continue;
      }
      if (
        this.mario.starLeft <= 0 &&
        a.scale > 1 &&
        playerFalling &&
        playerBottom <= this.mario.body.bounds.min.y + 12 &&
        a.body.bounds.max.y >= this.mario.body.bounds.min.y
      )
        this.stompMario(a);
    }
  }

  private shellFallSpeed(n: Actor) {
    return this.roomFor(n).data.type === "water" ? 0 : n.body.velocity.y;
  }

  private enterShell(n: Actor, stomper?: Actor) {
    n.shell = "stopped";
    n.wakeLeft = T.shellWake;
    n.kickIgnore = stomper?.id ?? 0;
    n.shellKicker = 0;
    n.navVx = undefined;
    n.navHoldX = undefined;
    n.idleDrop = undefined;
    n.jumpHeld = false;
    n.jumpHoldG = undefined;
    n.jumpFallG = undefined;
    n.navBackoff = undefined;
    n.navDrop = undefined;
    n.swimPath = undefined;
    Body.setVelocity(n.body, { x: 0, y: this.shellFallSpeed(n) });
  }

  private stopShell(n: Actor, stomper?: Actor) {
    n.shell = "stopped";
    n.wakeLeft = T.shellWake;
    n.kickIgnore = stomper?.id ?? 0;
    n.shellKicker = 0;
    n.swimPath = undefined;
    Body.setVelocity(n.body, { x: 0, y: this.shellFallSpeed(n) });
  }

  private kickShell(n: Actor, kicker: Actor) {
    const dir =
      Math.sign(n.body.position.x - kicker.body.position.x) ||
      kicker.facing ||
      1;
    n.shell = "moving";
    n.facing = dir;
    n.wakeLeft = 0;
    n.kickIgnore = kicker.id;
    n.shellKicker = kicker.id;
    n.swimPath = undefined;
    Body.setVelocity(n.body, {
      x: dir * T.shellSpeed,
      y: this.shellFallSpeed(n),
    });
    this.events.push("kick");
  }

  private wakeShell(n: Actor) {
    n.shell = "none";
    n.wakeLeft = 0;
    n.kickIgnore = 0;
    n.shellKicker = 0;
    if (n.warned) {
      n.state = "run";
      n.wait = -0.01;
    } else {
      n.state = "idle";
      n.idleWalking = true;
      n.idleWait = 0.4;
      n.homeX = n.body.position.x;
    }
  }

  private koopaStomp(n: Actor, stomper: Actor) {
    this.shellStomps.add(n);
    if (n.shell === "moving") this.stopShell(n, stomper);
    else if (n.shell === "stopped") this.kickShell(n, stomper);
    else this.enterShell(n, stomper);
  }

  private shellBlocked(n: Actor, direction: number) {
    const ahead = n.body.position.x + direction * (n.body.width / 2 + 3);
    return this.solids.some(
      (s) =>
        !s.headOnly &&
        ahead > s.bounds.min.x &&
        ahead < s.bounds.max.x &&
        n.body.bounds.max.y > s.bounds.min.y + 4 &&
        n.body.bounds.min.y < s.bounds.max.y,
    );
  }

  private updateShelledKoopa(n: Actor, dt: number) {
    const water = this.roomFor(n).data.type === "water";
    if (n.shell === "stopped") {
      n.wakeLeft = Math.max(0, n.wakeLeft - dt);
      this.move(n, 0);
      if (water) Body.setVelocity(n.body, { x: 0, y: 0 });
      if (n.wakeLeft === 0) this.wakeShell(n);
      return;
    }
    if (this.shellBlocked(n, n.facing)) n.facing *= -1;
    this.move(n, n.facing * T.shellSpeed);
    if (water)
      Body.setVelocity(n.body, { x: n.facing * T.shellSpeed, y: 0 });
  }

  private shellHits(victim: Actor, shell?: Actor) {
    if (!victim.alive || victim.saved || this.inPipe(victim)) return;
    if (victim === this.mario) {
      if (this.marioStun > 0 || this.isHuge(this.mario)) return;
      this.hitMarioByFireball(shell?.shellKicker === this.player.id);
      return;
    }
    this.hurt(victim);
  }

  private collideShells(
    marioBottom: number,
    marioFalling: boolean,
    prevNpcTops: Map<Actor, number>,
  ) {
    for (const n of this.npcs) {
      if (
        n.kind !== "koopa" ||
        n.shell === "none" ||
        !n.alive ||
        n.saved ||
        this.inPipe(n)
      )
        continue;
      const ignore = [this.player, this.mario, ...this.npcs].find(
        (a) => a.id === n.kickIgnore,
      );
      if (n.kickIgnore && (!ignore || !this.overlapActors(n, ignore)))
        n.kickIgnore = 0;
      const side = (a: Actor) =>
        a.alive &&
        !a.saved &&
        a !== n &&
        !this.inPipe(a) &&
        this.overlapActors(n, a) &&
        !this.shellStomps.has(n) &&
        n.kickIgnore !== a.id;
      if (side(this.player)) {
        if (n.shell === "stopped") this.kickShell(n, this.player);
        else this.shellHits(this.player, n);
      }
      if (
        this.marioActive &&
        this.mario.alive &&
        !this.inPipe(this.mario) &&
        !this.isHuge(this.mario) &&
        this.overlapActors(this.mario, n) &&
        !this.shellStomps.has(n) &&
        n.kickIgnore !== this.mario.id
      ) {
        const prevTop = prevNpcTops.get(n);
        const fallingOn =
          marioFalling &&
          prevTop !== undefined &&
          marioBottom <= prevTop &&
          this.mario.body.bounds.max.y >= this.npcTop(n);
        if (fallingOn) {
          if (!this.isHuge(n)) {
            this.koopaStomp(n, this.mario);
            Body.setVelocity(this.mario.body, {
              x: this.mario.body.velocity.x,
              y: -T.stompBounce,
            });
          }
        } else if (n.shell === "stopped") {
          if (!this.isHuge(n)) this.kickShell(n, this.mario);
        } else this.shellHits(this.mario, n);
      }
      if (n.shell === "moving") {
        for (const other of this.npcs) {
          if (
            other === n ||
            !other.alive ||
            other.saved ||
            this.inPipe(other) ||
            !this.overlapActors(n, other)
          )
            continue;
          this.shellHits(other, n);
        }
      }
    }
    this.shellStomps.clear();
  }

  private burst(x: number, y: number, blood: boolean) {
    const count = blood ? T.bloodBurst : T.brickBurst;
    for (let i = 0; i < count; i++) {
      // Cosmetic randomness must not alter AI decisions or seeded gameplay.
      const angle = Math.random() * Math.PI * 2;
      const speed = 65 + Math.random() * 180;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: -Math.abs(Math.sin(angle) * speed) - 60,
        age: 0,
        life: blood ? 7 : 1.6,
        size: blood ? 3 + Math.floor(Math.random() * 4) : 8,
        color: blood
          ? i % 3
            ? "#bc0018"
            : "#ff2030"
          : i % 2
            ? "#c84c0c"
            : "#fcbcb0",
        settled: false,
        blood,
      });
    }
    if (this.particles.length > 1200)
      this.particles.splice(0, this.particles.length - 1200);
  }
  breakBrick(c: Obstacle) {
    if (c.kind !== "brick") return;
    this.breakSolid(c);
  }
  private breakSolid(c: Obstacle) {
    if (c.broken || (c.kind !== "brick" && c.kind !== "pipe")) return;
    c.broken = true;
    if (c.body) {
      for (const a of [this.player, ...this.npcs, this.mario]) {
        const b = a.body;
        if (b.volumeHoldFloor === c.body || b.volumeHoldVolume === c.body)
          clearVolumeHold(b);
      }
      this.physics.remove(c.body);
      this.solids = this.solids.filter((s) => s !== c.body);
      for (const room of this.rooms.values()) {
        room.solids = room.solids.filter((s) => s !== c.body);
        room.clearNavigation();
      }
    }
    if (c.kind === "pipe") this.smashPipeTiles(c);
    this.burst(c.x, c.y, false);
    this.events.push("break");
  }
  private smashPipeTiles(c: Obstacle) {
    if (!c.body) return;
    let host: Room | undefined;
    for (const room of this.rooms.values())
      if (room.obstacles.includes(c)) host = room;
    if (!host) return;
    const col0 = Math.round((c.body.bounds.min.x - host.offset) / 32);
    const row0 = Math.round((c.body.bounds.min.y - MAP_TOP) / 32);
    const cols = Math.max(1, Math.round(c.body.width / 32));
    const rows = Math.max(1, Math.round(c.body.height / 32));
    for (let column = col0; column < col0 + cols; column++)
      for (let row = row0; row < row0 + rows; row++)
        host.smashedTiles.add(`${column},${row}`);
    this.rebuildTerrain(host);
  }
  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.age += dt;
      if (p.settled) continue;
      const oldY = p.y;
      p.vy += (p.firework ? 220 : 520) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (!p.blood) continue;
      const floor = this.solids.find(
        (s) =>
          p.x >= s.bounds.min.x &&
          p.x <= s.bounds.max.x &&
          oldY <= s.bounds.min.y &&
          p.y >= s.bounds.min.y,
      );
      if (floor && p.vy > 0) {
        p.y = floor.bounds.min.y - 1;
        p.settled = true;
      }
    }
    this.particles = this.particles.filter((p) =>
      p.firework || p.blood ? p.age < p.life : p.y < 540,
    );
  }
  save(n: Actor) {
    if (!n.alive || n.saved) return;
    n.saved = true;
    this.saved++;
    this.physics.remove(n.body);
    this.events.push("saved");
  }
  finish() {
    if (this.mode !== "playing") return;
    this.mode = "finishing";
    this.player.saved = true;
    Body.setFrozen(this.player.body, true);
    this.events.push("win");
    this.timerAcc = 0;
    this.finishElapsed = 0;
    this.tallyPhase = this.timeLeft > 0 ? "time" : "warned";
    this.tallyHold = this.timeLeft > 0 ? 0 : T.tallyLineSeconds;
    this.applyTallyDeltas();
    if (this.tallyPhase !== "time") this.armFireworks();
  }

  fireworkCount() {
    if (areaData(this.level.main).goal?.kind !== "castle-door") return 0;
    if (this.saved >= T.fireworkStrong) return 6;
    if (this.saved >= T.fireworkGood) return 3;
    if (this.saved >= T.fireworkModest) return 1;
    return 0;
  }

  private armFireworks() {
    if (this.fireworksArmed) return;
    this.fireworksArmed = true;
    this.fireworksTotal = this.fireworkCount();
    this.fireworksLeft = this.fireworksTotal;
    this.fireworkWait = 0;
  }

  private fireworkBurst(x: number, y: number) {
    const colors = ["#fffce0", "#ffd21a", "#ff5a18", "#ffffff"];
    for (let i = 0; i < T.fireworkBurst; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        age: 0,
        life: 0.55,
        size: 3 + Math.floor(Math.random() * 4),
        color: colors[i % colors.length]!,
        settled: false,
        blood: false,
        firework: true,
      });
    }
    if (this.particles.length > 1200)
      this.particles.splice(0, this.particles.length - 1200);
  }

  private castleRoofY(room: Room) {
    const col = room.data.goal?.column ?? room.data.width - 3;
    for (let row = 0; row < 13; row++) {
      const tiles = room.data.tiles[row];
      if (!tiles) continue;
      const start = Math.max(0, col - 6);
      const end = Math.min(tiles.length - 1, col + 1);
      for (let c = start; c <= end; c++) {
        const tile = tiles[c]!;
        if (tile >= 69 && tile <= 75) return MAP_TOP + row * 32;
      }
    }
    return MAP_TOP + 8 * 32;
  }

  private fireFirework() {
    const room = this.rooms.get(this.level.main) ?? this.activeRoom;
    const roof = this.castleRoofY(room);
    const spots = [
      { dx: -48, dy: -56 },
      { dx: 24, dy: -88 },
      { dx: -8, dy: -32 },
    ] as const;
    const spot = spots[(this.fireworksTotal - this.fireworksLeft) % spots.length]!;
    this.fireworkBurst(room.goalX + spot.dx, Math.max(24, roof + spot.dy));
    this.score += T.fireworkScore;
    this.events.push("firework");
  }

  private stepFireworks(dt: number) {
    if (!this.fireworksArmed) return;
    this.fireworkWait -= dt;
    while (this.fireworksLeft > 0 && this.fireworkWait <= 0) {
      this.fireFirework();
      this.fireworksLeft--;
      this.fireworkWait += T.fireworkInterval;
    }
  }

  playerClaimedFlag() {
    for (const room of this.rooms.values())
      if (room.flagpole?.claim === "goomba") return true;
    return false;
  }

  private onMainControl() {
    return this.player.areaId === this.level.main && !this.inPipe(this.player);
  }

  private tickTimer(dt: number) {
    this.timerAcc += dt * 60;
    while (this.timeLeft > 0 && this.timerAcc >= T.timerTickFrames) {
      this.timerAcc -= T.timerTickFrames;
      this.timeLeft -= 1;
      if (this.timeLeft <= T.hurryAt && !this.hurry) {
        this.hurry = true;
        this.events.push("hurry");
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.kill(this.player, false);
        break;
      }
    }
  }

  private tallyReached(line: (typeof TALLY_LINES)[number]) {
    if (this.tallyPhase === "ending") return true;
    const shown = TALLY_LINES.indexOf(this.tallyPhase as (typeof TALLY_LINES)[number]);
    const want = TALLY_LINES.indexOf(line);
    return shown >= 0 && want >= 0 && shown >= want;
  }

  private applyTallyDeltas() {
    if (this.tallyReached("warned")) {
      const extra = this.warned - this.awarded.warned;
      if (extra) {
        this.score += extra * T.warnedScore;
        this.awarded.warned = this.warned;
      }
    }
    if (this.tallyReached("saved")) {
      const extra = this.saved - this.awarded.saved;
      if (extra) {
        this.score += extra * T.savedScore;
        this.awarded.saved = this.saved;
      }
    }
    if (this.tallyReached("died")) {
      const extra = this.died() - this.awarded.died;
      if (extra) {
        this.score += extra * T.diedScore;
        this.awarded.died = this.died();
      }
    }
    if (this.tallyReached("flag") && !this.awarded.flag) {
      this.awarded.flag = true;
      if (this.playerClaimedFlag()) this.score += T.flagScore;
    }
    if (this.tallyReached("mario")) {
      const extra = this.marioKills - this.awarded.mario;
      if (extra) {
        this.score += extra * T.marioScore;
        this.awarded.mario = this.marioKills;
      }
    }
  }

  private stepTally(dt: number) {
    this.finishElapsed += dt;
    if (this.tallyPhase === "ending") {
      this.tallyHold -= dt;
      if (this.tallyHold <= 0) {
        this.levelIndex = 0;
        this.lives = T.startingLives;
        this.reset("title");
      }
      return;
    }
    if (this.tallyPhase === "time") {
      this.timerAcc += dt * 60;
      while (this.timeLeft > 0 && this.timerAcc >= T.timerTallyFrames) {
        this.timerAcc -= T.timerTallyFrames;
        this.timeLeft -= 1;
        this.score += T.timeScore;
        this.events.push("tally");
      }
      if (this.timeLeft > 0) return;
      this.timeLeft = 0;
      this.tallyPhase = "warned";
      this.tallyHold = T.tallyLineSeconds;
      this.armFireworks();
    }
    this.applyTallyDeltas();
    this.tallyHold -= dt;
    if (this.tallyHold > 0) return;
    if (this.tallyPhase === "mario") {
      if (this.levelIndex >= CAMPAIGN.length - 1) {
        this.tallyPhase = "ending";
        const clearLeft = Math.max(0, T.clearSeconds - this.finishElapsed);
        this.tallyHold =
          T.endingSeconds +
          clearLeft +
          (this.marioDeath ? T.deathSequenceSeconds : 0);
        this.events.push("ending");
      } else this.nextLevel();
      return;
    }
    const index = TALLY_LINES.indexOf(
      this.tallyPhase as (typeof TALLY_LINES)[number],
    );
    const next = TALLY_LINES[index + 1] ?? "mario";
    this.tallyPhase = next;
    this.tallyHold =
      next === "mario" ? T.tallyLineSeconds + T.tallyEndHold : T.tallyLineSeconds;
    this.applyTallyDeltas();
  }

  step(dt: number, input: Input) {
    if (this.mode === "dead") {
      this.updateParticles(dt);
      if (this.playerDeath) this.stepDeathHop(this.playerDeath, dt);
      this.deadLeft -= dt;
      if (this.deadLeft <= 0) {
        if (this.lives <= 0) {
          this.mode = "gameover";
          this.score = 0;
          this.gameoverLeft = T.gameoverSeconds;
          this.events.push("gameover");
        } else this.reset("intro");
      }
      return;
    }
    if (this.mode === "intro") {
      this.introLeft -= dt;
      if (this.introLeft <= 0) this.mode = "playing";
      return;
    }
    if (this.mode === "gameover") {
      this.gameoverLeft -= dt;
      if (this.gameoverLeft <= 0) {
        this.levelIndex = 0;
        this.lives = T.startingLives;
        this.reset("title");
      }
      return;
    }
    if (this.mode !== "playing" && this.mode !== "finishing") return;
    this.updateParticles(dt);
    if (
      this.pipeIntro &&
      this.player.areaId === this.level.main &&
      !this.inPipe(this.player)
    )
      this.endPipeIntro();
    const scripted = this.pipeIntro;
    if (!scripted) this.elapsed += dt;
    if (this.mode === "playing") {
      if (!this.timerStarted && this.onMainControl()) this.timerStarted = true;
      if (this.timerStarted) this.tickTimer(dt);
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.audible = Math.max(0, this.audible - dt);
    for (const shout of this.shouts) shout.left = Math.max(0, shout.left - dt);
    this.shouts = this.shouts.filter((shout) => shout.left > 0);
    for (const a of [this.player, ...this.npcs, this.mario]) {
      a.starLeft = Math.max(0, a.starLeft - dt);
      a.transformLeft = Math.max(0, a.transformLeft - dt);
      a.hugeLeft = Math.max(0, a.hugeLeft - dt);
      if (a.alive && !a.saved && this.isHuge(a) && a.hugeLeft === 0)
        this.expireHuge(a);
      a.exclaimLeft = Math.max(0, a.exclaimLeft - dt);
      if (!this.inPipe(a)) a.pipeWait = Math.max(0, (a.pipeWait ?? 0) - dt);
      a.vineIgnore = Math.max(0, (a.vineIgnore ?? 0) - dt);
      a.navRetry = Math.max(0, (a.navRetry ?? 0) - dt);
      a.swimRepath = Math.max(0, (a.swimRepath ?? 0) - dt);
      const water = this.roomFor(a).data.type === "water";
      if (water) {
        a.body.gravityScale = a === this.player ? T.swimGravity : 0;
        if (a === this.player)
          a.body.velocity.y = Math.min(T.swimFallSpeed, a.body.velocity.y);
        if (a.body.position.y < MAP_TOP + 64 + a.body.height / 2) {
          a.body.position.y = MAP_TOP + 64 + a.body.height / 2;
          a.body.velocity.y = Math.max(0, a.body.velocity.y);
        }
      }
    }
    if (!scripted)
      for (const room of this.rooms.values())
        room.updatePlatforms(this.elapsed, [
          this.player,
          ...this.npcs,
          this.mario,
        ].filter((a) => !this.inPipe(a)));
    for (const c of this.obstacles) c.bounce = Math.max(0, c.bounce - dt);
    const phase =
      this.elapsed >= T.fireballsAt ? 2 : this.elapsed >= T.fasterAt ? 1 : 0;
    if (phase !== this.phase) {
      this.phase = phase;
      if (!this.marioActive)
        this.setMarioStage((phase === 0 ? 1 : phase) as 0 | 1 | 2);
    }
    for (const a of [this.player, ...this.npcs, this.mario]) {
      this.ground(a);
      if (a.grounded) {
        a.jumpHeld = false;
        a.jumpHoldG = undefined;
        a.jumpFallG = undefined;
      }
    }
    this.updatePipeTravel(dt);
    this.updateVines(dt);
    if (this.mode !== "playing" && this.mode !== "finishing") return;
    if (this.mode === "playing" && !this.inPipe(this.player)) {
      const play = this.pipeIntro
        ? { ...emptyInput(), right: true }
        : input;
      if (this.onVine(this.player)) {
        this.updateClimb(this.player, play, dt);
        this.player.jumpHeld = play.jump;
        this.jumped = play.jump;
        this.wasUp = play.up;
      } else {
        const dx = Number(play.right) - Number(play.left);
        const p = this.player.body.position;
        const water = this.activeRoom.data.type === "water";
        if (water) this.playerPace = T.walkSpeed;
        else if (this.player.grounded)
          this.playerPace = play.run ? T.runSpeed : T.walkSpeed;
        this.move(this.player, dx * this.playerPace);
        if (play.jump && !this.jumped)
          this.jump(
            this.player,
            this.roomFor(this.player).onSpring(this.player)
              ? T.springImpulse
              : undefined,
          );
        this.player.jumpHeld = play.jump;
        this.jumped = play.jump;
        this.wasUp = play.up;
        if (play.fire && this.player.flower && this.canThrowFireball("player")) {
          this.fireballs.push({
            id: this.nextId++,
            x: p.x + this.player.facing * (this.player.body.width / 2 + 10),
            y: p.y,
            vx: this.player.facing * 6,
            vy: 0,
            age: 0,
            owner: "player",
            scale: fireballScaleFor(this.player.scale),
          });
          this.events.push("fire");
        }
        const room = this.activeRoom;
        if (p.x < room.offset + 20)
          Body.setPosition(this.player.body, { x: room.offset + 20, y: p.y });
        const traveled = this.tryPipe(this.player, play.down, play.right);
        if (
          !traveled &&
          room.data.goal &&
          room.data.goal.kind !== "pipe" &&
          p.x >= room.goalX
        ) {
          if (room.atDoor(this.player)) {
            this.expireHuge(this.player, false);
            this.finish();
          }
          else Body.setPosition(this.player.body, { x: room.goalX - 1, y: p.y });
        }
      }
    } else if (this.mode === "playing") this.jumped = true;
    if (!scripted) {
      this.updateNpcs(dt);
      this.updateCrowd(dt);
    }
    if (!scripted) this.updateMario(dt);
    for (const a of [this.player, ...this.npcs, this.mario]) {
      if (this.onVine(a)) {
        a.body.gravityScale = 0;
        continue;
      }
      if (this.roomFor(a).data.type === "water") continue;
      const hold = !!a.jumpHeld && a.body.velocity.y < 0 && !a.grounded;
      const holdG = a.jumpHoldG ?? T.jumpHoldGravity;
      const fallG =
        a.jumpFallG ??
        (a === this.player || a === this.mario
          ? T.jumpFallGravity
          : T.npcJumpFallGravity);
      a.body.gravityScale = !a.grounded
        ? (hold ? holdG : fallG) / T.gravity
        : 1;
    }
    const hitters = [
      this.player,
      ...(this.marioActive && this.marioStun === 0 ? [this.mario] : []),
    ]
      .filter(
        (a) => a.alive && !a.saved && !a.body.isStatic && a.body.velocity.y < 0,
      )
      .map((a) => ({
        actor: a,
        top: a.body.bounds.min.y,
      }));
    const playerBottom = this.player.body.bounds.max.y;
    const playerFalling = this.player.body.velocity.y > 0.2;
    const marioBottom = this.mario.body.bounds.max.y;
    const marioFalling = this.mario.body.velocity.y > 0.2;
    const prevNpcTops = new Map<Actor, number>();
    for (const n of this.npcs) prevNpcTops.set(n, this.npcTop(n));
    this.physics.step(dt);
    this.tryGrabVine(this.player);
    for (const n of [...this.npcs, this.mario]) {
      if (n.navHoldX === undefined) continue;
      // Keep takeoff x so delayed air speed can match ground pace without extra travel.
      Body.setPosition(n.body, { x: n.navHoldX, y: n.body.position.y });
      if (n.navVx !== undefined)
        Body.setVelocity(n.body, { x: n.navVx, y: n.body.velocity.y });
      n.navHoldX = undefined;
    }
    for (const a of [
      this.player,
      ...this.npcs,
      ...(this.marioActive ? [this.mario] : []),
    ])
      this.smashHuge(a);
    for (const room of this.rooms.values())
      for (const coin of room.coins) {
        if (coin.collected) continue;
        const collector = [
          this.player,
          ...this.npcs,
          ...(this.marioActive ? [this.mario] : []),
        ].find(
          (a) =>
            a.alive &&
            !a.saved &&
            !this.inPipe(a) &&
            Math.abs(a.body.position.x - coin.x) < a.body.width / 2 + 8 &&
            Math.abs(a.body.position.y - coin.y) < a.body.height / 2 + 12,
        );
        if (collector) this.collectCoin(coin, collector);
      }
    this.bouncePlayerOffNpcs(playerBottom, playerFalling, prevNpcTops);
    this.collideShells(marioBottom, marioFalling, prevNpcTops);
    this.pruneBouncedNpcs();
    this.autoWarn();
    for (const { actor, top } of hitters)
      for (const c of this.obstacles) {
        if (
          c.kind === "brick" &&
          !c.broken &&
          c.body &&
          Math.abs(actor.body.position.x - c.x) <
            T.brickSize / 2 + 10 * actor.scale &&
          top >= c.body.bounds.max.y - 2 &&
          actor.body.bounds.min.y <= c.body.bounds.max.y + 3
        )
          this.hitBlock(c, actor);
      }
    this.updateItems(dt);
    for (const pop of this.coinPops) pop.age += dt;
    this.coinPops = this.coinPops.filter((pop) => pop.age < 0.5);
    this.resolveMarioContact(playerBottom, playerFalling);
    for (const a of [this.player, ...this.npcs])
      if (
        a.alive &&
        !a.saved &&
        !this.inPipe(a) &&
        !this.onVine(a) &&
        a.body.position.y > 640 &&
        !(a === this.player && this.pipeIntro)
      ) {
        if (a === this.player && this.returnFromBonus(a)) continue;
        this.kill(a, false);
      }
    this.updateFireballs(dt);
    this.updateCannons();
    this.updateBulletBills(
      dt,
      playerBottom,
      playerFalling,
      marioBottom,
      marioFalling,
    );
    this.updateCastleHazards(dt);
    this.updateFlagpoles(dt);
    if (this.mode === "finishing") {
      this.stepTally(dt);
      if (this.mode === "finishing") this.stepFireworks(dt);
    }
  }

  private updateFlagpoles(dt: number) {
    const playerX = this.player.body.position.x;
    const marioX = this.mario.body.position.x;
    const prevPlayerX = this.flagPrevPlayerX;
    const prevMarioX = this.flagPrevMarioX;
    this.flagPrevPlayerX = playerX;
    this.flagPrevMarioX = marioX;
    for (const room of this.rooms.values()) {
      const pole = room.flagpole;
      if (!pole) continue;
      if (!pole.claim) {
        const playerPass = this.flagPass(
          this.player,
          room,
          pole.x,
          prevPlayerX,
          playerX,
          true,
        );
        const marioPass = this.flagPass(
          this.mario,
          room,
          pole.x,
          prevMarioX,
          marioX,
          this.marioActive,
        );
        if (playerPass !== undefined && marioPass !== undefined)
          pole.claim = playerPass <= marioPass ? "goomba" : "mario";
        else if (playerPass !== undefined) pole.claim = "goomba";
        else if (marioPass !== undefined) pole.claim = "mario";
      }
      if (pole.claim)
        pole.raise = Math.min(1, pole.raise + dt / T.flagRaiseSeconds);
    }
  }
  private flagPass(
    actor: Actor,
    room: Room,
    poleX: number,
    prevX: number,
    currX: number,
    eligible: boolean,
  ) {
    if (!eligible || !actor.alive || actor.saved || this.roomFor(actor) !== room)
      return;
    if (prevX < poleX && currX >= poleX) {
      const span = currX - prevX;
      return span === 0 ? 0 : (poleX - prevX) / span;
    }
    if (actor.body.bounds.min.x <= poleX && actor.body.bounds.max.x >= poleX)
      return 1;
  }

  private updateNpcs(dt: number) {
    for (const n of this.npcs) {
      if (!n.alive || n.saved || this.inPipe(n)) continue;
      if (n.kind === "koopa" && n.shell !== "none") {
        const room = this.roomFor(n);
        if (
          room.data.goal &&
          room.data.goal.kind !== "pipe" &&
          n.body.position.x >= room.goalX &&
          room.atDoor(n)
        ) {
          this.expireHuge(n, false);
          this.save(n);
        }
        else this.updateShelledKoopa(n, dt);
        continue;
      }
      if (n.grounded) n.navVx = undefined;
      if (
        n.navDetourBelow &&
        n.grounded &&
        n.body.bounds.max.y >= n.navDetourBelow
      )
        n.navDetourBelow = undefined;
      n.navDelay = Math.max(0, (n.navDelay ?? 0) - 1);
      const p = n.body.position;
      const room = this.roomFor(n);
      if (
        room.data.goal?.kind === "pipe" &&
        p.x >= room.goalX - 80 &&
        this.tryPipe(n, true, true)
      )
        continue;
      if (
        room.data.goal &&
        room.data.goal.kind !== "pipe" &&
        p.x >= room.goalX
      ) {
        if (room.atDoor(n)) {
          this.expireHuge(n, false);
          this.save(n);
        }
        else {
          n.navVx = 0;
          Body.setVelocity(n.body, { x: 0, y: n.body.velocity.y });
        }
        continue;
      }
      if (!n.warned) {
        const speed = T.idleSpeed * (0.8 + n.fear * 0.4);
        if (n.kind === "fish") {
          n.idleWait -= dt;
          if (n.idleWait <= 0) {
            n.idleWalking = !n.idleWalking;
            n.idleWait = n.idleWalking
              ? 1.2 + this.random() * 1.8
              : 0.3 + this.random() * 0.6;
            if (n.idleWalking && this.random() < 0.5) n.facing *= -1;
          }
          if ((p.x - n.homeX) * n.facing >= T.idleRadius) n.facing *= -1;
          this.move(n, n.idleWalking ? n.facing * speed : 0);
          n.body.velocity.y = 0;
          continue;
        }
        const feet = n.body.bounds.max.y;
        if (n.idleDrop || !n.grounded) {
          n.idleDrop ??= { airborne: !n.grounded };
          n.idleDrop.airborne ||= !n.grounded;
          if (n.grounded && n.idleDrop.airborne) {
            n.idleDrop = undefined;
            n.homeX = p.x;
            n.idleWalking = false;
            n.idleWait = 0.4;
          } else {
            this.move(n, n.facing * speed);
            continue;
          }
        }
        n.idleWait -= dt;
        if (n.idleWait <= 0) {
          n.idleWalking = !n.idleWalking;
          n.idleWait = n.idleWalking
            ? 1.2 + this.random() * 1.8
            : 0.3 + this.random() * 0.6;
          if (n.idleWalking && this.random() < 0.5) n.facing *= -1;
        }
        if (n.idleWalking) {
          const route = (direction: number) => {
            const ahead = p.x + direction * (n.body.width / 2 + 8);
            const below = this.solids.filter(
              (s) => ahead >= s.bounds.min.x && ahead <= s.bounds.max.x,
            );
            if (
              !n.body.ignoreWalls &&
              below.some(
                (s) =>
                  s.bounds.min.y < feet - 5 &&
                  s.bounds.max.y > n.body.bounds.min.y,
              )
            )
              return "blocked";
            if (
              this.firebarBlocks(
                this.roomFor(n),
                ahead,
                p.y,
                n.body.width / 2,
                n.body.height / 2,
              )
            )
              return "blocked";
            if (below.some((s) => Math.abs(s.bounds.min.y - feet) < 6))
              return "walk";
            if (
              n.body.ignoreWalls &&
              hugeHoldAt(feet, ahead, 1, this.solids, n.body) &&
              below.some(
                (s) =>
                  s.passHuge !== "top" &&
                  s.bounds.min.y < feet - 5 &&
                  s.bounds.max.y >= feet - 5,
              )
            )
              return "walk";
            if (
              below.some(
                (s) => s.bounds.min.y > feet + 5 && s.bounds.min.y <= T.groundY,
              )
            )
              return "drop";
            return "blocked";
          };
          if ((p.x - n.homeX) * n.facing >= T.idleRadius) n.facing *= -1;
          let next = route(n.facing);
          if (next === "blocked") {
            next = route(-n.facing);
            if (next === "blocked") {
              n.idleWalking = false;
              n.idleWait = 0.4;
            } else n.facing *= -1;
          }
          if (next === "drop") n.idleDrop = { airborne: false };
        }
        this.move(n, n.idleWalking ? n.facing * speed : 0);
        continue;
      }
      n.wait -= dt;
      if (n.wait > 0) {
        this.move(n, 0);
        continue;
      }
      if (this.tryNpcPipeEscape(n)) continue;
      if (room.data.type === "water") {
        this.swim(n);
        continue;
      }
      if (n.navDrop) {
        const drop = n.navDrop,
          dx = drop.x - p.x;
        if (Math.abs(dx) < 0.5) {
          n.navDrop = undefined;
          this.move(n, drop.vx);
          n.navVx = drop.vx;
          n.navDelay = 0;
        } else this.move(n, Math.sign(dx) * Math.min(n.speed, Math.abs(dx)));
        continue;
      }
      if (
        room.data.goal?.kind === "pipe" &&
        Math.abs(p.x - room.goalX) < 100 &&
        n.grounded
      ) {
        const opening = MAP_TOP + room.data.goal.row * 32;
        if (p.y > opening + 40) {
          this.launchJump(
            n,
            Math.sign(room.goalX - p.x) * this.runSpeedFor(n),
            T.runJumpSpeed,
            14,
          );
          continue;
        }
      }
      if (n.navBackoff) {
        const target = n.navBackoff;
        if (n.grounded && Math.abs(p.x - target.x) <= n.speed) {
          this.launchJump(n, target.vx, T.runJumpSpeed, target.delay);
          n.navBackoff = undefined;
        } else this.move(n, Math.sign(target.x - p.x) * n.speed);
        continue;
      }
      if (n.scale > 1 && !n.body.ignoreWalls) {
        n.blockedFor = Math.abs(p.x - n.lastX) < 8 ? n.blockedFor + dt : 0;
        n.lastX = p.x;
        if (n.blockedFor > 0.5 && n.grounded) {
          this.jump(n, jumpArc(this.runSpeedFor(n)).impulse);
          n.blockedFor = 0;
        }
      }
      const threat =
        this.marioActive && Math.abs(this.mario.body.position.x - p.x) < 340;
      if (n.state === "idle" || (n.state === "run" && threat && n.wait < -2)) {
        n.state = "run";
        n.wait = -0.01;
      }
      if (this.aboveExitCeiling(n) && n.grounded)
        n.navDetourBelow ??= MAP_TOP + 2 * 32 + 24;
      const direction =
        n.navDetourBelow ||
        (room.data.goal?.kind === "pipe" && p.x > room.goalX + 20)
          ? -1
          : 1;
      this.move(n, direction * this.runSpeedFor(n));
      this.autoJump(n, direction);
      if (
        n.grounded &&
        !n.navDrop &&
        !n.navBackoff &&
        this.cannonLaneAhead(n, direction)
      )
        this.jump(n);
    }
  }

  private swim(actor: Actor, target?: { x: number; y: number }) {
    if (
      !actor.swimPath ||
      actor.swimSize !== actor.body.width ||
      (actor === this.mario && actor.swimRepath === 0)
    ) {
      actor.swimPath = this.roomFor(actor).swimPath(actor, target);
      actor.swimSize = actor.body.width;
      actor.swimRepath = 0.5;
    }
    const p = actor.body.position;
    while (
      actor.swimPath.length > 1 &&
      Math.hypot(p.x - actor.swimPath[0].x, p.y - actor.swimPath[0].y) < 4
    )
      actor.swimPath.shift();
    const next = actor.swimPath[0];
    if (!next) {
      Body.setVelocity(actor.body, { x: 0, y: 0 });
      return;
    }
    const speed =
      actor === this.mario ? (this.marioRunning ? 4.5 : 2.8) : actor.speed;
    const dx = next.x - p.x,
      dy = next.y - p.y;
    const length = Math.hypot(dx, dy),
      pace = Math.min(speed, length);
    Body.setVelocity(actor.body, {
      x: length ? (dx / length) * pace : 0,
      y: length ? (dy / length) * pace : 0,
    });
    if (Math.abs(dx) > 1) actor.facing = Math.sign(dx);
  }

  private runningCrowd() {
    const center = this.marioActive
      ? this.mario.body.position.x
      : this.cameraX + this.viewWidth / 2;
    return this.npcs.filter(
      (n) =>
        n.alive &&
        !n.saved &&
        n.shell === "none" &&
        n.warned &&
        n.state === "run" &&
        Math.abs(n.body.velocity.x) > 1 &&
        n.body.position.x >= this.cameraX &&
        n.body.position.x <= this.cameraX + this.viewWidth &&
        Math.abs(n.body.position.x - center) <= T.marioCrowdRange,
    );
  }

  private updateCrowd(dt: number) {
    this.marioCrowd = this.runningCrowd().length;
    const target = Math.min(1, this.marioCrowd / T.marioCrowdLimit);
    const change = target - this.marioPressure;
    this.marioPressure +=
      Math.sign(change) *
      Math.min(Math.abs(change), dt * (change > 0 ? 1.5 : 0.5));
  }

  private investigate(target: Actor, duration: number) {
    this.marioTarget = target.id;
    this.marioAim =
      target.body.position.x +
      target.body.velocity.x * 14 +
      (this.random() - 0.5) * 24;
    this.marioChase = duration;
    this.marioReaction =
      (T.marioReaction + this.random() * 0.15) * (1 - this.marioPressure * 0.4);
    this.marioSeenAgo = 0;
  }

  private placeHunterMario() {
    const room = this.roomFor(this.player);
    const half = this.mario.body.width / 2;
    const page = 16 * 32;
    const pageIndex = Math.max(0, Math.floor((this.cameraX - room.offset) / page));
    const preferred = room.offset + pageIndex * page + 100;
    const minX = Math.max(room.offset + half, this.cameraX - 650);
    const maxX = Math.min(this.cameraX - half, room.goalX + 100);
    const tryAt = (x: number) => {
      if (x < minX || x > maxX) return false;
      if (!room.standOnFloor(this.mario, x)) return false;
      const m = this.mario.body.position;
      return (
        this.mario.body.bounds.max.x <= this.cameraX &&
        m.x >= this.cameraX - 650 &&
        m.x <= room.goalX + 100 &&
        this.mario.body.bounds.min.x >= room.offset
      );
    };
    if (tryAt(preferred)) return true;
    const edge = this.cameraX - half;
    if (edge !== preferred && tryAt(edge)) return true;
    const leftCol = Math.min(
      room.data.width - 1,
      Math.floor((maxX - room.offset) / 32),
    );
    const minCol = Math.max(0, Math.floor((minX - room.offset) / 32));
    for (let col = leftCol; col >= minCol; col--) {
      const x = room.offset + col * 32 + 16;
      if (x === preferred || x === edge) continue;
      if (tryAt(x)) return true;
    }
    return false;
  }

  private enterMarioDoor() {
    this.expireHuge(this.mario, false);
    this.marioActive = false;
    this.marioEntered = true;
    this.mario.navVx = undefined;
    this.mario.navDelay = undefined;
    this.mario.navHoldX = undefined;
    Body.setFrozen(this.mario.body, true);
  }

  private updateMario(dt: number) {
    if (!this.marioActive) {
      if (this.marioEntered) return;
      this.marioReturn -=
        dt * (this.mario.alive ? 1 + this.marioPressure * 1.8 : 1);
      if (this.marioDeath) {
        this.stepDeathHop(this.marioDeath, dt);
        if (this.marioDeath.y > 700) this.marioDeath = null;
      }
      if (this.marioReturn > 0 || this.marioDeath) return;
      if (this.isHuge(this.mario)) this.expireHuge(this.mario, false);
      this.setMarioStage((this.phase === 0 ? 1 : this.phase) as 0 | 1 | 2);
      this.mario.starLeft = 0;
      this.mario.areaId = this.player.areaId;
      if (!this.placeHunterMario()) return;
      this.marioActive = true;
      this.mario.alive = true;
      Body.setFrozen(this.mario.body, false);
      Body.setVelocity(this.mario.body, { x: 0, y: 0 });
      this.mario.facing = 1;
      this.marioDecision = 3;
      this.marioChase = 0;
      this.marioTarget = null;
      this.marioLook = T.marioReaction;
      this.marioJumpWait = 0.8;
      this.marioPause = this.marioReaction = this.marioSeenAgo = 0;
      this.brickTarget = null;
      this.marioStun = 0;
      this.mario.navVx = undefined;
      this.mario.navDelay = undefined;
      this.mario.navHoldX = undefined;
    }
    if (this.inPipe(this.mario)) return;
    const huntRoom = this.roomFor(this.mario);
    if (huntRoom.data.goal && huntRoom.data.goal.kind !== "pipe") {
      if (huntRoom.atDoor(this.mario)) {
        this.enterMarioDoor();
        return;
      }
      if (this.mario.body.position.x >= huntRoom.goalX) {
        Body.setPosition(this.mario.body, {
          x: huntRoom.goalX - 1,
          y: this.mario.body.position.y,
        });
        Body.setVelocity(this.mario.body, {
          x: 0,
          y: this.mario.body.velocity.y,
        });
        return;
      }
    }
    this.marioIgnore = Math.max(0, this.marioIgnore - dt);
    this.marioDecision -= dt;
    const pursuing = this.marioChase > 0;
    this.marioChase = Math.max(0, this.marioChase - dt);
    const aggression = 1 + this.marioPressure * 1.2;
    this.marioReaction = Math.max(0, this.marioReaction - dt * aggression);
    this.marioJumpWait -= dt * aggression;
    this.marioLook -= dt * aggression;
    this.marioPause = Math.max(0, this.marioPause - dt);
    this.marioSeenAgo += dt;
    this.mario.navDelay = Math.max(0, (this.mario.navDelay ?? 0) - 1);
    if (this.mario.grounded) this.mario.navVx = undefined;
    if (pursuing && (this.marioChase === 0 || this.marioSeenAgo > 1.4)) {
      this.marioChase = 0;
      this.marioTarget = null;
      this.marioIgnore = 0.3;
      this.mario.facing = 1;
    }
    const m = this.mario.body.position;
    const water = this.roomFor(this.mario).data.type === "water";
    if (
      m.y > 620 ||
      m.x > this.roomFor(this.mario).goalX + 100 ||
      m.x > this.cameraX + this.viewWidth + 240 ||
      m.x < this.cameraX - 650
    ) {
      this.marioActive = false;
      this.marioReturn = 2.5 + this.random() * 2.5;
      this.mario.navVx = undefined;
      this.mario.navDelay = undefined;
      this.mario.navHoldX = undefined;
      Body.setFrozen(this.mario.body, true);
      return;
    }
    if (this.marioStun > 0) {
      this.marioStun = Math.max(0, this.marioStun - dt);
    }
    const starThreat = [this.player, ...this.npcs].find(
      (a) =>
        a.alive &&
        !a.saved &&
        a.starLeft > 0 &&
        Math.abs(a.body.position.x - m.x) < 220 &&
        !rayBlocked(this.solids, m, a.body.position),
    );
    if (starThreat) {
      this.marioRunning = true;
      this.marioTarget = null;
      this.marioChase = 0;
      const direction = Math.sign(m.x - starThreat.body.position.x) || -1;
      if (water) {
        this.swim(this.mario, { x: m.x + direction * 240, y: m.y });
      } else if (!this.mario.grounded && this.mario.navVx !== undefined) {
        this.move(this.mario, this.mario.navVx);
      } else if (this.mario.grounded) {
        this.move(this.mario, direction * (4.8 + this.marioPressure));
        this.autoJump(this.mario, direction);
      }
      return;
    }
    const candidates = [this.player, ...this.npcs].filter(
      (a) => a.alive && !a.saved && !this.invincible(a) && !this.inPipe(a),
    );
    const sees = (a: Actor) =>
      Math.abs(a.body.position.x - m.x) < T.marioSight &&
      !rayBlocked(this.solids, m, a.body.position);
    const runners = new Set(this.runningCrowd().map((n) => n.id));
    const hearsCrowd = (a: Actor) =>
      runners.has(a.id) &&
      Math.abs(a.body.position.x - m.x) < 350 + this.marioPressure * 400;
    // Observe only at human-scale intervals. Aim at the last observed point,
    // Jumps keep their launch direction while targets can dodge.
    if (this.marioLook <= 0) {
      this.marioLook = 0.22 + this.random() * 0.15;
      const target = candidates.find((a) => a.id === this.marioTarget);
      if (target && (sees(target) || hearsCrowd(target))) {
        this.marioAim =
          target.body.position.x +
          target.body.velocity.x * 14 +
          (this.random() - 0.5) * 24;
        this.marioSeenAgo = 0;
        this.marioChase = T.marioChaseSeconds;
      } else if (this.marioChase === 0 && this.marioIgnore === 0) {
        const noticed = candidates
          .filter((a) => sees(a) || hearsCrowd(a))
          .sort(
            (a, b) =>
              Math.abs(a.body.position.x - m.x) *
                (runners.has(a.id) ? 1 - this.marioPressure * 0.5 : 1) -
              Math.abs(b.body.position.x - m.x) *
                (runners.has(b.id) ? 1 - this.marioPressure * 0.5 : 1),
          )[0];
        if (noticed)
          this.investigate(noticed, T.marioChaseSeconds + this.random());
      }
    }
    let direction = this.mario.facing;
    this.marioRunning = false;
    if (this.marioChase > 0 && this.marioReaction === 0) {
      this.marioRunning = true;
      const distance = Math.abs(this.marioAim - m.x);
      direction =
        distance > 18 ? Math.sign(this.marioAim - m.x) : this.mario.facing;
      if (
        distance > 8 &&
        distance < 125 &&
        this.mario.grounded &&
        this.marioJumpWait <= 0 &&
        !this.wallAhead(this.mario, direction)
      ) {
        this.marioJumpWait = 0.65 + this.random() * 0.35;
        // Commit toward the predicted landing point, with bounded inaccuracy.
        const arc = jumpArc(this.mario.body.velocity.x);
        const upG = arc.hold / 3600;
        const flightFrames =
          arc.impulse / upG +
          arc.impulse / Math.sqrt(upG * (arc.fall / 3600));
        const launch = Math.max(
          -4,
          Math.min(4, (this.marioAim - m.x) / flightFrames),
        );
        this.move(this.mario, launch);
        this.jump(this.mario);
      }
      if (
        this.marioStage === 2 &&
        this.marioSeenAgo < 0.8 &&
        (this.mario.grounded || water) &&
        this.canThrowFireball("mario")
      ) {
        this.fireballs.push({
          id: this.nextId++,
          x: m.x,
          y: m.y,
          vx: direction * 5,
          age: 0,
          owner: "mario",
          vy: 0,
        });
        this.events.push("fire");
      }
    }
    const brick = this.obstacles.find(
      (c) => c.id === this.brickTarget && !c.broken,
    );
    if (brick && Math.abs(brick.x - m.x) < 160) {
      direction = Math.sign(brick.x - m.x) || 1;
      if (
        this.mario.grounded &&
        this.marioReaction === 0 &&
        this.marioJumpWait <= 0
      ) {
        this.jump(this.mario);
        this.marioJumpWait = 1.5;
      }
      // Actual head contact breaks the solid block in step(), not proximity.
    }
    if (this.marioDecision <= 0 && this.marioChase === 0) {
      direction = this.random() < 0.15 ? -1 : 1;
      this.marioDecision = 2 + this.random() * 3;
      if (this.random() < 0.15) this.marioPause = 0.2;
      const pipe = this.obstacles.find(
        (c) => c.kind === "pipe" && Math.abs(c.x - m.x) < 65,
      );
      if (pipe && this.random() < 0.5 && this.tryPipe(this.mario, true, true))
        return;
      const nearbyBrick = this.obstacles.find(
        (c) => c.kind === "brick" && !c.broken && Math.abs(c.x - m.x) < 100,
      );
      if (nearbyBrick && this.random() < 0.3) this.brickTarget = nearbyBrick.id;
    }
    const speed =
      (this.marioRunning ? 5.2 + this.marioPressure * 0.8 : 2.8) +
      this.marioPressure * T.marioCrowdSpeedBonus;
    const desired =
      this.marioReaction > 0 ||
      (this.marioPause > 0 && !this.wallAhead(this.mario, direction))
        ? 0
        : direction * speed;
    // A jump commits to its takeoff velocity; Mario cannot steer after a dodge.
    if (water) {
      const target = candidates.find((a) => a.id === this.marioTarget);
      if (this.marioReaction > 0 || this.marioPause > 0)
        Body.setVelocity(this.mario.body, { x: 0, y: 0 });
      else
        this.swim(
          this.mario,
          target?.body.position ?? { x: m.x + direction * 200, y: m.y },
        );
    } else if (!this.mario.grounded && this.mario.navVx !== undefined) {
      this.move(this.mario, this.mario.navVx);
    } else if (this.mario.grounded) {
      const vx = this.mario.body.velocity.x;
      const acceleration = 0.16 + this.marioPressure * 0.16;
      this.move(
        this.mario,
        vx + Math.max(-acceleration, Math.min(acceleration, desired - vx)),
      );
      if (desired) this.autoJump(this.mario, direction);
    }
    for (const a of candidates) {
      const p = a.body.position;
      if (
        a.kind === "koopa" &&
        a.shell !== "none"
      )
        continue;
      if (
        this.mario.body.velocity.y > 0.2 &&
        m.y < p.y - 8 &&
        this.overlapActors(this.mario, a)
      ) {
        if (a === this.player && !a.grounded && !this.mario.grounded) continue;
        if (this.isHuge(a) || this.isHuge(this.mario)) continue;
        if (a.kind === "koopa") {
          this.koopaStomp(a, this.mario);
          Body.setVelocity(this.mario.body, {
            x: this.mario.body.velocity.x,
            y: -T.stompBounce,
          });
        } else if (!this.hurt(a)) continue;
        this.marioTarget = null;
        this.marioChase = 0;
        this.marioLook = 0;
        this.marioReaction = 0.15;
      }
    }
  }

  private canThrowFireball(owner: "player" | "mario") {
    return (
      this.fireballs.filter((f) => f.owner === owner).length < T.fireballSlots
    );
  }

  private updateFireballs(dt: number) {
    for (const f of this.fireballs) {
      f.age += dt;
      const radius = 6 * (f.scale ?? 1);
      const oldX = f.x,
        oldY = f.y;
      f.x += f.vx * dt * 60;
      f.vy = (f.vy ?? 0) + 0.28 * dt * 60;
      f.y += f.vy * dt * 60;
      for (const s of this.solids) {
        if (
          f.x + radius <= s.bounds.min.x ||
          f.x - radius >= s.bounds.max.x ||
          f.y + radius <= s.bounds.min.y ||
          f.y - radius >= s.bounds.max.y
        )
          continue;
        if (f.vy > 0 && oldY + radius <= s.bounds.min.y + 2) {
          f.y = s.bounds.min.y - radius;
          f.vy = -3.8;
        } else if (oldX !== f.x) {
          if (f.owner === "player" && (f.scale ?? 1) >= T.playerFireballScale) {
            const brick = this.obstacles.find(
              (c) =>
                c.body === s &&
                c.kind === "brick" &&
                !c.broken &&
                !c.question &&
                !c.used,
            );
            if (brick?.content === "vine") {
              this.sproutVine(brick);
              this.reveal(brick);
              brick.bounce = T.blockBounceSeconds;
              this.events.push("bump");
            } else if (brick) this.breakBrick(brick);
          }
          f.age = 6;
        }
      }
      if (f.age >= 5) continue;
      if (f.owner === "player") {
        if (
          this.marioActive &&
          !this.inPipe(this.mario) &&
          this.overlapFireball(this.mario, f.x, f.y, radius)
        ) {
          this.hitMarioByFireball();
          f.age = 6;
        }
        continue;
      }
      for (const a of [this.player, ...this.npcs]) {
        if (
          a.alive &&
          !a.saved &&
          !this.inPipe(a) &&
          this.overlapFireball(a, f.x, f.y, radius)
        ) {
          if (a.starLeft <= 0) this.hurt(a);
          f.age = 6;
          break;
        }
      }
    }
    this.fireballs = this.fireballs.filter((f) => f.age < 5);
  }

  spawnBulletBill(
    x: number,
    y: number,
    vx: number,
    areaId = this.player.areaId ?? this.level.main,
    cannonX = x,
  ): BulletBill {
    const bill: BulletBill = {
      id: this.nextId++,
      x,
      y,
      vx,
      areaId,
      cannonX,
    };
    this.bulletBills.push(bill);
    return bill;
  }

  private cannonLaneAhead(n: Actor, direction: number) {
    const room = this.roomFor(n);
    const ny = n.body.position.y,
      nx = n.body.position.x;
    return room.cannons.some((c) => {
      if (Math.abs(c.y - ny) > n.body.height / 2 + 16) return false;
      const ahead = (c.x - nx) * direction;
      return ahead > n.body.width / 2 && ahead < 320;
    });
  }

  private viewWindow(room = this.activeRoom) {
    const width = this.viewWidth;
    const cam = Math.max(
      room.offset,
      Math.min(
        room.offset + room.data.width * 32 - width,
        this.player.body.position.x - width * 0.36,
      ),
    );
    return { left: cam - 32, right: cam + width + 32 };
  }

  private updateCannons() {
    if (this.pipeIntro) return;
    for (const room of this.rooms.values()) {
      if (room.data.type === "water" || !room.cannons.length) continue;
      let live = this.bulletBills.filter(
        (b) => b.areaId === room.data.id,
      ).length;
      for (const cannon of room.cannons) {
        if (cannon.timer > 0) {
          cannon.timer--;
          continue;
        }
        if (live >= T.cannonSlots) continue;
        if (this.tryFireCannon(room, cannon)) live++;
        cannon.timer = T.cannonReload;
      }
    }
  }

  private tryFireCannon(room: Room, cannon: { x: number; y: number }) {
    if (
      this.player.areaId !== room.data.id ||
      this.inPipe(this.player) ||
      this.player.saved
    )
      return false;
    const view = this.viewWindow(room);
    if (cannon.x < view.left || cannon.x > view.right) return false;
    const dx = this.player.body.position.x - cannon.x;
    if (Math.abs(dx) < T.cannonClose) return false;
    const vx = dx < 0 ? -T.bulletSpeed : T.bulletSpeed;
    this.spawnBulletBill(cannon.x, cannon.y, vx, room.data.id, cannon.x);
    return true;
  }

  private overlapBill(a: Actor, b: BulletBill) {
    const half = T.bulletSize / 2;
    return (
      a.alive &&
      !a.saved &&
      !this.inPipe(a) &&
      Math.abs(a.body.position.x - b.x) < a.body.width / 2 + half &&
      Math.abs(a.body.position.y - b.y) < a.body.height / 2 + half
    );
  }

  private stompBill(
    a: Actor,
    b: BulletBill,
    falling: boolean,
    bottom: number,
  ) {
    if (!this.overlapBill(a, b)) return false;
    const billTop = b.y - T.bulletSize / 2;
    return falling && bottom <= billTop + 2;
  }

  private strikeBill(a: Actor, byPlayer: boolean) {
    if (a.starLeft > 0 || this.isHuge(a)) return;
    if (a === this.mario) {
      if (this.marioStun === 0) this.hitMarioByFireball(byPlayer);
      return;
    }
    this.hurt(a);
  }

  private updateBulletBills(
    dt: number,
    playerBottom: number,
    playerFalling: boolean,
    marioBottom: number,
    marioFalling: boolean,
  ) {
    const keep: BulletBill[] = [];
    for (const b of this.bulletBills) {
      b.x += b.vx * dt * 60;
      const room = this.rooms.get(b.areaId);
      if (!room) continue;
      const half = T.bulletSize / 2;
      const view = this.viewWindow(room);
      if (
        b.x < room.offset - half ||
        b.x > room.offset + room.data.width * 32 + half ||
        b.x < view.left ||
        b.x > view.right
      )
        continue;
      let hit = false;
      if (this.stompBill(this.player, b, playerFalling, playerBottom)) {
        Body.setVelocity(this.player.body, {
          x: this.player.body.velocity.x,
          y: -T.stompBounce,
        });
        hit = true;
      } else if (this.overlapBill(this.player, b)) {
        this.strikeBill(this.player, false);
        hit = true;
      } else if (
        this.marioActive &&
        this.stompBill(this.mario, b, marioFalling, marioBottom)
      ) {
        Body.setVelocity(this.mario.body, {
          x: this.mario.body.velocity.x,
          y: -T.stompBounce,
        });
        hit = true;
      } else if (this.marioActive && this.overlapBill(this.mario, b)) {
        this.strikeBill(this.mario, false);
        hit = true;
      } else {
        for (const n of this.npcs) {
          if (!this.overlapBill(n, b)) continue;
          this.strikeBill(n, false);
          hit = true;
          break;
        }
      }
      if (!hit) keep.push(b);
    }
    this.bulletBills = keep;
  }

  private firebarBlocks(
    room: Room,
    x: number,
    y: number,
    halfW: number,
    halfH: number,
  ) {
    for (const bar of room.firebars)
      if (firebarHits(bar, this.elapsed, x, y, halfW, halfH)) return true;
    return false;
  }

  private firebarSoon(a: Actor, direction: number) {
    const room = this.roomFor(a);
    if (!room.firebars.length) return false;
    const p = a.body.position;
    const half = a.body.width / 2 + 6,
      tall = a.body.height / 2 + 8;
    const speed = this.runSpeedFor(a);
    for (let step = 0; step <= 36; step += 3) {
      const x = p.x + direction * speed * step;
      const time = this.elapsed + step / 60;
      for (const bar of room.firebars)
        if (firebarHits(bar, time, x, p.y, half, tall)) return true;
    }
    return false;
  }

  firebarBalls(room: Room) {
    return room.firebars.flatMap((bar) => firebarBalls(bar, this.elapsed));
  }

  private updateCastleHazards(dt: number) {
    this.updateBowsers(dt);
    this.updateBowserFlames(dt);
    this.collideFirebars();
    this.checkAxes();
  }

  private collideFirebars() {
    const actors = [
      this.player,
      ...this.npcs,
      ...(this.marioActive ? [this.mario] : []),
    ];
    for (const a of actors) {
      if (!a.alive || a.saved || this.inPipe(a)) continue;
      const room = this.roomFor(a);
      if (
        !this.firebarBlocks(
          room,
          a.body.position.x,
          a.body.position.y,
          a.body.width / 2,
          a.body.height / 2,
        )
      )
        continue;
      if (a === this.mario) {
        if (this.marioStun > 0) continue;
        this.hitMarioByFireball(false);
      } else this.hurt(a);
    }
  }

  private bowserBox(b: Bowser) {
    return {
      x: b.x,
      y: b.y,
      w: T.bowserWidth,
      h: T.bowserHeight,
    };
  }

  private overlapBowser(a: Actor, b: Bowser) {
    const box = this.bowserBox(b);
    return (
      Math.abs(a.body.position.x - box.x) < a.body.width / 2 + box.w / 2 &&
      Math.abs(a.body.position.y - box.y) < a.body.height / 2 + box.h / 2
    );
  }

  private updateBowsers(dt: number) {
    for (const b of this.bowsers) {
      if (!b.alive) continue;
      const room = this.rooms.get(b.areaId);
      if (!room || room.bridgeDropped) continue;
      b.shoutWait = Math.max(0, b.shoutWait - dt);
      b.fireWait = Math.max(0, b.fireWait - dt);
      b.blockWait = Math.max(0, b.blockWait - dt);
      const marioHere =
        this.marioActive &&
        this.mario.alive &&
        this.mario.areaId === b.areaId &&
        !this.inPipe(this.mario);
      if (marioHere) {
        b.facing = Math.sign(this.mario.body.position.x - b.x) || b.facing;
        if (this.overlapBowser(this.mario, b) && b.blockWait === 0) {
          this.marioPause = Math.max(this.marioPause, 0.3);
          b.blockWait = 1;
        }
        if (b.fireWait === 0) {
          this.bowserFlames.push({
            id: this.nextId++,
            areaId: b.areaId,
            x: b.x + b.facing * (T.bowserWidth / 2),
            y: b.y + T.bowserHeight / 2 - 10,
            vx: b.facing * T.bowserFlameSpeed,
            age: 0,
          });
          b.fireWait = T.bowserFlamePeriod;
        }
      } else {
        b.x += b.facing * T.bowserWalkSpeed * dt * 60;
        if (b.x <= b.minX) {
          b.x = b.minX;
          b.facing = 1;
        } else if (b.x >= b.maxX) {
          b.x = b.maxX;
          b.facing = -1;
        }
      }
      if (b.shoutWait === 0 && this.bowserShouldShout(b)) {
        this.shouts.push({
          id: this.nextId++,
          text: BOWSER_PHRASES[Math.floor(this.random() * BOWSER_PHRASES.length)]!,
          left: T.bubbleTime,
          x: b.x,
          y: b.y - T.bowserHeight / 2 - 24,
        });
        this.events.push("warn");
        b.shoutWait = T.bowserShoutCooldown;
      }
    }
  }

  private bowserShouldShout(b: Bowser) {
    const near = (a: Actor) =>
      a.alive &&
      !a.saved &&
      (a.areaId ?? this.level.main) === b.areaId &&
      Math.hypot(a.body.position.x - b.x, a.body.position.y - b.y) <=
        T.bowserShoutRange;
    if (near(this.player)) return true;
    return this.npcs.some(near);
  }

  private updateBowserFlames(dt: number) {
    for (const f of this.bowserFlames) {
      f.age += dt;
      f.x += f.vx * dt * 60;
      if (
        this.marioActive &&
        this.mario.alive &&
        this.marioStun === 0 &&
        this.mario.areaId === f.areaId &&
        !this.inPipe(this.mario) &&
        Math.abs(this.mario.body.position.x - f.x) <
          this.mario.body.width / 2 + 24 &&
        Math.abs(this.mario.body.position.y - f.y) <
          this.mario.body.height / 2 + 8
      ) {
        this.hitMarioByFireball(false);
        f.age = T.bowserFlameLife;
      }
    }
    this.bowserFlames = this.bowserFlames.filter((f) => f.age < T.bowserFlameLife);
  }

  private checkAxes() {
    if (!this.marioActive || !this.mario.alive || this.inPipe(this.mario))
      return;
    const room = this.roomFor(this.mario);
    if (!room.axe || room.bridgeDropped) return;
    if (!this.overlapAxe(this.mario, room.axe)) return;
    this.dropBridge(room);
  }

  private overlapAxe(a: Actor, axe: { x: number; y: number }) {
    return (
      Math.abs(a.body.position.x - axe.x) < a.body.width / 2 + 16 &&
      Math.abs(a.body.position.y - axe.y) < a.body.height / 2 + 16
    );
  }

  private dropBridge(room: Room) {
    if (room.bridgeDropped) return;
    room.bridgeDropped = true;
    const keys: string[] = [];
    const smashTile = (column: number, row: number) => {
      if (row < 0 || row >= room.data.height) return;
      if (column < 0 || column >= room.data.width) return;
      const key = `${column},${row}`;
      if (room.smashedTiles.has(key)) return;
      room.smashedTiles.add(key);
      keys.push(key);
      this.burst(
        room.offset + column * 32 + 16,
        MAP_TOP + row * 32 + 16,
        false,
      );
    };
    for (let column = 0; column < room.data.width; column++)
      for (let row = 0; row < room.data.height; row++)
        if (room.data.tiles[row][column] === 137) smashTile(column, row);
    if (room.axe) {
      const column = Math.floor((room.axe.x - room.offset) / 32);
      smashTile(column, 8);
      const rope = room.data.objects.find((o) => o.opcode === 37);
      if (rope) smashTile(rope.column, 9);
    }
    if (keys.length) this.rebuildTerrain(room);
    for (const b of this.bowsers) {
      if (b.areaId !== room.data.id || !b.alive) continue;
      b.alive = false;
      this.burst(b.x, b.y, true);
      this.events.push("splat");
    }
    this.bowserFlames = this.bowserFlames.filter((f) => f.areaId !== room.data.id);
  }
}
