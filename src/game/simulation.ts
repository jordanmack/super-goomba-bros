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
  type Point,
} from "./physics.ts";
import {
  BOWSER_PHRASES,
  HAMMER_BRO_PHRASES,
  MAP_TOP,
  PHRASES,
  STANDING_JUMP_IMPULSE,
  CANNON_BLAST,
  TUNING as T,
  VIEW_HEIGHT,
  blockDrawY,
  jumpArc,
} from "./config.ts";
import {
  colliderFirebarBalls,
  colliderFirebarFrame,
  firebarHits,
  plannerFirebarFrame,
} from "./castle.ts";
import {
  areaData,
  CAMPAIGN,
  isCannonTile,
  isSmashExemptTile,
  isSolidTile,
  isSpringTile,
  stageTimer,
  terrainRects,
  areaMusicKey,
  PIPE_INTRO_MUSIC,
  vineDestination,
  vineExitColumn,
} from "./levels.ts";
import {
  ENEMY_RED_CHEEP,
  FRENZY_BILLS_OR_CHEEPS,
  FRENZY_FLYING_CHEEPS,
  Room,
  enemyRole,
} from "./room.ts";
import {
  FLY_START_Y,
  FLY_TIMER,
  initBlooper,
  initFlyCheep,
  stepBlooper,
  stepFlyCheep,
  stepSwimCheep,
  swimCheepHeight,
  swimCheepIsRed,
  type Step,
  type WaterMotion,
} from "./water-enemies.ts";
import { enclosedWell, firebarCrossing, planJump } from "./navigation.ts";
import { firstEmptySpawnCell } from "./spawn-cell.ts";
import { warpZoneSignage } from "./warp-zone.ts";

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
  cameraY = 0,
  zoom = 1,
  viewHeight = VIEW_HEIGHT,
): PipeClip {
  const mouthX = roomOffset + pipe.column * 32;
  const mouthY = MAP_TOP + pipe.row * 32;
  const z = zoom || 1;
  const viewTop = cameraY + (viewHeight / 2) * (1 - 1 / z);
  const viewH = viewHeight / z;
  if (dir === "down" || dir === "up")
    return {
      x: roomOffset,
      y: viewTop,
      w: roomWidthPx,
      h: Math.max(1, mouthY - viewTop),
    };
  return {
    x: roomOffset,
    y: viewTop,
    w: Math.max(1, mouthX - roomOffset),
    h: viewH,
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
  coinTimerFrames?: number;
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
  kind: "goomba" | "koopa" | "mario" | "fish" | "spike";
  // Lakitu's spike starts as an egg and hatches when it lands.
  egg?: boolean;
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
    // Pipe-intro cutscene: slide speed, frames left before the area changes,
    // and no second pipe sound on arrival.
    speed?: number;
    wait?: number;
    quiet?: boolean;
  };
  navVx?: number;
  navDelay?: number;
  navHoldX?: number;
  navRetry?: number;
  navBackoff?: { x: number; vx: number; delay: number };
  navDetourBelow?: number;
  navFirebarGo?: { bar: number; moves: Uint8Array; step: number; frame: number };
  navFirebarWaitFrame?: number;
  navDrop?: { x: number; vx: number; delay: number };
  // Warned land flee only. Holds count down to zero, then the run continues.
  fleeHold?: number;
  fleeLock?: number;
  fleeEdge?: number;
  fleeEarly?: boolean;
  fleeLip?: number;
  // X modulo run speed before a short hop, restored on landing.
  fleeGrid?: number;
  jumpHeld?: boolean;
  jumpHoldG?: number;
  jumpFallG?: number;
  swimPath?: { x: number; y: number }[];
  swimSize?: number;
  swimRepath?: number;
  // Rescue swimmers (kind "fish"): which one, and its SMB1 motion until
  // warned.
  species?: FishSpecies;
  waterMotion?: WaterMotion;
  // The frenzy's enemy slot (0-2). A frenzy spawn leaves when it swims or
  // falls out of view unwarned.
  frenzySlot?: number;
  // A Cheep Cheep leaves the view only after it has been in it.
  seen?: boolean;
};
export type FishSpecies = "blooper" | "grey-cheep" | "red-cheep";
export type Shout = {
  id: number;
  text: string;
  left: number;
  x: number;
  y: number;
};
/**
 * Which rule picked Mario's current goal. `stomp`, `crowd`, `item`, and
 * `question` are the priority rungs; `flee`, `chase`, `notice`, and `shout`
 * are the states outside that order.
 */
export type MarioGoal =
  | ""
  | "flee"
  | "stomp"
  | "crowd"
  | "item"
  | "question"
  | "chase"
  | "notice"
  // A heard warning retargets him at the player outside the priority order.
  | "shout";
export type TallyPhase =
  | ""
  | "time"
  | "warned"
  | "saved"
  | "died"
  | "flag"
  | "mario"
  | "ending";
/** Shown on the 8-4 card. The player won. Not a Mario or Princess thank-you. */
// The 8-4 card, in order. Mario is named only as the villain.
export const ENDING_LINES = [
  "ONE SMALL GOOMBA STOOD BRAVE.",
  "HE HELD BACK THE EVIL MARIO BROTHERS.",
  "THE KINGDOM IS SAFE.",
  "A NEW QUEST STILL WAITS.",
] as const;
// Campaign sums of each stage-end counter. FLAG counts stages where the
// player beat Mario to the flag.
export type CampaignTotals = Record<TallyLine, number>;
const noTotals = (): CampaignTotals => ({
  warned: 0,
  saved: 0,
  died: 0,
  flag: 0,
  mario: 0,
});
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
  | "firework"
  | "blast"
  | "flame";
