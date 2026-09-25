import { test } from "node:test";
import assert from "node:assert/strict";
import { Body } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
  landSpecies,
  type Actor,
} from "../src/game/simulation.ts";
import { MAP_TOP, TUNING as T } from "../src/game/config.ts";
import { CAMPAIGN, areaGaps, areaData } from "../src/game/levels.ts";
import { landCast, speciesRows } from "../src/game/cast.ts";
import {
  HOP_GRAVITY,
  TROOPA_FALL_GRAVITY,
  bobRange,
  flyFacing,
  flyX,
  hopTakeoff,
  initFlyParatroopa,
  initRedParatroopa,
  restingBytes,
  stepFlyParatroopa,
  stepRedParatroopa,
  troopaFall,
} from "../src/game/troopa.ts";

class Simulation extends RulesSimulation {
  constructor(random = () => 0.5) {
    super(random, physics());
  }
}

const dt = 1 / 60;

function stage(id: string) {
  const s = new Simulation();
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === id);
  s.reset();
  s.marioReturn = 1e6;
  s.timeLeft = 9999;
  while (s.pipeIntro) s.step(dt, emptyInput());
  return s;
}

function tick(s: Simulation, frames: number) {
  for (let i = 0; i < frames; i++) s.step(dt, emptyInput());
}

// Only `keep` stays in the stage, so nobody else walks up to the player.
function only(s: Simulation, keep: Actor[]) {
  for (const n of s.npcs) if (!keep.includes(n)) s.physics.remove(n.body);
  s.npcs = [...keep];
}

function count(list: (string | undefined)[]) {
  const counts: Record<string, number> = {};
  for (const key of list) if (key) counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}

test("a green flying Paratroopa sweeps 95 px left and back and sways 16", () => {
  const m = initFlyParatroopa();
  let lo = 0,
    hi = 0,
    top = 0,
    bottom = 0;
  const turns: number[] = [];
  let facing = flyFacing(m);
  assert.equal(facing, -1, "starts left");
  for (let frame = 1; frame <= 960; frame++) {
    stepFlyParatroopa(m, frame);
    lo = Math.min(lo, flyX(m));
    hi = Math.max(hi, flyX(m));
    top = Math.min(top, m.y);
    bottom = Math.max(bottom, m.y);
    if (flyFacing(m) !== facing) {
      turns.push(frame);
      facing = flyFacing(m);
    }
  }
  assert.deepEqual([lo, hi], [-95, 0]);
  assert.ok(bottom - top <= 16);
  // $13 steps up and back every 4th frame: 160 frames each way.
  assert.deepEqual(turns.slice(0, 3), [160, 320, 480]);
});

test("a red Paratroopa swings about a center 48 px below a high start, or 32 above a low one", () => {
  const high = initRedParatroopa(80);
  assert.equal(high.center, 128);
  const low = initRedParatroopa(140);
  assert.equal(low.center, 108);
  const up = bobRange(80);
  assert.ok(up.lo >= 70 && up.hi >= 170, JSON.stringify(up));
  const down = bobRange(140);
  assert.ok(down.hi === 140 && down.lo <= 80, JSON.stringify(down));
  // It never moves more than 2 px a frame, plus the carried fraction.
  const m = initRedParatroopa(80);
  let y = m.y;
  for (let frame = 1; frame <= 900; frame++) {
    stepRedParatroopa(m, frame);
    assert.ok(Math.abs(m.y - y) <= 3);
    y = m.y;
  }
});

test("a hop leaves at $fd under $1c gravity; a walker falls with $3d, at most 3", () => {
  const v = restingBytes();
  hopTakeoff(v);
  assert.equal(v.speed, -3);
  let y = 0,
    apex = 0,
    frames = 0;
  do {
    y += troopaFall(v, HOP_GRAVITY);
    apex = Math.min(apex, y);
    frames++;
  } while (y < 0);
  assert.ok(apex <= -40 && apex >= -46, `apex ${apex}`);
  assert.ok(frames >= 52 && frames <= 60, `airtime ${frames}`);
  const fall = restingBytes();
  for (let i = 0; i < 60; i++) troopaFall(fall, TROOPA_FALL_GRAVITY);
  assert.equal(fall.speed, 3);
});

