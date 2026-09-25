import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation, emptyInput } from "../src/game/simulation.ts";
import type { Actor } from "../src/game/simulation.ts";
import { Body } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import { MAP_TOP, TUNING as T } from "../src/game/config.ts";
import { CAMPAIGN, campaignIndex } from "../src/game/levels.ts";

const dt = 1 / 60;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function groundAt(sim: Simulation, x: number, feet: number) {
  return sim.solids.some(
    (s) =>
      !s.headOnly &&
      x > s.bounds.min.x &&
      x < s.bounds.max.x &&
      Math.abs(s.bounds.min.y - feet) < 4,
  );
}

function openAhead(sim: Simulation, x: number, feet: number) {
  for (const dist of [40, 80, 120, 160])
    if (!groundAt(sim, x + dist, feet)) return false;
  return true;
}

function parkPlayer(sim: Simulation) {
  sim.player.saved = true;
  Body.setFrozen(sim.player.body, true);
  Body.setPosition(sim.player.body, { x: -4000, y: 0 });
  Body.setVelocity(sim.player.body, { x: 0, y: 0 });
}

function keepOnly(sim: Simulation, runner: Actor) {
  for (const npc of sim.npcs) {
    if (npc !== runner) sim.physics.remove(npc.body);
  }
  sim.npcs = [runner];
}

function stand(actor: Actor, x: number) {
  Body.setPosition(actor.body, {
    x,
    y: T.groundY - actor.body.height / 2,
  });
  Body.setVelocity(actor.body, { x: 0, y: 0 });
  actor.grounded = true;
}

type Jump = {
  x: number;
  vy: number;
  open: boolean;
  nearGap: boolean;
  landX: number;
  landY: number;
  dy: number;
};

type Pause = { x: number; frames: number; open: boolean; atLip: boolean };