/** Looped cue for the 8-4 card. Game over and stage clear stay one-shots. */
export function victoryCue(
  event: GameEvent,
): { name: "worldClear"; loop: true } | null {
  return event === "ending" ? { name: "worldClear", loop: true } : null;
}
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
  // Enemy slot 0..2 from ProcessCannons. A full set blocks new selects.
  slot: number;
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
export type Lakitu = {
  id: number;
  areaId: string;
  x: number;
  y: number;
  facing: number;
  alive: boolean;
  throwWait: number;
};
export type HammerBro = {
  id: number;
  areaId: string;
  column: number;
  body: Body;
  facing: number;
  alive: boolean;
  grounded: boolean;
  // Frame counters. Jump timing is per column so a Bro does not draw from
  // the rescue random stream.
  jumpTimer: number;
  throwTimer: number;
  walkTimer: number;
  shoutWait: number;
};
export type Hammer = {
  id: number;
  broId: number;
  areaId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  age: number;
  windup: number;
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
/** Drawn sprite size for an actor at its currently shown scale. */
// #209: a 3x body collides with floors, walls, and ceilings as a 2x body.
// Its sprite and hurt box stay 3x.
export function solidScale(scale: number) {
  return scale === T.giantScale ? T.mushroomScale : scale;
}

export function actorSpriteBox(actor: Actor, shown: number) {
  const shelled = actor.kind === "koopa" && actor.shell !== "none";
  const h =
    (shelled
      ? 32
      : actor.kind === "koopa"
        ? 48
        : actor.kind === "mario"
          ? 64
          : 32) * shown;
  // Small Mario keeps the 32px frame width.
  const w = actor.kind === "mario" && shown < 1 ? 32 : 32 * shown;
  return { w, h };
}
/** Draw Y so a larger sprite shares the 32px item's visible bottom. */
export function itemDrawY(item: { kind: ItemKind; body: Body }) {
  return item.body.position.y - (itemSpriteSize(item.kind) - 32) / 2;
}
export function itemHoldHidden(item: { hold: number; age: number }) {
  return item.hold > 0 && Math.floor(item.age * T.transformBlinkHz) % 2 === 1;
}
/** Walk-cycle pace. Fish always use both axes. Goombas and koopas do too in water. */
export function walkPace(
  actor: { kind: Actor["kind"]; body: { velocity: { x: number; y: number } } },
  inWater = false,
) {
  const vertical =
    actor.kind === "fish" ||
    (inWater && (actor.kind === "goomba" || actor.kind === "koopa"));
  return vertical
    ? Math.hypot(actor.body.velocity.x, actor.body.velocity.y)
    : Math.abs(actor.body.velocity.x);
}

/** True when Play should advance the walk cycle. Shells stay on shell frames. */
export function actorWalkMoving(
  actor: {
    kind: Actor["kind"];
    grounded: boolean;
    shell: Actor["shell"];
    body: { velocity: { x: number; y: number } };
  },
  inWater: boolean,
) {
  if (actor.kind === "koopa" && actor.shell !== "none") return false;
  const pace = walkPace(actor, inWater);
  if (
    actor.kind === "fish" ||
    (inWater && (actor.kind === "goomba" || actor.kind === "koopa"))
  )
    return pace > 0.1;
  return actor.grounded && pace > 0.1;
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
/** One flagpole firework at a fixed center. Age counts game frames. */
export type Firework = { x: number; y: number; age: number };
/** RunFireworks graphic for this age: 0 small, 1 medium, 2 large. */
export function fireworkFrame(firework: Firework) {
  return Math.floor(firework.age / T.fireworkFrameHold);
}
type SpringPose = "extended" | "mid" | "compressed";
type SpringRider = { id: number; x: number; vx: number; force: number };
type SpringRide = {
  areaId: string;
  column: number;
  row: number;
  step: number;
  tick: number;
  // Pose placed this frame. step may already point at the next pose.
  shown: number;
  riders: SpringRider[];
};
const SPRING_POSE: SpringPose[] = ["mid", "compressed", "mid", "extended"];
// A stroke swimmer steers at the farthest swim-path point it can reach in a
// straight line, up to this many 16px cells ahead, and strokes when that
// point is more than the margin above its rise.
const SWIM_AIM_AHEAD = 12;
const SWIM_STROKE_MARGIN = 8;
// Bloopers and Cheep Cheeps move while within this much of the view.
const SWIMMER_VIEW_MARGIN = 128;
export type TallyLine = Exclude<TallyPhase, "" | "time" | "ending">;
const TALLY_LINES: TallyLine[] = ["warned", "saved", "died", "flag", "mario"];
/** SCORE change for one tally line: count times that line's points. */
export function tallyLineScore(line: TallyLine, count: number) {
  const points = {
    warned: T.warnedScore,
    saved: T.savedScore,
    died: T.diedScore,
    flag: T.flagScore,
    mario: T.marioScore,
  }[line];
  return count * points;
}

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
  // Starman recording. Cloud areas use that same track with no star.
  musicKey() {
    const room = this.activeRoom;
    if (this.pipeIntro && room.data.id !== this.level.main)
      return PIPE_INTRO_MUSIC;
    const star =
      (this.player.alive && this.player.starLeft > 0) ||
      (this.marioActive && this.mario.alive && this.mario.starLeft > 0);
    return areaMusicKey(room.data.type, room.data.header.cloud, star);
  }
  warpSignage() {
    const room = this.activeRoom;
    return warpZoneSignage(
      room.data,
      room.offset,
      this.level.world,
      this.player.body.position.x,
    );
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
  /** Title control for the 8-4 card. No-op unless that card is already up. */
  leaveEnding() {
    if (this.mode !== "finishing" || this.tallyPhase !== "ending") return;
    this.levelIndex = 0;
    this.lives = T.startingLives;
    this.reset("title");
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
  private pipeDestination(
    room: Room,
    pipe: Room["data"]["pipes"][number],
  ) {
    return (
      pipe.destinations.find((d) => d.world === this.level.world) ??
      (room.data.id === "29" ? { area: this.level.main, page: 0 } : undefined)
    );
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
      // A side pipe opens only at its mouth hole, the lower tile of the pipe
      // end, by walking right into its left face. SMB1 DoPlayerSideCheck enters
      // on $6c or $1f and never on the $1c or $6b rim above it.
      const body = actor.body.bounds;
      return (
        pipe.direction === "right" &&
        right &&
        body.max.x >= left - 5 &&
        p.x < left + pipe.width * 32 &&
        body.max.y > top + 32 &&
        body.min.y < top + 64
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
    const destination = this.pipeDestination(room, pipe);
    if (!destination) return;
    const destLevel = this.warpLevelFor(destination);
    if (destLevel !== undefined && actor !== this.player) return;
    return { pipe, destination, destLevel };
  }
  private goalPipeData(room: Room) {
    const goal = room.data.goal;
    if (goal?.kind !== "pipe") return;
    return room.data.pipes.find(
      (p) => p.column === goal.column && p.row === goal.row,
    );
  }
  private isGoalPipeData(
    room: Room,
    pipe: { column: number; row: number },
  ) {
    const goal = this.goalPipeData(room);
    return !!goal && goal.column === pipe.column && goal.row === pipe.row;
  }
  // Depth an NPC must get below to clear a ceiling over a pipe goal, or
  // undefined when it is not on one. The target sits under the actor's own
  // support, so a non-row-2 slab cannot satisfy the clear while standing on it.
  private aboveExitCeiling(a: Actor) {
    const room = this.roomFor(a);
    const goal = room.data.goal;
    if (goal?.kind !== "pipe") return;
    if (Math.abs(a.body.position.x - room.goalX) >= 512) return;
    const opening = MAP_TOP + goal.row * 32;
    const feet = a.body.bounds.max.y;
    if (feet >= opening - 40) return;
    const support = this.solids.find(
      (s) =>
        !s.headOnly &&
        a.body.bounds.max.x > s.bounds.min.x &&
        a.body.bounds.min.x < s.bounds.max.x &&
        Math.abs(s.bounds.min.y - feet) < 3,
    );
    if (!support) return;
    const ceilingTop = MAP_TOP + 2 * 32;
    if (Math.abs(support.bounds.min.y - ceilingTop) < 8) return ceilingTop + 24;
    if (support.bounds.max.y < opening) return support.bounds.max.y + 24;
  }
  private npcCanDrop(a: Actor) {
    return (
      this.roomFor(a).data.type === "castle" ||
      this.aboveExitCeiling(a) !== undefined
    );
  }
  private tryNpcPipeEscape(n: Actor) {
    if (!n.warned) return false;
    const room = this.roomFor(n);
    const entry = this.enterablePipe(n, true, true);
    if (!entry) {
      n.pipeEscapeTried = undefined;
      return false;
    }
    if (!n.grounded) return false;
    const { pipe } = entry;
    if (this.isGoalPipeData(room, pipe)) return false;
    const key = `${room.data.id}:${pipe.column}:${pipe.row}`;
    if (n.pipeEscapeTried === key) return false;
    n.pipeEscapeTried = key;
    if (this.random() >= T.npcPipeEscapeChance) return false;
    return this.tryPipe(n, true, true, true);
  }
  private tryPipe(
    actor: Actor,
    down: boolean,
    right: boolean,
    escape = false,
  ) {
    const entry = this.enterablePipe(actor, down, right);
    if (!entry) return false;
    const { pipe, destination, destLevel } = entry;
    const room = this.roomFor(actor);
    const wasHuge = this.isHuge(actor);
    const hugeFeet = actor.body.bounds.max.y;
    if (wasHuge) this.expireHuge(actor);
    const dir = pipe.direction === "down" ? "down" : "right";
    const vis = this.pipeVisual(actor);
    const left = room.offset + pipe.column * 32;
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
    // expireHuge runs fitActor, which lifts the shrunk body off the side lip.
    else if (wasHuge)
      Body.setPosition(actor.body, {
        x: actor.body.position.x,
        y: hugeFeet - actor.body.height / 2,
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
      clip: pipeClip(
        room.offset,
        room.data.width * 32,
        pipe,
        dir,
        this.cameraY,
        this.cameraZoom,
      ),
      escape: escape || undefined,
    };
    if (actor === this.player && this.pipeIntro && dir === "right") {
      // SMB1 EnterSidePipe slides until the sprite sits on the pipe's 16px
      // column, then holds until ChangeAreaTimer runs out.
      const travel = actor.pipeTravel;
      travel.remaining = Math.max(
        0,
        left - (actor.body.position.x - vis.w / 2),
      );
      travel.speed = T.introPipeSlide;
      travel.wait = T.introPipeFrames;
      travel.quiet = true;
    }
    actor.idleDrop = undefined;
    actor.facing = dir === "down" ? actor.facing : 1;
    actor.navVx = undefined;
    actor.navDelay = undefined;
    actor.navHoldX = undefined;
    actor.navBackoff = undefined;
    actor.navFirebarGo = undefined;
    actor.swimPath = undefined;
    if (actor === this.player && !wasHuge) this.events.push("pipe");
    return true;
  }
  private updatePipeTravel(dt: number) {
    for (const actor of [this.player, ...this.npcs, this.mario]) {
      const travel = actor.pipeTravel;
      if (!travel) continue;
      const step = (travel.speed ?? T.pipeSpeed) * dt * 60;
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
      if (travel.wait !== undefined) travel.wait -= dt * 60;
      if (travel.remaining > 0 || (travel.wait ?? 0) > 0) continue;
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
    this.limitBorrowedArrival(actor, target, travel.destPage);
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
            this.cameraY,
            this.cameraZoom,
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
        if (actor === this.player && !travel.quiet) this.events.push("pipe");
        return;
      }
      this.standAt(actor, target, this.pipeSpawnX(target, travel.destPage));
      this.finishPipeArrival(actor, true);
      if (actor === this.player && !travel.quiet) this.events.push("pipe");
      return;
    }
    const spawnX =
      travel.arrival === "stand"
        ? this.pipeSpawnX(target, travel.destPage)
        : this.pipeFallX(target, travel.destPage, actor);
    if (travel.arrival === "stand") {
      this.standAt(actor, target, spawnX);
      this.finishPipeArrival(actor, true);
      if (actor === this.player && !travel.quiet) this.events.push("pipe");
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
    if (actor === this.player && !travel.quiet) this.events.push("pipe");
  }
  private limitBorrowedArrival(actor: Actor, room: Room, page: number) {
    const id = room.data.id;
    const borrowed =
      !this.level.route.includes(id) && CAMPAIGN.some((l) => l.main === id);
    if (borrowed)
      this.leftLimit = { areaId: id, x: room.offset + page * 16 * 32 };
    else if (actor === this.player) this.leftLimit = undefined;
  }
  /** Left edge for the camera and for actors in this room. */
  roomLeft(room: Room) {
    return this.leftLimit?.areaId === room.data.id
      ? this.leftLimit.x
      : room.offset;
  }
  private holdLeftLimit() {
    const limit = this.leftLimit;
    if (!limit) return;
    for (const a of [this.player, ...this.npcs, this.mario]) {
      if (a.areaId !== limit.areaId || a.body.isStatic || this.inPipe(a))
        continue;
      const over = limit.x - a.body.bounds.min.x;
      if (over <= 0) continue;
      Body.setPosition(a.body, {
        x: a.body.position.x + over,
        y: a.body.position.y,
      });
      if (a.body.velocity.x < 0)
        Body.setVelocity(a.body, { x: 0, y: a.body.velocity.y });
    }
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
  // SMB1 PseudoRandomBitReg. Cold boot seeds the first byte with $a5.
  private cannonLfsr = Uint8Array.of(0xa5, 0, 0, 0, 0, 0, 0);
  // FrenzyEnemyTimer (frames) and BitMFilter for the Cheep Cheep frenzies.
  private frenzyTimer = 0;
  private cheepHeights = 0;
  bowsers: Bowser[] = [];
  bowserFlames: BowserFlame[] = [];
  // Balls of a bar whose anchor cell broke. They fall through solids and hurt
  // no one.
  firebarDebris: { areaId: string; x: number; y: number; vy: number }[] = [];
  lakitus: Lakitu[] = [];
  hammerBros: HammerBro[] = [];
  hammers: Hammer[] = [];
  items: Item[] = [];
  private springRides: SpringRide[] = [];
  vines: Vine[] = [];
  particles: Particle[] = [];
  fireworks: Firework[] = [];
  events: GameEvent[] = [];
  mode: Mode = "title";
  elapsed = 0;
  // Play frames. Firebar phase reads this counter, not elapsed.
  frame = 0;
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
  campaignTotals = noTotals();
  tallyPhase: TallyPhase = "";
  tallyHold = 0;
  /** Looped recording while the 8-4 card is up. Empty once the player leaves. */
  victoryLoop: "" | "worldClear" = "";
  fireworksTotal = 0;
  private fireworksLeft = 0;
  private fireworkWait = 0;
  private fireworksArmed = false;
  deadLeft = 0;
  marioActive = false;
  marioEntered = false;
  marioReturn = T.firstMarioAt as number;
  marioDecision = 0;
  marioChase = 0;
  marioIgnore = 0;
  marioTarget: number | null = null;
  marioHuntItem = false;
  marioGoal: MarioGoal = "";
  marioAim = 0;
  marioReaction = 0;
  waterHitLock = 0;
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
  // Set when a pipe rises into another stage's area, like the 1-2, 2-2, 4-2,
  // and 7-2 goal pipes onto page 11 of 1-1's area 25. Nothing in that area
  // scrolls or moves back left of the arrival page.
  leftLimit?: { areaId: string; x: number };
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
  // Mutual 8x blinks from hugeScale, so the one-sided rule would chain.
  // Hold each victim until that overlap ends, including after Mario leaves 8x.
  private hugeContactHold = new Set<Actor>();
  private marioHugeHold = new Set<Actor>();
  // 8x demotion only. The same overlap must not also shrink. A new
  // hammer or Bro is a separate hit.
  private hammerHugeHold = new Map<
    Actor,
    { bros: Set<number>; hammers: Set<number> }
  >();
  private timerAcc = 0;
  private timerStarted = false;
  private awarded = { warned: 0, saved: 0, died: 0, flag: false, mario: 0 };
  random: () => number;

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
    if (!keepCampaign) this.campaignTotals = noTotals();
    this.physics.clear();
    this.nextId = 1;
    this.leftLimit = undefined;
    this.solids = [];
    this.obstacles = [];
    this.rooms.clear();
    this.npcs = [];
    this.terrainId = 0;
    this.bowsers = [];
    this.bowserFlames = [];
    this.firebarDebris = [];
    this.lakitus = [];
    this.hammerBros = [];
    this.hammers = [];
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
    Body.setFrozen(this.mario.body, true);
    this.mode = mode;
    this.elapsed =
      this.frame =
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
    this.victoryLoop = "";
    this.fireworksTotal = 0;
    this.fireworksLeft = 0;
    this.fireworkWait = 0;
    this.fireworksArmed = false;
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
    this.setMarioStage(this.marioArrivalStage());
    this.marioTarget = null;
    this.marioHuntItem = false;
    this.marioGoal = "";
    this.marioAim =
      this.marioReaction =
      this.waterHitLock =
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
    this.cannonLfsr.fill(0);
    this.cannonLfsr[0] = 0xa5;
    this.frenzyTimer = 0;
    this.cheepHeights = 0;
    this.items = [];
    this.springRides = [];
    this.vines = [];
    this.coinPops = [];
    this.particles = [];
    this.fireworks = [];
    this.events = [];
    this.jumped = false;
    this.wasUp = false;
    this.playerPace = T.walkSpeed;
    this.bouncedNpcs.clear();
    this.hugeContactHold.clear();
    this.marioHugeHold.clear();
    this.hammerHugeHold.clear();
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
    this.spawnHammerBros(room);
    for (const enemy of room.data.enemies) {
      const role = enemyRole(enemy.type);
      const x = room.offset + enemy.column * 32 + 16;
      const y = MAP_TOP + enemy.row * 32 + 16;
      // Type 7 is a Blooper. It only lives in water areas.
      if (role === "fish" && room.data.type === "water")
        this.spawnSwimmer(room, x, y, "blooper", initBlooper(), true);
      // A placed Cheep Cheep: InitCheepCheep, never on a wobbling slot.
      else if (role === "cheep") {
        const red = enemy.type === ENEMY_RED_CHEEP;
        this.spawnSwimmer(room, x, y, red ? "red-cheep" : "grey-cheep", {
          kind: "swim",
          red,
          xForce: 0,
          yDummy: 0,
          down: false,
          originY: enemy.row * 16,
          wobble: false,
        });
      }
    }
  }

  // Bloopers and Cheep Cheeps are rescue NPCs outside the land population.
  private spawnSwimmer(
    room: Room,
    x: number,
    y: number,
    species: FishSpecies,
    motion: WaterMotion,
    fit = false,
  ) {
    const fish = this.actor(x, "fish");
    fish.areaId = room.data.id;
    fish.species = species;
    fish.waterMotion = motion;
    Body.setPosition(fish.body, { x, y });
    Body.setVelocity(fish.body, { x: 0, y: 0 });
    fish.homeX = x;
    fish.facing = -1;
    fish.grounded = false;
    if (fit) {
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
    }
    this.npcs.push(fish);
    return fish;
  }

  // Frenzy objects 42 and 43 in the player's area. Flying Cheep Cheeps use
  // InitFlyingCheepCheep. Opcode 43 in water is the swimming Cheep Cheep side
  // of BulletBillCheepCheep; on land it is the Bullet Bill frenzy, which is
  // not run here. Each frenzy uses enemy slots 0-2.
  private updateFrenzy() {
    if (this.mode !== "playing" || this.pipeIntro) return;
    if (this.frenzyTimer > 0) this.frenzyTimer--;
    const room = this.activeRoom;
    // The view's right edge, without viewWindow's 32px margin.
    const right = this.viewWindow(room).right - 32;
    const frenzy = room.frenzyAt(right);
    const water = room.data.type === "water";
    if (
      frenzy !== FRENZY_FLYING_CHEEPS &&
      !(frenzy === FRENZY_BILLS_OR_CHEEPS && water)
    )
      return;
    if (this.frenzyTimer > 0) return;
    const lfsr = this.cannonLfsr;
    const used = new Set(
      this.npcs
        .filter(
          (n) =>
            n.frenzySlot !== undefined &&
            n.alive &&
            !n.saved &&
            !n.warned &&
            n.areaId === room.data.id,
        )
        .map((n) => n.frenzySlot),
    );
    const slot = [0, 1, 2].find((i) => !used.has(i));
    if (frenzy === FRENZY_FLYING_CHEEPS) {
      // The timer is set before the slot check, so a full frenzy still waits.
      this.frenzyTimer = FLY_TIMER[(lfsr[1 + (slot ?? 0)] ?? 0) & 3]!;
      if (slot === undefined) return;
      const p = this.player.body.position;
      const { motion, offset } = initFlyCheep(
        Math.round(this.player.body.velocity.x * 8),
        [lfsr[slot] ?? 0, lfsr[slot + 1] ?? 0, lfsr[slot + 2] ?? 0],
      );
      const fish = this.spawnSwimmer(
        room,
        p.x + offset * 2,
        MAP_TOP + FLY_START_Y * 2 + 16,
        "red-cheep",
        motion,
      );
      fish.frenzySlot = slot;
      fish.facing = motion.xSpeed < 0 ? -1 : 1;
      return;
    }
    if (slot === undefined) return;
    const pick = lfsr[slot] ?? 0;
    const red = swimCheepIsRed(this.level.world, pick);
    const height = swimCheepHeight(this.cheepHeights, pick);
    this.cheepHeights = height.filter;
    // PutAtRightExtent: 32 NES px past the right edge of the screen.
    const fish = this.spawnSwimmer(
      room,
      right + 64 + 16,
      MAP_TOP + height.top * 2 + 16,
      red ? "red-cheep" : "grey-cheep",
      {
        kind: "swim",
        red,
        xForce: 0,
        yDummy: 0,
        down: (pick & 0x10) !== 0,
        originY: height.top,
        wobble: slot === 2,
      },
    );
    fish.frenzySlot = slot;
    this.frenzyTimer = 0x20;
  }

  // One frame of a Blooper's or Cheep Cheep's own motion while unwarned. The
  // body is frozen and moved directly: like SMB1, they pass through terrain.
  // Returns false when the swimmer has left for good.
  private stepSwimmer(n: Actor) {
    const m = n.waterMotion;
    if (!m) {
      Body.setVelocity(n.body, { x: 0, y: 0 });
      return true;
    }
    Body.setFrozen(n.body, true);
    const room = this.roomFor(n);
    const p = n.body.position;
    const view = this.viewWindow(room);
    const inView =
      room === this.activeRoom &&
      p.x > view.left - SWIMMER_VIEW_MARGIN &&
      p.x < view.right + SWIMMER_VIEW_MARGIN;
    if (!inView) {
      Body.setVelocity(n.body, { x: 0, y: 0 });
      // Bloopers wait off screen. A Cheep Cheep that has left is gone.
      return m.kind === "blooper" || (!n.seen && n.frenzySlot === undefined);
    }
    n.seen = true;
    const frame = Math.round(this.elapsed * 60);
    const top = (p.y - 16 - MAP_TOP) / 2;
    const slot = n.frenzySlot ?? n.id % 5;
    let step: Step;
    if (m.kind === "blooper") {
      const player = this.player;
      const near = this.roomFor(player) === room;
      // PseudoRandomBitReg+1,x & $3f picks a new heading 1 frame in 64.
      if (near && !((this.cannonLfsr[1 + slot] ?? 0) & 0x3f))
        m.dir =
          slot % 2
            ? player.facing < 0
              ? -1
              : 1
            : p.x >= player.body.position.x
              ? -1
              : 1;
      // Player_Y_Position is the top of a 32px box over the player's feet.
      const playerTop = (player.body.bounds.max.y - MAP_TOP) / 2 - 32;
      step = stepBlooper(m, frame, top, near && top + 16 < playerTop);
    } else if (m.kind === "swim") step = stepSwimCheep(m, top);
    else {
      step = stepFlyCheep(m);
      // Back below the screen on the way down: the leap is over.
      if (m.speed > 0 && m.y > FLY_START_Y) return false;
    }
    const dx = step.dx * 2,
      dy = step.dy * 2;
    Body.setPosition(n.body, { x: p.x + dx, y: p.y + dy });
    Body.setVelocity(n.body, { x: dx, y: dy });
    if (dx) n.facing = Math.sign(dx);
    return true;
  }

  private dropSwimmers(gone: Set<Actor>) {
    if (!gone.size) return;
    for (const n of gone) this.physics.remove(n.body);
    this.npcs = this.npcs.filter((n) => !gone.has(n));
  }

  // Type 5 is outside the land population and outside WARNED, SAVED, and DIED.
  private spawnHammerBros(room: Room) {
    for (const enemy of room.data.enemies) {
      if (enemyRole(enemy.type) !== "hammer-bro") continue;
      const body = this.physics.rectangle(
        0,
        0,
        T.hammerBroWidth,
        T.hammerBroHeight,
        false,
      );
      this.placeHammerBro(room, enemy.column, enemy.row, body);
      this.hammerBros.push({
        id: this.nextId++,
        areaId: room.data.id,
        column: enemy.column,
        body,
        facing: -1,
        alive: true,
        grounded: true,
        jumpTimer: 0,
        throwTimer: 0,
        walkTimer: T.hammerBroWalkFrames,
        shoutWait: 0,
      });
    }
  }

  private placeHammerBro(
    room: Room,
    column: number,
    row: number,
    body: Body,
  ) {
    const x = room.offset + column * 32 + 16;
    const rowTop = MAP_TOP + row * 32;
    const half = body.width / 2;
    const floors = room.solids.filter(
      (solid) =>
        !solid.headOnly &&
        x + half > solid.bounds.min.x &&
        x - half < solid.bounds.max.x &&
        solid.bounds.min.y >= rowTop - 1,
    );
    floors.sort((a, b) => a.bounds.min.y - b.bounds.min.y);
    const floor = floors[0];
    Body.setPosition(body, {
      x,
      y: floor
        ? floor.bounds.min.y - body.height / 2
        : T.groundY - body.height / 2,
    });
    Body.setVelocity(body, { x: 0, y: 0 });
  }

  // Idle until Mario is close. They fight him, not the rescue cast. The
  // whole view is too wide: a Bro would jump and land again before Mario
  // reaches the column. Vertical distance must not freeze a Bro who is on
  // screen above the floor. 5-2 column 124 stands near y=154.
  private broCanThrow(bro: HammerBro) {
    if (!this.marioActive || !this.mario.alive) return false;
    if (this.mario.areaId !== bro.areaId || this.inPipe(this.mario))
      return false;
    const dx = this.mario.body.position.x - bro.body.position.x;
    return Math.abs(dx) < 240;
  }

  private broOnGround(bro: HammerBro) {
    const bottom = bro.body.bounds.max.y;
    const half = bro.body.width / 2;
    return this.solids.some(
      (solid) =>
        !solid.headOnly &&
        bro.body.position.x + half > solid.bounds.min.x &&
        bro.body.position.x - half < solid.bounds.max.x &&
        bottom >= solid.bounds.min.y - 2 &&
        bottom <= solid.bounds.min.y + 10 &&
        bro.body.velocity.y >= -0.2,
    );
  }

  private updateHammerBros(dt: number) {
    const frames = dt * 60;
    for (const bro of this.hammerBros) {
      if (!bro.alive) continue;
      if (bro.body.position.y > 640) {
        bro.alive = false;
        this.physics.remove(bro.body);
        continue;
      }
      // Spawned at load, but idle until Mario is close. Otherwise every Bro
      // jumps and walks off before he arrives. Timers stay put, the same way
      // an offscreen throw does. A jump already in the air finishes; zeroing
      // it would leave him hanging.
      if (!this.broCanThrow(bro)) {
        if (this.broOnGround(bro)) Body.setVelocity(bro.body, { x: 0, y: 0 });
        continue;
      }
      bro.grounded = this.broOnGround(bro);
      const marioLeft = this.mario.body.position.x < bro.body.position.x;
      bro.facing = marioLeft ? -1 : 1;
      if (bro.shoutWait > 0) bro.shoutWait -= dt;
      else {
        this.shouts.push({
          id: this.nextId++,
          text: HAMMER_BRO_PHRASES[
            Math.floor(this.random() * HAMMER_BRO_PHRASES.length)
          ]!,
          left: T.bubbleTime,
          x: bro.body.position.x,
          y: bro.body.bounds.min.y - 24,
        });
        this.events.push("warn");
        bro.shoutWait = T.bowserShoutCooldown;
      }
      if (bro.walkTimer > 0) bro.walkTimer -= frames;
      const chase = bro.walkTimer <= 0;
      const shimmy =
        (this.frame & 0x40) === 0 ? -T.hammerBroShimmy : T.hammerBroShimmy;
      const stepX = chase ? bro.facing * T.hammerBroChase : shimmy;
      let jumped = false;
      if (bro.jumpTimer > 0) bro.jumpTimer -= frames;
      else if (bro.grounded) {
        const low = bro.body.position.y > MAP_TOP + 8 * 32;
        Body.setVelocity(bro.body, {
          x: stepX,
          y: -(low ? T.hammerBroJumpHigh : T.hammerBroJumpLow),
        });
        bro.grounded = false;
        bro.jumpTimer = T.hammerBroJumpMin + (bro.column % 64);
        jumped = true;
      }
      if (!jumped)
        Body.setVelocity(bro.body, {
          x: stepX,
          y: bro.body.velocity.y,
        });
      if (jumped || !this.broCanThrow(bro)) continue;
      if (bro.throwTimer > 0) {
        bro.throwTimer -= frames;
        continue;
      }
      if (this.hammers.length >= T.hammerSlots) continue;
      bro.throwTimer = T.hammerThrowFrames;
      this.hammers.push({
        id: this.nextId++,
        broId: bro.id,
        areaId: bro.areaId,
        x: bro.body.position.x + 4,
        y: bro.body.bounds.min.y - 8,
        vx: 0,
        vy: 0,
        facing: bro.facing,
        age: 0,
        windup: T.hammerWindupFrames,
      });
    }
    const keep: Hammer[] = [];
    for (const hammer of this.hammers) {
      hammer.age += dt;
      if (hammer.windup > 0) {
        const bro = this.hammerBros.find(
          (item) => item.id === hammer.broId && item.alive,
        );
        if (!bro) {
          // Still in the hand. Do not launch it from a dead Bro.
          if (hammer.windup > 0) continue;
        } else {
          hammer.x = bro.body.position.x + 4;
          hammer.y = bro.body.bounds.min.y - 8;
          hammer.facing = bro.facing;
          hammer.windup -= frames;
          if (hammer.windup <= 0) {
            hammer.vx = bro.facing * T.hammerSpeed;
            hammer.vy = T.hammerThrowVy;
          }
        }
      }
      if (hammer.windup <= 0) {
        hammer.vy = Math.min(
          T.hammerMaxVy,
          hammer.vy + T.hammerGravity * frames,
        );
        hammer.x += hammer.vx * frames;
        hammer.y += hammer.vy * frames;
      }
      const room = this.rooms.get(hammer.areaId);
      if (
        hammer.age > 6 ||
        hammer.y > 680 ||
        (room &&
          (hammer.x < room.offset - 80 ||
            hammer.x > room.offset + room.data.width * 32 + 80))
      )
        continue;
      keep.push(hammer);
    }
    this.hammers = keep;
  }

  private defeatHammerBro(bro: HammerBro) {
    if (!bro.alive) return;
    bro.alive = false;
    this.physics.remove(bro.body);
    this.hammers = this.hammers.filter(
      (hammer) => hammer.broId !== bro.id || hammer.windup <= 0,
    );
    this.burst(bro.body.position.x, bro.body.position.y, true);
    this.events.push("splat");
  }

  private marioStompsBro(
    bro: HammerBro,
    prevTop: number,
    bottom: number,
    falling: boolean,
  ) {
    if (!falling || this.mario.areaId !== bro.areaId) return false;
    const top = bro.body.bounds.min.y;
    const m = this.mario;
    if (
      Math.abs(m.body.position.x - bro.body.position.x) >=
      (m.body.width + bro.body.width) / 2
    )
      return false;
    // Previous tops, same as an NPC stomp. A Bro who jumps during the step
    // would otherwise rise out of the 8px band and the fall would count as a hit.
    return bottom <= prevTop + 8 && m.body.bounds.max.y >= top - 1;
  }

  private actorHitsHammer(a: Actor, hammer: Hammer) {
    if (hammer.windup > 0) return false;
    return (
      (a.areaId ?? this.level.main) === hammer.areaId &&
      Math.abs(a.body.position.x - hammer.x) < a.body.width / 2 + 10 &&
      Math.abs(a.body.position.y - hammer.y) < a.body.height / 2 + 10
    );
  }

  private actorHitsBro(a: Actor, bro: HammerBro) {
    return (
      bro.alive &&
      (a.areaId ?? this.level.main) === bro.areaId &&
      Math.abs(a.body.position.x - bro.body.position.x) <
        (a.body.width + bro.body.width) / 2 &&
      Math.abs(a.body.position.y - bro.body.position.y) <
        (a.body.height + bro.body.height) / 2
    );
  }

  private hammerHazards(a: Actor) {
    return {
      bros: this.hammerBros.filter((bro) => this.actorHitsBro(a, bro)),
      hammers: this.hammers.filter((hammer) => this.actorHitsHammer(a, hammer)),
    };
  }

  private rememberHugeHammer(a: Actor) {
    const touch = this.hammerHazards(a);
    this.hammerHugeHold.set(a, {
      bros: new Set(touch.bros.map((bro) => bro.id)),
      hammers: new Set(touch.hammers.map((hammer) => hammer.id)),
    });
  }

  private freshHammerHazard(a: Actor) {
    const touch = this.hammerHazards(a);
    if (!touch.bros.length && !touch.hammers.length) return false;
    const hold = this.hammerHugeHold.get(a);
    if (!hold) return true;
    return (
      touch.bros.some((bro) => !hold.bros.has(bro.id)) ||
      touch.hammers.some((hammer) => !hold.hammers.has(hammer.id))
    );
  }

  // Mario only. Star and a lone 8x ignore it. Both sides at 8x demote Mario
  // once. The player and rescue NPCs are not hurt, and DIED does not change.
  private applyHammerHurt(a: Actor) {
    if (a !== this.mario) return false;
    if (!a.alive || a.saved || this.inPipe(a)) return false;
    if (!this.freshHammerHazard(a)) return false;
    if (!this.marioActive || this.marioStun > 0 || this.mario.starLeft > 0)
      return false;
    if (this.isHuge(this.mario) && this.isHuge(this.player)) {
      this.demoteHuge(this.mario);
      this.rememberHugeHammer(this.mario);
      return true;
    }
    const stage = this.marioStage;
    this.hitMarioByFireball(false);
    return this.marioStage !== stage || !this.mario.alive;
  }

  private resolveHammerHits(
    marioBottom: number,
    marioFalling: boolean,
    prevBroTops: Map<number, number>,
  ) {
    if (this.mode !== "playing") return;
    if (this.marioActive && this.mario.alive && this.marioStun === 0)
      for (const bro of this.hammerBros) {
        if (!bro.alive) continue;
        const prevTop = prevBroTops.get(bro.id);
        if (prevTop === undefined) continue;
        if (!this.marioStompsBro(bro, prevTop, marioBottom, marioFalling))
          continue;
        this.defeatHammerBro(bro);
        Body.setVelocity(this.mario.body, {
          x: this.mario.body.velocity.x,
          y: -T.stompBounce,
        });
      }
    for (const [actor, hold] of [...this.hammerHugeHold]) {
      const touch = this.hammerHazards(actor);
      const liveBros = new Set(touch.bros.map((bro) => bro.id));
      const liveHammers = new Set(touch.hammers.map((hammer) => hammer.id));
      for (const id of [...hold.bros]) if (!liveBros.has(id)) hold.bros.delete(id);
      for (const id of [...hold.hammers])
        if (!liveHammers.has(id)) hold.hammers.delete(id);
      if (
        !actor.alive ||
        actor.saved ||
        (hold.bros.size === 0 && hold.hammers.size === 0)
      )
        this.hammerHugeHold.delete(actor);
    }
    if (this.marioActive && this.mario.alive && !this.inPipe(this.mario))
      this.applyHammerHurt(this.mario);
  }

  private onLakituStage() {
    for (const room of this.rooms.values())
      if (room.lakituPoints.length > 0) return true;
    return false;
  }

  private marioArrivalStage(): 0 | 1 | 2 {
    if (this.onLakituStage()) return 2;
    if (this.phase >= 2) return 2;
    return 1;
  }

  private cameraEdges(room: Room) {
    const view = this.viewWindow(room);
    return { left: view.left + 32, right: view.right - 32 };
  }

  // Type-17 rows are entrances. A live Lakitu claims later points.
  private updateLakitu(dt: number) {
    if (this.pipeIntro) return;
    for (const room of this.rooms.values()) {
      const points = room.lakituPoints;
      if (!points.length) continue;
      // viewWindow follows player x. A bonus room is 20000 away and would
      // clamp this cloud to the far end and spend every later spawn point.
      if (this.player.areaId !== room.data.id) continue;
      const edges = this.cameraEdges(room);
      let live = this.lakitus.find((l) => l.alive && l.areaId === room.data.id);
      if (!live) {
        if (this.lakitus.some((l) => l.alive)) continue;
        let index = -1;
        for (let i = 0; i < points.length; i++) {
          if (room.lakituUsed[i]) continue;
          if (points[i]!.x > edges.right + 8) break;
          index = i;
        }
        if (index < 0) continue;
        for (let i = 0; i <= index; i++) room.lakituUsed[i] = true;
        const point = points[index]!;
        live = {
          id: this.nextId++,
          areaId: room.data.id,
          x: point.x,
          y: point.y,
          facing: 1,
          alive: true,
          throwWait: T.lakituThrow,
        };
        this.lakitus.push(live);
      } else {
        for (let i = 0; i < points.length; i++)
          if (points[i]!.x <= edges.right + 8) room.lakituUsed[i] = true;
      }
      const aim =
        this.player.areaId === room.data.id
          ? this.player.body.position.x
          : live.x;
      const step = T.lakituSpeed * dt * 60;
      const dx = aim - live.x;
      live.x += Math.max(-step, Math.min(step, dx));
      const minX = Math.max(
        room.offset + T.lakituWidth / 2,
        edges.left + T.lakituWidth / 2,
      );
      const maxX = edges.right - T.lakituWidth / 2;
      if (maxX > minX) live.x = Math.max(minX, Math.min(maxX, live.x));
      live.facing = Math.sign(aim - live.x) || live.facing || 1;
      // At the spike cap he rides, held where the drop pose would start, so a
      // freed slot still gets the whole pose before the throw.
      const hold = T.lakituDropFrames / 60;
      if (live.throwWait <= hold && this.spikesCapped()) {
        live.throwWait = hold;
        continue;
      }
      live.throwWait -= dt;
      if (live.throwWait > 0) continue;
      live.throwWait = T.lakituThrow;
      this.throwSpike(live);
    }
  }

  private spikesCapped() {
    return (
      this.npcs.filter((n) => n.kind === "spike" && n.alive && !n.saved)
        .length >= T.lakituSpikeCap
    );
  }

  /** SMB1 drop pose: the last 16 frames before a throw that will happen. */
  lakituDropping(lakitu: Lakitu) {
    if (!lakitu.alive || this.spikesCapped()) return false;
    // Replay the 1/60 countdown, so float drift cannot add a 17th frame.
    let wait = lakitu.throwWait;
    for (let frame = 0; frame < T.lakituDropFrames; frame++) {
      wait -= 1 / 60;
      if (wait <= 0) return true;
    }
    return false;
  }

  private throwSpike(lakitu: Lakitu) {
    const spike = this.actor(lakitu.x, "spike");
    spike.areaId = lakitu.areaId;
    Body.setPosition(spike.body, {
      x: lakitu.x,
      y:
        lakitu.y -
        T.lakituHeight / 2 -
        T.spinyEggRise +
        spike.body.height / 2,
    });
    spike.facing = lakitu.facing || 1;
    spike.homeX = lakitu.x;
    spike.grounded = false;
    spike.egg = true;
    Body.setVelocity(spike.body, { x: 0, y: T.spinyEggVy });
    if (overlaps(spike.body, this.solids, 0.01).length) this.fitActor(spike);
    this.npcs.push(spike);
  }

  /** Falls straight down until it lands, then hatches into a walking Spiny. */
  private stepEgg(n: Actor) {
    if (!n.grounded) {
      Body.setVelocity(n.body, {
        x: 0,
        y: Math.min(n.body.velocity.y, T.spinyEggMaxFall),
      });
      return true;
    }
    n.egg = false;
    n.homeX = n.body.position.x;
    n.idleDrop = undefined;
    n.idleWalking = true;
    return false;
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
    const footMin = a.body.bounds.min.x;
    const footMax = a.body.bounds.max.x;
    const onLid = this.solids.some(
      (s) =>
        !s.headOnly &&
        footMax > s.bounds.min.x + 0.01 &&
        footMin < s.bounds.max.x - 0.01 &&
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
    if (a.grounded) {
      a.body.wallRiseArmed = false;
      a.body.wallRiseFaceX = undefined;
    }
  }
  private springActors() {
    const actors = [this.player, ...this.npcs];
    if (this.mario?.alive && !this.mario.body.frozen) actors.push(this.mario);
    return actors;
  }
  private actorById(id: number) {
    if (this.player?.id === id) return this.player;
    if (this.mario?.id === id) return this.mario;
    return this.npcs.find((n) => n.id === id);
  }
  private springLocked(a: Actor) {
    return this.springRides.some((ride) =>
      ride.riders.some((rider) => rider.id === a.id),
    );
  }
  private canStartSpring(a: Actor) {
    return (
      !!a &&
      a.alive &&
      !a.saved &&
      !a.body.frozen &&
      !this.inPipe(a) &&
      !this.onVine(a) &&
      a.grounded &&
      this.roomFor(a).data.type !== "water" &&
      !this.springLocked(a)
    );
  }
  // Landing starts the squash. Jump is not required. One ride per pad.
  private beginSprings() {
    if (this.mode !== "playing" || this.pipeIntro) return;
    for (const a of this.springActors()) {
      if (!this.canStartSpring(a)) continue;
      const spot = this.roomFor(a).springAt(a);
      if (!spot) continue;
      let ride = this.springRides.find(
        (item) => item.areaId === a.areaId && item.column === spot.column,
      );
      if (ride && (ride.step > 0 || ride.tick > 0)) continue;
      if (!ride) {
        ride = {
          areaId: a.areaId ?? this.roomFor(a).data.id,
          column: spot.column,
          row: spot.row,
          step: 0,
          tick: 0,
          shown: 0,
          riders: [],
        };
        this.springRides.push(ride);
      }
      if (ride.riders.some((rider) => rider.id === a.id)) continue;
      // Landing can zero a walk into the pad. NPCs keep a run toward the goal.
      const room = this.roomFor(a);
      const dir = Math.sign(room.goalX - a.body.position.x) || a.facing || 1;
      const vx =
        a === this.player
          ? a.body.velocity.x
          : dir * this.runSpeedFor(a);
      ride.riders.push({
        id: a.id,
        x: a.body.position.x,
        vx,
        force: -T.springVy,
      });
    }
  }
  private releaseSmashedSprings() {
    const gone = this.springRides.filter((ride) => {
      const room = this.rooms.get(ride.areaId);
      return (
        !room ||
        room.smashedTiles.has(`${ride.column},${ride.row}`) ||
        room.smashedTiles.has(`${ride.column},${ride.row + 1}`)
      );
    });
    if (!gone.length) return;
    const drop = new Set(gone);
    this.springRides = this.springRides.filter((ride) => !drop.has(ride));
    for (const ride of gone) {
      for (const rider of ride.riders) {
        const a = this.actorById(rider.id);
        if (!a) continue;
        Body.setFrozen(a.body, false);
        Body.setVelocity(a.body, { x: rider.vx, y: 0 });
        a.grounded = false;
        a.jumpHeld = false;
      }
    }
  }
  private placeSpringRiders() {
    this.releaseSmashedSprings();
    for (const ride of this.springRides) {
      ride.shown = Math.min(ride.step, T.springSquash.length - 1);
      const offset = T.springSquash[ride.shown]!;
      const top = MAP_TOP + ride.row * 32;
      ride.riders = ride.riders.filter((rider) => {
        const a = this.actorById(rider.id);
        if (!a?.alive || a.saved) {
          if (a) Body.setFrozen(a.body, false);
          return false;
        }
        Body.setFrozen(a.body, true);
        Body.setPosition(a.body, {
          x: rider.x,
          y: top + offset - a.body.height / 2,
        });
        a.grounded = false;
        a.body.gravityScale = 0;
        return true;
      });
    }
    this.springRides = this.springRides.filter((ride) => ride.riders.length > 0);
  }
  // A new jump press during the mid squash selects $f4 for that rider.
  // The first compression and the launch pose (offset 0) stay at -14.
  private noteSpringJump(a: Actor, edge: boolean) {
    if (!edge) return;
    const last = T.springSquash.length - 1;
    for (const ride of this.springRides) {
      if (ride.step < 1 || ride.step >= last) continue;
      const rider = ride.riders.find((item) => item.id === a.id);
      if (rider) rider.force = -T.springVyJump;
    }
  }
  private advanceSprings() {
    for (const ride of this.springRides) {
      if (ride.step >= T.springSquash.length - 1) continue;
      ride.tick++;
      if (ride.tick < T.springStepFrames) continue;
      ride.tick = 0;
      ride.step++;
    }
  }
  // Launch after physics so this frame still shows vy -14 or -24, unmoved.
  // Fall gravity ($70) for the whole arc, not jumpArc hold gravity.
  private launchSprings() {
    const ready = this.springRides.filter(
      (ride) => ride.step >= T.springSquash.length - 1,
    );
    this.springRides = this.springRides.filter(
      (ride) => ride.step < T.springSquash.length - 1,
    );
    for (const ride of ready) {
      const top = MAP_TOP + ride.row * 32;
      for (const rider of ride.riders) {
        const a = this.actorById(rider.id);
        if (!a) continue;
        Body.setFrozen(a.body, false);
        Body.setPosition(a.body, {
          x: rider.x,
          y: top - a.body.height / 2,
        });
        Body.setVelocity(a.body, { x: rider.vx, y: rider.force });
        a.grounded = false;
        if (a === this.player || a === this.mario) {
          // SMB1 sets VerticalForce to $70 for the whole spring arc.
          a.jumpHoldG = T.jumpFallGravity;
          a.jumpFallG = T.jumpFallGravity;
        } else {
          // Launch speed is still -14. NPCs keep their jump hang so the
          // bounce clears the obstacle after the pad. Not jumpArc.
          a.jumpHeld = true;
          a.jumpHoldG = T.jumpHoldGravity;
          a.jumpFallG = T.npcJumpFallGravity;
        }
        if (a !== this.player) {
          a.navVx = rider.vx;
          a.navDelay = 0;
          a.navHoldX = undefined;
        }
      }
    }
  }
  springDraw(room: Room) {
    const poses: { column: number; row: number; pose: SpringPose; offset: number }[] =
      [];
    for (const o of room.data.objects) {
      if (o.opcode !== 33) continue;
      if (
        room.smashedTiles.has(`${o.column},${o.row}`) ||
        room.smashedTiles.has(`${o.column},${o.row + 1}`)
      )
        continue;
      const ride = this.springRides.find(
        (item) => item.areaId === room.data.id && item.column === o.column,
      );
      const shown = ride ? ride.shown : -1;
      poses.push({
        column: o.column,
        row: o.row,
        pose: shown < 0 ? "extended" : SPRING_POSE[shown]!,
        offset: shown < 0 ? 0 : T.springSquash[shown]!,
      });
    }
    return poses;
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
    if (!water && a !== this.player) {
      const face = this.flushFaceAt(a);
      a.body.wallRiseArmed = face !== undefined;
      a.body.wallRiseFaceX = face?.x;
      a.body.wallRiseFromLeft = face?.fromLeft ?? false;
    }
    Body.setVelocity(a.body, {
      x: a.body.velocity.x,
      y: -(water
        ? T.swimImpulse
        : (impulse ?? arc.impulse)),
    });
    a.grounded = false;
    if (!water) a.jumpHeld = true;
    if (a === this.player) this.events.push(water ? "splat" : "jump");
  }
  // The wall face already within 1px, including a slight overlap.
  // A floor under the feet is not a face. fromLeft means the face is to the right.
  private flushFaceAt(a: Actor) {
    const limit = 1;
    const b = a.body.bounds;
    let best: { x: number; fromLeft: boolean; gap: number } | undefined;
    for (const solid of this.solids) {
      if (solid.headOnly) continue;
      const s = solid.bounds;
      const overlapY =
        Math.min(b.max.y, s.max.y) - Math.max(b.min.y, s.min.y);
      const gapLeft = b.min.x - s.max.x;
      const gapRight = s.min.x - b.max.x;
      const overhead =
        overlapY <= 1 &&
        s.max.y < b.min.y &&
        ((gapRight <= limit && gapRight >= -limit) ||
          (gapLeft <= limit && gapLeft >= -limit));
      if (overlapY <= 1 && !overhead) continue;
      if (gapRight <= limit && gapRight >= -limit) {
        const gap = Math.abs(gapRight);
        if (!best || gap < best.gap)
          best = { x: s.min.x, fromLeft: true, gap };
      }
      if (gapLeft <= limit && gapLeft >= -limit) {
        const gap = Math.abs(gapLeft);
        if (!best || gap < best.gap)
          best = { x: s.max.x, fromLeft: false, gap };
      }
    }
    return best;
  }
  // Bar clearance at the frame the body occupies that cell. Undefined when
  // this actor does not have to dodge bars.
  private npcFirebarClear(a: Actor) {
    const room = this.roomFor(a);
    if (a === this.mario || !room.firebars.length) return;
    const half = a.body.width / 2;
    const tall = a.body.height / 2;
    return (point: { x: number; y: number; frames: number }) =>
      !this.firebarBlocks(
        room,
        point.x,
        point.y,
        half,
        tall,
        plannerFirebarFrame(this.frame, point.frames),
      );
  }
  // Jump plan from the body that is about to leave the ground. Backoff stores
  // a probe arc only as a reason to walk here; a firebar room flies this one.
  resolveBackoff(a: Actor) {
    const room = this.roomFor(a);
    const p = a.body.position;
    const direction =
      a.navDetourBelow ||
      (room.data.goal?.kind === "pipe" && p.x > room.goalX + 20)
        ? -1
        : 1;
    const pace = this.runSpeedFor(a);
    const impulse = jumpArc(pace).impulse;
    const solids = this.solids.filter(
      (s) =>
        !s.headOnly &&
        s.bounds.max.x > p.x - 400 &&
        s.bounds.min.x < p.x + 400,
    );
    return planJump(
      a.body,
      solids,
      direction,
      pace,
      impulse,
      undefined,
      false,
      undefined,
      this.npcFirebarClear(a),
    );
  }
  // Stable outer edge of the floor under the body, across abutting rects.
  // A moving platform and a well are not a flee lip.
  private floorLip(
    a: Actor,
    direction: number,
    solids: Body[],
    feet: number,
  ) {
    const x = a.body.position.x;
    const under = solids.find(
      (s) =>
        !s.headOnly &&
        !s.motion &&
        x > s.bounds.min.x &&
        x < s.bounds.max.x &&
        Math.abs(s.bounds.min.y - feet) < 4 &&
        !enclosedWell(solids, s.bounds),
    );
    if (!under) return;
    let edge = direction > 0 ? under.bounds.max.x : under.bounds.min.x;
    for (let guard = 0; guard < 64; guard++) {
      let grew = false;
      for (const s of solids) {
        if (s.headOnly || s.motion) continue;
        if (Math.abs(s.bounds.min.y - feet) > 4) continue;
        if (
          direction > 0 &&
          s.bounds.min.x <= edge + 2 &&
          s.bounds.max.x > edge + 1
        ) {
          edge = s.bounds.max.x;
          grew = true;
        } else if (
          direction < 0 &&
          s.bounds.max.x >= edge - 2 &&
          s.bounds.min.x < edge - 1
        ) {
          edge = s.bounds.min.x;
          grew = true;
        }
      }
      if (!grew) break;
    }
    return edge;
  }
  // Near edge of the next same-height floor past this lip. Undefined when
  // the far side is not at this height.
  private farFloorEdge(
    solids: Body[],
    lip: number,
    direction: number,
    feet: number,
  ) {
    let best: number | undefined;
    let bestGap = Infinity;
    for (const s of solids) {
      if (s.headOnly || s.motion) continue;
      if (Math.abs(s.bounds.min.y - feet) > 20) continue;
      if (enclosedWell(solids, s.bounds)) continue;
      const edge = direction > 0 ? s.bounds.min.x : s.bounds.max.x;
      const gap = (edge - lip) * direction;
      if (gap < 8 || gap >= bestGap) continue;
      bestGap = gap;
      best = edge;
    }
    return best;
  }
  // 0..1 from traits drawn at spawn. Same seed and place, same choice.
  private fleeRoll(a: Actor, salt: number, key: number) {
    const mixed =
      Math.sin(a.fear * 12.9898 + a.speed * 78.233 + salt + key * 0.017) *
      43758.5453;
    return mixed - Math.floor(mixed);
  }
  private clearFlee(a: Actor) {
    if (!a.fleeHold && !a.fleeEdge && !a.fleeEarly) return;
    a.fleeHold = 0;
    a.fleeEdge = 0;
    a.fleeEarly = false;
  }
  // Short hop on the floor under the body. Lands before the lip.
  private tryFleeHop(
    a: Actor,
    direction: number,
    solids: Body[],
    lip: number,
  ) {
    const start = a.body.position.x;
    const feet = a.body.bounds.max.y;
    const impulse = 4;
    const launch = planJump(
      a.body,
      solids,
      direction,
      2.4,
      impulse,
      (landing) => {
        const ahead = (landing.x - start) * direction;
        const before = (lip - landing.x) * direction;
        return (
          ahead >= 20 &&
          ahead <= 100 &&
          before >= 40 &&
          Math.abs(landing.y + a.body.height / 2 - feet) < 6
        );
      },
      false,
      undefined,
      undefined,
      0,
    );
    if (!launch) return false;
    const speed = this.runSpeedFor(a);
    a.fleeGrid = ((start % speed) + speed) % speed;
    this.launchJump(a, launch.vx, impulse, 0);
    return true;
  }
  // Leave before the lip only when the lip itself has a safe arc to the same
  // floor. A pit the lip jump cannot clear is not taken early either.
  private tryFleeEarly(
    a: Actor,
    direction: number,
    solids: Body[],
    lip: number,
  ) {
    const pace = this.runSpeedFor(a);
    const impulse = jumpArc(pace).impulse;
    const half = a.body.width / 2;
    const probe = new Body(
      lip - direction * (half + 8),
      a.body.position.y,
      a.body.width,
      a.body.height,
    );
    const lipArc = planJump(
      probe,
      solids,
      direction,
      pace,
      impulse,
      undefined,
      false,
      undefined,
      undefined,
      0,
    );
    if (!lipArc) return false;
    const far = this.farFloorEdge(solids, lip, direction, a.body.bounds.max.y);
    if (far === undefined) return false;
    const launch = planJump(
      a.body,
      solids,
      direction,
      pace,
      impulse,
      (landing) =>
        (landing.x - far) * direction >= 32 &&
        Math.abs(landing.y - lipArc.y) <= 36,
      false,
      undefined,
      undefined,
      0,
    );
    if (!launch) return false;
    this.launchJump(a, launch.vx, impulse, 0);
    return true;
  }
  // Warned land NPCs only. Mario, water, shells, wells, and firebar rooms
  // keep the old path. A hold always reaches zero.
  private fleeDither(
    a: Actor,
    direction: number,
    solids: Body[],
    supported: boolean,
    wall: boolean,
    inWell: boolean,
    firebarHalt: boolean,
  ) {
    const room = this.roomFor(a);
    if (
      a === this.mario ||
      firebarHalt ||
      wall ||
      inWell ||
      a.kind === "fish" ||
      a.shell !== "none" ||
      a.navDetourBelow ||
      room.data.type === "water" ||
      room.firebars.length ||
      room.platforms.length > 0 ||
      room.onSpring(a)
    ) {
      this.clearFlee(a);
      return false;
    }
    if ((a.navRetry ?? 0) > 0) return false;
    if (a.fleeGrid !== undefined) {
      const speed = this.runSpeedFor(a);
      const mod = (value: number) => ((value % speed) + speed) % speed;
      const delta = mod(a.fleeGrid - mod(a.body.position.x));
      const shift = delta > speed / 2 ? delta - speed : delta;
      const next = a.body.position.x + shift;
      const feetNow = a.body.bounds.max.y;
      const onFloor = this.solids.some(
        (s) =>
          !s.headOnly &&
          next > s.bounds.min.x + 2 &&
          next < s.bounds.max.x - 2 &&
          Math.abs(s.bounds.min.y - feetNow) < 4,
      );
      if (onFloor) Body.setPosition(a.body, { x: next, y: a.body.position.y });
      a.fleeGrid = undefined;
    }
    const feet = a.body.bounds.max.y;
    const lip = this.floorLip(a, direction, this.solids, feet);
    if (lip === undefined) return false;
    const reach = (lip - a.body.position.x) * direction;
    if ((a.fleeHold ?? 0) > 0) {
      a.fleeHold = (a.fleeHold ?? 0) - 1;
      this.move(a, 0);
      return true;
    }
    if (!supported || reach < 14) {
      if ((a.fleeEdge ?? 0) > 0) {
        a.fleeEdge = (a.fleeEdge ?? 0) - 1;
        this.move(a, 0);
        return true;
      }
      return false;
    }
    if (reach <= 140) {
      const lipKey = Math.round(lip);
      if (a.fleeLip !== lipKey) {
        a.fleeLip = lipKey;
        // No safe arc from the lip: do not pause or leave early. The old
        // failure path must see the same approach.
        const pace = this.runSpeedFor(a);
        const probe = new Body(
          lip - direction * (a.body.width / 2 + 8),
          a.body.position.y,
          a.body.width,
          a.body.height,
        );
        const lipArc = planJump(
          probe,
          solids,
          direction,
          pace,
          jumpArc(pace).impulse,
        );
        if (!lipArc) {
          a.fleeEarly = false;
          a.fleeEdge = 0;
        } else {
          // Traits already came from the simulation random stream. A new
          // draw here would shift Mario and pipe rolls.
          const roll = this.fleeRoll(a, 1, lipKey);
          if (roll < 0.2) {
            a.fleeEarly = true;
            a.fleeEdge = 0;
          } else if (roll < 0.45) {
            a.fleeEarly = false;
            a.fleeEdge = 6;
          } else {
            a.fleeEarly = false;
            a.fleeEdge = 0;
          }
        }
      }
      if (a.fleeEarly && reach <= 72 && reach >= 48) {
        a.fleeEarly = false;
        if (this.tryFleeEarly(a, direction, solids, lip)) {
          a.fleeLock = 24;
          return true;
        }
      }
      return false;
    }
    if (a.fleeLock === undefined) {
      a.fleeLock = 8;
      return false;
    }
    if (a.fleeLock > 0) {
      a.fleeLock -= 1;
      return false;
    }
    const roll = this.fleeRoll(a, 2, Math.round(a.body.position.x / 96));
    if (roll < 0.16 && this.tryFleeHop(a, direction, solids, lip)) {
      a.fleeLock = 48;
      return true;
    }
    if (roll < 0.28) {
      a.fleeHold = 6;
      a.fleeLock = 64;
      this.move(a, 0);
      return true;
    }
    a.fleeLock = 48;
    return false;
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
    // The 30px wall probe reaches across a one-tile hole and calls the far
    // lip a wall. The step just ahead is air, so this is a drop, not a wall.
    const nearSolid = solids.some(
      (s) =>
        !s.headOnly &&
        ahead > s.bounds.min.x &&
        ahead < s.bounds.max.x &&
        (Math.abs(s.bounds.min.y - feet) < 6 ||
          (feet > s.bounds.min.y + 5 && a.body.bounds.min.y < s.bounds.max.y)),
    );
    const acrossHole = !!a.navDetourBelow && wall && !nearSolid;
    // Arcs are checked against each bar's phase at the frame the body is there.
    // step() advances frame before updateNpcs, so flight 1 is the current frame.
    const room = this.roomFor(a);
    const firebarFree = this.npcFirebarClear(a);
    // A bar mounted at walking height can only be jumped, so a halt falls
    // through to the jump planner instead of standing until a ball arrives.
    let firebarHalt = false;
    if (a !== this.mario && room.firebars.length) {
      const pace = this.runSpeedFor(a);
      const zone = this.firebarZone(a, direction);
      // A walking plan holds height fixed, so it needs the whole crossing on
      // one ledge. Otherwise the jump planner below models the arc instead.
      const onLedge =
        !!zone &&
        !!support &&
        Math.min(zone.exit, p.x) >= support.bounds.min.x &&
        Math.max(zone.exit, p.x) <= support.bounds.max.x;
      const ledgeEndsFirst =
        !!zone &&
        !!support &&
        (support.bounds[direction > 0 ? "max" : "min"].x - zone.hold) *
          direction <
          0;
      if (!zone || ledgeEndsFirst) a.navFirebarGo = undefined;
      else if ((p.x - zone.hold) * direction >= -pace) {
        const now = this.frame;
        // Plan once per bar and replay it; deciding per frame makes the NPC
        // dither on the rim. Only valid on consecutive grounded frames, since a
        // resumed plan would meet a phase it was never solved for.
        if (
          a.navFirebarGo?.bar !== zone.bar ||
          a.navFirebarGo.frame !== now - 1 ||
          a.navFirebarGo.step >= a.navFirebarGo.moves.length
        ) {
          const moves =
            onLedge && a.grounded
              ? this.firebarCrossPlan(a, direction * pace, zone.exit)
              : undefined;
          a.navFirebarGo = moves && {
            bar: zone.bar,
            moves,
            step: 0,
            frame: now,
          };
        }
        const plan = a.navFirebarGo;
        if (plan) {
          plan.frame = now;
          a.navFirebarWaitFrame = now;
          const move = plan.moves[plan.step] ?? 1;
          if (plan.step < plan.moves.length) plan.step++;
          this.move(a, move ? direction * pace : 0);
          return;
        }
        // No walking route past this bar. Stop advancing and let the jump
        // planner below look for an arc over it.
        firebarHalt = true;
        a.navFirebarWaitFrame = now;
        this.move(a, 0);
      } else a.navFirebarGo = undefined;
    }
    if (
      this.fleeDither(
        a,
        direction,
        solids,
        supported,
        wall,
        inWell,
        firebarHalt,
      )
    )
      return;
    if (!firebarHalt && supported && !wall && (a === this.mario || !inWell))
      return;
    if (a === this.mario) {
      if (wall) {
        // Collision zeros vx against a flush wall, so a standing hop cannot clear it.
        const pace = this.runSpeedFor(a);
        const impulse = T.runJumpSpeed;
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
    // A halted NPC is standing safely; a drop or walk-off is only worth taking
    // if it clears the bar, and the jump planner below already proves that.
    if (!firebarHalt && !supported && (!wall || acrossHole) && dropDown) {
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
          undefined,
          firebarFree,
          0,
          !!a.navDetourBelow,
        );
        // A stored firebar drop is replayed later at trait speed, so the
        // fall misses the frame planJump cleared. Fly that arc now instead.
        const step = this.runSpeedFor(a);
        const dist = Math.abs(x - p.x);
        const reach = a.navDetourBelow ? step : a.speed;
        const flyable = drop?.delay === 0 && (!firebarFree || dist <= reach);
        if (drop?.delay === 0 && dist < a.body.width + 40) {
          if (a.navDetourBelow && !flyable) return;
          if (flyable && (firebarFree || a.navDetourBelow)) {
            if (dist >= 0.5) Body.setPosition(a.body, { x, y: p.y });
            this.move(a, drop.vx);
            a.navVx = drop.vx;
            a.navDelay = 0;
            return;
          }
          if (a.navDetourBelow) return;
          if (flyable) {
            a.navDrop = { x, vx: drop.vx, delay: drop.delay };
            return;
          }
        }
      }
    }
    // A landing must stay clear long enough to touch down and step away. The
    // dwell follows the actor's motion, since it keeps walking after landing.
    const firebarLandingFree =
      firebarFree &&
      ((landing: { x: number; y: number; frames: number }) => {
        const step = Math.sign(landing.x - p.x) * this.runSpeedFor(a);
        for (let dwell = 0; dwell <= 10; dwell++)
          if (
            !firebarFree({
              x: landing.x + step * dwell,
              y: landing.y,
              frames: landing.frames + dwell,
            })
          )
            return false;
        return true;
      });
    if (
      !firebarHalt &&
      (dropDown || a.navDetourBelow) &&
      (!wall || acrossHole) &&
      safeDrop &&
      !supported
    ) {
      if (!firebarFree) return;
      // A walk-off is a ballistic arc, so it needs the same bar clearance.
      const fall = planJump(
        a.body,
        solids,
        direction,
        this.runSpeedFor(a),
        0,
        firebarLandingFree,
        true,
        undefined,
        firebarFree,
        0,
      );
      // The replay forces navDelay 0, so a delayed arc is not the one cleared.
      if (fall?.delay === 0) {
        this.move(a, fall.vx);
        a.navVx = fall.vx;
        a.navDelay = 0;
        return;
      }
      // No clear fall: hold, but fall through so a jump can still be planned.
      this.move(a, 0);
    }
    if ((a.navRetry ?? 0) > 0 && !inWell) {
      if (!supported) this.move(a, 0);
      return;
    }
    const pace = this.runSpeedFor(a);
    const impulse = jumpArc(pace).impulse;
    const launch = planJump(
      a.body,
      solids,
      direction,
      pace,
      impulse,
      (landing) => !firebarLandingFree || firebarLandingFree(landing),
      dropDown,
      undefined,
      firebarFree,
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
        (landing) =>
          landing.y < p.y - 24 &&
          (!firebarLandingFree || firebarLandingFree(landing)),
        false,
        undefined,
        firebarFree,
      );
      if (reverse) {
        this.launchJump(a, reverse.vx, impulse, reverse.delay);
      } else {
        this.launchJump(a, direction * this.runSpeedFor(a), impulse, 18);
      }
    } else if (a.body.ignoreWalls) return;
    else {
      if ((!wall || acrossHole) && (safeDrop || a.navDetourBelow)) {
        const drop = planJump(
          a.body,
          solids,
          direction,
          this.runSpeedFor(a),
          0,
          firebarLandingFree,
          false,
          undefined,
          firebarFree,
          // A firebar replay flies delay 0, so that is the arc to rank.
          // Elsewhere a delayed option is still accepted, then flown with no hold.
          firebarFree ? 0 : undefined,
        );
        if (drop && (!firebarFree || drop.delay === 0)) {
          this.move(a, drop.vx);
          a.navVx = drop.vx;
          a.navDelay = 0;
          return;
        }
      }
      a.navRetry = 0.15;
      if (support && !support.motion && !room.onSpring(a)) {
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
          const retry = planJump(
            probe,
            solids,
            direction,
            pace,
            impulse,
            undefined,
            false,
            undefined,
            firebarFree,
          );
          if (
            retry &&
            ((retry.x - p.x) * direction > 24 || retry.y < p.y - 32)
          ) {
            // The probe only chooses where to stand. The launch re-solves
            // from the body that actually jumps, so a firebar room can back
            // up without flying an arc cleared at the probe.
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
          (landing) =>
            landing.y < p.y - 24 &&
            (!firebarLandingFree || firebarLandingFree(landing)),
          false,
          undefined,
          firebarFree,
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
      if (d < T.hearingRange && this.random() < 1 - d / T.hearingRange) {
        this.investigate(this.player, 2);
        this.marioGoal = "shout";
      }
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
    const ratio = solidScale(nextScale) / solidScale(previous);
    Body.scale(a.body, ratio, ratio);
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
      c.content === "coins" ||
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
    if (c.content === "coins") {
      const timedOut = c.coinTimerFrames === 0;
      if (c.coinTimerFrames === undefined)
        c.coinTimerFrames = T.multiCoinTimerFrames;
      this.popCoin(hitter, c.x, c.y);
      c.coinsLeft = Math.max(0, (c.coinsLeft ?? T.multiCoinCount) - 1);
      if (c.coinsLeft <= 0 || timedOut) this.reveal(c);
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
      this.clearHuntedItem(item);
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
    this.clearHuntedItem(item);
  }

  private clearHuntedItem(item: Item) {
    if (this.marioTarget !== item.id) return;
    this.marioTarget = null;
    this.marioHuntItem = false;
    this.marioGoal = "";
    this.marioChase = 0;
    this.marioLook = 0;
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

  // One level. Player and NPC land on 3x. Mario keeps the stage under 8x.
  private demoteHuge(a: Actor) {
    if (!a.alive || !this.isHuge(a)) return false;
    this.events.push("shrink");
    if (a === this.mario) {
      for (const other of [this.player, ...this.npcs]) {
        if (
          other.alive &&
          !other.saved &&
          this.isHuge(other) &&
          this.overlapActors(other, this.mario)
        )
          this.marioHugeHold.add(other);
      }
      a.hugeLeft = 0;
      a.body.ignoreWalls = false;
      this.resize(this.mario, this.marioStage === 0 ? 0.5 : 1, true);
      this.fitActor(this.mario);
      this.marioStun = T.marioStunSeconds;
      return true;
    }
    this.setGoombaScale(a, T.giantScale, true);
    this.hugeContactHold.add(a);
    return true;
  }

  private releaseHugeContactHold() {
    if (!this.marioActive || !this.isHuge(this.mario)) {
      this.hugeContactHold.clear();
      return;
    }
    for (const a of [...this.hugeContactHold]) {
      if (!a.alive || a.saved || !this.overlapActors(a, this.mario))
        this.hugeContactHold.delete(a);
    }
  }

  private releaseMarioHugeHold() {
    if (!this.marioActive) {
      this.marioHugeHold.clear();
      return;
    }
    for (const a of [...this.marioHugeHold]) {
      if (!a.alive || a.saved || !this.isHuge(a) || !this.overlapActors(a, this.mario))
        this.marioHugeHold.delete(a);
    }
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
    // Feet on the lid are a floor, including a body that hangs past the sides.
    // Left, right, and below overlap still smash a non-goal pipe.
    if (c.kind === "pipe" && this.feetOnPipeLid(a, c)) return false;
    return overlaps(a.body, [c.body], 0.1).length > 0;
  }

  // Same 6px band as 8x lid support in the physics step. A deeper overlap is
  // not standing on the lid.
  private feetOnPipeLid(a: Actor, c: Obstacle) {
    const solid = c.body;
    if (!solid) return false;
    const top = solid.bounds.min.y;
    if (a.body.bounds.max.y > top + 6) return false;
    return (
      a.body.bounds.max.x > solid.bounds.min.x + 0.01 &&
      a.body.bounds.min.x < solid.bounds.max.x - 0.01
    );
  }

  private isGoalPipe(room: Room, c: Obstacle) {
    if (c.kind !== "pipe") return false;
    const pipe = this.goalPipeData(room);
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
        // The rider sinks into the pad. That overlap is not a smash.
        // Another 8x body on the same column still smashes it.
        if (
          isSpringTile(room.data.tiles[row]?.[column] ?? 0) &&
          this.springRides.some(
            (ride) =>
              ride.areaId === room.data.id &&
              ride.column === column &&
              ride.riders.some((rider) => rider.id === a.id),
          )
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
    this.commitSmashedTiles(room, smashed);
  }

  // Cannon and spring hits clear the paired tiles, then the room rebuilds once.
  private commitSmashedTiles(room: Room, smashed: string[]) {
    if (!smashed.length) return;
    const expanded = new Set(smashed);
    for (const key of smashed) {
      const [column, row] = key.split(",").map(Number);
      for (const extra of this.stackSmashKeys(room, column!, row!)) {
        if (expanded.has(extra) || room.smashedTiles.has(extra)) continue;
        expanded.add(extra);
        const [c, r] = extra.split(",").map(Number);
        this.burst(room.offset + c! * 32 + 16, MAP_TOP + r! * 32 + 16, false);
      }
    }
    for (const key of expanded) room.smashedTiles.add(key);
    room.cannons = room.cannons.filter(
      (c) => !expanded.has(`${c.column},${c.row}`),
    );
    this.rebuildTerrain(room);
    this.events.push("break");
  }

  private fireballHits(
    f: Fireball,
    radius: number,
    bounds: { min: { x: number; y: number }; max: { x: number; y: number } },
  ) {
    return !(
      f.x + radius <= bounds.min.x ||
      f.x - radius >= bounds.max.x ||
      f.y + radius <= bounds.min.y ||
      f.y - radius >= bounds.max.y
    );
  }

  // Scale 8 shares the body smash list. Any overlap counts, including a top.
  // Feet on a pipe lid are a body stand, not this hit.
  private smashFireball(f: Fireball, radius: number) {
    const hitter = f.owner === "mario" ? this.mario : this.player;
    let smashed = false;
    for (const c of [...this.obstacles]) {
      if (c.broken || !c.body) continue;
      if (c.hidden && !c.used) continue;
      const room = this.hostRoom(c);
      if (room && this.isGoalPipe(room, c)) continue;
      if (!this.fireballHits(f, radius, c.body.bounds)) continue;
      this.yieldSmashPrize(c, hitter);
      if (c.content === "vine") {
        smashed = true;
        continue;
      }
      if (c.kind !== "brick" && c.kind !== "pipe") continue;
      this.breakSolid(c);
      smashed = true;
    }
    if (this.smashFireballTerrain(f, radius)) smashed = true;
    if (smashed) this.releaseSmashedSprings();
    return smashed;
  }

  // A shot has no feet, so the stand-on-surface exemption does not apply.
  private smashFireballTerrain(f: Fireball, radius: number) {
    const minX = f.x - radius;
    const maxX = f.x + radius;
    const minY = f.y - radius;
    const maxY = f.y + radius;
    let smashedAny = false;
    for (const room of this.rooms.values()) {
      const roomRight = room.offset + room.data.width * 32;
      if (maxX <= room.offset || minX >= roomRight) continue;
      const smashed: string[] = [];
      const col0 = Math.floor((minX - room.offset) / 32);
      const col1 = Math.floor((maxX - room.offset - 0.01) / 32);
      const row0 = Math.floor((minY - MAP_TOP) / 32);
      const row1 = Math.floor((maxY - MAP_TOP - 0.01) / 32);
      for (let column = col0; column <= col1; column++) {
        if (column < 0 || column >= room.data.width) continue;
        for (let row = row0; row <= row1; row++) {
          if (row < 2 || row > 14) continue;
          const key = `${column},${row}`;
          if (
            room.smashedTiles.has(key) ||
            !this.smashableTerrain(room, column, row, Number.POSITIVE_INFINITY)
          )
            continue;
          const x = room.offset + column * 32 + 16;
          const y = MAP_TOP + row * 32 + 16;
          if (
            maxX <= x - 16 + 0.1 ||
            minX >= x + 16 - 0.1 ||
            maxY <= y - 16 + 0.1 ||
            minY >= y + 16 - 0.1
          )
            continue;
          smashed.push(key);
          this.burst(x, y, false);
        }
      }
      if (!smashed.length) continue;
      this.commitSmashedTiles(room, smashed);
      smashedAny = true;
    }
    return smashedAny;
  }

  // Hitting one cannon or spring tile destroys that column's paired tiles.
  // Dual-barrel columns bind a hit to one barrel: walk up through cannon
  // tiles, down through pedestal/shaft only, and stop at another barrel.
  private stackSmashKeys(room: Room, column: number, row: number) {
    const tile = room.data.tiles[row]?.[column] ?? 0;
    if (isSpringTile(tile)) {
      const keys: string[] = [];
      for (let r = 2; r <= 12; r++) {
        const id = room.data.tiles[r]?.[column] ?? 0;
        if (!isSpringTile(id)) continue;
        keys.push(`${column},${r}`);
      }
      return keys;
    }
    if (!isCannonTile(tile)) return [] as string[];
    const keys = [`${column},${row}`];
    const hitBarrel = tile === 100;
    for (let r = row - 1; r >= 2; r--) {
      const id = room.data.tiles[r]?.[column] ?? 0;
      if (!isCannonTile(id)) break;
      if (id === 100) {
        if (hitBarrel) break;
        keys.push(`${column},${r}`);
        break;
      }
      keys.push(`${column},${r}`);
    }
    for (let r = row + 1; r <= 12; r++) {
      const id = room.data.tiles[r]?.[column] ?? 0;
      if (id !== 101 && id !== 102) break;
      keys.push(`${column},${r}`);
    }
    return keys;
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
    if (room.axe) {
      const axeCol = Math.floor((room.axe.x - room.offset) / 32);
      const axeRow = Math.floor((room.axe.y - MAP_TOP) / 32);
      if (column === axeCol && row === axeRow) return false;
    }
    // The surface under the feet stays. It has air above it, from the map or
    // from an earlier smash, so breaking the rows above cannot drop the body.
    const top = MAP_TOP + row * 32;
    const above = room.data.tiles[row - 1]?.[column] ?? 0;
    const standableTop =
      row === 0 ||
      !isSolidTile(above) ||
      room.smashedTiles.has(`${column},${row - 1}`);
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
        this.clearHuntedItem(item);
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
    this.marioHuntItem = false;
    this.marioGoal = "";
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
    const box = this.hurtBox(n);
    return box.y - box.halfH;
  }

  private overlapNpcX(n: Actor) {
    return (
      Math.abs(this.player.body.position.x - n.body.position.x) <
      this.hurtBox(this.player).halfW + this.hurtBox(n).halfW
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
      }
    }
  }

  private overlapBody(a: Body, b: Body) {
    return (
      Math.abs(a.position.x - b.position.x) < (a.width + b.width) / 2 &&
      Math.abs(a.position.y - b.position.y) < (a.height + b.height) / 2
    );
  }

  // Actor contact and hits use the hurt box. At 3x that is the drawn 72x84,
  // bigger than the 2x solid body. Both share the feet and center x.
  hurtBox(a: Actor) {
    const b = a.body;
    if (a.scale !== T.giantScale)
      return {
        x: b.position.x,
        y: b.position.y,
        halfW: b.width / 2,
        halfH: b.height / 2,
      };
    const halfW = (b.width / T.mushroomScale) * (T.giantScale / 2);
    const halfH = (b.height / T.mushroomScale) * (T.giantScale / 2);
    return { x: b.position.x, y: b.bounds.max.y - halfH, halfW, halfH };
  }

  private overlapActors(a: Actor, b: Actor) {
    const p = this.hurtBox(a),
      q = this.hurtBox(b);
    return (
      Math.abs(p.x - q.x) < p.halfW + q.halfW &&
      Math.abs(p.y - q.y) < p.halfH + q.halfH
    );
  }

  private overlapFireball(a: Actor, x: number, y: number, radius: number) {
    return this.overlapHurt(a, x, y, radius);
  }

  private overlapHurt(a: Actor, x: number, y: number, half: number) {
    const box = this.hurtBox(a);
    return (
      Math.abs(box.x - x) < box.halfW + half &&
      Math.abs(box.y - y) < box.halfH + half
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

  private hurtFromWaterContact(a: Actor) {
    if (a === this.player && this.marioStun !== 0) return;
    if (this.waterHitLock > 0) return;
    if (this.hurt(a)) {
      this.waterHitLock = 0.15;
      this.marioReaction = 0.15;
    }
  }

  private playerLandStomp(
    a: Actor,
    playerBottom: number,
    playerFalling: boolean,
  ) {
    if (a !== this.player) return false;
    if (!a.grounded && !this.mario.grounded) return false;
    return (
      this.mario.starLeft <= 0 &&
      a.scale > 1 &&
      playerFalling &&
      playerBottom <= this.mario.body.bounds.min.y + 12 &&
      a.body.bounds.max.y >= this.mario.body.bounds.min.y
    );
  }

  private marioHugeLanding(a: Actor, marioFeetBefore: number, marioFalling: boolean) {
    if (!marioFalling || !this.isHuge(a) || !this.isHuge(this.mario)) return false;
    if (a.starLeft > 0) return false;
    if (this.inWater(a) || this.inWater(this.mario)) return false;
    if (a.kind === "spike" || (a.kind === "koopa" && a.shell !== "none"))
      return false;
    if (!a.alive || a.saved || this.inPipe(a) || this.inPipe(this.mario))
      return false;
    if (a === this.player && !a.grounded && !this.mario.grounded) return false;
    if (!this.overlapActors(a, this.mario)) return false;
    const top = a.body.bounds.min.y;
    return (
      marioFeetBefore <= top + 12 && this.mario.body.bounds.max.y >= top
    );
  }

  private resolveMarioHugeLanding(marioFeetBefore: number, marioFalling: boolean) {
    if (!this.marioActive || !this.isHuge(this.mario)) return;
    for (const a of [this.player, ...this.npcs]) {
      if (!this.marioHugeLanding(a, marioFeetBefore, marioFalling)) continue;
      this.stompDemoteActor(a);
    }
  }

  private stompDemoteMario(stomper: Actor) {
    if (this.marioStun !== 0) return;
    if (!this.demoteHuge(this.mario)) return;
    Body.setVelocity(stomper.body, {
      x: stomper.body.velocity.x,
      y: -T.stompBounce,
    });
  }

  private resolveMarioContact(playerBottom: number, playerFalling: boolean) {
    if (!this.marioActive) {
      this.hugeContactHold.clear();
      this.marioHugeHold.clear();
      return;
    }
    this.releaseHugeContactHold();
    this.releaseMarioHugeHold();
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
      if (actorHuge && marioHuge) {
        if (!this.inWater(a) && !this.inWater(this.mario)) {
          if (this.playerLandStomp(a, playerBottom, playerFalling))
            this.stompDemoteMario(a);
          else if (
            a === this.player &&
            !a.grounded &&
            !this.mario.grounded &&
            this.mario.starLeft <= 0
          ) {
            const dy = a.body.bounds.max.y - this.mario.body.bounds.max.y;
            if (dy < -0.5) this.stompDemoteMario(a);
            else if (dy > 0.5) this.demoteHuge(a);
          }
        }
        continue;
      }
      if (actorHuge) {
        if (this.marioStun === 0 && !this.marioHugeHold.has(a))
          this.hitMarioByFireball(a === this.player);
        continue;
      }
      if (marioHuge) {
        if (!this.hugeContactHold.has(a)) this.hurt(a);
        continue;
      }
      if (a.kind === "spike") {
        // Star and 8x already returned above. Any other touch is a loss.
        if (this.mario.starLeft <= 0) this.defeatMario(false);
        continue;
      }
      if (this.inWater(a)) {
        if (a.kind === "koopa" && a.shell !== "none") continue;
        this.hurtFromWaterContact(a);
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
      if (this.playerLandStomp(a, playerBottom, playerFalling))
        this.stompMario(a);
    }
  }

  private inWater(a: Actor) {
    return this.roomFor(a).data.type === "water";
  }

  private shellFallSpeed(n: Actor) {
    return this.inWater(n) ? T.swimFallSpeed : n.body.velocity.y;
  }

  private applyWaterShellMotion(n: Actor, vx: number) {
    const climb =
      n.shell === "moving" ? this.waterShellClimb(n, Math.sign(vx) || n.facing) : 0;
    if (climb > 0) {
      Body.setPosition(n.body, {
        x: n.body.position.x,
        y: n.body.position.y - climb,
      });
      Body.setVelocity(n.body, { x: vx, y: 0 });
      return;
    }
    Body.setVelocity(n.body, {
      x: vx,
      y: n.grounded ? 0 : T.swimFallSpeed,
    });
  }

  private waterShellClimb(n: Actor, direction: number) {
    const ahead = n.body.position.x + direction * (n.body.width / 2 + 3);
    let climb = 0;
    for (const s of this.solids) {
      if (s.headOnly) continue;
      if (ahead <= s.bounds.min.x || ahead >= s.bounds.max.x) continue;
      if (n.body.bounds.min.y >= s.bounds.max.y) continue;
      if (n.body.bounds.max.y <= s.bounds.min.y + 4) continue;
      const rise = n.body.bounds.max.y - s.bounds.min.y;
      if (rise > T.brickSize) return 0;
      if (rise > climb) climb = rise;
    }
    return climb;
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
    n.navFirebarGo = undefined;
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
    const water = this.inWater(n);
    if (n.shell === "stopped") {
      n.wakeLeft = Math.max(0, n.wakeLeft - dt);
      this.move(n, 0);
      if (water) this.applyWaterShellMotion(n, 0);
      if (n.wakeLeft === 0) this.wakeShell(n);
      return;
    }
    if (
      this.shellBlocked(n, n.facing) &&
      !(water && this.waterShellClimb(n, n.facing) > 0)
    )
      n.facing *= -1;
    this.move(n, n.facing * T.shellSpeed);
    if (water) this.applyWaterShellMotion(n, n.facing * T.shellSpeed);
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
      if (side(this.player) && n.shell === "moving") this.shellHits(this.player, n);
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
          !this.inWater(n) &&
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
      p.vy += 520 * dt;
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
      p.blood ? p.age < p.life : p.y < 540,
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
    this.leftLimit = undefined;
    this.player.saved = true;
    Body.setFrozen(this.player.body, true);
    this.events.push("win");
    this.timerAcc = 0;
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
    // Tall-castle sky is shorter than the stock lifts; scale them into (24, roof)
    // so bursts stay on-screen and keep three distinct origins.
    const skyTop = 24;
    const lift = Math.max(...spots.map((entry) => -entry.dy));
    const span = roof - skyTop;
    const scale = span >= lift ? 1 : Math.max(0, span) / lift;
    this.fireworks.push({
      x: room.goalX + spot.dx,
      y: roof + spot.dy * scale,
      age: 0,
    });
    this.score += T.fireworkScore;
    this.events.push("firework");
  }

  private stepFireworks(dt: number) {
    // Age first so a firework fired this step still shows its small frame.
    for (const firework of this.fireworks) firework.age += dt * 60;
    this.fireworks = this.fireworks.filter(
      (firework) => firework.age < T.fireworkFrames * T.fireworkFrameHold,
    );
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
        this.score += tallyLineScore("warned", extra);
        this.awarded.warned = this.warned;
      }
    }
    if (this.tallyReached("saved")) {
      const extra = this.saved - this.awarded.saved;
      if (extra) {
        this.score += tallyLineScore("saved", extra);
        this.awarded.saved = this.saved;
      }
    }
    if (this.tallyReached("died")) {
      const extra = this.died() - this.awarded.died;
      if (extra) {
        this.score += tallyLineScore("died", extra);
        this.awarded.died = this.died();
      }
    }
    if (this.tallyReached("flag") && !this.awarded.flag) {
      this.awarded.flag = true;
      if (this.playerClaimedFlag()) this.score += tallyLineScore("flag", 1);
    }
    if (this.tallyReached("mario")) {
      const extra = this.marioKills - this.awarded.mario;
      if (extra) {
        this.score += tallyLineScore("mario", extra);
        this.awarded.mario = this.marioKills;
      }
    }
  }

  // A stage's counters join the campaign once, when its tally finishes.
  private addCampaignTotals() {
    const totals = this.campaignTotals;
    totals.warned += this.warned;
    totals.saved += this.saved;
    totals.died += this.died();
    totals.flag += this.playerClaimedFlag() ? 1 : 0;
    totals.mario += this.marioKills;
  }

  private stepTally(dt: number) {
    // The 8-4 card waits for leaveEnding. A hold timer must not send it to title.
    if (this.tallyPhase === "ending") return;
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
      this.addCampaignTotals();
      if (this.levelIndex >= CAMPAIGN.length - 1) {
        this.tallyPhase = "ending";
        this.victoryLoop = "worldClear";
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
          this.campaignTotals = noTotals();
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
    if (!scripted) {
      this.elapsed += dt;
      this.frame += 1;
    }
    if (this.mode === "playing") {
      if (!this.timerStarted && this.onMainControl()) this.timerStarted = true;
      if (this.timerStarted) this.tickTimer(dt);
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.audible = Math.max(0, this.audible - dt);
    this.waterHitLock = Math.max(0, this.waterHitLock - dt);
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
        const strokes = this.strokeSwimmer(a);
        a.body.gravityScale = strokes ? T.swimGravity : 0;
        if (strokes)
          a.body.velocity.y = Math.min(T.swimFallSpeed, a.body.velocity.y);
        if (a.body.position.y < MAP_TOP + 64 + a.body.height / 2) {
          a.body.position.y = MAP_TOP + 64 + a.body.height / 2;
          a.body.velocity.y = Math.max(0, a.body.velocity.y);
        }
      }
    }
    if (!scripted)
      for (const room of this.rooms.values())
        room.updatePlatforms(
          this.elapsed,
          [this.player, ...this.npcs, this.mario].filter(
            (a) => !this.inPipe(a),
          ),
          this.player,
        );
    for (const c of this.obstacles) {
      c.bounce = Math.max(0, c.bounce - dt);
      if (c.coinTimerFrames !== undefined)
        c.coinTimerFrames = Math.max(0, c.coinTimerFrames - dt * 60);
    }
    const phase =
      this.elapsed >= T.fireballsAt ? 2 : this.elapsed >= T.fasterAt ? 1 : 0;
    if (phase !== this.phase) {
      this.phase = phase;
      if (!this.marioActive && !this.onLakituStage())
        this.setMarioStage(this.marioArrivalStage());
    }
    for (const a of [this.player, ...this.npcs, this.mario]) {
      this.ground(a);
      if (a.grounded) {
        a.jumpHeld = false;
        a.jumpHoldG = undefined;
        a.jumpFallG = undefined;
      }
    }
    this.beginSprings();
    this.placeSpringRiders();
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
      } else if (this.springLocked(this.player)) {
        this.noteSpringJump(this.player, play.jump && !this.jumped);
        this.player.jumpHeld = play.jump;
        this.jumped = play.jump;
        this.wasUp = play.up;
      } else {
        const dx = Number(play.right) - Number(play.left);
        const p = this.player.body.position;
        const water = this.activeRoom.data.type === "water";
        if (this.pipeIntro) this.playerPace = T.introWalkSpeed;
        else if (water) this.playerPace = T.walkSpeed;
        else if (this.player.grounded)
          this.playerPace = play.run ? T.runSpeed : T.walkSpeed;
        this.move(this.player, dx * this.playerPace);
        if (play.jump && !this.jumped)
          this.jump(this.player);
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
      this.updateFrenzy();
      this.updateNpcs(dt);
      this.updateCrowd(dt);
      this.updateLakitu(dt);
      this.updateHammerBros(dt);
    }
    if (!scripted) this.updateMario(dt);
    for (const a of [this.player, ...this.npcs, this.mario]) {
      if (this.springLocked(a) || this.onVine(a)) {
        a.body.gravityScale = 0;
        continue;
      }
      if (this.roomFor(a).data.type === "water") continue;
      // Bloopers and Cheep Cheeps swim or leap on their own, even on land.
      if (a.kind === "fish") {
        a.body.gravityScale = 0;
        continue;
      }
      const hold = !!a.jumpHeld && a.body.velocity.y < 0 && !a.grounded;
      const holdG = a.jumpHoldG ?? T.jumpHoldGravity;
      const fallG =
        a.jumpFallG ??
        (a === this.player || a === this.mario
          ? T.jumpFallGravity
          : a.egg
            ? T.spinyEggGravity
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
    const prevBroTops = new Map<number, number>();
    for (const bro of this.hammerBros)
      if (bro.alive) prevBroTops.set(bro.id, bro.body.bounds.min.y);
    const prevNpcTops = new Map<Actor, number>();
    for (const n of this.npcs) prevNpcTops.set(n, this.npcTop(n));
    // Mario and NPCs on land keep a jump that starts on a wall face.
    // Water keeps Arcade separation. The player release stays on in every room,
    // including an approach of more than one pixel.
    this.player.body.riseAlongWall = true;
    for (const n of [...this.npcs, this.mario]) {
      n.body.riseAlongWall = this.roomFor(n).data.type !== "water";
      n.body.wallRiseGap = 1;
    }
    this.physics.step(dt);
    this.holdLeftLimit();
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
    // Drop a smashed pad before launch, or the rider would still leave at -14.
    this.releaseSmashedSprings();
    this.launchSprings();
    this.advanceSprings();
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
    this.resolveMarioHugeLanding(marioBottom, marioFalling);
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
    this.resolveHammerHits(marioBottom, marioFalling, prevBroTops);
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
    const gone = new Set<Actor>();
    for (const n of this.npcs) {
      if (!n.alive || n.saved || this.inPipe(n) || this.springLocked(n)) continue;
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
      if (n.egg && this.stepEgg(n)) continue;
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
        (n.kind !== "fish" || n.warned) &&
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
        const speed =
          n.kind === "spike"
            ? T.spinyWalkSpeed
            : T.idleSpeed * (0.8 + n.fear * 0.4);
        if (n.kind === "fish") {
          if (!this.stepSwimmer(n)) gone.add(n);
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
      // A warned swimmer leaves its SMB1 pattern for the rescue door.
      if (n.kind === "fish" && n.body.frozen && !this.pipeIntro) {
        Body.setFrozen(n.body, false);
        Body.setVelocity(n.body, { x: 0, y: 0 });
      }
      n.wait -= dt;
      if (n.wait > 0) {
        this.move(n, 0);
        continue;
      }
      if (this.tryNpcPipeEscape(n)) continue;
      if (n.kind === "fish") {
        this.swim(n);
        continue;
      }
      if (room.data.type === "water") {
        if (this.strokeSwimmer(n)) this.strokeSwim(n, undefined, T.walkSpeed);
        else this.swim(n);
        continue;
      }
      if (n.navDrop) {
        const drop = n.navDrop,
          dx = drop.x - p.x;
        // Replay at run speed in a firebar room. Trait speed is slower than
        // the step that armed the drop, so the fall would start late.
        const pace = this.roomFor(n).firebars.length
          ? this.runSpeedFor(n)
          : n.speed;
        if (Math.abs(dx) <= pace) {
          n.navDrop = undefined;
          if (Math.abs(dx) >= 0.5) Body.setPosition(n.body, { x: drop.x, y: p.y });
          this.move(n, drop.vx);
          n.navVx = drop.vx;
          n.navDelay = 0;
        } else this.move(n, Math.sign(dx) * pace);
        continue;
      }
      if (
        room.data.goal?.kind === "pipe" &&
        Math.abs(p.x - room.goalX) < 100 &&
        n.grounded
      ) {
        const opening = MAP_TOP + room.data.goal.row * 32;
        // The mouth hole is the lower pipe tile. A body wholly below it jumps
        // up toward it. Level with it, walk in: the pipe end is not a wall.
        if (n.body.bounds.min.y >= opening + 64) {
          this.launchJump(
            n,
            Math.sign(room.goalX - p.x) * this.runSpeedFor(n),
            T.runJumpSpeed,
            14,
          );
          continue;
        }
        if (n.body.bounds.max.y > opening + 32 && p.x < room.goalX) {
          this.move(n, this.runSpeedFor(n));
          continue;
        }
      }
      if (n.navBackoff) {
        const target = n.navBackoff;
        if (n.grounded && Math.abs(p.x - target.x) <= n.speed) {
          // Firebar clearance belongs to the body that jumps, not the probe
          // that picked this x. Re-solve here. Other rooms keep the stored arc.
          if (this.roomFor(n).firebars.length) {
            const solved = this.resolveBackoff(n);
            n.navBackoff = undefined;
            if (solved) {
              const pace = this.runSpeedFor(n);
              const impulse = jumpArc(pace).impulse;
              this.launchJump(n, solved.vx, impulse, solved.delay);
            } else this.move(n, 0);
          } else {
            this.launchJump(n, target.vx, T.runJumpSpeed, target.delay);
            n.navBackoff = undefined;
          }
        } else this.move(n, Math.sign(target.x - p.x) * n.speed);
        continue;
      }
      if (n.scale > 1 && !n.body.ignoreWalls) {
        // Holding still at a firebar is deliberate, whether the NPC is walking
        // a crossing plan or waiting for one. It must not read as stuck against
        // scenery and hop into the swing.
        const waiting =
          n.navFirebarWaitFrame !== undefined &&
          this.frame - n.navFirebarWaitFrame <= 1;
        n.blockedFor =
          Math.abs(p.x - n.lastX) < 8 && !waiting ? n.blockedFor + dt : 0;
        n.lastX = p.x;
        if (n.blockedFor > 0.5 && n.grounded) {
          this.jump(n, STANDING_JUMP_IMPULSE);
          n.blockedFor = 0;
        }
      }
      const threat =
        this.marioActive && Math.abs(this.mario.body.position.x - p.x) < 340;
      if (n.state === "idle" || (n.state === "run" && threat && n.wait < -2)) {
        n.state = "run";
        n.wait = -0.01;
      }
      if (n.grounded) {
        const detour = this.aboveExitCeiling(n);
        if (detour !== undefined) n.navDetourBelow ??= detour;
      }
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
    this.dropSwimmers(gone);
  }

  // The player, Mario, and Goombas and Koopas out of a shell swim with the
  // player's water motion. Fish, shells, and other kinds keep their own.
  private strokeSwimmer(a: Actor) {
    return (
      a === this.player ||
      a === this.mario ||
      ((a.kind === "goomba" || a.kind === "koopa") && a.shell === "none")
    );
  }

  // Swim like the player: a stroke sets the swimImpulse rise, and otherwise
  // the swimmer sinks under swimGravity. Sideways pace is its own axis. The
  // swimmer steers along the swim path, and strokes when its aim is above
  // where the current rise tops out. With `ease`,
  // the sideways speed changes by at most that much per frame.
  private strokeSwim(
    actor: Actor,
    target: Point | undefined,
    pace: number,
    ease?: number,
  ) {
    if (
      !actor.swimPath ||
      actor.swimSize !== actor.body.width ||
      actor.swimRepath === 0
    ) {
      actor.swimPath = this.roomFor(actor).swimPath(actor, target);
      actor.swimSize = actor.body.width;
      actor.swimRepath = 0.5;
    }
    const p = actor.body.position;
    const path = actor.swimPath;
    while (path.length > 1 && Math.hypot(p.x - path[0].x, p.y - path[0].y) < 16)
      path.shift();
    const aim = this.swimAim(actor, path);
    if (!aim) {
      this.swimSideways(actor, 0, ease);
      return;
    }
    const dx = aim.x - p.x;
    this.swimSideways(actor, Math.sign(dx) * Math.min(pace, Math.abs(dx)), ease);
    if (Math.abs(dx) > 1) actor.facing = Math.sign(dx);
    const vy = actor.body.velocity.y;
    const sink = (T.gravity * T.swimGravity) / 3600;
    const apex = p.y - (vy < 0 ? (vy * vy) / (2 * sink) : 0);
    if (aim.y < apex - SWIM_STROKE_MARGIN && vy > -1) this.stroke(actor);
  }

  // The 16px path is 4-connected, so it steps. Aim past the steps at the
  // farthest point the whole body can reach in a straight line.
  private swimAim(actor: Actor, path: Point[]) {
    const last = Math.min(path.length - 1, SWIM_AIM_AHEAD);
    if (last <= 0) return path[0];
    const p = actor.body.position;
    const hw = actor.body.width / 2 - 1,
      hh = actor.body.height / 2 - 1;
    let minX = p.x,
      maxX = p.x,
      minY = p.y,
      maxY = p.y;
    for (let i = 0; i <= last; i++) {
      minX = Math.min(minX, path[i].x);
      maxX = Math.max(maxX, path[i].x);
      minY = Math.min(minY, path[i].y);
      maxY = Math.max(maxY, path[i].y);
    }
    const near = this.roomFor(actor).solids.filter(
      (solid) =>
        !solid.headOnly &&
        solid.bounds.max.x >= minX - hw &&
        solid.bounds.min.x <= maxX + hw &&
        solid.bounds.max.y >= minY - hh &&
        solid.bounds.min.y <= maxY + hh,
    );
    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [-hw, hh],
      [hw, hh],
    ];
    for (let i = last; i > 0; i--) {
      const q = path[i];
      if (
        corners.every(
          ([ox, oy]) =>
            !rayBlocked(
              near,
              { x: p.x + ox, y: p.y + oy },
              { x: q.x + ox, y: q.y + oy },
            ),
        )
      )
        return q;
    }
    return path[0];
  }

  // The player's upward stroke without the player's sound.
  private stroke(a: Actor) {
    Body.setVelocity(a.body, { x: a.body.velocity.x, y: -T.swimImpulse });
    a.grounded = false;
  }

  private swimSideways(a: Actor, vx: number, ease?: number) {
    const now = a.body.velocity.x;
    const next =
      ease === undefined ? vx : now + Math.max(-ease, Math.min(ease, vx - now));
    Body.setVelocity(a.body, { x: next, y: a.body.velocity.y });
  }

  // Fish follow the swim path at a flat speed with gravity off. On land a
  // warned Blooper or Cheep Cheep flies to the door: just past goalX, with
  // its feet on the door's floor, where atDoor saves it.
  private swim(actor: Actor, target?: { x: number; y: number }) {
    const room = this.roomFor(actor);
    const goal = room.data.goal;
    if (!target && room.data.type !== "water" && goal && goal.kind !== "pipe")
      target = {
        x: room.goalX + 8,
        y: MAP_TOP + (goal.row + 1) * 32 - actor.body.height / 2 - 1,
      };
    if (!actor.swimPath || actor.swimSize !== actor.body.width) {
      actor.swimPath = room.swimPath(actor, target);
      actor.swimSize = actor.body.width;
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
    const speed = T.npcSwimSpeed;
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
        n.starLeft <= 0 &&
        !this.isHuge(n) &&
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
    this.marioHuntItem = false;
    this.brickTarget = null;
    this.aimMarioAt(target.body.position.x, target.body.velocity.x);
    this.marioChase = duration;
    this.marioReaction =
      (T.marioReaction + this.random() * 0.15) * (1 - this.marioPressure * 0.4);
    this.marioSeenAgo = 0;
  }

  private aimMarioAt(x: number, vx = 0) {
    this.marioAim = x + vx * 14 + (this.random() - 0.5) * 24;
    this.marioSeenAgo = 0;
  }

  private lockMarioActor(target: Actor) {
    if (
      this.marioTarget === target.id &&
      !this.marioHuntItem &&
      this.marioChase > 0
    ) {
      this.brickTarget = null;
      this.aimMarioAt(target.body.position.x, target.body.velocity.x);
      this.marioChase = T.marioChaseSeconds;
      return;
    }
    this.investigate(target, T.marioChaseSeconds + this.random());
  }

  private easyStompCandidate(a: Actor) {
    if (
      !a.alive ||
      a.saved ||
      this.inPipe(a) ||
      this.invincible(a) ||
      this.isHuge(a)
    )
      return false;
    if (a.kind === "spike") return false;
    if (a.kind === "koopa" && a.shell !== "none") return false;
    if (
      this.marioStage === 0 &&
      a === this.player &&
      a.scale >= T.mushroomScale
    )
      return false;
    return true;
  }

  private easyStompWindow(a: Actor, m: { x: number; y: number }) {
    const dist = Math.abs(a.body.position.x - m.x);
    if (dist <= 8 || dist >= 125) return false;
    if (a.body.position.y < m.y - 160) return false;
    if (rayBlocked(this.solids, m, a.body.position)) return false;
    return true;
  }

  private isEasyStomp(a: Actor, m: { x: number; y: number }) {
    if (!this.easyStompCandidate(a) || !this.easyStompWindow(a, m))
      return false;
    if (this.mario.grounded) return true;
    return (
      this.mario.body.velocity.y > 0.2 &&
      this.mario.body.bounds.max.y < a.body.bounds.max.y
    );
  }

  private nearestEasyStomp(candidates: Actor[], m: { x: number; y: number }) {
    return candidates
      .filter((a) => this.isEasyStomp(a, m))
      .sort(
        (a, b) =>
          Math.abs(a.body.position.x - m.x) - Math.abs(b.body.position.x - m.x),
      )[0];
  }

  private detectableCrowd(
    sees: (a: Actor) => boolean,
    hearsCrowd: (a: Actor) => boolean,
  ) {
    const m = this.mario.body.position;
    return this.runningCrowd()
      .filter((a) => sees(a) || hearsCrowd(a))
      .sort(
        (a, b) =>
          Math.abs(a.body.position.x - m.x) - Math.abs(b.body.position.x - m.x),
      )[0];
  }

  private marioCanHunt(item: Item) {
    if (item.emerge > 0 || item.hold > 0) return false;
    return (
      item.kind === "mushroom" ||
      item.kind === "mushroom3x" ||
      item.kind === "mushroom8x" ||
      item.kind === "flower" ||
      item.kind === "star"
    );
  }

  private looseHuntItem(m: { x: number; y: number }) {
    return this.items
      .filter(
        (item) =>
          this.marioCanHunt(item) &&
          Math.abs(item.body.position.x - m.x) < T.marioSight &&
          item.body.position.y > m.y - 160 &&
          !rayBlocked(this.solids, m, item.body.position),
      )
      .sort(
        (a, b) =>
          Math.abs(a.body.position.x - m.x) - Math.abs(b.body.position.x - m.x),
      )[0];
  }

  private lockMarioItem(item: Item) {
    this.brickTarget = null;
    if (
      this.marioHuntItem &&
      this.marioTarget === item.id &&
      this.marioChase > 0
    ) {
      this.aimMarioAt(item.body.position.x, item.body.velocity.x);
      return;
    }
    this.marioTarget = item.id;
    this.marioHuntItem = true;
    this.aimMarioAt(item.body.position.x, item.body.velocity.x);
    this.marioChase = T.marioItemDetourSeconds;
    this.marioReaction =
      (T.marioReaction + this.random() * 0.15) * (1 - this.marioPressure * 0.4);
  }

  private visibleQuestion(m: { x: number; y: number }) {
    return this.obstacles
      .filter((c) => {
        if (
          c.kind !== "brick" ||
          !c.question ||
          c.used ||
          c.broken ||
          c.hidden
        )
          return false;
        if (Math.abs(c.x - m.x) >= T.marioSight) return false;
        if (c.y + T.brickSize / 2 < m.y - 160) return false;
        const solids = c.body
          ? this.solids.filter((s) => s !== c.body)
          : this.solids;
        return !rayBlocked(solids, m, {
          x: c.x,
          y: c.y + T.brickSize / 2 + 2,
        });
      })
      .sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))[0];
  }

  private lockMarioQuestion(block: Obstacle) {
    if (
      this.brickTarget === block.id &&
      this.marioChase > 0 &&
      !this.marioHuntItem &&
      this.marioTarget === null
    ) {
      this.marioAim = block.x;
      this.marioSeenAgo = 0;
      return;
    }
    this.brickTarget = block.id;
    this.marioTarget = null;
    this.marioHuntItem = false;
    this.marioAim = block.x;
    this.marioChase = T.marioItemDetourSeconds;
    this.marioReaction =
      (T.marioReaction + this.random() * 0.15) * (1 - this.marioPressure * 0.4);
    this.marioSeenAgo = 0;
  }

  private pickMarioGoal(
    m: { x: number; y: number },
    candidates: Actor[],
    sees: (a: Actor) => boolean,
    hearsCrowd: (a: Actor) => boolean,
    runners: Set<number>,
  ) {
    const currentActor = this.marioHuntItem
      ? undefined
      : candidates.find((a) => a.id === this.marioTarget);
    const keepAirStomp =
      !!currentActor &&
      !this.mario.grounded &&
      this.easyStompCandidate(currentActor) &&
      this.easyStompWindow(currentActor, m);
    const stomp = this.nearestEasyStomp(candidates, m);
    if (stomp || keepAirStomp) {
      this.lockMarioActor(
        currentActor &&
          (this.isEasyStomp(currentActor, m) || keepAirStomp)
          ? currentActor
          : stomp!,
      );
      this.marioGoal = "stomp";
      return;
    }
    const crowd = this.detectableCrowd(sees, hearsCrowd);
    if (crowd) {
      const keepCrowd =
        currentActor &&
        (sees(currentActor) || hearsCrowd(currentActor)) &&
        this.runningCrowd().some((n) => n.id === currentActor.id);
      this.lockMarioActor(keepCrowd && currentActor ? currentActor : crowd);
      this.marioGoal = "crowd";
      return;
    }
    if (this.marioIgnore === 0) {
      const item = this.looseHuntItem(m);
      if (item) {
        const currentItem = this.marioHuntItem
          ? this.items.find((i) => i.id === this.marioTarget)
          : undefined;
        const keepItem =
          !!currentItem &&
          this.marioCanHunt(currentItem) &&
          Math.abs(currentItem.body.position.x - m.x) < T.marioSight &&
          !rayBlocked(this.solids, m, currentItem.body.position);
        this.lockMarioItem(keepItem && currentItem ? currentItem : item);
        this.marioGoal = "item";
        return;
      }
      const block = this.visibleQuestion(m);
      if (block) {
        const huntingThis =
          this.brickTarget === block.id &&
          this.marioChase > 0 &&
          !this.marioHuntItem &&
          this.marioTarget === null;
        if (
          this.marioStage === 0 ||
          huntingThis ||
          Math.abs(block.x - m.x) < 160
        ) {
          this.lockMarioQuestion(block);
          this.marioGoal = "question";
          return;
        }
      }
    }
    const target = currentActor;
    if (target && !this.marioHuntItem && (sees(target) || hearsCrowd(target))) {
      this.brickTarget = null;
      this.aimMarioAt(target.body.position.x, target.body.velocity.x);
      this.marioChase = T.marioChaseSeconds;
      this.marioGoal = "chase";
      return;
    }
    if (this.marioChase === 0 && this.marioIgnore === 0) {
      const noticed = candidates
        .filter((a) => sees(a) || hearsCrowd(a))
        .sort(
          (a, b) =>
            Math.abs(a.body.position.x - m.x) *
              (runners.has(a.id) ? 1 - this.marioPressure * 0.5 : 1) -
            Math.abs(b.body.position.x - m.x) *
              (runners.has(b.id) ? 1 - this.marioPressure * 0.5 : 1),
        )[0];
      if (noticed) {
        this.investigate(noticed, T.marioChaseSeconds + this.random());
        this.marioGoal = "notice";
      }
    }
  }

  private placeHunterMario() {
    const room = this.roomFor(this.player);
    const screen = room.coinScreenAt(this.player.body.position.x);
    if (screen) return this.placeMarioInScreen(room, screen);
    const half = this.mario.body.width / 2;
    const page = 16 * 32;
    const pageIndex = Math.max(0, Math.floor((this.cameraX - room.offset) / page));
    const preferred = room.offset + pageIndex * page + 100;
    const left = this.roomLeft(room);
    const minX = Math.max(left + half, this.cameraX - 650);
    const maxX = Math.min(this.cameraX - half, room.goalX + 100);
    const tryAt = (x: number) => {
      if (x < minX || x > maxX) return false;
      if (!room.standOnFloor(this.mario, x)) return false;
      const m = this.mario.body.position;
      return (
        this.mario.body.bounds.max.x <= this.cameraX &&
        m.x >= this.cameraX - 650 &&
        m.x <= room.goalX + 100 &&
        this.mario.body.bounds.min.x >= left
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

  // A coin room is a closed screen with no floor off camera. Mario stands on
  // the free floor inside it farthest from the player, or waits for one.
  private placeMarioInScreen(
    room: Room,
    screen: { left: number; right: number; top: number },
  ) {
    const px = this.player.body.position.x;
    let best: number | undefined;
    for (let x = screen.left + 16; x < screen.right; x += 32) {
      if (Math.abs(x - px) < T.coinRoomMarioGap) continue;
      if (!room.standOnFloor(this.mario, x)) continue;
      const b = this.mario.body.bounds;
      if (b.min.x < screen.left || b.max.x > screen.right || b.min.y < screen.top)
        continue;
      if (best === undefined || Math.abs(x - px) > Math.abs(best - px)) best = x;
    }
    return best !== undefined && room.standOnFloor(this.mario, best);
  }

  private enterMarioDoor() {
    this.expireHuge(this.mario, false);
    this.marioActive = false;
    this.marioGoal = "";
    this.marioEntered = true;
    this.mario.navVx = undefined;
    this.mario.navDelay = undefined;
    this.mario.navHoldX = undefined;
    Body.setFrozen(this.mario.body, true);
  }

  private marioPace() {
    return (
      (this.marioRunning ? 5.2 + this.marioPressure * 0.8 : 2.8) +
      this.marioPressure * T.marioCrowdSpeedBonus
    );
  }

  // The land shape with the water numbers. He pulls ahead only on a chase.
  private marioSwimPace() {
    return this.marioRunning
      ? T.marioSwimChasePace + this.marioPressure * T.marioSwimChaseCrowdBonus
      : T.marioSwimPace + this.marioPressure * T.marioSwimCrowdBonus;
  }

  private marioAcceleration() {
    return 0.16 + this.marioPressure * 0.16;
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
      this.setMarioStage(this.marioArrivalStage());
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
      this.marioHuntItem = false;
      this.marioGoal = "";
      this.marioLook = T.marioReaction;
      this.marioJumpWait = 0.8;
      this.marioPause = this.marioReaction = this.marioSeenAgo = 0;
      this.brickTarget = null;
      this.marioStun = 0;
      this.mario.navVx = undefined;
      this.mario.navDelay = undefined;
      this.mario.navHoldX = undefined;
    }
    if (this.inPipe(this.mario) || this.springLocked(this.mario)) return;
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
      this.marioHuntItem = false;
      this.marioGoal = "";
      this.brickTarget = null;
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
      this.marioGoal = "";
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
      this.marioGoal = "flee";
      this.marioTarget = null;
      this.marioHuntItem = false;
      this.brickTarget = null;
      this.marioChase = 0;
      const direction = Math.sign(m.x - starThreat.body.position.x) || -1;
      if (water) {
        this.strokeSwim(
          this.mario,
          { x: m.x + direction * 240, y: m.y },
          this.marioSwimPace(),
          this.marioAcceleration(),
        );
      } else if (!this.mario.grounded && this.mario.navVx !== undefined) {
        this.move(this.mario, this.mario.navVx);
      } else if (this.mario.grounded) {
        this.move(this.mario, direction * (4.8 + this.marioPressure));
        this.autoJump(this.mario, direction);
      }
      return;
    }
    // The flee state ends with the threat, even if no new goal is picked yet.
    if (this.marioGoal === "flee") this.marioGoal = "";
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
      this.pickMarioGoal(m, candidates, sees, hearsCrowd, runners);
    }
    let direction = this.mario.facing;
    this.marioRunning = false;
    if (this.marioChase > 0 && this.marioReaction === 0) {
      this.marioRunning = true;
      const distance = Math.abs(this.marioAim - m.x);
      direction =
        distance > 18 ? Math.sign(this.marioAim - m.x) : this.mario.facing;
      const huntActor = this.marioHuntItem
        ? undefined
        : candidates.find((a) => a.id === this.marioTarget);
      const skipDive =
        this.marioStage === 0 &&
        huntActor === this.player &&
        this.player.scale >= T.mushroomScale;
      if (
        huntActor &&
        distance > 8 &&
        distance < 125 &&
        this.mario.grounded &&
        this.marioJumpWait <= 0 &&
        !this.wallAhead(this.mario, direction) &&
        !skipDive
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
      } else if (
        this.marioHuntItem &&
        this.mario.grounded &&
        this.marioJumpWait <= 0 &&
        !this.wallAhead(this.mario, direction)
      ) {
        const item = this.items.find((i) => i.id === this.marioTarget);
        if (
          item &&
          Math.abs(item.body.position.x - m.x) < 125 &&
          item.body.bounds.max.y < this.mario.body.bounds.min.y
        ) {
          this.marioJumpWait = 0.65 + this.random() * 0.35;
          this.jump(this.mario);
        }
      }
      if (this.marioStage === 2 && this.canThrowFireball("mario")) {
        // Lead the run he is already on, including the crowd bonus.
        // A new shot does not change his horizontal speed.
        this.fireballs.push({
          id: this.nextId++,
          x: m.x,
          y: m.y,
          vx: direction * (this.marioPace() + T.marioFireLead),
          age: 0,
          owner: "mario",
          vy: 0,
          // Matches his body like the player's shot: 8x throws scale 8.
          scale: fireballScaleFor(this.mario.scale),
        });
        this.events.push("fire");
      }
    }
    const brick = this.obstacles.find(
      (c) => c.id === this.brickTarget && !c.broken && !c.used,
    );
    if (this.brickTarget !== null && !brick) {
      this.brickTarget = null;
      if (!this.marioHuntItem && this.marioTarget === null) {
        this.marioGoal = "";
        this.marioChase = 0;
        this.marioLook = 0;
      }
    }
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
      // A side pipe opens at its mouth, which can sit far left of its center.
      const nearPipe =
        this.obstacles.some(
          (c) => c.kind === "pipe" && Math.abs(c.x - m.x) < 65,
        ) || !!this.enterablePipe(this.mario, false, true);
      if (
        nearPipe &&
        this.random() < 0.5 &&
        this.tryPipe(this.mario, true, true)
      )
        return;
      const nearbyBrick = this.obstacles.find(
        (c) => c.kind === "brick" && !c.broken && Math.abs(c.x - m.x) < 100,
      );
      if (nearbyBrick && this.random() < 0.3) this.brickTarget = nearbyBrick.id;
    }
    const speed = this.marioPace();
    const desired =
      this.marioReaction > 0 ||
      (this.marioPause > 0 && !this.wallAhead(this.mario, direction))
        ? 0
        : direction * speed;
    // A jump commits to its takeoff velocity; Mario cannot steer after a dodge.
    if (water) {
      const target = candidates.find((a) => a.id === this.marioTarget);
      const huntItem = this.marioHuntItem
        ? this.items.find((item) => item.id === this.marioTarget)
        : undefined;
      if (this.marioReaction > 0 || this.marioPause > 0)
        this.swimSideways(this.mario, 0, this.marioAcceleration());
      else
        this.strokeSwim(
          this.mario,
          target?.body.position ??
            huntItem?.body.position ?? { x: m.x + direction * 200, y: m.y },
          this.marioSwimPace(),
          this.marioAcceleration(),
        );
    } else if (!this.mario.grounded && this.mario.navVx !== undefined) {
      this.move(this.mario, this.mario.navVx);
    } else if (this.mario.grounded) {
      const vx = this.mario.body.velocity.x;
      const acceleration = this.marioAcceleration();
      this.move(
        this.mario,
        vx + Math.max(-acceleration, Math.min(acceleration, desired - vx)),
      );
      if (desired) this.autoJump(this.mario, direction);
    }
    if (!water)
      for (const a of candidates) {
        const p = a.body.position;
        if (a.kind === "spike") continue;
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
          if (this.isHuge(a) || this.isHuge(this.mario)) {
            // Landing is judged after the step, or a fast fall skips the head band.
            if (
              this.isHuge(a) &&
              this.isHuge(this.mario) &&
              !a.grounded &&
              !this.mario.grounded &&
              this.mario.body.bounds.max.y < a.body.bounds.max.y - 0.5
            )
              this.stompDemoteActor(a);
            continue;
          }
          if (a.kind === "koopa") {
            this.koopaStomp(a, this.mario);
            Body.setVelocity(this.mario.body, {
              x: this.mario.body.velocity.x,
              y: -T.stompBounce,
            });
          } else if (!this.hurt(a)) continue;
          this.marioTarget = null;
          this.marioHuntItem = false;
          this.marioGoal = "";
          this.marioChase = 0;
          this.marioLook = 0;
          this.marioReaction = 0.15;
        }
      }
  }

  private stompDemoteActor(a: Actor) {
    if (!this.demoteHuge(a)) return;
    Body.setVelocity(this.mario.body, {
      x: this.mario.body.velocity.x,
      y: -T.stompBounce,
    });
    this.marioTarget = null;
    this.marioHuntItem = false;
    this.marioGoal = "";
    this.marioChase = 0;
    this.marioLook = 0;
    this.marioReaction = 0.15;
  }

  private canThrowFireball(owner: "player" | "mario") {
    return (
      this.fireballs.filter((f) => f.owner === owner).length < T.fireballSlots
    );
  }

  private fireballPastCamera(f: Fireball) {
    const left = this.cameraX;
    const right = this.cameraX + this.viewWidth;
    const top = this.cameraY;
    const bottom = this.cameraY + VIEW_HEIGHT;
    return (
      f.x < left - this.viewWidth ||
      f.x > right + this.viewWidth ||
      f.y < top - VIEW_HEIGHT ||
      f.y > bottom + VIEW_HEIGHT
    );
  }
  private fireballHitAlreadyVoiced(before: number) {
    return this.events.slice(before).some(
      (event) =>
        event === "bump" ||
        event === "break" ||
        event === "shrink" ||
        event === "death" ||
        event === "marioDeath" ||
        event === "splat",
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
      // One full screen past the camera frees the slot. Not a hit, so no bump.
      if (this.fireballPastCamera(f)) {
        f.age = 6;
        continue;
      }
      let removedBySolid = false;
      const voicedAt = this.events.length;
      const hugeShot = (f.scale ?? 1) >= T.hugeScale;
      if (hugeShot && this.smashFireball(f, radius)) {
        f.age = 6;
        removedBySolid = true;
      } else {
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
            if (
              !hugeShot &&
              f.owner === "player" &&
              (f.scale ?? 1) >= T.playerFireballScale
            ) {
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
              } else if (brick && brick.content !== "coins")
                this.breakBrick(brick);
            }
            f.age = 6;
            removedBySolid = true;
          }
        }
      }
      if (removedBySolid && !this.fireballHitAlreadyVoiced(voicedAt))
        this.events.push("bump");
      if (f.age >= 5) continue;
      if (
        this.bulletBills.some(
          (b) =>
            Math.abs(f.x - b.x) < radius + T.bulletSize / 2 &&
            Math.abs(f.y - b.y) < radius + T.bulletSize / 2,
        )
      ) {
        f.age = 6;
        continue;
      }
      if (f.owner === "player") {
        if (
          this.marioActive &&
          !this.inPipe(this.mario) &&
          this.overlapFireball(this.mario, f.x, f.y, radius)
        ) {
          if (
            this.isHuge(this.mario) &&
            this.isHuge(this.player) &&
            this.mario.starLeft <= 0
          )
            this.demoteHuge(this.mario);
          else this.hitMarioByFireball();
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
          if (a.starLeft <= 0) {
            if (this.isHuge(a) && this.isHuge(this.mario)) this.demoteHuge(a);
            else this.hurt(a);
          }
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
    slot = 0,
  ): BulletBill {
    const bill: BulletBill = {
      id: this.nextId++,
      x,
      y,
      vx,
      areaId,
      cannonX,
      slot,
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
      this.roomLeft(room),
      Math.min(
        room.offset + room.data.width * 32 - width,
        this.player.body.position.x - width * 0.36,
      ),
    );
    return { left: cam - 32, right: cam + width + 32 };
  }

  // NMI rotates seven LSFR bytes. Feedback is bit 1 of the first two bytes.
  private stepCannonLfsr() {
    const reg = this.cannonLfsr;
    const mixed = (reg[0] & 0x02) ^ (reg[1] & 0x02);
    let carry = mixed === 0 ? 0 : 1;
    for (let i = 0; i < reg.length; i++) {
      const byte = reg[i] ?? 0;
      const next = byte & 1;
      reg[i] = ((byte >>> 1) | (carry << 7)) & 0xff;
      carry = next;
    }
  }

  // Three enemy slots. An empty slot reads PseudoRandomBitReg+1,x, keeps the
  // lower nybble, and skips the select when that value is >= $06. Cannon_Timer
  // counts only on a select. A shot that is off screen or too close (same
  // column included) reloads in silence. A bill that leaves plays Sfx_Blast.
  private updateCannons() {
    if (this.pipeIntro) return;
    this.stepCannonLfsr();
    for (const room of this.rooms.values()) {
      if (room.data.type === "water" || !room.cannons.length) continue;
      const bills = this.bulletBills.filter((b) => b.areaId === room.data.id);
      let live = bills.length;
      const occupied = new Set(bills.map((b) => b.slot));
      for (const enemySlot of [2, 1, 0]) {
        if (live >= T.cannonSlots || occupied.has(enemySlot)) continue;
        const pick = (this.cannonLfsr[1 + enemySlot] ?? 0) & 0x0f;
        if (pick >= T.cannonSelectMax) continue;
        // One enemy slot holds one bill. Barrels that share the LSFR index
        // still each count $0e, and they take turns so a pair does not volley.
        const ready: { cannon: (typeof room.cannons)[number]; index: number }[] =
          [];
        let index = 0;
        for (const cannon of room.cannons) {
          if (cannon.slot !== pick) continue;
          const at = index++;
          if (cannon.timer > 0) {
            cannon.timer--;
            continue;
          }
          cannon.timer = T.cannonReload;
          ready.push({ cannon, index: at });
        }
        if (!ready.length || live >= T.cannonSlots) continue;
        // cannonTurn is an index in the full slot group, not a place in
        // `ready`. A filtered list would otherwise skip the same barrel.
        const turn = room.cannonTurn[pick] ?? 0;
        let start = ready.findIndex((item) => item.index >= turn);
        if (start < 0) start = 0;
        for (let i = 0; i < ready.length && live < T.cannonSlots; i++) {
          const choice = ready[(start + i) % ready.length]!;
          if (!this.tryFireCannon(room, choice.cannon, enemySlot)) continue;
          live++;
          room.cannonTurn[pick] = choice.index + 1;
          break;
        }
      }
    }
  }

  private tryFireCannon(
    room: Room,
    cannon: { x: number; y: number },
    slot: number,
  ) {
    if (
      this.player.areaId !== room.data.id ||
      this.inPipe(this.player) ||
      this.player.saved
    )
      return false;
    const view = this.viewWindow(room);
    // viewWindow pads 32px past the camera so flying bills are not popped on
    // the rim. A barrel that does not meet the visible camera is withheld.
    const cameraLeft = view.left + 32;
    const cameraRight = view.right - 32;
    const barrel = 16;
    if (cannon.x + barrel <= cameraLeft || cannon.x - barrel >= cameraRight)
      return false;
    const dx = this.player.body.position.x - cannon.x;
    if (Math.abs(dx) < T.cannonClose) return false;
    const vx = dx < 0 ? -T.bulletSpeed : T.bulletSpeed;
    this.spawnBulletBill(
      cannon.x,
      cannon.y,
      vx,
      room.data.id,
      cannon.x,
      slot,
    );
    this.events.push(CANNON_BLAST.event);
    return true;
  }

  private overlapBill(a: Actor, b: BulletBill) {
    const half = T.bulletSize / 2;
    return (
      a.alive &&
      !a.saved &&
      !this.inPipe(a) &&
      this.overlapHurt(a, b.x, b.y, half)
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
        this.events.push("splat");
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
        this.events.push("splat");
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
    frame = colliderFirebarFrame(this.frame, 1),
  ) {
    for (const bar of room.firebars)
      if (firebarHits(bar, frame, x, y, halfW, halfH)) return true;
    return false;
  }

  // Walk to exitX without touching a bar or a solid. `wall` uses the same
  // vertical test as wallAhead, at each pace step instead of a fixed lookahead.
  private firebarCrossPlan(a: Actor, vx: number, exitX: number) {
    const start = a.body.position;
    const half = a.body.width / 2 + 6,
      tall = a.body.height / 2 + 8;
    const bodyHalf = a.body.width / 2;
    const feet = a.body.bounds.max.y;
    const head = a.body.bounds.min.y;
    return firebarCrossing(
      start.x,
      start.y,
      vx,
      exitX,
      half,
      tall,
      this.frame,
      this.roomFor(a).firebars,
      (x) => {
        if (a.body.ignoreWalls) return false;
        return this.solids.some(
          (solid) =>
            !solid.headOnly &&
            x + bodyHalf > solid.bounds.min.x &&
            x - bodyHalf < solid.bounds.max.x &&
            feet > solid.bounds.min.y + 5 &&
            head < solid.bounds.max.y,
        );
      },
    );
  }

  // Danger zone of the nearest bar ahead that reaches the actor's lane: `hold`
  // is the last safe spot before the swing, `exit` the first safe spot past it.
  // `bar` identifies it by index, since two bars can share a column.
  private firebarZone(a: Actor, direction: number) {
    const room = this.roomFor(a);
    const p = a.body.position;
    const half = a.body.width / 2 + 6,
      tall = a.body.height / 2 + 8;
    let zone: { bar: number; hold: number; exit: number } | undefined,
      nearest = Infinity;
    for (const [index, bar] of room.firebars.entries()) {
      const reach = (bar.length - 1) * T.firebarSpacing + T.firebarBallRadius;
      if (Math.abs(bar.y - p.y) > reach + tall) continue;
      const gap = (bar.x - p.x) * direction;
      // The body has width, so a bar counts as still ahead until its whole
      // swing plus that half-width is behind. A bare `reach` leaves a band the
      // collider can still kill in.
      if (gap + reach + half <= 0 || gap >= nearest) continue;
      nearest = gap;
      zone = {
        bar: index,
        hold: bar.x - direction * (reach + half + 4),
        exit: bar.x + direction * (reach + half + 4),
      };
    }
    return zone;
  }

  firebarBalls(room: Room) {
    return room.firebars.flatMap((bar) =>
      colliderFirebarBalls(bar, this.frame, 1),
    );
  }

  private updateCastleHazards(dt: number) {
    this.updateBowsers(dt);
    this.updateBowserFlames(dt);
    this.dropBrokenFirebars(dt);
    this.collideFirebars();
    this.checkAxes();
  }

  // A bar spins on one cell. Once that cell is gone, whatever removed it (an
  // 8x body, a scale-8 fireball, or a bridge drop), the bar stops. Its balls
  // fall from where they were and are dropped below the map.
  private dropBrokenFirebars(dt: number) {
    for (const room of this.rooms.values()) {
      if (!room.firebars.length) continue;
      const kept = room.firebars.filter((bar) => {
        const column = Math.floor((bar.x - room.offset) / 32);
        const row = Math.floor((bar.y - MAP_TOP) / 32);
        if (!room.smashedTiles.has(`${column},${row}`)) return true;
        for (const ball of colliderFirebarBalls(bar, this.frame, 1))
          this.firebarDebris.push({ areaId: room.data.id, ...ball, vy: 0 });
        return false;
      });
      if (kept.length !== room.firebars.length) room.firebars = kept;
    }
    // Loose balls fall like a defeated actor.
    const fall = (T.deathFallGravity / 3600) * dt * 60;
    for (const ball of this.firebarDebris) {
      ball.vy += fall;
      ball.y += ball.vy * dt * 60;
    }
    const bottom = MAP_TOP + 15 * 32 + T.firebarBallRadius;
    this.firebarDebris = this.firebarDebris.filter((ball) => ball.y < bottom);
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
      const box = this.hurtBox(a);
      if (!this.firebarBlocks(room, box.x, box.y, box.halfW, box.halfH))
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
          this.events.push("flame");
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
      smashTile(column, Math.floor((room.axe.y - MAP_TOP) / 32));
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