test("the land cast weights the 30 by the stage's species rows", () => {
  // Hard-mode rows count: 2-3's green flyers are all hard-mode rows.
  const rows = speciesRows(["27"]);
  assert.equal(rows.get("fly-paratroopa"), 2);
  assert.deepEqual(count(landCast(["27"], 30)), {
    "red-koopa": 13,
    "fly-paratroopa": 9,
    "green-koopa": 4,
    "hop-paratroopa": 4,
  });
  // 8-2: 12 hopping, 4 Buzzy, 2 Goomba rows, by largest remainder.
  assert.deepEqual(count(landCast(["32"], 30)), {
    "hop-paratroopa": 20,
    buzzy: 7,
    goomba: 3,
  });
  // Species are spread over the slots, not bunched.
  const cast = landCast(["32"], 30);
  assert.ok(cast.slice(0, 10).includes("buzzy"));
  assert.ok(cast.slice(20).includes("buzzy"));
  // Stages with none of the seven species, and 1-1 with only Goombas and
  // green Koopas, keep every third NPC a green Koopa.
  for (const id of [
    "1-1",
    "1-4",
    "2-4",
    "3-4",
    "4-4",
    "5-4",
    "6-4",
    "7-4",
    "2-2",
    "7-2",
    "4-1",
    "6-1",
    "6-3",
  ]) {
    const level = CAMPAIGN.find((l) => l.id === id)!;
    const mix = landCast(level.route, T.population);
    assert.deepEqual(
      mix,
      mix.map((_, i) => (i % 3 === 1 ? "green-koopa" : "goomba")),
      id,
    );
  }
  // 8-4 has Buzzy and hopping Paratroopa rows.
  assert.deepEqual(count(landCast(["65"], 30)), {
    "hop-paratroopa": 20,
    buzzy: 10,
  });
  for (const level of CAMPAIGN)
    assert.equal(landCast(level.route, T.population).length, T.population);
});

test("every stage spawns its 30 from the stage's species, on legal starts", () => {
  for (const level of CAMPAIGN) {
    const s = new Simulation();
    s.levelIndex = CAMPAIGN.indexOf(level);
    s.reset();
    const land = s.npcs.filter((n) => landSpecies(n));
    assert.equal(land.length, T.population, level.id);
    const allowed = new Set(landCast(level.route, T.population));
    for (const n of land) {
      assert.ok(allowed.has(landSpecies(n)!), `${level.id} ${landSpecies(n)}`);
      // Nobody starts inside a solid.
      assert.ok(
        !s.solids.some(
          (b) =>
            !b.headOnly &&
            n.body.bounds.max.x > b.bounds.min.x + 0.5 &&
            n.body.bounds.min.x < b.bounds.max.x - 0.5 &&
            n.body.bounds.max.y > b.bounds.min.y + 0.5 &&
            n.body.bounds.min.y < b.bounds.max.y - 0.5,
        ),
        `${level.id} ${landSpecies(n)} at ${n.body.position.x}`,
      );
      // Flyers are held in their flight. (A pipe intro freezes everyone.)
      if (n.wings === "fly" || n.wings === "bob")
        assert.equal(n.body.frozen, true, `${level.id} ${landSpecies(n)}`);
      if (n.kind === "koopa") assert.equal(n.facing, -1);
    }
    s.physics.clear();
  }
  // 1-3 keeps most of its red Paratroopas in the air.
  const s = stage("1-3");
  assert.ok(s.npcs.filter((n) => n.wings === "bob").length >= 5);
  s.physics.clear();
});

test("unwarned Koopa kinds walk at 1 px a frame; a green one steps down, a red one turns", () => {
  for (const red of [false, true]) {
    const s = stage("1-1");
    const n = s.npcs.find((a) => a.kind === "koopa")!;
    only(s, [n]);
    n.troopa = red ? "red" : undefined;
    // On the ?-block row at columns 20-24, walking left.
    const row = MAP_TOP + 9 * 32;
    Body.setPosition(n.body, { x: 720, y: row - n.body.height / 2 });
    Body.setVelocity(n.body, { x: 0, y: 0 });
    n.facing = -1;
    (s as unknown as { startPatrol(a: Actor): void }).startPatrol(n);
    tick(s, 2);
    assert.equal(n.body.velocity.x, -1);
    let lowest = 0,
      turned = false;
    for (let i = 0; i < 240; i++) {
      tick(s, 1);
      lowest = Math.max(lowest, n.body.bounds.max.y);
      turned ||= n.facing > 0;
    }
    assert.equal(n.alive, true);
    assert.equal(n.warned, false);
    if (red) {
      assert.ok(turned, "turns at the ledge");
      assert.ok(Math.abs(lowest - row) < 1, "stays on the blocks");
    } else assert.ok(Math.abs(lowest - T.groundY) < 1, "steps down to the floor");
    s.physics.clear();
  }
});

