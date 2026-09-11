import { Body, PhysicsWorld, overlaps, rayBlocked } from "./physics.ts";
import { COVER_LAYOUT, GAPS, PHRASES, MAP_TOP, TUNING as T } from "./config.ts";
import { WORLD_1_1 as LEVEL } from "./world-1-1.ts";

export type Input = {
  left: boolean;
  right: boolean;
  jump: boolean;
  hide: boolean;
  warn: boolean;
  fire: boolean;
};
export const emptyInput = (): Input => ({
  left: false,
  right: false,
  jump: false,
  hide: false,
  warn: false,
  fire: false,
});
export type Mode = "title" | "playing" | "dead" | "finishing" | "won";
export type Cover = {
  id: number;
  x: number;
  y: number;
  kind: "bush" | "pipe" | "brick";
  broken: boolean;
  body?: Body;
  height?: number;
  question?: boolean;
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
  state: "idle" | "run" | "seek" | "entering" | "hidden";
  cover: number | null;
  hideTime: number;
  wait: number;
  facing: number;
  grounded: boolean;
  entry?: { x: number; y: number };
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
};
export type GameEvent =
  | "jump"
  | "bump"
  | "warn"
  | "saved"
  | "death"
  | "marioDeath"
  | "hide"
  | "fire"
  | "break"
  | "power"
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
  solids: Body[] = [];
  player!: Actor;
  npcs: Actor[] = [];
  mario!: Actor;
  covers: Cover[] = [];
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
  marioPipe = 0;
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
    let edge = -300;
    for (const [start, end] of [
      ...GAPS,
      [T.worldWidth + 300, T.worldWidth + 300],
    ]) {
      this.solids.push(
        this.physics.rectangle(
          (edge + start) / 2,
          T.groundY + 80,
          start - edge,
          160,
          true,
        ),
      );
      edge = end;
    }
    this.covers = COVER_LAYOUT.map((c, id) => ({
      ...c,
      id,
      broken: false,
      used: false,
      bounce: 0,
    }));
    // One collider per column avoids internal seams trapping descending actors.
    for (let column = 0; column < LEVEL.columns; column++) {
      const rows = LEVEL.stairs
        .filter(([, first, last]) => column >= first && column <= last)
        .map(([row]) => row);
      if (rows.length) {
        const top = MAP_TOP + Math.min(...rows) * 32;
        this.solids.push(
          this.physics.rectangle(
            column * 32 + 16,
            (top + T.groundY) / 2,
            32,
            T.groundY - top,
            true,
          ),
        );
      }
    }
    for (const c of this.covers) {
      if (c.kind === "brick")
        c.body = this.physics.rectangle(c.x, c.y, T.brickSize, T.brickSize, true);
      if (c.kind === "pipe")
        c.body = this.physics.rectangle(
          c.x,
          T.groundY - (c.height ?? T.pipeHeight) / 2,
          T.pipeWidth,
          c.height ?? T.pipeHeight,
          true,
        );
      if (c.body) this.solids.push(c.body);
    }
    this.player = this.actor(100, "goomba");
    this.npcs = Array.from({ length: T.population }, (_, i) => {
      let x = 390 + i * ((T.goalX - 650) / T.population) + this.random() * 65;
      const gap = GAPS.find(([a, b]) => x > a - 35 && x < b + 20);
      if (gap) x = gap[1] + 35;
      const pipe = this.covers.find(
        (c) => c.kind === "pipe" && Math.abs(c.x - x) < T.pipeWidth / 2 + 24,
      );
      if (pipe) x = pipe.x + T.pipeWidth / 2 + 35;
      const actor = this.actor(x, i % 3 === 1 ? "koopa" : "goomba");
      const surface = this.solids
        .filter(
          (s) =>
            x > s.bounds.min.x - 12 &&
            x < s.bounds.max.x + 12 &&
            s.bounds.min.y >= MAP_TOP + 32,
        )
        .sort((a, b) => a.bounds.min.y - b.bounds.min.y)[0];
      if (surface)
        Body.setPosition(actor.body, { x, y: surface.bounds.min.y - 14 });
      return actor;
    });
    this.mario = this.actor(-200, "mario");
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
    this.marioDecision =
      this.marioChase =
      this.marioIgnore =
      this.marioPipe =
        0;
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
      body,
      kind,
      alive: true,
      saved: false,
      warned: false,
      fear: this.random(),
      reaction: 0.15 + this.random() * 0.75,
      speed: 2.1 + this.random() * 0.85,
      state: "idle",
      cover: null,
      hideTime: 0,
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
  coverFor(a: Actor) {
    return this.covers.find((c) => c.id === a.cover && !c.broken);
  }
  protected(_a: Actor) {
    return false;
  }
  living() {
    return this.npcs.filter((n) => n.alive && !n.saved).length;
  }
  private ground(a: Actor) {
    const bottom = a.body.position.y + (a.kind === "mario" ? 19 : 14) * a.scale;
    a.grounded =
      this.solids.some(
        (s) =>
          a.body.bounds.max.x > s.bounds.min.x + 0.01 &&
          a.body.bounds.min.x < s.bounds.max.x - 0.01 &&
        Math.abs(bottom - s.bounds.min.y) < 12,
      ) && Math.abs(a.body.velocity.y) < 1;
  }
  private move(a: Actor, vx: number) {
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
    if (!a.grounded) return;
    Body.setVelocity(a.body, {
      x: a.body.velocity.x,
      y: -(a !== this.player && a.scale > 1 ? 15 : T.jumpSpeed),
    });
    a.grounded = false;
    if (a === this.player) {
      this.events.push("jump");
    }
  }
  private autoJump(a: Actor, direction: number) {
    const p = a.body.position;
    const half = 12 * a.scale;
    const ahead = p.x + direction * (half + 8);
    if (a.scale > 1 && a.grounded) {
      // Giant characters must jump before going under block rows.
      const feet = p.y + 14 * a.scale;
      const front = p.x + direction * half;
      if (
        this.solids.some((s) => {
          const distance =
            direction > 0 ? s.bounds.min.x - front : front - s.bounds.max.x;
          return (
            distance >= -2 &&
            distance <= a.speed * 32 &&
            feet > s.bounds.min.y + 5 &&
            feet - s.bounds.min.y < 265
          );
        })
      )
        this.jump(a);
    }
    // Land on the last step before jumping the gap. Running off it mid-fall
    // can put an NPC below the opposite staircase's landing surface.
    if (
      a !== this.mario &&
      !a.grounded &&
      a.body.velocity.y >= 0 &&
      GAPS.some(([l, r]) =>
        direction > 0 ? p.x < l && ahead >= l : p.x > r && ahead <= r,
      )
    ) {
      const support = this.solids.find(
        (s) =>
          p.x > s.bounds.min.x &&
          p.x < s.bounds.max.x &&
          s.bounds.min.y >= p.y + 14 * a.scale - 5,
      );
      if (support) this.move(a, 0);
      return;
    }
    if (
      GAPS.some(([l, r]) => ahead > l && ahead < r) ||
      this.solids.some(
        (s) =>
          p.x + direction * (half + 23) > s.bounds.min.x &&
          p.x + direction * (half + 23) < s.bounds.max.x &&
          p.y + (a === this.mario ? 19 : 14) * a.scale > s.bounds.min.y + 5 &&
          p.y - (a === this.mario ? 19 : 14) * a.scale < s.bounds.max.y,
      )
    )
      this.jump(a);
  }
  private expose(a: Actor) {
    if (a.state === "hidden" || a.state === "entering") {
      if (a.entry) Body.setPosition(a.body, a.entry);
      Body.setFrozen(a.body, false);
      Body.setVelocity(a.body, { x: 0, y: 0 });
    }
    a.entry = undefined;
    a.cover = null;
    a.hideTime = 0;
    a.state = a === this.player ? "idle" : "run";
  }
  warn() {
    if (this.cooldown > 0 || this.mode !== "playing") return;
    this.expose(this.player);
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

  hitBlock(c: Cover, hitter: Actor) {
    if (c.broken || c.kind !== "brick" || c.bounce > 0) return;
    if (
      !c.question &&
      (hitter === this.mario || (hitter === this.player && hitter.scale > 1))
    ) {
      this.breakBrick(c, hitter);
      return;
    }
    c.bounce = T.blockBounceSeconds;
    this.events.push("bump");
    if (c.question && !c.used) {
      c.used = true;
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
    if (
      !a.alive ||
      a.saved ||
      this.protected(a) ||
      (a === this.mario && (!this.marioActive || this.marioPipe > 0))
    )
      return;
    if (item.kind === "star") a.starLeft = T.starSeconds;
    if (a === this.mario) {
      if (item.kind === "flower") this.setMarioStage(2);
      if (item.kind === "mushroom" && this.marioStage === 0)
        this.setMarioStage(1);
    } else if (item.kind === "flower") a.flower = true;
    if (a !== this.mario && item.kind === "mushroom" && a.scale === 1) {
      this.expose(a);
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
        const top = Math.min(
          ...hits.map(
            (hit) =>
              hit.bounds.min.y,
          ),
        );
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
          (a !== this.mario || (this.marioActive && this.marioPipe <= 0)) &&
          a.state !== "entering" &&
          !this.protected(a) &&
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
    this.marioChase = this.marioStun = this.marioPipe = 0;
    Body.setFrozen(this.mario.body, true);
    this.fireballs = this.fireballs.filter((f) => f.owner === "player");
  }

  private hitMarioByFireball() {
    if (!this.marioActive || this.marioPipe > 0 || this.mario.starLeft > 0)
      return;
    if (this.marioStage === 2) {
      this.setMarioStage(1);
      this.marioStun = T.marioStunSeconds;
      this.events.push("power");
    } else if (this.marioStage === 1) {
      this.setMarioStage(0);
      this.marioStun = T.marioStunSeconds;
      this.events.push("power");
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
    const count = blood ? 32 : 12;
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
      });
    }
    if (this.particles.length > 1200)
      this.particles.splice(0, this.particles.length - 1200);
  }
  breakBrick(c: Cover, breaker = this.mario) {
    if (c.kind !== "brick" || c.broken) return;
    c.broken = true;
    if (c.body) {
      this.physics.remove(c.body);
      this.solids = this.solids.filter((s) => s !== c.body);
    }
    this.burst(c.x, c.y, false);
    for (const a of [this.player, ...this.npcs])
      if (a.cover === c.id) {
        if (breaker === this.player || this.invincible(a)) this.expose(a);
        else this.kill(a);
      }
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
    this.particles = this.particles.filter((p) => p.age < p.life);
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
    for (const a of [this.player, ...this.npcs, this.mario])
      a.starLeft = Math.max(0, a.starLeft - dt);
    for (const c of this.covers) c.bounce = Math.max(0, c.bounce - dt);
    const phase =
      this.elapsed >= T.fireballsAt ? 2 : this.elapsed >= T.fasterAt ? 1 : 0;
    if (phase !== this.phase) {
      this.phase = phase;
      if (!this.marioActive)
        this.setMarioStage((phase === 0 ? 1 : phase) as 0 | 1 | 2);
      this.events.push("power");
    }
    for (const a of [this.player, ...this.npcs, this.mario]) this.ground(a);
    if (this.mode === "playing") {
      const dx = Number(input.right) - Number(input.left);
      const p = this.player.body.position;
      this.expose(this.player);
      this.move(this.player, dx * T.walkSpeed);
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
      if (p.x < 20) Body.setPosition(this.player.body, { x: 20, y: p.y });
      if (p.x >= T.goalX) {
        if (this.saved >= T.required) this.finish();
        else Body.setPosition(this.player.body, { x: T.goalX - 1, y: p.y });
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
    this.contactWarning();
    for (const { actor, top } of hitters)
      for (const c of this.covers) {
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
    if (this.marioActive && this.marioPipe <= 0 && this.mario.starLeft <= 0) {
      for (const a of [this.player, ...this.npcs]) {
        if (!a.alive || a.saved || this.protected(a)) continue;
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
      const p = n.body.position;
      if (p.x >= T.goalX) {
        this.save(n);
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
      this.move(n, n.speed);
      this.autoJump(n, 1);
    }
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
        (n.state === "run" || n.state === "seek") &&
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
    if (target.state === "entering" && this.coverFor(target)?.kind === "brick")
      this.brickTarget = target.cover;
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
    if (
      m.y > 620 ||
      m.x > T.goalX + 100 ||
      m.x > this.cameraX + this.viewWidth + 240 ||
      m.x < this.cameraX - 650
    ) {
      this.marioActive = false;
      this.marioReturn = 2.5 + this.random() * 2.5;
      Body.setFrozen(this.mario.body, true);
      return;
    }
    if (this.marioPipe > 0) {
      this.marioPipe -= dt;
      this.move(this.mario, 0);
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
        !this.protected(a) &&
        Math.abs(a.body.position.x - m.x) < 220 &&
        !rayBlocked(this.solids, m, a.body.position),
    );
    if (starThreat) {
      this.marioRunning = true;
      this.marioTarget = null;
      this.marioChase = 0;
      if (this.mario.grounded) {
        const direction = Math.sign(m.x - starThreat.body.position.x) || -1;
        this.move(this.mario, direction * (4.8 + this.marioPressure));
        this.autoJump(this.mario, direction);
      }
      return;
    }
    const candidates = [this.player, ...this.npcs].filter(
      (a) => a.alive && !a.saved && !this.protected(a) && !this.invincible(a),
    );
    const sees = (a: Actor) =>
      Math.abs(a.body.position.x - m.x) < T.marioSight &&
      !rayBlocked(this.solids, m, a.body.position);
    const runners = new Set(this.runningCrowd().map((n) => n.id));
    const hearsCrowd = (a: Actor) =>
      runners.has(a.id) &&
      Math.abs(a.body.position.x - m.x) < 350 + this.marioPressure * 400;
    // Observe only at human-scale intervals. Aim at the last observed point,
    // never at a target's continuously updated position or a hidden character.
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
        if (
          target.state === "entering" &&
          sees(target) &&
          this.coverFor(target)?.kind === "brick"
        )
          this.brickTarget = target.cover;
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
        this.mario.grounded &&
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
    const brick = this.covers.find(
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
      const pipe = this.covers.find(
        (c) => c.kind === "pipe" && Math.abs(c.x - m.x) < 65,
      );
      if (pipe && this.random() < 0.5) this.marioPipe = 1.2;
      const nearbyBrick = this.covers.find(
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
    if (this.mario.grounded) {
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
          this.marioPipe <= 0 &&
          Math.abs(this.mario.body.position.x - f.x) < 12 * this.mario.scale + radius &&
          Math.abs(this.mario.body.position.y - f.y) < 19 * this.mario.scale + radius
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
          !this.protected(a) &&
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
