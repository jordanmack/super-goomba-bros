// Node-only playtest harness for the Mario hunt order (issues #138 and #150).
// Every run drives the shipped Simulation with the real per-frame step,
// including the real hunter spawn; nothing here reimplements the priority
// rules it observes.
import { Simulation, emptyInput } from "../../src/game/simulation.ts";
import { Body } from "../../src/game/physics.ts";
import { TUNING as T } from "../../src/game/config.ts";
import { CAMPAIGN } from "../../src/game/levels.ts";
import { physics } from "./arcade.ts";
import type { Actor, Item, ItemKind, MarioGoal } from "../../src/game/simulation.ts";

const dt = 1 / 60;
const VIEW = 960;

/** Stimuli staged around Mario, lowest hunt priority first. */
export type Stimulus = "question" | "item" | "crowd" | "stomp" | "star";

export type Rung = {
  /** Every stimulus live in the arena for this rung. */
  live: Stimulus[];
  /** The goal the hunt order must pick while all of them are live. */
  expect: MarioGoal;
};

export type Scene = {
  name: string;
  /** Open ground with clear sight both ways. */
  arena: number;
  /**
   * Distance from the arena to the player. The camera follows the player, and
   * `runningCrowd` only counts on-screen NPCs, so this keeps the crowd in view.
   */
  playerOffset: number;
  /** Unused question block Mario can see from the arena, when the scene uses one. */
  questionX?: number;
  /** Fleeing NPCs staged for the crowd rung. Defaults to just over the cap. */
  crowdSize?: number;
  rungs: Rung[];
};

/** Each rung adds one higher-priority stimulus without removing the lower ones. */
const BLOCK_RUNGS: Rung[] = [
  { live: ["question"], expect: "question" },
  { live: ["question", "item"], expect: "item" },
];
const HUNT_RUNGS: Rung[] = [
  { live: ["item"], expect: "item" },
  { live: ["item", "crowd"], expect: "crowd" },
  { live: ["item", "crowd", "stomp"], expect: "stomp" },
  { live: ["item", "crowd", "stomp", "star"], expect: "flee" },
];

export type StageSetup = { id: string; scenes: Scene[] };

export const HUNT_STAGES: StageSetup[] = [
  {
    id: "1-1",
    scenes: [
      // Offset from the block so the pursuit direction discriminates; sitting
      // under it would satisfy "moved toward" on an 8px gap.
      {
        name: "blocks",
        arena: 3280,
        playerOffset: 400,
        questionX: 3408,
        rungs: BLOCK_RUNGS,
      },
      { name: "hunt", arena: 3400, playerOffset: 400, rungs: HUNT_RUNGS },
    ],
  },
  {
    id: "1-2",
    scenes: [
      // 1-2 keeps all five question blocks in the opening room, so the block
      // ordering has to be read there rather than in the wide arena. A
      // non-small Mario only takes a block within 160px, which bounds how far
      // this arena can sit from it.
      {
        name: "blocks",
        arena: 250,
        playerOffset: 400,
        questionX: 336,
        rungs: BLOCK_RUNGS,
      },
      // The issue asks for a CROWDED 1-2, so this arena runs a denser flight
      // than 1-1 and holds crowd pressure at its cap.
      {
        name: "hunt",
        arena: 2112,
        playerOffset: 400,
        crowdSize: 12,
        rungs: HUNT_RUNGS,
      },
    ],
  },
  {
    id: "1-3",
    scenes: [
      // 1-3 has one question block on a short island. Super Mario only takes
      // a block within 160px, so this arena sits on that island. Item+question
      // pairing needs a spare block, so this scene checks the question rung
      // alone. Hunt rungs use the long floor at the end of the stage.
      {
        name: "blocks",
        arena: 1920,
        playerOffset: 240,
        questionX: 59 * 32 + 16,
        rungs: [{ live: ["question"], expect: "question" }],
      },
      {
        name: "hunt",
        arena: 220,
        playerOffset: 280,
        crowdSize: 3,
        rungs: HUNT_RUNGS,
      },
    ],
  },
];