test("an unwarned walker turns at a pit instead of falling in", () => {
  const s = stage("1-1");
  const n = s.npcs.find((a) => a.kind === "koopa")!;
  only(s, [n]);
  const [gapLeft] = areaGaps(areaData(s.level.main), s.activeRoom.offset)[0]!;
  Body.setPosition(n.body, { x: gapLeft - 60, y: T.groundY - n.body.height / 2 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.facing = 1;
  tick(s, 180);
  assert.equal(n.alive, true);
  assert.ok(n.body.position.x < gapLeft, "never over the pit");
  assert.equal(n.facing, -1);
  s.physics.clear();
});

test("a hopping Paratroopa hops 43 NES px along the ground", () => {
  const s = stage("2-1");
  const n = s.npcs.find((a) => a.wings === "hop" && a.grounded)!;
  only(s, [n]);
  const feet = n.body.bounds.max.y;
  let apex = feet;
  const hops: number[] = [];
  let wasGrounded = true;
  for (let i = 0; i < 200; i++) {
    tick(s, 1);
    apex = Math.min(apex, n.body.bounds.max.y);
    if (n.grounded && !wasGrounded) hops.push(i);
    wasGrounded = n.grounded;
  }
  assert.equal(n.alive, true);
  const height = feet - apex;
  assert.ok(height >= 80 && height <= 92, `hop ${height}`);
  assert.ok(hops.length >= 2, "keeps hopping");
  s.physics.clear();
});

test("flyers keep their SMB1 flight through the air until warned", () => {
  const s = stage("2-3");
  const fly = s.npcs.find((a) => a.wings === "fly")!;
  assert.ok(fly, "2-3 has a green flyer");
  only(s, [fly]);
  const origin = { ...fly.body.position };
  let lo = 0,
    hi = 0,
    sway = 0;
  for (let i = 0; i < 400; i++) {
    tick(s, 1);
    lo = Math.min(lo, fly.body.position.x - origin.x);
    hi = Math.max(hi, fly.body.position.x - origin.x);
    sway = Math.max(sway, Math.abs(fly.body.position.y - origin.y));
  }
  assert.ok(lo <= -180 && hi <= 1, `${lo} ${hi}`);
  assert.ok(sway <= 34);
  assert.equal(fly.body.frozen, true);
  // A warning ends the flight: it drops onto the ground and runs.
  Body.setPosition(s.player.body, {
    x: fly.body.position.x - 40,
    y: fly.body.position.y,
  });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  s.warn();
  assert.equal(fly.warned, true);
  tick(s, 90);
  assert.equal(fly.body.frozen, false);
  assert.equal(fly.patrol, undefined);
  assert.equal(fly.alive, true);
  assert.equal(fly.state, "run");
  s.physics.clear();

  const r = stage("1-3");
  const bob = r.npcs.find((a) => a.wings === "bob")!;
  only(r, [bob]);
  const x = bob.body.position.x;
  let top = Infinity,
    bottom = -Infinity;
  for (let i = 0; i < 480; i++) {
    tick(r, 1);
    assert.equal(bob.body.position.x, x, "red Paratroopas fly straight up and down");
    top = Math.min(top, bob.body.position.y);
    bottom = Math.max(bottom, bob.body.position.y);
  }
  assert.ok(bottom - top >= 120, `swing ${bottom - top}`);
  r.physics.clear();
});

function marioStomp(s: Simulation, target: Actor) {
  s.marioActive = true;
  s.mario.alive = true;
  s.marioStun = 0;
  s.mario.areaId = target.areaId;
  s.cameraX = target.body.position.x - 300;
  const p = target.body.position;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, {
    x: p.x,
    y: p.y - target.body.height / 2 - 5,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 4 });
}

test("Mario's stomp takes a Paratroopa's wings, and the next one shells it", () => {
  for (const wings of ["hop", "fly", "bob"] as const) {
    const s = stage(wings === "bob" ? "1-3" : wings === "fly" ? "2-3" : "2-1");
    const n = s.npcs.find((a) => a.wings === wings)!;
    only(s, [n]);
    marioStomp(s, n);
    tick(s, 1);
    assert.equal(n.alive, true, wings);
    assert.equal(n.wings, undefined, wings);
    assert.equal(landSpecies(n), "green-koopa", wings);
    assert.equal(n.shell, "none", wings);
    assert.equal(n.body.frozen, false, wings);
    // Mario steps away, so only the next stomp lands.
    s.marioActive = false;
    Body.setPosition(s.mario.body, { x: n.body.position.x - 400, y: 100 });
    tick(s, 30);
    marioStomp(s, n);
    tick(s, 1);
    assert.equal(n.shell, "stopped", wings);
    s.physics.clear();
  }
});

test("a Buzzy Beetle is fireproof; Mario's stomp shells it", () => {
  const s = stage("4-2");
  const buzzy = s.npcs.find((a) => a.troopa === "buzzy" && a.grounded)!;
  const green = s.npcs.find((a) => landSpecies(a) === "green-koopa" && a.grounded)!;
  only(s, [buzzy, green]);
  for (const n of [buzzy, green])
    s.fireballs.push({
      id: n.id,
      x: n.body.position.x,
      y: n.body.position.y,
      vx: 0,
      age: 0,
      owner: "mario",
      vy: 0,
    });
  tick(s, 1);
  assert.equal(buzzy.alive, true);
  assert.equal(green.alive, false);
  assert.equal(s.fireballs.length, 0, "the ball bursts on the Buzzy");
  marioStomp(s, buzzy);
  tick(s, 1);
  assert.equal(buzzy.shell, "stopped");
  s.physics.clear();
});
