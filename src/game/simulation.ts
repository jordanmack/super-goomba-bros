import { Body, PhysicsWorld, overlaps, rayBlocked } from "./physics.ts";
import { MAP_TOP, PHRASES, TUNING as T } from "./config.ts";
import { CAMPAIGN } from "./levels.ts";
import { Room } from "./room.ts";
import { enclosedWell, planJump } from "./navigation.ts";

export type Input = {
  left: boolean;
  right: boolean;
  jump: boolean;
  fire: boolean;
  down: boolean;
  run: boolean;
};
export const emptyInput = (): Input => ({
  left: false,
  right: false,
  jump: false,
  fire: false,
  down: false,
  run: false,
});
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
};
export type Actor = {
  id: number;
  body: Body;
  kind: "goomba" | "koopa" | "mario";
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
  blockedFor: number;
  lastX: number;
  areaId?: string;
  pipeWait?: number;
  pipeTravel?: {
    phase: "enter" | "exit";
    dir: "down" | "up" | "right" | "left";
    remaining: number;
    destArea: string;
    destPage: number;
    clip?: { x: number; y: number; w: number; h: number };
  };
  navVx?: number;
  navDelay?: number;
  navHoldX?: number;
  navRetry?: number;
  navBackoff?: { x: number; vx: number; delay: number };
  navDetourBelow?: number;
  navDrop?: { x: number; vx: number; delay: number };
  jumpHeld?: boolean;
  swimPath?: { x: number; y: number }[];
  swimSize?: number;
  swimRepath?: number;
};
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
  | "appear";
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
export const fireballScaleFor = (scale: number) =>
  scale >= T.hugeScale
    ? T.hugeScale
    : scale >= T.giantScale
      ? T.playerFireballScale
      : 1;