export type RungResult = {
  scene: string;
  rung: Rung;
  goal: MarioGoal;
  targetX: number | null;
  /** `marioTarget` after the hunt pick; null when the lock is a block or flee. */
  targetId: number | null;
  huntItem: boolean;
  brickId: number | null;
  marioX: number;
  crowd: number;
  /** Mario's horizontal velocity once the reaction delay has cleared. */
  pursuitVx: number;
  /** Sign of the direction the pursuit actually moved him. */
  pursuitToward: number;
  placed: Record<string, number>;
  /** Stimulus name to the locked actor, item, or block id. */
  placedIds: Record<string, number>;
  crowdIds: number[];
};

export type StageResult = { id: string; seed: number; rungs: RungResult[] };

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Mirrors the scroll rule in Play.renderState, which owns the camera at runtime.
function aimCamera(s: Simulation) {
  const room = s.activeRoom;
  s.viewWidth = VIEW;
  s.cameraX = Math.max(
    room.offset,
    Math.min(
      room.offset + room.data.width * 32 - VIEW,
      s.player.body.position.x - VIEW * 0.36,
    ),
  );
}

function openStage(id: string, seed: number, holdMario = true) {
  const s = new Simulation(seeded(seed), physics());
  s.reset();
  // The forced ladder parks the return timer so staging cannot spawn Mario
  // early. The free-run trace leaves the shipped timer alone.
  if (holdMario) s.marioReturn = 1e6;
  while (s.level.id !== id) {
    const prev = s.level.id;
    s.nextLevel();
    s.reset("playing");
    if (holdMario) s.marioReturn = 1e6;
    if (s.level.id === prev)
      throw new Error(`expected ${id}, stopped at ${s.level.id}`);
  }
  if (!CAMPAIGN.some((level) => level.id === id))
    throw new Error(`unknown stage ${id}`);
  return s;
}

function stand(s: Simulation, actor: Actor, x: number, what: string) {
  if (!s.activeRoom.standOnFloor(actor, x))
    throw new Error(`${what}: no floor at ${x}`);
  Body.setVelocity(actor.body, { x: 0, y: 0 });
}

/**
 * Drop the walk-in jump Mario may still be committed to. `move` replays
 * `navVx` while he is airborne, so a leftover launch would steer the pursuit
 * instead of the goal he just picked.
 */
function settleHunter(s: Simulation, arena: number) {
  for (let f = 0; f < 4; f++) {
    stand(s, s.mario, arena, "mario");
    s.mario.navVx = undefined;
    s.mario.navDelay = undefined;
    s.mario.navHoldX = undefined;
    s.marioJumpWait = 0.8;
    aimCamera(s);
    s.step(dt, emptyInput());
  }
  stand(s, s.mario, arena, "mario");
  s.mario.navVx = undefined;
  s.mario.navDelay = undefined;
  s.mario.navHoldX = undefined;
}

function targetPositionOf(s: Simulation) {
  if (s.marioHuntItem)
    return s.items.find((i) => i.id === s.marioTarget)?.body.position.x ?? null;
  if (s.marioTarget !== null)
    return (
      [s.player, ...s.npcs].find((a) => a.id === s.marioTarget)?.body.position
        .x ?? null
    );
  if (s.brickTarget !== null)
    return s.obstacles.find((c) => c.id === s.brickTarget)?.x ?? null;
  return null;
}