function watchFlee(seed: number, frames: number, level = "1-1", startX = 180) {
  const sim = new Simulation(mulberry32(seed), physics());
  sim.levelIndex = CAMPAIGN.findIndex((entry) => entry.id === level);
  sim.reset();
  sim.marioReturn = 1e6;
  sim.timeLeft = 9999;
  const runner = sim.npcs.find((n) => n.kind !== "fish")!;
  keepOnly(sim, runner);
  parkPlayer(sim);
  const room = sim.roomFor(runner);
  stand(runner, room.offset + startX);
  runner.warned = true;
  runner.state = "run";
  runner.wait = 99;
  runner.scale = 1;
  sim.step(dt, emptyInput());
  runner.wait = 0;
  const gap = room.gaps.find((span) => span[0] > runner.body.position.x + 40);
  assert.ok(gap, "stage has a gap ahead of the runner");
  const jumps: Jump[] = [];
  const pauses: Pause[] = [];
  const trace: number[] = [];
  let still = 0;
  let stillX = runner.body.position.x;
  let maxStill = 0;
  let pending:
    | { x: number; y: number; vy: number; open: boolean; nearGap: boolean }
    | undefined;
  for (let frame = 0; frame < frames && runner.alive && !runner.saved; frame++) {
    const wasGrounded = runner.grounded;
    const prevX = runner.body.position.x;
    const prevY = runner.body.position.y;
    sim.step(dt, emptyInput());
    const x = runner.body.position.x;
    const y = runner.body.position.y;
    const vx = runner.body.velocity.x;
    const vy = runner.body.velocity.y;
    trace.push(
      Math.round(x * 10),
      Math.round(y * 10),
      Math.round(vx * 10),
      Math.round(vy * 10),
    );
    const feet = runner.body.bounds.max.y;
    if (runner.grounded && Math.abs(vx) < 0.2) {
      if (still === 0) stillX = x;
      still++;
      maxStill = Math.max(maxStill, still);
    } else {
      if (still >= 6)
        pauses.push({
          x: stillX,
          frames: still,
          open: openAhead(sim, stillX, feet),
          atLip: stillX > gap[0] - 36 && stillX < gap[0] + 8,
        });
      still = 0;
    }
    if (wasGrounded && !runner.grounded && vy < -1) {
      pending = {
        x: prevX,
        y: prevY,
        vy,
        open: groundAt(sim, prevX + 80, feet),
        nearGap: prevX > gap[0] - 130 && prevX < gap[0],
      };
    }
    if (pending && !wasGrounded && runner.grounded) {
      jumps.push({
        x: pending.x,
        vy: pending.vy,
        open: pending.open,
        nearGap: pending.nearGap,
        landX: x,
        landY: y,
        dy: Math.abs(y - pending.y),
      });
      pending = undefined;
    }
  }
  if (still >= 6) {
    const feet = runner.body.bounds.max.y;
    pauses.push({
      x: stillX,
      frames: still,
      open: openAhead(sim, stillX, feet),
      atLip: stillX > gap[0] - 36 && stillX < gap[0] + 8,
    });
  }
  const early = jumps.some(
    (jump) =>
      jump.vy <= -8 &&
      jump.nearGap &&
      jump.x <= gap[0] - 40 &&
      jump.landX >= gap[1] - 16 &&
      jump.dy < 30,
  );
  const late = pauses.some((pause) => pause.atLip && pause.frames >= 6) &&
    jumps.some(
      (jump) =>
        jump.vy <= -8 &&
        jump.x > gap[0] - 36 &&
        jump.x < gap[0] + 8 &&
        jump.landX >= gap[1] - 16,
    );
  const hop = jumps.some(
    (jump) =>
      jump.vy <= -2 &&
      jump.vy > -7 &&
      jump.dy < 8 &&
      Math.abs(jump.landX - jump.x) <= 120 &&
      jump.landX < gap[0] &&
      groundAt(sim, jump.landX, T.groundY),
  );
  const hesitate = pauses.some((pause) => pause.open && pause.frames >= 6);
  const report = {
    seed,
    alive: runner.alive,
    x: Math.round(runner.body.position.x),
    y: Math.round(runner.body.position.y),
    maxStill,
    hops: jumps.filter((jump) => jump.vy > -7).length,
    gapJumps: jumps.filter((jump) => jump.vy <= -8).length,
    early,
    late,
    hop,
    hesitate,
    pauses: pauses.length,
  };
  sim.physics.clear();
  return { report, trace, sim: undefined, runnerAlive: runner.alive };
}

test("warned land flee varies hop, gap takeoff, and pause, and one seed replays", { timeout: 180000 }, () => {
  const seen = { hop: false, hesitate: false, early: false, late: false };
  let replaySeed = 0;
  let replayFrames = 0;
  const notes: unknown[] = [];
  for (let seed = 1; seed <= 20 && !replaySeed; seed++) {
    const frames = 60 * 18;
    const run = watchFlee(seed, frames);
    notes.push(run.report);
    assert.equal(run.runnerAlive, true, `seed ${seed} died ${JSON.stringify(run.report)}`);
    assert.ok(run.report.maxStill < 45, `seed ${seed} paused too long ${run.report.maxStill}`);
    if (run.report.hop) seen.hop = true;
    if (run.report.hesitate) seen.hesitate = true;
    if (run.report.early) seen.early = true;
    if (run.report.late) seen.late = true;
    if (
      !replaySeed &&
      run.report.hop &&
      run.report.hesitate &&
      (run.report.early || run.report.late)
    ) {
      replaySeed = seed;
      replayFrames = frames;
    }
  }
  assert.ok(seen.hop, `no short hop ${JSON.stringify(notes)}`);
  assert.ok(seen.hesitate, `no hesitation ${JSON.stringify(notes)}`);
  assert.ok(seen.early || seen.late, `no varied gap takeoff ${JSON.stringify(notes)}`);
  assert.ok(
    replaySeed > 0,
    `no single seed showed hop, pause, and a gap choice ${JSON.stringify(notes)}`,
  );
  const first = watchFlee(replaySeed, replayFrames);
  const second = watchFlee(replaySeed, replayFrames);
  assert.deepEqual(second.trace, first.trace, `seed ${replaySeed} did not replay`);
  assert.deepEqual(second.report.hop, first.report.hop);
  assert.deepEqual(second.report.hesitate, first.report.hesitate);
  assert.deepEqual(second.report.early, first.report.early);
  assert.deepEqual(second.report.late, first.report.late);
});

