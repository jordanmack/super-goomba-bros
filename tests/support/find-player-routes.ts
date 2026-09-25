// Test-only route search. Every candidate and final replay uses the real Arcade
// simulation and ordinary Input actions. It never changes production controls.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Simulation, emptyInput } from "../../src/game/simulation.ts";
import type { BulletBill, Hammer } from "../../src/game/simulation.ts";
import { Body } from "../../src/game/physics.ts";
import { CAMPAIGN, areaData } from "../../src/game/levels.ts";
import { TUNING as T } from "../../src/game/config.ts";
import { physics } from "./arcade.ts";
import type { PlatformMotion } from "../../src/game/platform-motion.ts";
import type { PlantMotion } from "../../src/game/piranha.ts";
import type { PodobooMotion } from "../../src/game/podoboo.ts";

type State = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  area: string;
  time: number;
  grounded: boolean;
  jumpHeld: boolean;
  jumpHoldG?: number;
  jumpFallG?: number;
  pipeWait: number;
  hidden: number[];
  pace: number;
  // Every room's moving platforms, so a rewind replays their own motion.
  lifts: Record<string, SavedLifts>;
  liftKey: string;
  // Every room's Piranha Plants, so a rewind replays their cycle.
  plants: Record<string, PlantMotion[]>;
  // Every room's Podoboos, and the frame they last stepped.
  podoboos: Record<string, PodobooMotion[]>;
  podobooStepped: number;
  // Rooms loaded so far. A rewind unloads later ones so they load fresh.
  roomIds: string[];
  // Spring squashes in progress, riders included.
  springRides: unknown[];
  terrainId: number;
  bills: BulletBill[];
  billId: number;
  cannonTimers: Record<string, number[]>;
  cannonTurn: Record<string, number[]>;
  cannonLfsr: number[];
  frame: number;
  bros: {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: number;
    alive: boolean;
    grounded: boolean;
    jumpTimer: number;
    throwTimer: number;
    walkTimer: number;
  }[];
  hammers: Hammer[];
};
type SavedLifts = {
  elapsed?: number;
  frame?: number;
  list: {
    x: number;
    y: number;
    motion?: PlatformMotion;
    rightSpeed?: number;
    rightTravel?: number;
  }[];
};
type LiftClock = { platformElapsed?: number; platformFrame?: number };
type Node = {
  state: State;
  cost: number;
  priority: number;
  parent?: Node;
  inputs: number[];
};
type Macro = {
  kind: "walk" | "jump" | "drop" | "swim" | "wait" | "pipe";
  direction: number;
  frames: number;
  delay: number;
  ratio: number;
  run: boolean;
};
const output = "/tmp/super-goomba-player-routes-debug.json";
const results: Record<string, [number, number][]> = existsSync(output)
  ? JSON.parse(readFileSync(output, "utf8"))
  : {};
const requested = process.argv.slice(2);
const levels = requested.length
  ? CAMPAIGN.filter((level) => requested.includes(level.id))
  : CAMPAIGN;
if (requested.some((id) => !CAMPAIGN.some((level) => level.id === id)))
  throw new Error("Unknown test level");