/** Stage one arena: real spawn, parked bystanders, then the named stimuli. */
function stageArena(
  stage: StageSetup,
  scene: Scene,
  live: Set<Stimulus>,
  seed: number,
) {
  const s = openStage(stage.id, seed);
  const room = s.activeRoom;
  const placed: Record<string, number> = {};
  const placedIds: Record<string, number> = {};
  const crowdIds: number[] = [];

  // Park every NPC out of the arena so only staged stimuli are in play.
  for (const n of s.npcs) {
    n.warned = false;
    n.state = "idle";
    n.idleWalking = false;
    n.wait = 1e6;
    Body.setPosition(n.body, { x: room.goalX - 120, y: 300 });
    Body.setVelocity(n.body, { x: 0, y: 0 });
  }
  stand(s, s.player, scene.arena + scene.playerOffset, "player");
  aimCamera(s);

  // The hunter arrives through the shipped spawn path, not by assignment.
  s.marioReturn = 0;
  for (let f = 0; f < 600 && !s.marioActive; f++) {
    aimCamera(s);
    s.step(dt, emptyInput());
  }
  if (!s.marioActive) throw new Error(`${stage.id}: hunter never spawned`);
  settleHunter(s, scene.arena);

  if (live.has("question")) {
    const block = s.obstacles.find(
      (c) => c.question && !c.used && !c.hidden && c.x === scene.questionX,
    );
    if (!block)
      throw new Error(`${stage.id}: no unused question block at ${scene.questionX}`);
    placed.question = block.x;
    placedIds.question = block.id;
  }

  if (live.has("item")) {
    // Take the prize from a real block hit, then normalize its kind and place
    // it, so the rung does not depend on the question-block prize roll.
    const box = s.obstacles.find(
      (c) => c.question && !c.used && !c.hidden && c.x !== scene.questionX,
    );
    if (!box) throw new Error(`${stage.id}: no spare question block`);
    const roll = s.random;
    s.random = () => 0.5;
    s.hitBlock(box, s.player);
    s.random = roll;
    const item = s.items.at(-1);
    if (!item) throw new Error(`${stage.id}: block gave no item`);
    item.kind = "mushroom";
    item.emerge = 0;
    item.hold = 0;
    item.clip = undefined;
    Body.setFrozen(item.body, false);
    Body.setPosition(item.body, { x: scene.arena - 170, y: T.groundY - 16 });
    Body.setVelocity(item.body, { x: 0, y: 0 });
    placed.item = item.body.position.x;
    placedIds.item = item.id;
  }

  // Retire every other visible block, so a rung that does not list "question"
  // truly has none live and the printed evidence matches the arena.
  for (const c of s.obstacles)
    if (c.question && !c.used && !c.hidden && c.x !== placed.question)
      c.used = true;

  // Draw NPCs by role instead of fixed indices, so a change to the spawn
  // population or kind pattern fails with a labeled error, not a TypeError.
  const spare = s.npcs.filter((n) => n.kind === "goomba");
  const take = (role: string) => {
    const n = spare.shift();
    if (!n) throw new Error(`${stage.id}: no spare goomba for ${role}`);
    return n;
  };

  if (live.has("crowd")) {
    const size = scene.crowdSize ?? 6;
    const runners = [];
    for (let i = 0; i < size; i++) runners.push(take("crowd"));
    // Pack a bigger flight tighter so it still fits the arena's open ground.
    const gap = size > 6 ? 18 : 28;
    runners.forEach((n, i) => {
      stand(s, n, scene.arena + 200 + i * gap, "crowd");
      n.warned = true;
      n.fear = 0;
      n.state = "run";
      n.wait = -1;
      // `runningCrowd` requires |vx| > 1, so give the flight a velocity here
      // instead of relying on NPC movement running before updateMario.
      Body.setVelocity(n.body, { x: n.speed, y: 0 });
      crowdIds.push(n.id);
    });
    placed.crowd = scene.arena + 200;
  }

  if (live.has("stomp")) {
    const n = take("stomp");
    stand(s, n, scene.arena + 70, "stomp");
    placed.stomp = n.body.position.x;
    placedIds.stomp = n.id;
  }

  let starHolder: Actor | undefined;
  if (live.has("star")) {
    starHolder = take("star");
    stand(s, starHolder, scene.arena + 150, "star");
    starHolder.starLeft = T.starSeconds;
    placed.star = starHolder.body.position.x;
    placedIds.star = starHolder.id;
  }

  return { s, placed, placedIds, crowdIds, starHolder };
}

