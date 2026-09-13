// Test-only route search. Every candidate and final replay uses the real Arcade
// simulation and ordinary Input actions. It never changes production controls.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Simulation, emptyInput } from "../../src/game/simulation.ts";
import { Body } from "../../src/game/physics.ts";
import { CAMPAIGN, areaData } from "../../src/game/levels.ts";
import { TUNING as T } from "../../src/game/config.ts";
import { physics } from "./arcade.ts";

type State = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  area: string;
  time: number;
  grounded: boolean;
  jumpHeld: boolean;
  pipeWait: number;
  hidden: number[];
  pace: number;
};
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
  sim.saved = T.required;
  sim.marioReturn = 1e6;
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
    pipeWait: sim.player.pipeWait ?? 0,
    hidden: sim.obstacles.filter((c) => c.hidden && c.used).map((c) => c.id),
    pace: flags.playerPace,
  };
}
function restore(sim: Simulation, state: State) {
  sim.physics.remove(sim.player.body);
  for (const room of sim.rooms.values()) room.updatePlatforms(state.time, []);
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
    jumped: state.jumpHeld,
    playerPace: state.pace,
    marioReturn: 1e6,
    marioActive: false,
  });
  sim.player.jumpHeld = state.jumpHeld;
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
    if (sim.activeRoom.platforms.length) add("wait", 0, 30);
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
  while (queue.length && count++ < 40000) {
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
      const phase = room.platforms.length
        ? Math.floor(
            (state.time %
              ((Math.PI * 2 * T.platformTravel) / T.platformSpeed)) *
              2,
          )
        : 0;
      const key = `${state.area}:${Math.round((state.x - room.offset) / 6)}:${Math.round(state.y / 6)}:${Math.round(state.vy)}:${Number(state.grounded)}:${Math.round(state.pace)}:${phase}:${state.hidden.join(",")}`;
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
  if (sim.mode !== "finishing" && sim.mode !== "won")
    throw new Error(
      `${level.id}: candidate failed real input replay (${sim.mode})`,
    );
  sim.physics.clear();
  results[level.id] = found.route;
  writeFileSync(output, JSON.stringify(results) + "\n");
  console.log(
    `${level.id}: replay passed, ${found.route.reduce((n, run) => n + run[1], 0)} input frames, ${found.nodes} search states`,
  );
}
if (failures) process.exitCode = 1;