function openPit(sim: Simulation, lip: number) {
  const world = sim.physics.world;
  assert.ok(world, "physics world");
  for (const solid of sim.solids) {
    if (solid.headOnly || !solid.native) continue;
    const bounds = solid.bounds;
    const straddles = bounds.min.x < lip - 2 && bounds.max.x > lip + 2;
    const past = bounds.min.x >= lip - 2;
    if (!straddles && !past) continue;
    if (straddles) {
      const width = lip - bounds.min.x;
      solid.width = width;
      solid.position.x = bounds.min.x + width / 2;
    } else solid.position.x += 6000;
    const native = solid.native as {
      setSize: (w: number, h: number, center?: boolean) => void;
      position: { set: (x: number, y: number) => void };
      updateCenter: () => void;
    };
    world.remove(solid.native);
    native.setSize(solid.width, solid.height, false);
    native.position.set(solid.bounds.min.x, solid.bounds.min.y);
    native.updateCenter();
    world.add(solid.native);
  }
}

test("a lethal gap is not taken", { timeout: 60000 }, () => {
  for (const seed of [2, 3, 4, 11]) {
    const sim = new Simulation(mulberry32(seed), physics());
    sim.reset();
    sim.marioReturn = 1e6;
    sim.timeLeft = 9999;
    const runner = sim.npcs.find((n) => n.kind !== "fish")!;
    keepOnly(sim, runner);
    parkPlayer(sim);
    const room = sim.roomFor(runner);
    const lip = room.offset + 400;
    openPit(sim, lip);
    stand(runner, lip - 220);
    runner.warned = true;
    runner.state = "run";
    runner.wait = 0;
    let crossed = false;
    let moved = false;
    const startX = runner.body.position.x;
    for (let frame = 0; frame < 60 * 8 && runner.alive; frame++) {
      sim.step(dt, emptyInput());
      if (Math.abs(runner.body.position.x - startX) > 40) moved = true;
      if (runner.body.position.x > lip + 36) crossed = true;
      if (runner.body.position.y > 520) break;
    }
    assert.equal(moved, true, `seed ${seed} never ran toward the pit`);
    assert.equal(runner.alive, true, `seed ${seed} died in the pit`);
    assert.ok(
      runner.body.position.y < 500,
      `seed ${seed} fell to ${runner.body.position.y}`,
    );
    assert.equal(
      crossed,
      false,
      `seed ${seed} crossed the pit at ${runner.body.position.x}`,
    );
    sim.physics.clear();
  }
});