export type Item = {
  id: number;
  kind: ItemKind;
  body: Body;
  emerge: number;
  originY: number;
  direction: number;
  age: number;
};
export type CoinPop = { x: number; y: number; age: number };
export const rescueImpossible = (
  saved: number,
  living: number,
  required: number,
) => saved + living < required;

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
      spawn = room.offset + page * 512 + 100;
    const onPage = room.data.pipes.filter(
      (p) => p.column >= start && p.column < end,
    );
    if (!onPage.length) return;
    return onPage.reduce((best, pipe) => {
      const x = room.offset + (pipe.column + pipe.width / 2) * 32,
        bestX = room.offset + (best.column + best.width / 2) * 32;
      return Math.abs(x - spawn) < Math.abs(bestX - spawn) ? pipe : best;
    });
  }
  private pipeClip(
    room: Room,
    pipe: { column: number; row: number; width: number; height: number },
    dir: "down" | "up" | "right" | "left",
  ) {
    const x = room.offset + pipe.column * 32,
      y = MAP_TOP + pipe.row * 32,
      w = pipe.width * 32,
      h = pipe.height * 32;
    if (dir === "down" || dir === "up")
      return { x, y: MAP_TOP, w, h: Math.max(1, y - MAP_TOP) };
    return { x: room.offset, y, w: Math.max(1, x - room.offset), h };
  }
  private tryPipe(actor: Actor, down: boolean, right: boolean) {
    if ((actor.pipeWait ?? 0) > 0 || this.inPipe(actor)) return false;
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
    if (!pipe) return false;
    const destination =
      pipe.destinations.find((d) => d.world === this.level.world) ??
      (room.data.id === "29" ? { area: this.level.main, page: 0 } : undefined);
    if (!destination) return false;
    const dir = pipe.direction === "down" ? "down" : "right";
    const vis = this.pipeVisual(actor);
    const left = room.offset + pipe.column * 32;
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
      clip: this.pipeClip(room, pipe, dir),
    };
    actor.idleDrop = undefined;
    actor.facing = dir === "down" ? actor.facing : 1;
    actor.navVx = undefined;
    actor.navHoldX = undefined;
    actor.navBackoff = undefined;
    actor.swimPath = undefined;
    if (actor === this.player) {
      this.events.push("pipe");
      this.bubbleLeft = 0;
    }
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
      if (travel.phase === "enter") this.beginPipeExit(actor, travel);
      else this.endPipeTravel(actor);
    }
  }
  private beginPipeExit(
    actor: Actor,
    travel: NonNullable<Actor["pipeTravel"]>,
  ) {
    const target = this.loadRoom(travel.destArea);
    actor.areaId = target.data.id;
    const dest = this.pipeOnPage(target, travel.destPage);
    const vis = this.pipeVisual(actor);
    const height = actor.body.height;
    if (!dest) {
      const x = target.offset + travel.destPage * 512 + 100;
      target.dropOnto(actor, x);
      Body.setPosition(actor.body, {
        x: Math.max(
          target.offset + vis.w / 2,
          actor.body.position.x - vis.w,
        ),
        y: actor.body.position.y,
      });
      actor.facing = 1;
      actor.pipeTravel = {
        phase: "exit",
        dir: "right",
        remaining: vis.w,
        destArea: travel.destArea,
        destPage: travel.destPage,
      };
    } else {
      const left = target.offset + dest.column * 32,
        top = MAP_TOP + dest.row * 32,
        clip = this.pipeClip(
          target,
          dest,
          dest.direction === "right" ? "left" : "up",
        );
      if (dest.direction === "right") {
        Body.setPosition(actor.body, {
          x: left + dest.width * 16,
          y: top + dest.height * 32 - height / 2,
        });
        actor.facing = -1;
        actor.pipeTravel = {
          phase: "exit",
          dir: "left",
          remaining: dest.width * 16 + vis.w / 2 + 0.5,
          destArea: travel.destArea,
          destPage: travel.destPage,
          clip,
        };
      } else {
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
          clip,
        };
      }
    }
    if (actor === this.player) this.events.push("pipe");
  }
  private endPipeTravel(actor: Actor) {
    actor.pipeTravel = undefined;
    actor.pipeWait = T.pipeCooldown;
    actor.homeX = actor.body.position.x;
    actor.grounded = true;
    Body.setFrozen(actor.body, false);
    Body.setVelocity(actor.body, { x: 0, y: 0 });
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
    return room;
  }
  solids: Body[] = [];
  player!: Actor;
  npcs: Actor[] = [];
  mario!: Actor;
  obstacles: Obstacle[] = [];
  fireballs: Fireball[] = [];
  items: Item[] = [];
  particles: Particle[] = [];
  events: GameEvent[] = [];
  mode: Mode = "title";
  elapsed = 0;
  warned = 0;
  saved = 0;
  coins = 0;
  phase = 0;
  cooldown = 0;
  audible = 0;
  bubble = "";
  bubbleLeft = 0;
  finishLeft = 0;
  deadLeft = 0;
  marioActive = false;
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
  doomed = false;
  brickTarget: number | null = null;
  cameraX = 0;
  viewWidth = 960;
  private flagPrevPlayerX = 0;
  private flagPrevMarioX = 0;
  lives: number = T.startingLives;
  introLeft = 0;
  gameoverLeft = 0;
  coinPops: CoinPop[] = [];
  private nextId = 1;
  private jumped = false;
  private playerPace = T.walkSpeed as number;
  private bouncedNpcs = new Set<Actor>();
  private shellStomps = new Set<Actor>();
  random: () => number;

  constructor(random = Math.random, physics = new PhysicsWorld()) {
    this.physics = physics;
    this.random = random;
    this.reset("title");
  }

  reset(mode: Mode = "playing") {
    this.physics.clear();
    this.nextId = 1;
    this.solids = [];
    this.obstacles = [];
    this.rooms.clear();
    this.terrainId = 0;
    const main = this.loadRoom(this.level.main);
    this.player = this.actor(100, "goomba");
    const entry = this.loadRoom(this.level.route[0]);
    this.player.areaId = entry.data.id;
    entry.place(this.player, entry.offset + 100);
    this.npcs = Array.from({ length: T.population }, (_, i) => {
      const x =
        main.offset +
        390 +
        i * ((main.goalX - main.offset - 650) / T.population) +
        this.random() * 65;
      const actor = this.actor(x, i % 3 === 1 ? "koopa" : "goomba");
      main.place(actor, x);
      return actor;
    });
    this.mario = this.actor(entry.offset - 200, "mario");
    this.mario.areaId = entry.data.id;
    this.setMarioStage(1);
    Body.setFrozen(this.mario.body, true);
    this.mode = mode;
    this.elapsed =
      this.warned =
      this.saved =
      this.coins =
      this.phase =
      this.cooldown =
      this.audible =
        0;
    this.bubble = "";
    this.bubbleLeft = this.finishLeft = this.deadLeft = 0;
    this.introLeft = mode === "intro" ? T.introSeconds : 0;
    this.gameoverLeft = 0;
    this.marioActive = false;
    this.marioReturn = T.firstMarioAt;
    this.marioDecision = this.marioChase = this.marioIgnore = 0;
    this.brickTarget = null;
    this.marioCrowd = this.marioPressure = 0;
    this.marioRunning = false;
    this.marioStun = 0;
    this.marioDeath = this.playerDeath = null;
    this.marioStage = 1;
    this.doomed = false;
    this.marioTarget = null;
    this.marioAim =
      this.marioReaction =
      this.marioLook =
      this.marioSeenAgo =
      this.marioJumpWait =
      this.marioPause =
        0;
    this.cameraX = 0;
    this.fireballs = [];
    this.items = [];
    this.coinPops = [];
    this.particles = [];
    this.events = [];
    this.jumped = false;
    this.playerPace = T.walkSpeed;
    this.bouncedNpcs.clear();
    this.flagPrevPlayerX = this.player.body.position.x;
    this.flagPrevMarioX = this.mario.body.position.x;
    this.shellStomps.clear();
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
    return T.population - this.saved - this.living();
  }
  private ground(a: Actor) {
    const bottom = a.body.position.y + (a.kind === "mario" ? 19 : 14) * a.scale;
    const onLid = this.solids.some(
      (s) =>
        !s.headOnly &&
        a.body.bounds.max.x > s.bounds.min.x + 0.01 &&
        a.body.bounds.min.x < s.bounds.max.x - 0.01 &&
        Math.abs(bottom - s.bounds.min.y) < 12,
    );
    const inVolume =
      a.body.ignoreWalls &&
      Math.abs(bottom - T.groundY) < 12 &&
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
    if (
      a !== this.player &&
      a !== this.mario &&
      !a.grounded &&
      a.navVx !== undefined
    ) {
      // Keep the planned launch velocity so a reverse takeoff is not flipped.
      if ((a.navDelay ?? 0) > 0) vx = 0;
      else vx = a.navVx;
    }
    Body.setVelocity(a.body, { x: vx, y: a.body.velocity.y });
    if (vx) a.facing = Math.sign(vx);
  }
  private launchJump(a: Actor, vx: number, impulse: number, delay = 0) {
    this.move(a, vx);
    this.jump(a, impulse);
    a.navVx = vx;
    a.navDelay = delay;
    if (delay > 0) a.navHoldX = a.body.position.x;
  }
  setMarioStage(stage: 0 | 1 | 2, blink = false) {
    if (!this.mario) {
      this.marioStage = stage;
      return;
    }
    this.resize(this.mario, stage === 0 ? 0.5 : 1, blink);
    this.mario.flower = stage === 2;
    this.marioStage = stage;
  }
  private runSpeedFor(a: Actor) {
    if (a === this.player || a === this.mario) return T.runSpeed;
    return T.runSpeed;
  }
  private jumpImpulse(a: Actor, vx = a.body.velocity.x) {
    if (this.roomFor(a).onSpring(a)) return T.springImpulse;
    return Math.abs(vx) >= (T.walkSpeed + T.runSpeed) / 2
      ? T.runJumpSpeed
      : T.jumpSpeed;
  }
  private jump(a: Actor, impulse?: number) {
    const water = this.roomFor(a).data.type === "water";
    if (!a.grounded && !water) return;
    Body.setVelocity(a.body, {
      x: a.body.velocity.x,
      y: -(water
        ? T.swimImpulse
        : (impulse ?? this.jumpImpulse(a))),
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
            Math.abs(feet - T.groundY) < 12 &&
            s.bounds.min.y < feet - 5 &&
            s.bounds.max.y >= feet - 5)),
    );
    const wall =
      !a.body.ignoreWalls &&
      solids.some(
        (s) =>
          p.x + direction * (half + 30) > s.bounds.min.x &&
          p.x + direction * (half + 30) < s.bounds.max.x &&
          feet > s.bounds.min.y + 5 &&
          a.body.bounds.min.y < s.bounds.max.y,
      );
    if (supported && !wall && (a === this.mario || !inWell)) return;
    if (a === this.mario) {
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
    if (!supported && !wall && this.roomFor(a).data.type === "castle") {
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
    if (
      (a.navDetourBelow || this.roomFor(a).data.type === "castle") &&
      !wall &&
      safeDrop &&
      !supported
    )
      return;
    if ((a.navRetry ?? 0) > 0 && !inWell) {
      if (!supported) this.move(a, 0);
      return;
    }
    const pace = this.runSpeedFor(a);
    let impulse = this.roomFor(a).onSpring(a)
      ? T.springImpulse
      : a.scale > 1
        ? T.giantJumpSpeed
        : T.runJumpSpeed;
    let launch = planJump(
      a.body,
      solids,
      direction,
      pace,
      impulse,
      undefined,
      this.roomFor(a).data.type === "castle",
    );
    if (
      impulse === T.runJumpSpeed &&
      this.roomFor(a).data.type !== "castle" &&
      (!launch || (wall && (launch.x - p.x) * direction < 64))
    ) {
      const high = planJump(
        a.body,
        solids,
        direction,
        pace,
        T.giantJumpSpeed,
        undefined,
        this.roomFor(a).data.type === "castle",
      );
      if (high && (!launch || high.score > launch.score + 40)) {
        launch = high;
        impulse = T.giantJumpSpeed;
      }
    }
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
      if (support && !support.motion && !this.roomFor(a).onSpring(a))
        for (let distance = 32; distance <= 256; distance += 32) {
          const x = p.x - direction * distance;
          if (
            x - half < support.bounds.min.x ||
            x + half > support.bounds.max.x
          )
            break;
          const probe = new Body(x, p.y, a.body.width, a.body.height);
          if (overlaps(probe, solids, 0.1).length) continue;
          if (
            solids.some(
              (s) =>
                x + half + 4 > s.bounds.min.x &&
                x - half - 4 < s.bounds.max.x &&
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
    if (this.cooldown > 0 || this.mode !== "playing") return;
    this.cooldown = T.warningCooldown;
    this.audible = T.warningSound;
    this.bubbleLeft = T.bubbleTime;
    this.bubble = PHRASES[Math.floor(this.random() * PHRASES.length)];
    this.events.push("warn");
    const p = this.player.body.position;
    for (const n of this.npcs) {
      if (
        !n.alive ||
        n.saved ||
        n.warned ||
        this.bouncedNpcs.has(n) ||
        (this.player.body.velocity.y > 0.2 &&
          this.fallingOntoNpc(
            n,
            this.player.body.position.y + 14 * this.player.scale,
          )) ||
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
    a.alive = false;
    if (bloody) {
      this.burst(a.body.position.x, a.body.position.y, true);
      this.events.push("splat");
    }
    this.physics.remove(a.body);
    if (a === this.player) {
      this.mode = "dead";
      this.deadLeft = T.deathSequenceSeconds;
      this.bubbleLeft = 0;
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
    const radius = a.kind === "mario" ? 19 : 14;
    const feet = a.body.position.y + radius * previous;
    Body.scale(a.body, nextScale / previous, nextScale / previous);
    a.scale = nextScale;
    Body.setPosition(a.body, {
      x: a.body.position.x,
      y: feet - radius * nextScale,
    });
    if (blink) {
      a.transformFrom = previous;
      a.transformLeft = T.transformSeconds;
    } else a.transformLeft = 0;
  }

  private shrinking(a: Actor) {
    return a.transformLeft > 0 && a.transformFrom > a.scale;
  }

  private hurt(a: Actor) {
    if (!a.alive || a.saved || a.starLeft > 0 || this.shrinking(a)) return false;
    if (a.scale > 1) {
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
    const prize = c.content === "1-up" || (c.hidden && c.content === "coin");
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
      this.coins++;
      this.events.push("coin");
      this.coinPops.push({ x: c.x, y: c.y, age: 0 });
      return;
    }
    if (c.content === "1-up") {
      this.reveal(c);
      this.events.push("bump");
      this.spawnItem(c, "oneUp", hitter.facing);
      return;
    }
    this.events.push("bump");
    if (c.question) {
      this.reveal(c);
      this.spawnItem(c, this.rollItem(), hitter.facing);
      this.events.push("appear");
    }
  }

  private reveal(c: Obstacle) {
    c.used = true;
    if (c.body) c.body.headOnly = false;
  }

  private spawnItem(c: Obstacle, kind: ItemKind, facing: number) {
    const body = this.physics.rectangle(c.x, c.y, 24, 28, false);
    Body.setFrozen(body, true);
    this.items.push({
      id: this.nextId++,
      kind,
      body,
      emerge: 0.45,
      originY: c.y,
      direction: facing,
      age: 0,
    });
  }

  private collectCoin(coin: { collected: boolean }, collector: Actor) {
    if (coin.collected || !collector.alive || collector.saved) return;
    coin.collected = true;
    if (collector === this.player) {
      this.coins++;
      this.events.push("coin");
    }
  }

  private collectCoinsOnBlock(block: Obstacle, collector: Actor) {
    const half = T.brickSize / 2;
    for (const room of this.rooms.values())
      for (const coin of room.coins)
        if (
          Math.abs(coin.x - block.x) < half &&
          Math.abs(coin.y - (block.y - T.brickSize)) < half
        )
          this.collectCoin(coin, collector);
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
      if (isMushroom(item.kind) && this.marioStage === 0)
        this.setMarioStage(1, true);
    } else if (item.kind === "flower") a.flower = true;
    if (a !== this.mario && isMushroom(item.kind))
      this.setGoombaScale(a, mushroomScale(item.kind), true);
    this.physics.remove(item.body);
    this.items = this.items.filter((i) => i !== item);
    this.events.push("power");
  }

  private rollItem(): ItemKind {
    const kind = (["star", "mushroom", "flower"] as const)[
      Math.min(2, Math.floor(this.random() * 3))
    ];
    if (kind !== "mushroom") return kind;
    const roll = this.random();
    if (roll >= 1 - T.mushroom8xChance) return "mushroom8x";
    if (roll >= 1 - T.mushroom8xChance - T.mushroom3xChance) return "mushroom3x";
    return "mushroom";
  }

  private setGoombaScale(a: Actor, scale: number, blink = false) {
    this.resize(a, scale, blink);
    a.body.ignoreWalls = scale >= T.hugeScale;
    a.hugeLeft = scale >= T.hugeScale ? T.hugeSeconds : 0;
    if (scale < T.hugeScale) this.fitActor(a);
    else this.smashHugeBricks(a);
  }

  private fitActor(a: Actor) {
    // Growing or shrinking must not leave the body embedded in scenery.
    for (let i = 0; i < 16; i++) {
      const hits = overlaps(a.body, this.solids, 0.1);
      if (!hits.length) return;
      const top = Math.min(...hits.map((hit) => hit.bounds.min.y));
      Body.setPosition(a.body, {
        x: a.body.position.x,
        y: top - 14 * a.scale - 0.1,
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

  private smashHugeBricks(a: Actor) {
    if (a.scale < T.hugeScale || !a.alive || a.saved) return;
    for (const c of [...this.obstacles]) {
      if (
        c.kind !== "brick" ||
        c.question ||
        c.hidden ||
        c.broken ||
        !c.body
      )
        continue;
      if (overlaps(a.body, [c.body], 0.1).length) this.breakBrick(c);
    }
  }

  private updateItems(dt: number) {
    for (const item of [...this.items]) {
      item.age += dt;
      if (item.emerge > 0) {
        item.emerge = Math.max(0, item.emerge - dt);
        Body.setPosition(item.body, {
          x: item.body.position.x,
          y: item.originY - 32 * (1 - item.emerge / 0.45),
        });
        if (item.emerge === 0) Body.setFrozen(item.body, false);
        continue;
      }
      const p = item.body.position;
      const floor = this.solids.some(
        (s) =>
          p.x + 12 > s.bounds.min.x &&
          p.x - 12 < s.bounds.max.x &&
          Math.abs(p.y + 14 - s.bounds.min.y) < 5,
      );
      const wall = this.solids.some(
        (s) =>
          p.x + item.direction * 15 > s.bounds.min.x &&
          p.x + item.direction * 15 < s.bounds.max.x &&
          p.y > s.bounds.min.y &&
          p.y < s.bounds.max.y,
      );
      if (wall) item.direction *= -1;
      Body.setVelocity(item.body, {
        x:
          item.kind === "flower"
            ? 0
            : item.direction * (item.kind === "star" ? 2.8 : 1.8),
        y:
          item.kind === "star" && floor && item.body.velocity.y >= 0
            ? -7.5
            : item.body.velocity.y,
      });
      for (const a of [this.player, ...this.npcs, this.mario]) {
        if (
          a.alive &&
          !a.saved &&
          !this.inPipe(a) &&
          (a !== this.mario || this.marioActive) &&
          Math.abs(a.body.position.x - p.x) < 12 * a.scale + 12 &&
          Math.abs(a.body.position.y - p.y) < 14 * a.scale + 14
        ) {
          this.collect(a, item);
          break;
        }
      }
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

  private defeatMario() {
    if (!this.marioActive) return;
    this.burst(this.mario.body.position.x, this.mario.body.position.y, true);
    this.events.push("marioDeath");
    this.marioDeath = {
      x: this.mario.body.position.x,
      y: this.mario.body.position.y,
      vy: -T.deathHopSpeed,
      age: 0,
    };
    this.marioActive = this.mario.alive = false;
    this.mario.starLeft = 0;
    this.setMarioStage(0);
    this.marioReturn = T.marioDefeatSeconds;
    this.marioTarget = null;
    this.marioChase = this.marioStun = 0;
    Body.setFrozen(this.mario.body, true);
    this.fireballs = this.fireballs.filter((f) => f.owner === "player");
  }

  private hitMarioByFireball() {
    if (!this.marioActive || this.mario.starLeft > 0) return;
    if (this.marioStage === 2) {
      this.setMarioStage(1, true);
      this.marioStun = T.marioStunSeconds;
      this.events.push("shrink");
    } else if (this.marioStage === 1) {
      this.setMarioStage(0, true);
      this.marioStun = T.marioStunSeconds;
      this.events.push("shrink");
    } else this.defeatMario();
  }

  private withinWarningRange(n: Actor) {
    const p = this.player.body.position,
      q = n.body.position;
    return Math.hypot(q.x - p.x, q.y - p.y) <= T.warningRange;
  }

  private npcTop(n: Actor) {
    return n.body.position.y - 14 * n.scale;
  }

  private overlapNpcX(n: Actor) {
    return (
      Math.abs(this.player.body.position.x - n.body.position.x) <
      12 * this.player.scale + 12 * n.scale
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
      if (
        !n.alive ||
        n.saved ||
        (this.player.grounded && !this.withinWarningRange(n))
      )
        this.bouncedNpcs.delete(n);
    }
  }

  private autoWarn() {
    if (
      this.cooldown > 0 ||
      this.mode !== "playing" ||
      this.inPipe(this.player)
    )
      return;
    const playerBottom =
      this.player.body.position.y + 14 * this.player.scale;
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
        Body.setVelocity(this.player.body, {
          x: this.player.body.velocity.x,
          y: -T.stompBounce,
        });
        if (n.kind === "koopa") this.koopaStomp(n, this.player);
      }
    }
  }

  private overlapActors(a: Actor, b: Actor) {
    const halfW = (actor: Actor) => 12 * actor.scale;
    const halfH = (actor: Actor) =>
      (actor.kind === "mario" ? 19 : 14) * actor.scale;
    return (
      Math.abs(a.body.position.x - b.body.position.x) <
        halfW(a) + halfW(b) &&
      Math.abs(a.body.position.y - b.body.position.y) < halfH(a) + halfH(b)
    );
  }

  private shellFallSpeed(n: Actor) {
    return this.roomFor(n).data.type === "water" ? 0 : n.body.velocity.y;
  }

  private enterShell(n: Actor, stomper?: Actor) {
    n.shell = "stopped";
    n.wakeLeft = T.shellWake;
    n.kickIgnore = stomper?.id ?? 0;
    n.navVx = undefined;
    n.navHoldX = undefined;
    n.idleDrop = undefined;
    n.jumpHeld = false;
    n.navBackoff = undefined;
    n.navDrop = undefined;
    n.swimPath = undefined;
    Body.setVelocity(n.body, { x: 0, y: this.shellFallSpeed(n) });
  }

  private stopShell(n: Actor, stomper?: Actor) {
    n.shell = "stopped";
    n.wakeLeft = T.shellWake;
    n.kickIgnore = stomper?.id ?? 0;
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

  private shellHits(victim: Actor) {
    if (!victim.alive || victim.saved || this.inPipe(victim)) return;
    if (victim === this.mario) {
      if (this.marioStun > 0) return;
      this.hitMarioByFireball();
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
        else this.shellHits(this.player);
      }
      if (
        this.marioActive &&
        this.mario.alive &&
        !this.inPipe(this.mario) &&
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
          this.koopaStomp(n, this.mario);
          Body.setVelocity(this.mario.body, {
            x: this.mario.body.velocity.x,
            y: -T.stompBounce,
          });
        } else if (n.shell === "stopped") this.kickShell(n, this.mario);
        else this.shellHits(this.mario);
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
          this.shellHits(other);
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
    if (c.kind !== "brick" || c.broken) return;
    c.broken = true;
    if (c.body) {
      this.physics.remove(c.body);
      this.solids = this.solids.filter((s) => s !== c.body);
      for (const room of this.rooms.values()) {
        room.solids = room.solids.filter((s) => s !== c.body);
        room.clearNavigation();
      }
    }
    this.burst(c.x, c.y, false);
    this.events.push("break");
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
    if (this.mode !== "playing" || this.saved < T.required) return;
    this.mode = "finishing";
    this.finishLeft = T.finishWindow;
    this.player.saved = true;
    Body.setFrozen(this.player.body, true);
    this.events.push("win");
  }

  step(dt: number, input: Input) {
    if (this.mode === "dead") {
      this.updateParticles(dt);
      if (this.playerDeath) this.stepDeathHop(this.playerDeath, dt);
      this.deadLeft -= dt;
      if (this.deadLeft <= 0) {
        if (this.lives <= 0) {
          this.mode = "gameover";
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
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.audible = Math.max(0, this.audible - dt);
    this.bubbleLeft = Math.max(0, this.bubbleLeft - dt);
    for (const a of [this.player, ...this.npcs, this.mario]) {
      a.starLeft = Math.max(0, a.starLeft - dt);
      a.transformLeft = Math.max(0, a.transformLeft - dt);
      a.hugeLeft = Math.max(0, a.hugeLeft - dt);
      if (a !== this.mario && a.scale >= T.hugeScale && a.hugeLeft === 0)
        this.setGoombaScale(a, T.giantScale);
      a.exclaimLeft = Math.max(0, a.exclaimLeft - dt);
      if (!this.inPipe(a)) a.pipeWait = Math.max(0, (a.pipeWait ?? 0) - dt);
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
      if (a.grounded) a.jumpHeld = false;
    }
    this.updatePipeTravel(dt);
    if (this.mode === "playing" && !this.inPipe(this.player)) {
      const dx = Number(input.right) - Number(input.left);
      const p = this.player.body.position;
      const water = this.activeRoom.data.type === "water";
      if (water) this.playerPace = T.walkSpeed;
      else if (this.player.grounded)
        this.playerPace = input.run ? T.runSpeed : T.walkSpeed;
      this.move(this.player, dx * this.playerPace);
      if (input.jump && !this.jumped) this.jump(this.player);
      this.player.jumpHeld = input.jump;
      this.jumped = input.jump;
      if (input.fire && this.player.flower && this.canThrowFireball("player")) {
        this.fireballs.push({
          id: this.nextId++,
          x: p.x + this.player.facing * (12 * this.player.scale + 10),
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
      const traveled = this.tryPipe(this.player, input.down, input.right);
      if (
        !traveled &&
        room.data.goal &&
        room.data.goal.kind !== "pipe" &&
        p.x >= room.goalX
      ) {
        if (this.saved >= T.required && room.atDoor(this.player)) this.finish();
        else Body.setPosition(this.player.body, { x: room.goalX - 1, y: p.y });
      }
    } else if (this.mode === "playing") this.jumped = true;
    this.updateNpcs(dt);
    this.updateCrowd(dt);
    this.doomed = rescueImpossible(this.saved, this.living(), T.required);
    this.updateMario(dt);
    for (const a of [this.player, ...this.npcs, this.mario]) {
      if (this.roomFor(a).data.type === "water") continue;
      const hold = !!a.jumpHeld && a.body.velocity.y < 0 && !a.grounded;
      a.body.gravityScale = !a.grounded
        ? (hold ? T.jumpHoldGravity : T.jumpFallGravity) / T.gravity
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
        top: a.body.position.y - (a === this.mario ? 19 : 14 * a.scale),
      }));
    const playerBottom = this.player.body.position.y + 14 * this.player.scale;
    const playerFalling = this.player.body.velocity.y > 0.2;
    const marioBottom = this.mario.body.position.y + 19 * this.mario.scale;
    const marioFalling = this.mario.body.velocity.y > 0.2;
    const prevNpcTops = new Map<Actor, number>();
    for (const n of this.npcs) prevNpcTops.set(n, this.npcTop(n));
    this.physics.step(dt);
    for (const n of this.npcs) {
      if (n.navHoldX === undefined) continue;
      // Keep takeoff x so delayed air speed can match ground pace without extra travel.
      Body.setPosition(n.body, { x: n.navHoldX, y: n.body.position.y });
      if (n.navVx !== undefined)
        Body.setVelocity(n.body, { x: n.navVx, y: n.body.velocity.y });
      n.navHoldX = undefined;
    }
    for (const a of [this.player, ...this.npcs]) this.smashHugeBricks(a);
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
    if (this.marioActive && this.mario.starLeft <= 0) {
      for (const a of [this.player, ...this.npcs]) {
        if (!a.alive || a.saved || this.inPipe(a) || this.inPipe(this.mario))
          continue;
        const overlapX =
          Math.abs(a.body.position.x - this.mario.body.position.x) <
          12 * a.scale + 12;
        if (
          a.starLeft > 0 &&
          overlapX &&
          Math.abs(a.body.position.y - this.mario.body.position.y) <
            14 * a.scale + 19
        ) {
          this.defeatMario();
          break;
        }
        if (
          a === this.player &&
          a.scale > 1 &&
          playerFalling &&
          overlapX &&
          playerBottom <=
            this.mario.body.position.y - 19 * this.mario.scale + 12 &&
          a.body.bounds.max.y >=
            this.mario.body.position.y - 19 * this.mario.scale
        ) {
          if (this.marioStun === 0) {
            this.hitMarioByFireball();
            Body.setVelocity(a.body, {
              x: a.body.velocity.x,
              y: -T.stompBounce,
            });
          }
          break;
        }
      }
    }
    for (const a of [this.player, ...this.npcs])
      if (a.alive && !a.saved && !this.inPipe(a) && a.body.position.y > 640)
        this.kill(a, false);
    this.updateFireballs(dt);
    this.updateFlagpoles(dt);
    this.doomed = rescueImpossible(this.saved, this.living(), T.required);
    if (this.mode === "finishing") {
      this.finishLeft -= dt;
      if (this.finishLeft <= 0) {
        this.finishLeft = 0;
        this.mode = "won";
      }
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
        )
          this.save(n);
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
        if (room.atDoor(n)) this.save(n);
        else {
          n.navVx = 0;
          Body.setVelocity(n.body, { x: 0, y: n.body.velocity.y });
        }
        continue;
      }
      if (!n.warned) {
        const feet = p.y + 14 * n.scale;
        const speed = T.idleSpeed * (0.8 + n.fear * 0.4);
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
            const ahead = p.x + direction * (12 * n.scale + 8);
            const below = this.solids.filter(
              (s) => ahead >= s.bounds.min.x && ahead <= s.bounds.max.x,
            );
            if (
              !n.body.ignoreWalls &&
              below.some(
                (s) =>
                  s.bounds.min.y < feet - 5 &&
                  s.bounds.max.y > p.y - 14 * n.scale,
              )
            )
              return "blocked";
            if (below.some((s) => Math.abs(s.bounds.min.y - feet) < 6))
              return "walk";
            if (
              n.body.ignoreWalls &&
              Math.abs(feet - T.groundY) < 12 &&
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
          this.jump(n, T.giantJumpSpeed);
          n.blockedFor = 0;
        }
      }
      const threat =
        this.marioActive && Math.abs(this.mario.body.position.x - p.x) < 340;
      if (n.state === "idle" || (n.state === "run" && threat && n.wait < -2)) {
        n.state = "run";
        n.wait = -0.01;
      }
      const direction =
        n.navDetourBelow ||
        (room.data.goal?.kind === "pipe" && p.x > room.goalX + 20)
          ? -1
          : 1;
      this.move(n, direction * this.runSpeedFor(n));
      this.autoJump(n, direction);
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

  private updateMario(dt: number) {
    if (!this.marioActive) {
      this.marioReturn -=
        dt * (this.mario.alive ? 1 + this.marioPressure * 1.8 : 1);
      if (this.marioDeath) {
        this.stepDeathHop(this.marioDeath, dt);
        if (this.marioDeath.y > 700) this.marioDeath = null;
      }
      if (this.marioReturn > 0 || this.marioDeath) return;
      this.setMarioStage((this.phase === 0 ? 1 : this.phase) as 0 | 1 | 2);
      this.marioActive = true;
      this.mario.alive = true;
      this.mario.starLeft = 0;
      this.setMarioStage((this.phase === 0 ? 1 : this.phase) as 0 | 1 | 2);
      Body.setFrozen(this.mario.body, false);
      this.mario.areaId = this.player.areaId;
      Body.setPosition(this.mario.body, { x: this.cameraX - 110, y: 350 });
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
    }
    if (this.inPipe(this.mario)) return;
    this.marioIgnore = Math.max(0, this.marioIgnore - dt);
    this.marioDecision -= dt;
    const pursuing = this.marioChase > 0;
    this.marioChase = Math.max(0, this.marioChase - dt);
    const aggression = 1 + this.marioPressure * 1.2 + (this.doomed ? 0.5 : 0);
    this.marioReaction = Math.max(0, this.marioReaction - dt * aggression);
    this.marioJumpWait -= dt * aggression;
    this.marioLook -= dt * aggression;
    this.marioPause = Math.max(0, this.marioPause - dt);
    this.marioSeenAgo += dt;
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
                (this.doomed && a === this.player ? 0.15 : 1) *
                (runners.has(a.id) ? 1 - this.marioPressure * 0.5 : 1) -
              Math.abs(b.body.position.x - m.x) *
                (this.doomed && b === this.player ? 0.15 : 1) *
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
        this.marioJumpWait <= 0
      ) {
        this.marioJumpWait = 0.65 + this.random() * 0.35;
        // Commit toward the predicted landing point, with bounded inaccuracy.
        const upG = T.jumpHoldGravity / 3600;
        const flightFrames =
          T.jumpSpeed / upG +
          T.jumpSpeed / Math.sqrt(upG * (T.jumpFallGravity / 3600));
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
      this.marioPressure * T.marioCrowdSpeedBonus +
      (this.doomed ? 0.8 : 0);
    const desired =
      this.marioPause > 0 || this.marioReaction > 0 ? 0 : direction * speed;
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
    } else if (this.mario.grounded) {
      const vx = this.mario.body.velocity.x;
      const acceleration = 0.16 + this.marioPressure * 0.16;
      this.move(
        this.mario,
        vx + Math.max(-acceleration, Math.min(acceleration, desired - vx)),
      );
      if (desired && Math.abs(this.mario.body.velocity.x) > 0.5)
        this.autoJump(this.mario, direction);
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
        Math.abs(p.x - m.x) <
          Math.max(22, 12 * a.scale + 12 * this.mario.scale) &&
        Math.abs(p.y - m.y) <
          Math.max(34, 14 * a.scale + 19 * this.mario.scale)
      ) {
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
            if (brick) this.breakBrick(brick);
          }
          f.age = 6;
        }
      }
      if (f.age >= 5) continue;
      if (f.owner === "player") {
        if (
          this.marioActive &&
          !this.inPipe(this.mario) &&
          Math.abs(this.mario.body.position.x - f.x) <
            12 * this.mario.scale + radius &&
          Math.abs(this.mario.body.position.y - f.y) <
            19 * this.mario.scale + radius
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
          Math.abs(a.body.position.x - f.x) < 12 * a.scale + radius &&
          Math.abs(a.body.position.y - f.y) < 14 * a.scale + radius
        ) {
          if (a.starLeft <= 0) this.kill(a);
          f.age = 6;
          break;
        }
      }
    }
    this.fireballs = this.fireballs.filter((f) => f.age < 5);
  }
}