/** One rung: stage the stimuli, let the shipped hunt pick, then read it back. */
export function runRung(
  stage: StageSetup,
  scene: Scene,
  rung: Rung,
  seed: number,
): RungResult {
  const { s, placed, placedIds, crowdIds } = stageArena(
    stage,
    scene,
    new Set(rung.live),
    seed,
  );

  // Force one observation now, then read back the goal the shipped code chose.
  s.marioLook = 0;
  s.marioIgnore = 0;
  aimCamera(s);
  s.step(dt, emptyInput());
  const goal = s.marioGoal;
  const marioX = s.mario.body.position.x;
  const crowd = s.marioCrowd;
  const targetX = targetPositionOf(s);
  const targetId = s.marioTarget;
  const huntItem = s.marioHuntItem;
  const brickId = s.brickTarget;

  // Clear the reaction delay so the pursuit itself becomes observable.
  s.marioReaction = 0;
  const before = s.mario.body.position.x;
  let pursuitVx = 0;
  for (let f = 0; f < 12; f++) {
    aimCamera(s);
    s.step(dt, emptyInput());
    pursuitVx = s.mario.body.velocity.x;
  }

  return {
    scene: scene.name,
    rung,
    goal,
    targetX,
    targetId,
    huntItem,
    brickId,
    marioX,
    crowd,
    pursuitVx,
    pursuitToward: Math.sign(s.mario.body.position.x - before),
    placed,
    placedIds,
    crowdIds,
  };
}

export function runStage(stage: StageSetup, seed: number): StageResult {
  const rungs: RungResult[] = [];
  for (const scene of stage.scenes)
    for (const rung of scene.rungs) rungs.push(runRung(stage, scene, rung, seed));
  return { id: stage.id, seed, rungs };
}

/**
 * Flee the star holder, then expire the star and step again without forcing a
 * fresh observation. Mario only re-picks on his own look interval, so a stale
 * `flee` would keep reading as the current goal in between.
 */
export function stageFleeRelease(stage: StageSetup, seed: number) {
  const scene = stage.scenes.find((sc) => sc.name === "hunt");
  if (!scene) throw new Error(`${stage.id}: no hunt scene`);
  const { s, starHolder } = stageArena(
    stage,
    scene,
    new Set<Stimulus>(["item", "crowd", "stomp", "star"]),
    seed,
  );
  if (!starHolder) throw new Error(`${stage.id}: no star holder staged`);
  s.marioLook = 0;
  s.marioIgnore = 0;
  aimCamera(s);
  s.step(dt, emptyInput());
  const whileStarred = s.marioGoal;

  // Run the star down through the shipped timer rather than zeroing it, and
  // hold off the next observation so only the release itself can clear it.
  starHolder.starLeft = dt;
  s.marioLook = 10;
  aimCamera(s);
  s.step(dt, emptyInput());
  const betweenLooks = s.marioGoal;

  // Now allow a normal observation and confirm the order resumes.
  s.marioLook = 0;
  aimCamera(s);
  s.step(dt, emptyInput());
  return {
    whileStarred,
    betweenLooks,
    afterStar: s.marioGoal,
    starLeft: starHolder.starLeft,
  };
}

/**
 * A heard warning retargets Mario at the player from `warn()`, outside
 * `pickMarioGoal`. The readback has to follow that jump, or it would keep
 * naming the rule that chose the goal he just abandoned.
 */
export function stageShoutRetarget(stage: StageSetup, seed: number) {
  const scene = stage.scenes.find((sc) => sc.name === "hunt");
  if (!scene) throw new Error(`${stage.id}: no hunt scene`);
  const { s } = stageArena(
    stage,
    scene,
    new Set<Stimulus>(["item", "crowd", "stomp"]),
    seed,
  );
  s.marioLook = 0;
  s.marioIgnore = 0;
  aimCamera(s);
  s.step(dt, emptyInput());
  const beforeShout = s.marioGoal;
  const targetBefore = s.marioTarget;

  // Guarantee the hearing roll lands, then shout through the shipped path.
  const roll = s.random;
  s.random = () => 0;
  s.warn();
  s.random = roll;
  return {
    beforeShout,
    afterShout: s.marioGoal,
    targetBefore,
    targetAfter: s.marioTarget,
    playerId: s.player.id,
  };
}