test("unwarned patrol, Mario, a swimmer, Lakitu, a shell, and a firebar plan do not dither", { timeout: 120000 }, () => {
  const warned = watchFlee(4, 60 * 10);
  assert.equal(warned.report.hop || warned.report.hesitate, true, JSON.stringify(warned.report));

  const idle = new Simulation(mulberry32(4), physics());
  idle.reset();
  idle.marioReturn = 1e6;
  idle.timeLeft = 9999;
  const walker = idle.npcs.find((n) => n.kind !== "fish")!;
  keepOnly(idle, walker);
  parkPlayer(idle);
  stand(walker, idle.roomFor(walker).offset + 180);
  walker.warned = false;
  walker.wait = 0;
  let idleHop = false;
  for (let frame = 0; frame < 60 * 6 && walker.alive; frame++) {
    idle.step(dt, emptyInput());
    if (walker.body.velocity.y < -1 || walker.jumpHeld) idleHop = true;
  }
  assert.equal(idleHop, false, "unwarned patrol took a flee hop");
  assert.equal(walker.fleeHold ?? 0, 0);
  idle.physics.clear();

  const marioSim = new Simulation(mulberry32(4), physics());
  marioSim.reset();
  marioSim.timeLeft = 9999;
  marioSim.marioReturn = 1e6;
  for (const npc of marioSim.npcs) marioSim.physics.remove(npc.body);
  marioSim.npcs = [];
  parkPlayer(marioSim);
  marioSim.marioActive = true;
  marioSim.mario.alive = true;
  marioSim.mario.areaId = marioSim.level.main;
  Body.setFrozen(marioSim.mario.body, false);
  stand(marioSim.mario, marioSim.activeRoom.offset + 200);
  marioSim.mario.facing = 1;
  marioSim.marioDecision = 999;
  marioSim.marioPause = 0;
  marioSim.marioReaction = 0;
  marioSim.marioLook = 999;
  marioSim.marioChase = 0;
  marioSim.marioJumpWait = 999;
  marioSim.marioGoal = "";
  let marioShort = false;
  let marioStill = 0;
  let marioMoved = false;
  let marioWasGrounded = marioSim.mario.grounded;
  for (let frame = 0; frame < 60 * 5; frame++) {
    marioSim.step(dt, emptyInput());
    const vx = marioSim.mario.body.velocity.x;
    const vy = marioSim.mario.body.velocity.y;
    if (marioWasGrounded && !marioSim.mario.grounded && vy < -1 && vy > -7)
      marioShort = true;
    marioWasGrounded = marioSim.mario.grounded;
    const feet = marioSim.mario.body.bounds.max.y;
    const open = openAhead(
      marioSim,
      marioSim.mario.body.position.x,
      feet,
    );
    if (marioMoved && marioSim.mario.grounded && open && Math.abs(vx) < 0.2) {
      marioStill++;
      assert.ok(marioStill < 6, "Mario hesitated on open ground");
    } else marioStill = 0;
    if (Math.abs(vx) > 2) marioMoved = true;
  }
  assert.equal(marioMoved, true, "Mario never got moving");
  assert.equal(marioShort, false, "Mario took a short flee hop");
  assert.equal(marioSim.mario.fleeHold ?? 0, 0);
  marioSim.physics.clear();

  const water = new Simulation(mulberry32(4), physics());
  water.levelIndex = campaignIndex(2, 2);
  water.reset();
  water.marioReturn = 1e6;
  water.timeLeft = 9999;
  for (let frame = 0; frame < 60 * 20 && water.pipeIntro; frame++)
    water.step(dt, emptyInput());
  const fish = water.npcs.find((n) => n.kind === "fish" && n.alive)!;
  assert.ok(fish, "2-2 has a fish");
  assert.equal(water.roomFor(fish).data.type, "water");
  for (const npc of water.npcs) {
    if (npc !== fish) water.physics.remove(npc.body);
  }
  water.npcs = [fish];
  parkPlayer(water);
  fish.warned = true;
  fish.state = "run";
  fish.wait = 0;
  let fishHop = false;
  for (let frame = 0; frame < 60 * 4 && fish.alive && !fish.saved; frame++) {
    water.step(dt, emptyInput());
    if (fish.jumpHeld || (fish.fleeHold ?? 0) > 0) fishHop = true;
  }
  assert.equal(fishHop, false, "swimmer took a land flee choice");
  water.physics.clear();

  const cloud = new Simulation(mulberry32(4), physics());
  cloud.levelIndex = campaignIndex(4, 1);
  cloud.reset();
  cloud.marioReturn = 1e6;
  cloud.timeLeft = 9999;
  const lakituRoom = [...cloud.rooms.values()].find((room) => room.lakituPoints.length)!;
  const point = lakituRoom.lakituPoints[0]!;
  Body.setFrozen(cloud.player.body, true);
  Body.setPosition(cloud.player.body, { x: point.x, y: MAP_TOP + 96 });
  for (let frame = 0; frame < 90 && cloud.lakitus.length === 0; frame++)
    cloud.step(dt, emptyInput());
  const lakitu = cloud.lakitus.find((entry) => entry.alive)!;
  assert.ok(lakitu, "Lakitu did not appear");
  const lakituY = lakitu.y;
  for (let frame = 0; frame < 60 * 3; frame++) cloud.step(dt, emptyInput());
  assert.equal(lakitu.y, lakituY, "Lakitu changed height");
  cloud.physics.clear();

  const shellSim = new Simulation(mulberry32(4), physics());
  shellSim.reset();
  shellSim.marioReturn = 1e6;
  shellSim.timeLeft = 9999;
  const shell = shellSim.npcs.find((n) => n.kind === "koopa") ?? shellSim.npcs[0]!;
  keepOnly(shellSim, shell);
  parkPlayer(shellSim);
  stand(shell, shellSim.roomFor(shell).offset + 300);
  shell.kind = "koopa";
  shell.warned = true;
  shell.state = "run";
  shell.wait = 0;
  shell.shell = "moving";
  shell.facing = 1;
  let shellHop = false;
  for (let frame = 0; frame < 60 * 3 && shell.alive; frame++) {
    shellSim.step(dt, emptyInput());
    if (shell.body.velocity.y < -1 || shell.jumpHeld || (shell.fleeHold ?? 0) > 0)
      shellHop = true;
  }
  assert.equal(shellHop, false, "shell took a flee hop");
  shellSim.physics.clear();

  const castle = new Simulation(mulberry32(4), physics());
  castle.levelIndex = CAMPAIGN.findIndex((entry) => entry.id === "1-4");
  castle.reset();
  castle.marioReturn = 1e6;
  castle.timeLeft = 9999;
  assert.ok(castle.activeRoom.firebars.length > 0, "1-4 has firebars");
  const guard = castle.npcs[0]!;
  keepOnly(castle, guard);
  parkPlayer(castle);
  guard.warned = true;
  guard.state = "run";
  guard.wait = 0;
  let followed = 0;
  let barHop = false;
  let dithered = false;
  for (let frame = 0; frame < 60 * 25 && guard.alive && !guard.saved; frame++) {
    const plan = guard.navFirebarGo;
    const stepIndex = plan?.step;
    const moves = plan?.moves;
    castle.step(dt, emptyInput());
    const choice =
      (guard.fleeHold ?? 0) > 0 || (guard.fleeEdge ?? 0) > 0 || guard.fleeEarly;
    // #217: the approach in a firebar room varies, the bar plan does not.
    if (choice && (plan || guard.navFirebarGo)) barHop = true;
    if (choice) dithered = true;
    if (
      plan &&
      moves &&
      stepIndex !== undefined &&
      stepIndex < moves.length &&
      guard.navFirebarGo?.bar === plan.bar &&
      guard.navFirebarGo.step === stepIndex + 1
    ) {
      const move = moves[stepIndex] ?? 1;
      if (move === 0) assert.ok(Math.abs(guard.body.velocity.x) < 0.2);
      else assert.ok(Math.abs(guard.body.velocity.x) > 1);
      assert.equal(guard.jumpHeld ?? false, false);
      followed++;
    }
  }
  assert.equal(barHop, false, "a firebar plan took a flee dither choice");
  assert.equal(dithered, true, "the firebar room approach never varied");
  assert.ok(followed > 0, "firebar plan never played");
  assert.equal(guard.alive, true, "firebar NPC died");
  castle.physics.clear();
});