const input = (bits: number) => ({
  ...emptyInput(),
  left: !!(bits & 1),
  right: !!(bits & 2),
  jump: !!(bits & 4),
  down: !!(bits & 8),
  run: !!(bits & 16),
});
function prepare(index: number) {
  const sim = new Simulation(() => 0.5, physics());
  sim.levelIndex = index;
  sim.reset();
  for (const npc of sim.npcs) sim.physics.remove(npc.body);
  sim.npcs = [];
  sim.marioReturn = 1e6;
  for (let frame = 0; frame < 60 * 20 && sim.pipeIntro; frame++)
    step(sim, 0);
  sim.timeLeft = 9999;
  return sim;
}
function step(sim: Simulation, bits: number) {
  sim.step(1 / 60, input(bits));
  // These witnesses prove movement without requiring a random power-up.
  for (const item of sim.items) sim.physics.remove(item.body);
  sim.items = [];
  sim.events = [];
  sim.particles = [];
}
function capture(sim: Simulation): State {
  const body = sim.player.body;
  const flags = sim as unknown as {
    jumped: boolean;
    playerPace: number;
    nextId: number;
  };
  return {
    x: body.position.x,
    y: body.position.y,
    vx: body.velocity.x,
    vy: body.velocity.y,
    area: sim.player.areaId!,
    time: sim.elapsed,
    grounded:
      sim.player.grounded ||
      !!(body.native as unknown as { blocked: { down: boolean } }).blocked.down,
    jumpHeld: flags.jumped,
    jumpHoldG: sim.player.jumpHoldG,
    jumpFallG: sim.player.jumpFallG,
    pipeWait: sim.player.pipeWait ?? 0,
    hidden: sim.obstacles.filter((c) => c.hidden && c.used).map((c) => c.id),
    pace: flags.playerPace,
    lifts: Object.fromEntries(
      [...sim.rooms].map(([id, room]) => {
        const clock = room as unknown as LiftClock;
        return [
          id,
          {
            elapsed: clock.platformElapsed,
            frame: clock.platformFrame,
            list: room.platforms.map((p) => ({
              x: p.body.position.x,
              y: p.body.position.y,
              motion: p.motion && { ...p.motion },
              rightSpeed: p.rightSpeed,
              rightTravel: p.rightTravel,
            })),
          },
        ];
      }),
    ),
    roomIds: [...sim.rooms.keys()],
    springRides: structuredClone(
      (sim as unknown as { springRides: unknown[] }).springRides,
    ),
    terrainId: (sim as unknown as { terrainId: number }).terrainId,
    plants: Object.fromEntries(
      [...sim.rooms].map(([id, room]) => [
        id,
        room.plants.map((plant) => ({ ...plant.motion })),
      ]),
    ),
    podoboos: Object.fromEntries(
      [...sim.rooms].map(([id, room]) => [
        id,
        room.podoboos.map((podoboo) => ({ ...podoboo.motion })),
      ]),
    ),
    podobooStepped: (sim as unknown as { podobooStepped: number })
      .podobooStepped,
    liftKey: sim.activeRoom.platforms
      .map(
        (p) =>
          `${Math.round(p.body.position.x / 8)},${Math.round(p.body.position.y / 8)},${p.motion?.speed ?? 0},${(p.motion?.primary ?? 0) & 3},${p.rightSpeed ?? 0}`,
      )
      .join(";"),
    bills: sim.bulletBills.map((b) => ({ ...b })),
    billId: flags.nextId,
    cannonTimers: Object.fromEntries(
      [...sim.rooms].map(([id, room]) => [
        id,
        room.cannons.map((c) => c.timer),
      ]),
    ),
    cannonLfsr: [
      ...(sim as unknown as { cannonLfsr: Uint8Array }).cannonLfsr,
    ],
    cannonTurn: Object.fromEntries(
      [...sim.rooms].map(([id, room]) => [id, [...room.cannonTurn]]),
    ),
    frame: sim.frame,
    bros: sim.hammerBros.map((bro) => ({
      id: bro.id,
      x: bro.body.position.x,
      y: bro.body.position.y,
      vx: bro.body.velocity.x,
      vy: bro.body.velocity.y,
      facing: bro.facing,
      alive: bro.alive,
      grounded: bro.grounded,
      jumpTimer: bro.jumpTimer,
      throwTimer: bro.throwTimer,
      walkTimer: bro.walkTimer,
    })),
    hammers: sim.hammers.map((hammer) => ({ ...hammer })),
  };
}
// Load exactly the rooms the state had. A room another branch loaded does not
// exist yet here: plants in it would keep that branch's cycle, so unload it.
// A room this state had but a rewind unloaded is rebuilt fresh, in load
// order, so its terrain ids match a real replay.
function syncRooms(sim: Simulation, state: State) {
  for (const [id, room] of [...sim.rooms]) {
    if (state.roomIds.includes(id)) continue;
    const bodies = new Set(room.solids);
    const blocks = new Set(room.obstacles);
    for (const body of room.solids) sim.physics.remove(body);
    sim.solids = sim.solids.filter((body) => !bodies.has(body));
    sim.obstacles = sim.obstacles.filter((block) => !blocks.has(block));
    sim.rooms.delete(id);
  }
  const terrain = sim as unknown as { terrainId: number };
  terrain.terrainId = [...sim.rooms.values()].reduce(
    (sum, room) => sum + room.obstacles.length,
    0,
  );
  for (const id of state.roomIds) if (!sim.rooms.has(id)) sim.loadRoom(id);
  if (terrain.terrainId !== state.terrainId)
    throw new Error(`terrain ids drifted: ${terrain.terrainId} vs ${state.terrainId}`);
}