export type FreeSample = {
  frame: number;
  goal: MarioGoal;
  targetId: number | null;
};

/** Stimuli that were actually in range when a free-run window was read. */
export type FreeLive = {
  question: boolean;
  itemKind: ItemKind | null;
  itemNear: boolean;
  runners: number;
  stompNear: boolean;
  starNear: boolean;
};

export type FreeWindow = FreeSample & {
  name: string;
  /** True when this read waited for a shipped look after `marioIgnore` hit 0. */
  looked: boolean;
  live: FreeLive;
};

export type FreeHuntTrace = {
  id: string;
  seed: number;
  startX: number;
  endX: number;
  areaId: string;
  mainId: string;
  /** Frames stepped from the level start before any stimulus was staged. */
  naturalFrames: number;
  natural: FreeSample[];
  /** Every goal-field change in the session, natural prefix included. */
  trace: FreeSample[];
  windows: FreeWindow[];
  runners: number;
  runnerIds: number[];
  stompId: number;
  /** Already-emerged power-up used for the item rung on the blocks scene. */
  powerId: number;
  /** Mushroom that stays live under the crowd and stomp windows. */
  itemId: number;
  playerId: number;
};

const NATURAL_FRAMES = 600;
const LOOK_FRAMES = 150;
const HUNT_KINDS: ItemKind[] = [
  "mushroom",
  "mushroom3x",
  "mushroom8x",
  "flower",
  "star",
];

/**
 * One session from the real stage start. The first `NATURAL_FRAMES` steps are
 * an unstaged walk: the shipped return timer spawns Mario, and `marioGoal` is
 * only read when it changes. Later windows keep stepping that same simulation.
 * They do not zero `marioLook`. Positions are held only so a multi-frame look
 * still sees the same distances the order rules use (question within 160px,
 * stomp within 8-125px, crowd on screen).
 */