// #217: a pack warned together splits up.
test("a crowd warned together takes different jumps at different spots", { timeout: 120000 }, () => {
  const sim = new Simulation(mulberry32(7), physics());
  sim.reset();
  sim.marioReturn = 1e6;
  sim.timeLeft = 9999;
  const pack = sim.npcs.filter((n) => n.kind !== "fish").slice(0, 6);
  for (const npc of sim.npcs) if (!pack.includes(npc)) sim.physics.remove(npc.body);
  sim.npcs = pack;
  parkPlayer(sim);
  const room = sim.roomFor(pack[0]!);
  pack.forEach((n, i) => {
    stand(n, room.offset + 200 + i * 12);
    n.warned = true;
    n.state = "run";
    n.wait = 0;
    n.scale = 1;
  });
  const takeoffs = pack.map(() => [] as number[]);
  const was = pack.map((n) => n.grounded);
  for (let frame = 0; frame < 60 * 12; frame++) {
    sim.step(dt, emptyInput());
    pack.forEach((n, i) => {
      if (was[i] && !n.grounded && n.body.velocity.y < -1)
        takeoffs[i]!.push(Math.round((n.body.position.x - room.offset) / 16));
      was[i] = n.grounded;
    });
  }
  for (const n of pack) assert.equal(n.alive, true, "Mario is far, so every jump is safe");
  const patterns = new Set(takeoffs.map((list) => list.join(",")));
  assert.ok(patterns.size >= 4, `jumps ${JSON.stringify(takeoffs)}`);
  // Somebody jumps where somebody else keeps running.
  const spots = new Set(takeoffs.flat());
  const shared = [...spots].filter((spot) =>
    takeoffs.every((list) => list.includes(spot)),
  );
  assert.ok(shared.length < spots.size, `jumps ${JSON.stringify(takeoffs)}`);
  sim.physics.clear();
});

