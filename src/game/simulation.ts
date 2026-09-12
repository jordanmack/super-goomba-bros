import { Body, PhysicsWorld, overlaps, rayBlocked } from "./physics.ts";
import { MAP_TOP, PHRASES, TUNING as T } from "./config.ts";
import { CAMPAIGN } from "./levels.ts";
import { Room } from "./room.ts";
import { planJump } from "./navigation.ts";

export type Input = {
  left: boolean;
  right: boolean;
  jump: boolean;
  fire: boolean;
  down: boolean;
};
export const emptyInput = (): Input => ({
  left: false,
  right: false,
  jump: false,
  fire: false,
  down: false,
});
export type Mode = "title" | "playing" | "dead" | "finishing" | "won";
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
  content?: ItemKind;
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
  starLeft: number;
  flower: boolean;
  blockedFor: number;
  lastX: number;
  jumpClear?: { x: number; top: number };
  areaId?: string;
  pipeWait?: number;
  navVx?: number;
  navDelay?: number;
  navRetry?: number;
  navBackoff?: { x: number; vx: number; delay: number };
  navDetourBelow?: number;
  navDrop?: { x: number; vx: number; delay: number };
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
  | "win";
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
export type ItemKind = "star" | "mushroom" | "flower";
export type Item = {
  id: number;
  kind: ItemKind;
  body: Body;
  emerge: number;
  originY: number;
  direction: number;
  age: number;
};
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
      this.reset();
    }
  }
  private tryPipe(actor: Actor, down: boolean, right: boolean) {
    if ((actor.pipeWait ?? 0) > 0) return false;
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
    const target = this.loadRoom(destination.area);
    actor.areaId = target.data.id;
    actor.pipeWait = T.pipeCooldown;
    actor.idleDrop = undefined;
    actor.jumpClear = undefined;
    actor.facing = 1;
    actor.navVx = undefined;
    actor.navBackoff = undefined;
    actor.swimPath = undefined;
    target.place(actor, target.offset + destination.page * 512 + 100);
    if (actor === this.player) {
      this.events.push("pipe");
      this.bubbleLeft = 0;
    }
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
  marioStage: 0 | 1 | 2 = 0;
  doomed = false;
  playerFireCooldown = 0;
  brickTarget: number | null = null;
  fireCooldown = 2;
  cameraX = 0;
  viewWidth = 960;
  private nextId = 1;
  private jumped = false;
  private playerJumping = false;
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
      this.phase =
      this.cooldown =
      this.audible =
        0;
    this.bubble = "";
    this.bubbleLeft = this.finishLeft = this.deadLeft = 0;
    this.marioActive = false;
    this.marioReturn = T.firstMarioAt;
    this.marioDecision = this.marioChase = this.marioIgnore = 0;
    this.brickTarget = null;
    this.marioCrowd = this.marioPressure = 0;
    this.marioRunning = false;
    this.marioStun = this.playerFireCooldown = 0;
    this.marioDeath = null;
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
    this.fireCooldown = 2;
    this.cameraX = 0;
    this.fireballs = [];
    this.items = [];
    this.particles = [];
    this.events = [];
    this.jumped = false;
    this.playerJumping = false;
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
      starLeft: 0,
      flower: false,
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
  private ground(a: Actor) {
    const bottom = a.body.position.y + (a.kind === "mario" ? 19 : 14) * a.scale;
    a.grounded =
      this.solids.some(
        (s) =>
          !s.headOnly &&
          a.body.bounds.max.x > s.bounds.min.x + 0.01 &&
          a.body.bounds.min.x < s.bounds.max.x - 0.01 &&
          Math.abs(bottom - s.bounds.min.y) < 12,
      ) && Math.abs(a.body.velocity.y) < 1;
  }
  private move(a: Actor, vx: number) {
    if (
      a !== this.player &&
      a !== this.mario &&
      !a.grounded &&
      !a.jumpClear &&
      a.navVx !== undefined
    )
      vx = (a.navDelay ?? 0) > 0 ? 0 : a.navVx;
    Body.setVelocity(a.body, { x: vx, y: a.body.velocity.y });
    if (vx) a.facing = Math.sign(vx);
  }
  setMarioStage(stage: 0 | 1 | 2) {
    if (!this.mario) {
      this.marioStage = stage;
      return;
    }
    const previousScale = this.mario.scale;
    const nextScale = stage === 0 ? 0.5 : 1;
    const feet = this.mario.body.position.y + 19 * previousScale;
    if (previousScale !== nextScale) {
      const ratio = nextScale / previousScale;
      Body.scale(this.mario.body, ratio, ratio);
    }
    this.mario.scale = nextScale;
    this.mario.flower = stage === 2;
    this.marioStage = stage;
    Body.setPosition(this.mario.body, {
      x: this.mario.body.position.x,
      y: feet - 19 * nextScale,
    });
  }
  private jump(a: Actor) {
    const water = this.roomFor(a).data.type === "water";
    if (!a.grounded && !water) return;
    Body.setVelocity(a.body, {
      x: a.body.velocity.x,
      y: -(water
        ? T.swimImpulse
        : this.roomFor(a).onSpring(a)
          ? T.springImpulse
          : a !== this.player && a.scale > 1
            ? 15
            : T.jumpSpeed),
    });
    a.grounded = false;
    if (a === this.player) {
      this.playerJumping = true;
      this.events.push("jump");
    }
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
    const supported = solids.some(
      (s) =>
        ahead > s.bounds.min.x &&
        ahead < s.bounds.max.x &&
        s.bounds.min.y >= feet - 5 &&
        s.bounds.min.y <= feet + 32,
    );
    const wall = solids.some(
      (s) =>
        p.x + direction * (half + 30) > s.bounds.min.x &&
        p.x + direction * (half + 30) < s.bounds.max.x &&
        feet > s.bounds.min.y + 5 &&
        a.body.bounds.min.y < s.bounds.max.y,
    );
    if (supported && !wall) return;
    if (a === this.mario) {
      this.jump(a);
      return;
    }
    const safeDrop = solids.some(
      (s) =>
        ahead > s.bounds.min.x &&
        ahead < s.bounds.max.x &&
        s.bounds.min.y > feet &&
        s.bounds.min.y <= T.groundY,
    );
    if (!supported && !wall && this.roomFor(a).data.type === "castle") {
      const support = solids.find(
        (s) =>
          p.x + half > s.bounds.min.x &&
          p.x - half < s.bounds.max.x &&
          Math.abs(s.bounds.min.y - feet) < 3,
      );
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
          a.speed,
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
    if (a.navDetourBelow && !wall && safeDrop && !supported) return;
    if ((a.navRetry ?? 0) > 0) {
      if (!supported) this.move(a, 0);
      return;
    }
    const impulse = this.roomFor(a).onSpring(a)
      ? T.springImpulse
      : a.scale > 1
        ? 15
        : T.jumpSpeed;
    const launch = planJump(
      a.body,
      solids,
      direction,
      a.speed,
      impulse,
      undefined,
      this.roomFor(a).data.type === "castle",
    );
    if (launch) {
      this.move(a, launch.delay ? 0 : launch.vx);
      this.jump(a);
      a.navVx = launch.vx;
      a.navDelay = launch.delay;
    } else {
      if (!wall && (safeDrop || a.navDetourBelow)) {
        const drop = planJump(a.body, solids, direction, a.speed, 0);
        if (drop) {
          this.move(a, drop.vx);
          a.navVx = drop.vx;
          a.navDelay = 0;
          return;
        }
      }
      a.navRetry = 0.15;
      const support = solids.find(
        (s) =>
          !s.motion &&
          p.x + half > s.bounds.min.x &&
          p.x - half < s.bounds.max.x &&
          Math.abs(s.bounds.min.y - feet) < 3,
      );
      if (support && !this.roomFor(a).onSpring(a))
        for (let distance = 32; distance <= 256; distance += 32) {
          const x = p.x - direction * distance;
          if (
            x - half < support.bounds.min.x ||
            x + half > support.bounds.max.x
          )
            break;
          const probe = new Body(x, p.y, a.body.width, a.body.height);
          if (overlaps(probe, solids, 0.1).length) continue;
          const retry = planJump(probe, solids, direction, a.speed, impulse);
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
          a.speed,
          impulse,
          (landing) => landing.y < p.y - 24,
        );
        if (reverse) {
          this.move(a, reverse.delay ? 0 : reverse.vx);
          this.jump(a);
          a.navVx = reverse.vx;
          a.navDelay = reverse.delay;
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
        Math.hypot(n.body.position.x - p.x, n.body.position.y - p.y) >
          T.warningRange
      )
        continue;
      n.warned = true;
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
    a.alive = false;
    if (bloody) {
      this.burst(a.body.position.x, a.body.position.y, true);
      this.events.push("splat");
    }
    this.physics.remove(a.body);
    if (a === this.player) {
      this.mode = "dead";
      this.deadLeft = T.deathSequenceSeconds;
      this.events.push("death");
    }
  }

  invincible(a: Actor) {
    return a.starLeft > 0 || a.scale > 1;
  }

  hitBlock(c: Obstacle, hitter: Actor) {
    if (c.broken || c.kind !== "brick" || c.bounce > 0) return;
    if (
      !c.question &&
      (hitter === this.mario || (hitter === this.player && hitter.scale > 1))
    ) {
      this.breakBrick(c);
      return;
    }
    c.bounce = T.blockBounceSeconds;
    this.events.push("bump");
    if (c.question && !c.used) {
      c.used = true;
      if (c.body) c.body.headOnly = false;
      c.content = (["star", "mushroom", "flower"] as const)[
        Math.min(2, Math.floor(this.random() * 3))
      ];
      const body = this.physics.rectangle(c.x, c.y, 24, 28, false);
      Body.setFrozen(body, true);
      this.items.push({
        id: this.nextId++,
        kind: c.content,
        body,
        emerge: 0.45,
        originY: c.y,
        direction: hitter.facing,
        age: 0,
      });
    }
  }

  collect(a: Actor, item: Item) {
    if (!a.alive || a.saved || (a === this.mario && !this.marioActive)) return;
    if (item.kind === "star") a.starLeft = T.starSeconds;
    if (a === this.mario) {
      if (item.kind === "flower") this.setMarioStage(2);
      if (item.kind === "mushroom" && this.marioStage === 0)
        this.setMarioStage(1);
    } else if (item.kind === "flower") a.flower = true;
    if (a !== this.mario && item.kind === "mushroom" && a.scale === 1) {
      const feet = a.body.position.y + 14;
      a.scale = T.giantScale;
      Body.scale(a.body, a.scale, a.scale);
      Body.setPosition(a.body, {
        x: a.body.position.x,
        y: feet - 14 * a.scale,
      });
      // Growing below a ceiling must never leave the larger body embedded.
      for (let i = 0; i < 16; i++) {
        const hits = overlaps(a.body, this.solids, 0.1);
        if (!hits.length) break;
        const top = Math.min(...hits.map((hit) => hit.bounds.min.y));
        Body.setPosition(a.body, {
          x: a.body.position.x,
          y: top - 14 * a.scale - 0.1,
        });
      }
    }
    this.physics.remove(item.body);
    this.items = this.items.filter((i) => i !== item);
    this.events.push("power");
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

  private defeatMario() {
    if (!this.marioActive) return;
    this.burst(this.mario.body.position.x, this.mario.body.position.y, true);
    this.events.push("marioDeath");
    this.marioDeath = {
      x: this.mario.body.position.x,
      y: this.mario.body.position.y,
      vy: -420,
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
      this.setMarioStage(1);
      this.marioStun = T.marioStunSeconds;
      this.events.push("shrink");
    } else if (this.marioStage === 1) {
      this.setMarioStage(0);
      this.marioStun = T.marioStunSeconds;
      this.events.push("shrink");
    } else this.defeatMario();
  }

  private contactWarning() {
    if (
      this.cooldown > 0 ||
      this.mode !== "playing" ||
      this.player.state !== "idle"
    )
      return;
    const p = this.player.body.position;
    const touching = this.npcs.some(
      (n) =>
        n.alive &&
        !n.saved &&
        !n.warned &&
        Math.abs(n.body.position.x - p.x) <
          12 * n.scale + 13 * this.player.scale &&
        Math.abs(n.body.position.y - p.y) < 14 * n.scale + 16,
    );
    if (touching) {
      this.warn();
      // The automatic voice cue should not delay the player's next action.
      this.audible = 0;
    }
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
      this.deadLeft -= dt;
      if (this.deadLeft <= 0) this.reset();
      return;
    }
    if (this.mode !== "playing" && this.mode !== "finishing") return;
    this.updateParticles(dt);
    this.elapsed += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.audible = Math.max(0, this.audible - dt);
    this.bubbleLeft = Math.max(0, this.bubbleLeft - dt);
    this.playerFireCooldown = Math.max(0, this.playerFireCooldown - dt);
    for (const a of [this.player, ...this.npcs, this.mario]) {
      a.starLeft = Math.max(0, a.starLeft - dt);
      a.pipeWait = Math.max(0, (a.pipeWait ?? 0) - dt);
      a.navRetry = Math.max(0, (a.navRetry ?? 0) - dt);
      a.swimRepath = Math.max(0, (a.swimRepath ?? 0) - dt);
      const water = this.roomFor(a).data.type === "water";
      a.body.gravityScale = water ? (a === this.player ? T.swimGravity : 0) : 1;
      if (water && a === this.player)
        a.body.velocity.y = Math.min(T.swimFallSpeed, a.body.velocity.y);
      if (water && a.body.position.y < MAP_TOP + 64 + a.body.height / 2) {
        a.body.position.y = MAP_TOP + 64 + a.body.height / 2;
        a.body.velocity.y = Math.max(0, a.body.velocity.y);
      }
    }
    for (const room of this.rooms.values())
      room.updatePlatforms(this.elapsed, [
        this.player,
        ...this.npcs,
        this.mario,
      ]);
    for (const c of this.obstacles) c.bounce = Math.max(0, c.bounce - dt);
    const phase =
      this.elapsed >= T.fireballsAt ? 2 : this.elapsed >= T.fasterAt ? 1 : 0;
    if (phase !== this.phase) {
      this.phase = phase;
      if (!this.marioActive)
        this.setMarioStage((phase === 0 ? 1 : phase) as 0 | 1 | 2);
    }
    for (const a of [this.player, ...this.npcs, this.mario]) this.ground(a);
    if (this.mode === "playing") {
      const dx = Number(input.right) - Number(input.left);
      const p = this.player.body.position;
      if (this.player.grounded) this.playerJumping = false;
      const pace =
        this.playerJumping && this.activeRoom.data.type !== "water"
          ? T.airSpeed
          : T.walkSpeed;
      this.move(this.player, dx * pace);
      if (input.jump && !this.jumped) this.jump(this.player);
      this.jumped = input.jump;
      if (input.fire && this.player.flower && this.playerFireCooldown === 0) {
        this.playerFireCooldown = T.playerFireCooldown;
        this.fireballs.push({
          id: this.nextId++,
          x: p.x + this.player.facing * (12 * this.player.scale + 10),
          y: p.y,
          vx: this.player.facing * 6,
          vy: 0,
          age: 0,
          owner: "player",
          scale: this.player.scale > 1 ? T.playerFireballScale : 1,
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
    }
    this.updateNpcs(dt);
    this.updateCrowd(dt);
    this.doomed = rescueImpossible(this.saved, this.living(), T.required);
    this.updateMario(dt);
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
    this.physics.step(dt);
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
            Math.abs(a.body.position.x - coin.x) < a.body.width / 2 + 8 &&
            Math.abs(a.body.position.y - coin.y) < a.body.height / 2 + 12,
        );
        if (collector) {
          coin.collected = true;
          if (collector === this.player) this.events.push("coin");
        }
      }
    this.contactWarning();
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
    if (this.marioActive && this.mario.starLeft <= 0) {
      for (const a of [this.player, ...this.npcs]) {
        if (!a.alive || a.saved) continue;
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
          playerBottom <= this.mario.body.position.y - 19 + 12 &&
          a.body.bounds.max.y >= this.mario.body.position.y - 19
        ) {
          this.defeatMario();
          Body.setVelocity(a.body, { x: a.body.velocity.x, y: -8 });
          break;
        }
      }
    }
    for (const a of [this.player, ...this.npcs])
      if (a.alive && !a.saved && a.body.position.y > 640) this.kill(a, false);
    this.updateFireballs(dt);
    this.doomed = rescueImpossible(this.saved, this.living(), T.required);
    if (this.mode === "finishing") {
      this.finishLeft -= dt;
      if (this.finishLeft <= 0) {
        this.finishLeft = 0;
        this.mode = "won";
      }
    }
  }

  private updateNpcs(dt: number) {
    for (const n of this.npcs) {
      if (!n.alive || n.saved) continue;
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
          n.navVx = drop.vx;
          n.navDelay = drop.delay;
          n.navDrop = undefined;
          this.move(n, drop.delay ? 0 : drop.vx);
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
          this.move(n, 0);
          this.jump(n);
          n.navVx = Math.sign(room.goalX - p.x) * T.npcGapSpeed;
          n.navDelay = 14;
          continue;
        }
      }
      if (n.navBackoff) {
        const target = n.navBackoff;
        if (n.grounded && Math.abs(p.x - target.x) <= n.speed) {
          this.move(n, target.delay ? 0 : target.vx);
          this.jump(n);
          n.navVx = target.vx;
          n.navDelay = target.delay;
          n.navBackoff = undefined;
        } else this.move(n, Math.sign(target.x - p.x) * n.speed);
        continue;
      }
      if (n.scale > 1) {
        n.blockedFor = Math.abs(p.x - n.lastX) < 8 ? n.blockedFor + dt : 0;
        n.lastX = p.x;
        if (n.blockedFor > 0.5 && !n.jumpClear) {
          const ceiling = this.solids
            .filter(
              (s) =>
                s.bounds.max.x > p.x - 12 * n.scale &&
                s.bounds.min.x < p.x + 12 * n.scale + 40 &&
                s.bounds.min.y < p.y + 14 * n.scale - 40,
            )
            .sort((a, b) => a.bounds.min.y - b.bounds.min.y)[0];
          if (ceiling)
            n.jumpClear = {
              x: ceiling.bounds.min.x - 12 * n.scale - 4,
              top: ceiling.bounds.min.y,
            };
          else
            Body.setVelocity(n.body, {
              x: n.facing * n.speed,
              y: -15,
            });
          n.blockedFor = 0;
        }
        if (n.jumpClear) {
          // Back out from under a low ceiling, then jump vertically onto it.
          if (p.x > n.jumpClear.x + 1) this.move(n, -n.speed);
          else {
            this.move(n, 0);
            this.jump(n);
            if (p.y + 14 * n.scale < n.jumpClear.top - 1)
              n.jumpClear = undefined;
          }
          if (n.jumpClear) continue;
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
      this.move(n, direction * n.speed);
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
        this.marioDeath.age += dt;
        if (this.marioDeath.age > 0.15) {
          this.marioDeath.vy += 900 * dt;
          this.marioDeath.y += this.marioDeath.vy * dt;
        }
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
    this.fireCooldown -= dt * aggression;
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
      (a) => a.alive && !a.saved && !this.invincible(a),
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
        const flightFrames = (2 * T.jumpSpeed) / 0.4167;
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
        this.fireCooldown <= 0
      ) {
        this.fireCooldown = Math.max(
          0.55,
          1.1 + this.random() * 0.8 - this.marioPressure * 0.35,
        );
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
        this.mario.body.velocity.y > 0.2 &&
        m.y < p.y - 8 &&
        Math.abs(p.x - m.x) < 22 &&
        Math.abs(p.y - m.y) < 34
      ) {
        this.kill(a);
        this.marioTarget = null;
        this.marioChase = 0;
        this.marioLook = 0;
        this.marioReaction = 0.15;
      }
    }
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
        } else if (oldX !== f.x) f.age = 6;
      }
      if (f.age >= 5) continue;
      if (f.owner === "player") {
        if (
          this.marioActive &&
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