export function runFreeHuntTrace(stage: StageSetup, seed: number): FreeHuntTrace {
  const blocks = stage.scenes.find((scene) => scene.name === "blocks");
  const hunt = stage.scenes.find((scene) => scene.name === "hunt");
  if (!blocks?.questionX || !hunt)
    throw new Error(`${stage.id}: free run needs the blocks and hunt scenes`);
  const s = openStage(stage.id, seed, false);
  const trace: FreeSample[] = [];
  let frame = 0;
  let prevGoal = s.marioGoal;
  const note = () => {
    if (s.marioGoal === prevGoal) return;
    prevGoal = s.marioGoal;
    trace.push({
      frame,
      goal: s.marioGoal,
      targetId: s.marioTarget,
    });
  };
  const step = (input = emptyInput()) => {
    aimCamera(s);
    s.step(dt, input);
    frame++;
    note();
  };
  const startX = s.player.body.position.x;
  const areaId = s.player.areaId;
  if (!areaId) throw new Error(`${stage.id}: player has no area at the start`);
  const walking = { ...emptyInput(), right: true };
  for (let i = 0; i < NATURAL_FRAMES; i++) step(walking);
  const natural = trace.slice();
  const endX = s.player.body.position.x;
  if (s.mode !== "playing" || !s.marioActive)
    throw new Error(
      `${stage.id}: free run left playing=${s.mode} mario=${s.marioActive}`,
    );

  const used = new Set<number>();
  let item: Item | undefined;
  let runners: Actor[] = [];
  let stomp: Actor | undefined;
  let starHolder: Actor | undefined;
  let questionX = blocks.questionX;

  const spareGoombas = () =>
    s.npcs.filter(
      (n) =>
        n.alive &&
        !n.saved &&
        n.kind === "goomba" &&
        !n.pipeTravel &&
        n.scale < T.hugeScale &&
        n.starLeft <= 0 &&
        !used.has(n.id),
    );
  const take = (role: string) => {
    const n = spareGoombas()[0];
    if (!n) throw new Error(`${stage.id}: no spare goomba for ${role}`);
    used.add(n.id);
    return n;
  };
  const scrubItems = () => {
    for (const loose of [...s.items]) s.physics.remove(loose.body);
    s.items = [];
    item = undefined;
  };
  const park = () => {
    const room = s.activeRoom;
    for (const n of s.npcs) {
      n.warned = false;
      n.state = "idle";
      n.idleWalking = false;
      n.wait = 1e6;
      n.starLeft = 0;
      n.fear = 0;
      Body.setPosition(n.body, { x: room.goalX - 120, y: 300 });
      Body.setVelocity(n.body, { x: 0, y: 0 });
    }
    runners = [];
    stomp = undefined;
    starHolder = undefined;
    used.clear();
  };
  const holdQuestion = (scene: Scene) => {
    const kept = s.obstacles.find(
      (c) =>
        c.question &&
        !c.hidden &&
        !c.used &&
        scene.questionX !== undefined &&
        c.x === scene.questionX,
    );
    if (scene.questionX !== undefined && !kept)
      throw new Error(`${stage.id}: question block at ${scene.questionX} is spent`);
    for (const c of s.obstacles)
      if (c.question && !c.hidden && c !== kept) c.used = true;
    questionX = scene.questionX ?? -1;
  };
  const spawnLoose = (scene: Scene, kind: ItemKind) => {
    const box = s.obstacles.find(
      (c) =>
        c.question &&
        !c.used &&
        !c.hidden &&
        c.x !== scene.questionX,
    );
    if (!box) throw new Error(`${stage.id}: no spare question block`);
    const roll = s.random;
    s.random = () => 0.5;
    s.hitBlock(box, s.player);
    s.random = roll;
    const spawned = s.items.at(-1);
    if (!spawned) throw new Error(`${stage.id}: block gave no item`);
    spawned.kind = kind;
    spawned.emerge = 0;
    spawned.hold = 0;
    spawned.clip = undefined;
    Body.setFrozen(spawned.body, false);
    Body.setPosition(spawned.body, {
      x: scene.arena - 170,
      y: T.groundY - 16,
    });
    Body.setVelocity(spawned.body, { x: 0, y: 0 });
    item = spawned;
    return spawned;
  };
  const pin = (scene: Scene) => {
    stand(s, s.player, scene.arena + scene.playerOffset, "player");
    stand(s, s.mario, scene.arena, "mario");
    s.mario.navVx = undefined;
    s.mario.navDelay = undefined;
    s.mario.navHoldX = undefined;
    s.marioJumpWait = 0.8;
    if (item) {
      item.emerge = 0;
      item.hold = 0;
      item.clip = undefined;
      Body.setFrozen(item.body, false);
      Body.setPosition(item.body, {
        x: scene.arena - 170,
        y: T.groundY - 16,
      });
      Body.setVelocity(item.body, { x: 0, y: 0 });
    }
    const gap = runners.length > 6 ? 18 : 28;
    runners.forEach((n, index) => {
      stand(s, n, scene.arena + 200 + index * gap, "crowd");
      n.warned = true;
      n.fear = 0;
      n.state = "run";
      n.wait = -1;
      n.starLeft = 0;
      Body.setVelocity(n.body, { x: n.speed, y: 0 });
    });
    if (stomp) {
      stand(s, stomp, scene.arena + 70, "stomp");
      stomp.starLeft = 0;
      stomp.warned = false;
      stomp.state = "idle";
    }
    if (starHolder) {
      stand(s, starHolder, scene.arena + 150, "star");
      starHolder.warned = false;
      starHolder.state = "idle";
    }
  };
  const liveNow = (scene: Scene): FreeLive => {
    const mx = scene.arena;
    const block = s.obstacles.find(
      (c) => c.question && !c.hidden && !c.used && c.x === questionX,
    );
    const itemX = item?.body.position.x;
    return {
      question: !!block && Math.abs(block.x - mx) < 160,
      itemKind: item?.kind ?? null,
      itemNear:
        itemX !== undefined && Math.abs(itemX - mx) < T.marioSight,
      runners: runners.filter(
        (n) =>
          n.warned &&
          n.state === "run" &&
          n.starLeft <= 0 &&
          Math.abs(n.body.position.x - mx) < T.marioSight,
      ).length,
      stompNear: !!stomp &&
        Math.abs(stomp.body.position.x - mx) > 8 &&
        Math.abs(stomp.body.position.x - mx) < 125,
      starNear: !!starHolder &&
        starHolder.starLeft > 0 &&
        Math.abs(starHolder.body.position.x - mx) < 220,
    };
  };
  const windows: FreeWindow[] = [];
  const afterLook = (scene: Scene, name: string, accept?: (goal: MarioGoal) => boolean) => {
    let looked = false;
    let live = liveNow(scene);
    const limit = accept ? 300 : LOOK_FRAMES;
    for (let i = 0; i < limit; i++) {
      pin(scene);
      live = liveNow(scene);
      const prevLook = s.marioLook;
      step();
      // Ignore is spent down before the look, so a look on the clearing step
      // already saw zero. Item and question are skipped while it is above zero.
      const sawLook = s.marioLook > prevLook + 0.05 && s.marioIgnore === 0;
      if (!sawLook) continue;
      looked = true;
      if (!accept || accept(s.marioGoal)) break;
    }
    const sample: FreeWindow = {
      name,
      frame,
      goal: s.marioGoal,
      targetId: s.marioTarget,
      looked,
      live,
    };
    windows.push(sample);
    return sample;
  };
  const parkActor = (actor: Actor) => {
    actor.warned = false;
    actor.state = "idle";
    actor.wait = 1e6;
    actor.starLeft = 0;
    Body.setPosition(actor.body, { x: s.activeRoom.goalX - 120, y: 300 });
    Body.setVelocity(actor.body, { x: 0, y: 0 });
  };

  const enter = (scene: Scene) => {
    park();
    scrubItems();
    stand(s, s.player, scene.arena + scene.playerOffset, "player");
    stand(s, s.mario, scene.arena, "mario");
    aimCamera(s);
  };

  enter(blocks);
  // random 0 rolls a coin. That pop must not become a loose hunt item.
  const coinBox = s.obstacles.find(
    (c) => c.question && !c.used && !c.hidden && c.x !== blocks.questionX,
  );
  if (!coinBox) throw new Error(`${stage.id}: no spare block for a coin`);
  const coinRoll = s.random;
  s.random = () => 0;
  s.hitBlock(coinBox, s.player);
  s.random = coinRoll;
  if (s.items.length)
    throw new Error(`${stage.id}: coin prize left a hunt item`);
  afterLook(blocks, "question-over-coin");
  const power = spawnLoose(blocks, "oneUp");
  holdQuestion(blocks);
  afterLook(blocks, "question-over-one-up");
  if (!item) throw new Error(`${stage.id}: one-up item missing`);
  for (const kind of HUNT_KINDS) {
    item.kind = kind;
    afterLook(blocks, kind === "star" ? "item-star" : kind);
  }
  item.kind = "oneUp";
  afterLook(blocks, "question-over-one-up-again");

  enter(hunt);
  const huntItem = spawnLoose(hunt, "mushroom");
  holdQuestion(hunt);
  const size = hunt.crowdSize ?? 6;
  runners = [];
  for (let i = 0; i < size; i++) runners.push(take("crowd"));
  const runnerIds = runners.map((n) => n.id);
  // Stomp outranks the crowd, so it stays absent until that window.
  afterLook(hunt, "crowd");
  stomp = take("stomp");
  const stompId = stomp.id;
  afterLook(hunt, "stomp");
  starHolder = take("star");
  starHolder.starLeft = T.starSeconds;
  // Flee is checked every frame, ahead of the look, so one step is the read.
  pin(hunt);
  step();
  windows.push({
    name: "flee",
    frame,
    goal: s.marioGoal,
    targetId: s.marioTarget,
    looked: false,
    live: liveNow(hunt),
  });
  starHolder.starLeft = 0;
  afterLook(hunt, "stomp-after-star");
  // Drop each higher rung and read the next goal. The question block for this
  // stage sits on the blocks scene, so the lower rungs move back there. The
  // hunt pass only marked it used; it was not hit.
  if (stomp) parkActor(stomp);
  stomp = undefined;
  afterLook(hunt, "crowd-after-stomp");
  for (const runner of runners) parkActor(runner);
  runners = [];
  afterLook(hunt, "item-after-crowd");
  const question = s.obstacles.find(
    (c) => c.question && !c.hidden && c.x === blocks.questionX,
  );
  if (!question) throw new Error(`${stage.id}: question block disappeared`);
  question.used = false;
  questionX = blocks.questionX;
  if (!item) throw new Error(`${stage.id}: hunt item missing after the crowd`);
  for (const kind of HUNT_KINDS) {
    item.kind = kind;
    afterLook(blocks, kind === "star" ? "after-star-item-star" : `after-star-${kind}`);
  }
  item.kind = "oneUp";
  afterLook(blocks, "question-after-item");
  question.used = true;
  questionX = -1;
  scrubItems();
  if (starHolder) parkActor(starHolder);
  starHolder = undefined;
  afterLook(blocks, "patrol", (goal) => goal === "chase" || goal === "notice");
  pin(hunt);
  const roll = s.random;
  s.random = () => 0;
  s.warn();
  s.random = roll;
  note();
  windows.push({
    name: "shout",
    frame,
    goal: s.marioGoal,
    targetId: s.marioTarget,
    looked: false,
    live: liveNow(hunt),
  });
  // Keep stepping after the warning so the shout is not the final snapshot.
  for (let i = 0; i < 30; i++) {
    pin(hunt);
    step();
  }

  return {
    id: stage.id,
    seed,
    startX,
    endX,
    areaId,
    mainId: s.level.main,
    naturalFrames: NATURAL_FRAMES,
    natural,
    trace,
    windows,
    runners: size,
    runnerIds,
    stompId,
    powerId: power.id,
    itemId: huntItem.id,
    playerId: s.player.id,
  };
}