test("a room with moving platforms still varies the approach", { timeout: 180000 }, () => {
  let varied = false;
  const notes: unknown[] = [];
  for (let seed = 1; seed <= 12 && !varied; seed++) {
    const run = watchFlee(seed, 60 * 8, "1-3", 120);
    notes.push(run.report);
    assert.equal(run.runnerAlive, true, `seed ${seed} ${JSON.stringify(run.report)}`);
    varied = run.report.hop || run.report.hesitate || run.report.early || run.report.late;
  }
  assert.ok(varied, JSON.stringify(notes));
});

test("with Mario near, a panicked NPC can leap a gap it has no landing for", { timeout: 120000 }, () => {
  let leapt = 0;
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  for (const seed of seeds) {
    const sim = new Simulation(mulberry32(seed), physics());
    sim.reset();
    sim.marioReturn = 1e6;
    sim.timeLeft = 9999;
    const runner = sim.npcs.find((n) => n.kind !== "fish")!;
    keepOnly(sim, runner);
    parkPlayer(sim);
    const room = sim.roomFor(runner);
    const lip = room.offset + 400;
    openPit(sim, lip);
    stand(runner, lip - 220);
    runner.warned = true;
    runner.state = "run";
    runner.wait = 0;
    // Mario stays near, standing still, so the NPC panics.
    sim.marioActive = true;
    sim.mario.alive = true;
    sim.mario.areaId = room.data.id;
    Body.setFrozen(sim.mario.body, true);
    for (let frame = 0; frame < 60 * 8 && runner.alive; frame++) {
      Body.setPosition(sim.mario.body, {
        x: runner.body.position.x - 200,
        y: T.groundY - 40,
      });
      sim.cameraX = runner.body.position.x - 300;
      sim.step(dt, emptyInput());
    }
    // The pit has no landing, so a leap is a fall and the existing death.
    if (!runner.alive) leapt++;
    sim.physics.clear();
  }
  assert.ok(leapt > 0, "no panicked NPC ever leapt the gap");
  assert.ok(leapt < seeds.length, "every panicked NPC leapt; some should hold");
});