function restore(sim: Simulation, state: State) {
  syncRooms(sim, state);
  sim.physics.remove(sim.player.body);
  sim.bulletBills = state.bills.map((b) => ({ ...b }));
  (sim as unknown as { nextId: number }).nextId = state.billId;
  for (const [id, room] of sim.rooms) {
    const timers = state.cannonTimers[id];
    if (!timers) continue;
    for (let i = 0; i < room.cannons.length; i++) {
      const timer = timers[i];
      if (timer !== undefined) room.cannons[i]!.timer = timer;
    }
    const turn = state.cannonTurn[id];
    if (turn) room.cannonTurn = [...turn];
  }
  const lfsr = (sim as unknown as { cannonLfsr: Uint8Array }).cannonLfsr;
  for (let i = 0; i < lfsr.length; i++) lfsr[i] = state.cannonLfsr[i] ?? 0;
  (sim as unknown as { springRides: unknown[] }).springRides = structuredClone(
    state.springRides,
  );
  for (const [id, room] of sim.rooms) {
    const plants = state.plants[id];
    if (plants)
      room.plants.forEach((plant, i) => {
        const motion = plants[i];
        if (motion) plant.motion = { ...motion };
      });
    const podoboos = state.podoboos[id];
    if (podoboos)
      room.podoboos.forEach((podoboo, i) => {
        const motion = podoboos[i];
        if (motion) podoboo.motion = { ...motion };
      });
    const saved = state.lifts[id];
    if (!saved) continue;
    const clock = room as unknown as LiftClock;
    clock.platformElapsed = saved.elapsed;
    clock.platformFrame = saved.frame;
    room.platforms.forEach((p, i) => {
      const lift = saved.list[i];
      if (!lift) return;
      p.body.position.x = lift.x;
      p.body.position.y = lift.y;
      p.motion = lift.motion && { ...lift.motion };
      p.path = undefined;
      p.rightSpeed = lift.rightSpeed;
      p.rightTravel = lift.rightTravel;
    });
    room.refreshBalanceRopes();
  }
  sim.player.body = sim.physics.rectangle(state.x, state.y, 24, 28);
  Body.setVelocity(sim.player.body, { x: state.vx, y: state.vy });
  Object.assign(sim.player, {
    alive: true,
    saved: false,
    grounded: state.grounded,
    areaId: state.area,
    pipeWait: state.pipeWait,
  });
  Object.assign(sim, {
    mode: "playing",
    elapsed: state.time,
    frame: state.frame,
    podobooStepped: state.podobooStepped,
    podobooTracks: new WeakMap(),
    jumped: state.jumpHeld,
    playerPace: state.pace,
    marioReturn: 1e6,
    marioActive: false,
  });
  // Hammer Bros are not in the player snapshot. Rewind them with the branch,
  // or a later candidate dodges a hammer that only existed on another path.
  for (const snap of state.bros) {
    const bro = sim.hammerBros.find((item) => item.id === snap.id);
    if (!bro) continue;
    const inWorld = sim.physics.bodies.has(bro.body);
    if (snap.alive && !inWorld) {
      bro.body = sim.physics.rectangle(
        snap.x,
        snap.y,
        T.hammerBroWidth,
        T.hammerBroHeight,
      );
      Body.setVelocity(bro.body, { x: snap.vx, y: snap.vy });
    } else if (!snap.alive && inWorld) sim.physics.remove(bro.body);
    else if (snap.alive) {
      Body.setPosition(bro.body, { x: snap.x, y: snap.y });
      Body.setVelocity(bro.body, { x: snap.vx, y: snap.vy });
    }
    bro.facing = snap.facing;
    bro.alive = snap.alive;
    bro.grounded = snap.grounded;
    bro.jumpTimer = snap.jumpTimer;
    bro.throwTimer = snap.throwTimer;
    bro.walkTimer = snap.walkTimer;
  }
  sim.hammers = state.hammers.map((hammer) => ({ ...hammer }));
  (
    sim as unknown as { hammerHugeHold: Map<unknown, unknown> }
  ).hammerHugeHold.clear();
  sim.player.jumpHeld = state.jumpHeld;
  sim.player.jumpHoldG = state.jumpHoldG;
  sim.player.jumpFallG = state.jumpFallG;
  if (!sim.activeRoom)
    throw new Error(
      `restore lost area ${state.area}: captured ${state.roomIds.join(",")}; loaded ${[...sim.rooms.keys()].join(",")}; level ${sim.levelIndex}`,
    );
  sim.cameraX = sim.activeRoom.offset;
  for (const block of sim.obstacles) {
    block.bounce = 0;
    if (block.hidden) {
      block.used = state.hidden.includes(block.id);
      block.body!.headOnly = !block.used;
    }
  }
}
function macros(sim: Simulation, state: State): Macro[] {
  const actions: Macro[] = [];
  const add = (
    kind: Macro["kind"],
    direction: number,
    frames: number,
    delay = 0,
    ratio = 1,
    run = false,
  ) => actions.push({ kind, direction, frames, delay, ratio, run });
  if (sim.activeRoom.data.type === "water") {
    for (const direction of [1, 0, -1]) {
      add("walk", direction, 8);
      add("swim", direction, 8);
    }
  } else if (state.grounded) {
    for (const direction of [1, -1]) {
      add("walk", direction, 4);
      add("walk", direction, 12);
      add("walk", direction, 8, 0, 1, true);
      add("walk", direction, 16, 0, 1, true);
      for (const delay of [0, 8, 16, 24])
        for (const run of [false, true])
          add("jump", direction, 110, delay, 1, run);
      for (const delay of [0, 12, 24]) add("drop", direction, 100, delay);
    }
    if (sim.activeRoom.platforms.length || sim.activeRoom.firebars.length) {
      add("wait", 0, 20);
      add("wait", 0, 40);
    }
    // A Hammer Bro on the ground fills the corridor until he jumps. Waiting
    // is how the recorded route slips under that jump.
    if (
      sim.hammerBros.some(
        (bro) =>
          bro.alive &&
          bro.areaId === sim.player.areaId &&
          Math.abs(bro.body.position.x - state.x) < 420,
      )
    ) {
      for (const frames of [15, 30, 45, 70, 100]) add("wait", 0, frames);
      add("walk", 1, 24, 0, 1, true);
      add("walk", 1, 40, 0, 1, true);
    }
  } else {
    for (const direction of [1, 0, -1]) {
      add("walk", direction, 8);
      add("walk", direction, 8, 0, 1, true);
    }
  }
  if (
    sim.activeRoom.data.pipes.some(
      (p) =>
        p.direction === "down" &&
        Math.abs(
          state.x - sim.activeRoom.offset - (p.column + p.width / 2) * 32,
        ) < 60,
    )
  )
    add("pipe", 0, 8);
  return actions;
}
function execute(sim: Simulation, start: State, macro: Macro) {
  restore(sim, start);
  const actions: number[] = [];
  let budget = 0,
    airborne = false,
    airFrames = 0;
  if (start.jumpHeld && (macro.kind === "jump" || macro.kind === "swim")) {
    step(sim, 0);
    actions.push(0);
  }
  for (let frame = 0; frame < macro.frames; frame++) {
    const delaying =
      macro.kind === "drop"
        ? airborne && airFrames <= macro.delay
        : frame < macro.delay;
    if (!delaying) budget += macro.ratio;
    const moving = !delaying && budget >= 1 && macro.direction !== 0;
    if (moving) budget--;
    let bits = moving ? (macro.direction > 0 ? 2 : 1) : 0;
    if (macro.kind === "jump") bits |= 4;
    else if (macro.kind === "swim" && frame === 0) bits |= 4;
    if (macro.kind === "pipe") bits |= 8;
    if (macro.run) bits |= 16;
    actions.push(bits);
    step(sim, bits);
    if (sim.mode === "dead" || sim.player.body.position.y > 630) return null;
    // A warp pipe leaves the stage, and its reset cannot be rewound.
    if (sim.player.pipeTravel?.destLevel !== undefined) return null;
    if (sim.mode === "finishing")
      return { actions, won: true, state: capture(sim) };
    if (sim.player.areaId !== start.area) break;
    if (!sim.player.grounded) {
      airborne = true;
      airFrames++;
    } else if (airborne && (macro.kind === "jump" || macro.kind === "drop"))
      break;
    if (macro.kind === "drop" && !airborne && frame > 20) break;
  }
  while (sim.player.pipeTravel) {
    step(sim, 0);
    actions.push(0);
    if (sim.mode === "dead" || sim.player.body.position.y > 630) return null;
    if (sim.mode === "finishing")
      return { actions, won: true, state: capture(sim) };
  }
  return { actions, won: false, state: capture(sim) };
}
function push(heap: Node[], node: Node) {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent].priority <= node.priority) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = node;
}
function pop(heap: Node[]) {
  const first = heap[0],
    last = heap.pop()!;
  if (heap.length) {
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < heap.length &&
        heap[child + 1].priority < heap[child].priority
      )
        child++;
      if (heap[child].priority >= last.priority) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return first;
}
function pack(actions: number[]) {
  const runs: [number, number][] = [];
  for (const bits of actions) {
    const last = runs.at(-1);
    if (last && last[0] === bits) last[1]++;
    else runs.push([bits, 1]);
  }
  return runs;
}
function remainingAfterPipe(
  sim: Simulation,
  id: string,
  seen = new Set<string>(),
): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const area = areaData(id);
  if (area.goal?.kind !== "pipe") return 0;
  const exit = area.pipes.find((p) => p.column === area.goal!.column);
  const destination =
    exit?.destinations.find((d) => d.world === sim.level.world) ??
    (id === "29" ? { area: sim.level.main, page: 0 } : undefined);
  if (!destination) return 0;
  const next = areaData(destination.area);
  const pace = next.type === "water" ? T.walkSpeed : T.runSpeed;
  return (
    Math.max(
      0,
      ((next.goal?.column ?? next.width - 3) - destination.page * 16) * 32 -
        100,
    ) /
      pace +
    remainingAfterPipe(sim, destination.area, seen)
  );
}
function search(index: number) {
  const sim = prepare(index),
    initial = capture(sim);
  const queue: Node[] = [],
    visited = new Map<string, number>();
  push(queue, { state: initial, cost: 0, priority: 0, inputs: [] });
  let count = 0;
  while (queue.length && count++ < 80000) {
    const node = pop(queue);
    restore(sim, node.state);
    for (const macro of macros(sim, node.state)) {
      const result = execute(sim, node.state, macro);
      if (!result) continue;
      const cost = node.cost + result.actions.length;
      const state = result.state,
        room = sim.activeRoom;
      if (
        state.x < room.offset + 18 ||
        state.x > room.offset + room.data.width * 32 ||
        state.y < -160 ||
        cost > 60 * 240
      )
        continue;
      const next: Node = {
        state,
        cost,
        priority: cost,
        parent: node,
        inputs: result.actions,
      };
      if (result.won) {
        const parts: number[][] = [];
        for (
          let cursor: Node | undefined = next;
          cursor;
          cursor = cursor.parent
        )
          parts.push(cursor.inputs);
        sim.physics.clear();
        return { route: pack(parts.reverse().flat()), nodes: count };
      }
      const phase = room.platforms.length ? state.liftKey : 0;
      const springPhase = (
        state.springRides as { areaId: string; step: number; tick: number }[]
      )
        .filter((ride) => ride.areaId === state.area)
        .map((ride) => `${ride.step},${ride.tick}`)
        .join("|");
      // A plant near the player is part of the state: its rise, its heading,
      // and its wait in 8-frame steps.
      const plantPhase = room.plants
        .map((plant, i) => ({ plant, motion: state.plants[state.area]?.[i] }))
        .filter(({ plant, motion }) => motion && Math.abs(plant.x - state.x) < 200)
        .map(
          ({ motion }) =>
            `${motion!.rise},${motion!.speed},${Math.ceil(motion!.timer / 8)}`,
        )
        .join("|");
      // A Podoboo near the player is part of the state too.
      const podobooPhase = room.podoboos
        .map((podoboo, i) => ({
          podoboo,
          motion: state.podoboos[state.area]?.[i],
        }))
        .filter(
          ({ podoboo, motion }) => motion && Math.abs(podoboo.x - state.x) < 200,
        )
        .map(({ motion }) => `${Math.round(motion!.y / 8)},${motion!.timer}`)
        .join("|");
      const firePhase = room.firebars.some(
        (bar) => Math.abs(state.x - bar.x) < 220,
      )
        ? Math.floor((((state.time * 60 * 0x28) / 256) % 32) / 4)
        : 0;
      // Bills are lethal and move, so two otherwise equal states differ when
      // live bullets sit at different offsets. Rows matter too: cannons on
      // 7-1 and 8-2 sit across several rows and only one row is in the way.
      const billPhase = state.bills
        .filter((b) => b.areaId === state.area && Math.abs(b.x - state.x) < 360)
        .map(
          (b) =>
            `${Math.round((b.x - state.x) / 12)},${Math.round((b.y - state.y) / 12)}v${Math.sign(b.vx)}`,
        )
        .sort()
        .join("|");
      // Hammers move on their own. A cell the player already visited is not
      // the same cell when a hammer now crosses it.
      const hammerPhase = [
        ...state.bros
          .filter((bro) => bro.alive && Math.abs(bro.x - state.x) < 280)
          .map(
            (bro) =>
              `b${Math.round((bro.x - state.x) / 24)},${Math.round((bro.y - state.y) / 24)}`,
          ),
        ...state.hammers
          .filter(
            (hammer) =>
              hammer.areaId === state.area && Math.abs(hammer.x - state.x) < 280,
          )
          .map(
            (hammer) =>
              `h${Math.round((hammer.x - state.x) / 24)},${Math.round((hammer.y - state.y) / 24)}v${Math.sign(hammer.vx)}`,
          ),
      ].join("|");
      const key = `${state.area}:${Math.round((state.x - room.offset) / 6)}:${Math.round(state.y / 6)}:${Math.round(state.vy)}:${Number(state.grounded)}:${Math.round(state.pace)}:${phase}:${firePhase}:${billPhase}:${hammerPhase}:${plantPhase}:${podobooPhase}:${springPhase}:${state.hidden.join(",")}`;
      if ((visited.get(key) ?? Infinity) <= cost) continue;
      visited.set(key, cost);
      const dx =
        room.data.goal?.kind === "pipe"
          ? Math.abs(room.goalX - state.x)
          : Math.max(0, room.goalX - state.x);
      const pace = room.data.type === "water" ? T.walkSpeed : T.runSpeed;
      next.priority =
        cost + (dx / pace + remainingAfterPipe(sim, state.area)) * 1.4;
      push(queue, next);
    }
    if (count % 2000 === 0)
      console.log(`${CAMPAIGN[index].id}: explored ${count} states`);
  }
  sim.physics.clear();
  return { nodes: count };
}
let failures = 0;
for (const level of levels) {
  const index = CAMPAIGN.indexOf(level);
  const cached = results[level.id];
  if (cached) {
    const sim = prepare(index);
    for (const [bits, frames] of cached)
      for (let i = 0; i < frames; i++) step(sim, bits);
    let extra = 0;
    while (sim.mode === "playing" && extra++ < 120) step(sim, 2);
    if (sim.mode === "finishing" || sim.mode === "won") {
      if (extra) {
        cached.push([2, extra]);
        writeFileSync(output, JSON.stringify(results) + "\n");
      }
      sim.physics.clear();
      console.log(`${level.id}: existing input replay passed`);
      continue;
    }
    sim.physics.clear();
  }
  const found = search(index);
  if (!found.route) {
    failures++;
    console.log(`${level.id}: no witness found in ${found.nodes} states`);
    continue;
  }
  const sim = prepare(index);
  for (const [bits, frames] of found.route)
    for (let i = 0; i < frames; i++) step(sim, bits);
  if (sim.mode !== "finishing" && sim.mode !== "won") {
    writeFileSync(
      "/tmp/super-goomba-failed-route.json",
      JSON.stringify({ id: level.id, route: found.route }),
    );
    throw new Error(
      `${level.id}: candidate failed real input replay (${sim.mode} in ${sim.player.areaId} at ${Math.round(sim.player.body.position.x - sim.activeRoom.offset)},${Math.round(sim.player.body.position.y)})`,
    );
  }
  sim.physics.clear();
  results[level.id] = found.route;
  writeFileSync(output, JSON.stringify(results) + "\n");
  console.log(
    `${level.id}: replay passed, ${found.route.reduce((n, run) => n + run[1], 0)} input frames, ${found.nodes} search states`,
  );
}
if (failures) process.exitCode = 1;