export function formatStage(result: StageResult) {
  const lines = [`stage ${result.id} seed ${result.seed}`];
  for (const r of result.rungs)
    lines.push(
      `  ${r.goal === r.rung.expect ? "PASS" : "FAIL"} ` +
        `scene=${r.scene} live=[${r.rung.live.join(",")}] ` +
        `expect=${r.rung.expect} chose=${r.goal} ` +
        `marioX=${Math.round(r.marioX)} ` +
        `targetX=${r.targetX === null ? "none" : Math.round(r.targetX)} ` +
        `crowd=${r.crowd} pursuitVx=${r.pursuitVx.toFixed(2)} ` +
        `toward=${r.pursuitToward} placed={${Object.entries(r.placed)
          .map(([k, v]) => `${k}:${Math.round(v)}`)
          .join(" ")}}`,
    );
  return lines.join("\n");
}

// Usage: mario-hunt-playtest.ts [stage id ...] [seed ...], for example
// `... mario-hunt-playtest.ts 1-2 1 2 3`. Defaults to 1-1, 1-2, and 1-3.
if (import.meta.main) {
  const args = process.argv.slice(2);
  const wanted = args.filter((a) => !Number.isFinite(Number(a)));
  const requested = args.map(Number).filter(Number.isFinite);
  const seeds = requested.length ? requested : [1, 2, 3];
  const stages = wanted.length
    ? HUNT_STAGES.filter((s) => wanted.includes(s.id))
    : HUNT_STAGES;
  if (!stages.length) throw new Error(`no such stage: ${wanted.join(",")}`);
  let failures = 0;
  for (const stage of stages)
    for (const seed of seeds) {
      const result = runStage(stage, seed);
      console.log(formatStage(result));
      failures += result.rungs.filter((r) => r.goal !== r.rung.expect).length;
    }
  console.log(failures ? `FAILED ${failures} rung(s)` : "OK every rung held");
  if (failures) process.exitCode = 1;
}
