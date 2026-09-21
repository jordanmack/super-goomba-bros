import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Body } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
} from "../src/game/simulation.ts";
import { MAP_TOP, STANDING_JUMP_IMPULSE, TUNING as T, jumpArc } from "../src/game/config.ts";
import { CAMPAIGN, areaData, isSolidTile } from "../src/game/levels.ts";
import {
  colliderFirebarBalls,
  firebarHits,
  isFirebarType,
  plannerFirebarBalls,
} from "../src/game/castle.ts";
import { firebarCrossing, planJump } from "../src/game/navigation.ts";
import type { Input } from "../src/game/simulation.ts";
import {
  axeMetatileRow,
  decodeArea,
  isSolidMetatile,
} from "../scripts/extract-levels.mjs";

const { tables } = JSON.parse(
  readFileSync(new URL("../src/assets/levels/source-tables.json", import.meta.url), "utf8"),
);

class Simulation extends RulesSimulation {
  constructor(random = Math.random) {
    super(random, physics());
  }
}

const dt = 1 / 60;

function tick(s: Simulation, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++)
    s.step(dt, { ...emptyInput(), ...input });
}

function castleGame(levelId = "1-4") {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === levelId);
  s.reset();
  s.marioReturn = 1e6;
  s.timeLeft = 9999;
  return s;
}

function parkNpcs(s: Simulation, keep = s.npcs.slice(0, 0)) {
  const x = s.activeRoom.offset + 80;
  for (const n of s.npcs) {
    if (keep.includes(n)) continue;
    Body.setPosition(n.body, { x, y: T.groundY - 14 });
    Body.setVelocity(n.body, { x: 0, y: 0 });
  }
}

function stillMario(s: Simulation) {
  s.marioActive = true;
  s.mario.alive = true;
  s.marioStun = 0;
  s.marioLook = 10;
  s.marioPause = 10;
  s.marioChase = 0;
  s.marioReaction = 1;
  Body.setFrozen(s.mario.body, false);
}

function exposedFireball(s: Simulation) {
  for (const ball of s.firebarBalls(s.activeRoom)) {
    const buried = s.solids.some(
      (sol) =>
        !sol.headOnly &&
        ball.x > sol.bounds.min.x + 2 &&
        ball.x < sol.bounds.max.x - 2 &&
        ball.y > sol.bounds.min.y + 2 &&
        ball.y < sol.bounds.max.y - 2,
    );
    if (!buried) return ball;
  }
}

function holdOnFireball(s: Simulation, who: "player" | "npc") {
  const actor = who === "player" ? s.player : s.npcs[0]!;
  const ball = exposedFireball(s);
  if (!ball) return false;
  Body.setPosition(actor.body, { x: ball.x, y: ball.y });
  Body.setVelocity(actor.body, { x: 0, y: 0 });
  return true;
}

test("castle areas 60-65 spawn firebars from original enemy types", () => {
  for (const id of ["60", "61", "62", "63", "64", "65"]) {
    const area = areaData(id);
    const expected = area.enemies.filter((e) => isFirebarType(e.type));
    const level = CAMPAIGN.find((l) => l.main === id);
    assert.ok(level, id);
    const s = castleGame(level.id);
    assert.equal(
      s.activeRoom.firebars.length,
      expected.length,
      `${id}: firebar count matches enemy data`,
    );
    for (const bar of s.activeRoom.firebars)
      assert.equal(isFirebarType(bar.type), true, `${id}: type ${bar.type}`);
    s.physics.clear();
  }
});

test("every castle has Bowser and a Mario-only axe from level data", () => {
  for (const level of CAMPAIGN.filter((l) => l.id.endsWith("-4"))) {
    const s = castleGame(level.id);
    assert.equal(s.bowsers.length, 1, `${level.id}: one Bowser`);
    assert.equal(s.bowsers[0]!.alive, true);
    assert.ok(s.activeRoom.axe, `${level.id}: axe at opcode 36`);
    const axeObj = s.activeRoom.data.objects.find((o) => o.opcode === 36);
    assert.ok(axeObj);
    assert.ok(
      Math.abs(s.activeRoom.axe!.x - (s.activeRoom.offset + axeObj.column * 32 + 16)) <
        1,
    );
    s.physics.clear();
  }
});

test("castle axe metatile and sprite occupy the same tile", () => {
  for (const level of CAMPAIGN.filter((l) => l.id.endsWith("-4"))) {
    const s = castleGame(level.id);
    const axe = s.activeRoom.axe;
    assert.ok(axe, `${level.id}: sprite from room placement`);
    const cells: { column: number; row: number }[] = [];
    s.activeRoom.data.tiles.forEach((row, y) =>
      row.forEach((tile, x) => {
        if (tile === 197) cells.push({ column: x, row: y });
      }),
    );
    assert.equal(cells.length, 1, `${level.id}: one metatile 197`);
    const cell = cells[0]!;
    const spriteColumn = Math.floor((axe.x - s.activeRoom.offset) / 32);
    const spriteRow = Math.floor((axe.y - MAP_TOP) / 32);
    assert.equal(spriteColumn, cell.column, `${level.id}: same column`);
    assert.equal(spriteRow, cell.row, `${level.id}: same row`);
    assert.ok(
      Math.abs(axe.y - (MAP_TOP + cell.row * 32 + 16)) < 32,
      `${level.id}: same world y`,
    );
    s.physics.clear();
  }
});

test("extract places castle axe 197 on the empty cell above the stand", () => {
  for (let n = 0; n < 6; n++) {
    const area = decodeArea(tables, 3 * 32 + n);
    const axe = area.objects.find((o) => o.opcode === 36);
    assert.ok(axe, `${area.id}: opcode 36`);
    const row = area.tiles.findIndex((tiles) => tiles[axe.column] === 197);
    assert.ok(row >= 0, `${area.id}: metatile 197`);
    assert.equal(isSolidTile(area.tiles[row][axe.column]!), false, `${area.id}: 197 empty`);
    assert.equal(isSolidTile(area.tiles[row + 1]![axe.column]!), true, `${area.id}: stand below`);
  }
});

test("extract axe fallback matches the sprite groundY cell", () => {
  const tiles = Array.from({ length: 15 }, () => [0]);
  assert.equal(
    axeMetatileRow(tiles, 0),
    Math.floor((T.groundY - 16 - MAP_TOP) / 32),
  );
});

test("extract axe solids match isSolidTile", () => {
  for (let id = 0; id <= 255; id++)
    assert.equal(isSolidMetatile(id), isSolidTile(id), String(id));
});

test("a firebar spawned from castle area data kills the player", () => {
  const s = castleGame("1-4");
  parkNpcs(s);
  assert.ok(s.activeRoom.firebars.length > 0);
  let hit = false;
  for (let frame = 0; frame < 240 && s.player.alive; frame++) {
    hit = holdOnFireball(s, "player") || hit;
    s.step(dt, emptyInput());
  }
  assert.equal(hit, true, "an exposed fireball exists");
  assert.equal(s.player.alive, false);
  assert.equal(s.mode, "dead");
  s.physics.clear();
});

test("a firebar kills an NPC and increments DIED", () => {
  const s = castleGame("1-4");
  const n = s.npcs[0]!;
  parkNpcs(s, [n]);
  const before = s.died();
  n.warned = false;
  n.state = "idle";
  let hit = false;
  for (let frame = 0; frame < 240 && n.alive; frame++) {
    hit = holdOnFireball(s, "npc") || hit;
    s.step(dt, emptyInput());
  }
  assert.equal(hit, true, "an exposed fireball exists");
  assert.equal(n.alive, false);
  assert.equal(s.died(), before + 1);
  s.physics.clear();
});

test("8x does not smash a firebar", () => {
  const s = castleGame("1-4");
  parkNpcs(s);
  const before = s.activeRoom.firebars.length;
  assert.ok(before > 0);
  s.player.scale = T.hugeScale;
  s.player.hugeLeft = T.hugeSeconds;
  Body.scale(s.player.body, T.hugeScale, T.hugeScale);
  let hit = false;
  for (let frame = 0; frame < 90; frame++) {
    hit = holdOnFireball(s, "player") || hit;
    s.step(dt, emptyInput());
  }
  assert.equal(hit, true, "an exposed fireball exists");
  assert.equal(s.player.alive, true);
  assert.equal(s.activeRoom.firebars.length, before);
  s.physics.clear();
});

test("a star makes the player immune to a firebar", () => {
  const s = castleGame("1-4");
  parkNpcs(s);
  s.player.starLeft = 10;
  let hit = false;
  for (let frame = 0; frame < 60; frame++) {
    hit = holdOnFireball(s, "player") || hit;
    s.step(dt, emptyInput());
  }
  assert.equal(hit, true, "an exposed fireball exists");
  assert.equal(s.player.alive, true);
  assert.equal(s.mode, "playing");
  s.physics.clear();
});

test("non-castle scroll-stop commands do not spawn an axe", () => {
  const s = castleGame("1-2");
  assert.equal(s.activeRoom.axe, undefined);
  s.physics.clear();
});

test("a firebar does not strip Mario through every power stage in one touch", () => {
  const s = castleGame("1-4");
  parkNpcs(s);
  const bar = s.activeRoom.firebars[0];
  assert.ok(bar);
  s.cameraX = bar.x - 400;
  stillMario(s);
  s.mario.areaId = s.activeRoom.data.id;
  s.setMarioStage(2);
  Body.setPosition(s.mario.body, { x: bar.x, y: bar.y });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, 3 * dt);
  assert.equal(s.marioActive, true);
  assert.ok(s.marioStun > 0);
  assert.equal(s.marioStage, 1);
  s.physics.clear();
});

test("Mario on the axe drops the bridge and kills Bowser", () => {
  const s = castleGame("1-4");
  parkNpcs(s);
  const axe = s.activeRoom.axe!;
  const bowser = s.bowsers[0]!;
  assert.equal(bowser.alive, true);
  assert.equal(s.activeRoom.bridgeDropped, false);
  Body.setPosition(s.player.body, { x: axe.x - 200, y: T.groundY - 14 });
  s.cameraX = axe.x - 400;
  stillMario(s);
  s.mario.areaId = s.activeRoom.data.id;
  Body.setPosition(s.mario.body, { x: axe.x, y: axe.y });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(s.activeRoom.bridgeDropped, true);
  assert.equal(bowser.alive, false);
  const axeCol = Math.floor((axe.x - s.activeRoom.offset) / 32);
  const axeRow = Math.floor((axe.y - MAP_TOP) / 32);
  assert.equal(s.activeRoom.smashedTiles.has(`${axeCol},${axeRow}`), true);
  const bridgeCol = s.activeRoom.data.tiles[10].findIndex((tile) => tile === 137);
  assert.ok(bridgeCol >= 0);
  const x = s.activeRoom.offset + bridgeCol * 32 + 16;
  const y = MAP_TOP + 10 * 32 + 16;
  assert.equal(
    s.solids.some(
      (sol) =>
        !sol.headOnly &&
        sol.bounds.min.x < x &&
        sol.bounds.max.x > x &&
        sol.bounds.min.y < y &&
        sol.bounds.max.y > y,
    ),
    false,
    "bridge collision is gone",
  );
  s.physics.clear();
});

test("the player on the axe does not drop the bridge or kill Bowser", () => {
  const s = castleGame("1-4");
  parkNpcs(s);
  const axe = s.activeRoom.axe!;
  s.cameraX = axe.x - 400;
  stillMario(s);
  s.mario.areaId = s.activeRoom.data.id;
  Body.setPosition(s.mario.body, { x: axe.x - 400, y: axe.y });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  Body.setPosition(s.player.body, { x: axe.x - 12, y: axe.y });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  tick(s, 0.3);
  assert.equal(s.activeRoom.bridgeDropped, false);
  assert.equal(s.bowsers[0]!.alive, true);
  assert.notEqual(s.mode, "finishing");
  s.physics.clear();
});

test("Bowser delays Mario without granting hit immunity", () => {
  const s = castleGame("1-4");
  parkNpcs(s);
  const b = s.bowsers[0]!;
  s.cameraX = b.x - 400;
  stillMario(s);
  s.mario.areaId = s.activeRoom.data.id;
  s.marioPause = 0;
  s.marioStun = 0;
  Body.setPosition(s.mario.body, { x: b.x, y: b.y });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.ok(s.marioPause > 0);
  assert.equal(s.marioStun, 0);
  s.physics.clear();
});

test("Bowser does not damage the player", () => {
  const s = castleGame("1-4");
  parkNpcs(s);
  const b = s.bowsers[0]!;
  Body.setPosition(s.player.body, { x: b.x, y: b.y });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  s.cameraX = b.x - 200;
  tick(s, 1);
  assert.equal(s.player.alive, true);
  assert.equal(s.mode, "playing");
  assert.equal(s.player.scale, 1);
  s.physics.clear();
});

test("Bowser flame spawn pushes a flame event and stays silent when he is not spitting", () => {
  const quiet = castleGame("1-4");
  parkNpcs(quiet);
  const idle = quiet.bowsers[0]!;
  quiet.marioActive = false;
  idle.fireWait = 0;
  quiet.events.length = 0;
  tick(quiet, dt);
  assert.equal(quiet.bowserFlames.length, 0);
  assert.equal(quiet.events.includes("flame"), false);
  quiet.physics.clear();

  const s = castleGame("1-4");
  parkNpcs(s);
  const b = s.bowsers[0]!;
  stillMario(s);
  s.mario.areaId = s.activeRoom.data.id;
  s.setMarioStage(1);
  Body.setPosition(s.player.body, { x: b.x - 180, y: T.groundY - 14 });
  s.cameraX = b.x - 400;
  Body.setPosition(s.mario.body, {
    x: b.x - T.bowserWidth * 2,
    y: T.groundY - s.mario.body.height / 2,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  b.fireWait = 0;
  s.events.length = 0;
  tick(s, dt);
  assert.ok(s.bowserFlames.length >= 1);
  assert.ok(s.events.includes("flame"));
  s.physics.clear();
});

test("Bowser ground fire breath can damage or delay Mario", () => {
  const s = castleGame("1-4");
  parkNpcs(s);
  const b = s.bowsers[0]!;
  Body.setPosition(s.player.body, { x: b.x - 180, y: T.groundY - 14 });
  s.cameraX = b.x - 400;
  stillMario(s);
  s.mario.areaId = s.activeRoom.data.id;
  s.setMarioStage(1);
  Body.setPosition(s.mario.body, {
    x: b.x - T.bowserWidth,
    y: b.y + T.bowserHeight / 2 - 19,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  b.facing = -1;
  b.fireWait = 0;
  const stage = s.marioStage;
  tick(s, 0.4);
  assert.ok(
    s.marioStun > 0 || s.marioStage < stage || !s.marioActive,
    JSON.stringify({
      stun: s.marioStun,
      stage: s.marioStage,
      active: s.marioActive,
      flames: s.bowserFlames.length,
    }),
  );
  s.physics.clear();
});

// #129: escort pathing let the leftmost castle NPC walk into a firebar. The
// assertion is "saved", never "saved or dead", because a death here is the bug.
for (const id of ["1-4", "2-4", "3-4", "5-4", "6-4", "7-4"]) {
  test(`the leftmost ${id} NPC reaches a rescue door instead of dying on a firebar`, () => {
    const s = castleGame(id);
    assert.ok(s.activeRoom.firebars.length > 0, `${id} has firebars`);
    const runner = s.npcs[0]!;
    for (const other of s.npcs.slice(1)) s.physics.remove(other.body);
    s.npcs = [runner];
    s.player.saved = true;
    Body.setFrozen(s.player.body, true);
    runner.warned = true;
    runner.state = "run";
    runner.wait = 0;
    for (
      let frame = 0;
      frame < 60 * 120 && runner.alive && !runner.saved;
      frame++
    )
      s.step(dt, emptyInput());
    assert.equal(
      runner.saved,
      true,
      `${id}: ${JSON.stringify({
        alive: runner.alive,
        position: runner.body.position,
        elapsed: s.elapsed,
      })}`,
    );
    s.physics.clear();
  });
}

// #131: a jump was judged against the firebar phase at takeoff, so an NPC could
// aim at a spot the bar had swept into by the time it landed. planJump now
// reports each candidate landing's frame count so the caller can sample the
// phase at that frame instead of at takeoff.
test("planJump reports landing frames so the firebar phase is sampled on arrival", () => {
  const s = castleGame("1-4");
  const bar = s.activeRoom.firebars[0]!;
  const runner = s.npcs[0]!;
  const half = runner.body.width / 2,
    tall = runner.body.height / 2;
  const solids = s.solids.filter((solid) => !solid.headOnly);
  // Stand the body on the ledge nearest the bar so planJump has real geometry.
  const ledge = solids
    .filter(
      (solid) =>
        solid.bounds.min.x < bar.x &&
        solid.bounds.max.x > bar.x - 200 &&
        solid.bounds.min.y > bar.y,
    )
    .sort((a, b) => a.bounds.min.y - b.bounds.min.y)[0];
  assert.ok(ledge, "1-4 has a ledge under the first firebar");
  const body = new Body(
    ledge.bounds.min.x + half + 4,
    ledge.bounds.min.y - tall,
    runner.body.width,
    runner.body.height,
  );
  const arc = jumpArc(T.runSpeed);
  const landings: { x: number; y: number; frames: number }[] = [];
  planJump(
    body,
    solids,
    1,
    T.runSpeed,
    arc.impulse,
    (landing) => {
      landings.push({ ...landing });
      return true;
    },
    false,
  );
  assert.ok(landings.length > 0, "planJump found candidate landings");
  // Every landing carries the frame it happens on, and it is a real flight
  // time: this is the number the caller needs to ask the bar for its phase on
  // arrival instead of at takeoff.
  for (const landing of landings) assert.ok(landing.frames > 0);
  const flight = Math.min(...landings.map((l) => l.frames));
  assert.ok(flight >= 10, `arcs last ${flight} frames, long enough to matter`);
  // Over that flight the bar turns far enough that its phase then is not its
  // phase now, so a takeoff-time decision is measurably the wrong question.
  const reach = (bar.length - 1) * T.firebarSpacing + T.firebarBallRadius;
  let differed = 0;
  for (let takeoff = 0; takeoff < 210; takeoff++)
    for (let offset = -reach; offset <= reach; offset += 8)
      for (const y of [bar.y - 24, bar.y, bar.y + 24]) {
        const x = bar.x + offset;
        if (
          firebarHits(bar, takeoff, x, y, half, tall) !==
          firebarHits(bar, takeoff + flight, x, y, half, tall)
        )
          differed++;
      }
  assert.ok(
    differed > 0,
    `over ${flight} frames the bar sweeps into spots that are clear at takeoff`,
  );
  // Now pin the predicate itself. Mount a bar beside a real planned landing so
  // its arm sweeps through that cell: it is CLEAR at takeoff and OCCUPIED when
  // the arc lands. A planner that asks at takeoff accepts the arc; one that
  // asks at the landing frame rejects it.
  const target = landings.find((l) => l.frames === flight)!;
  const trap = {
    x: target.x,
    y: target.y - 4 * T.firebarSpacing,
    type: bar.type,
    length: bar.length,
    nesSpeed: bar.nesSpeed,
    clockwise: bar.clockwise,
  };
  let trapped: number | undefined;
  for (let takeoff = 0; takeoff < 400 && trapped === undefined; takeoff++)
    if (
      !firebarHits(trap, takeoff, target.x, target.y, half, tall) &&
      firebarHits(
        trap,
        takeoff + target.frames,
        target.x,
        target.y,
        half,
        tall,
      )
    )
      trapped = takeoff;
  assert.notEqual(
    trapped,
    undefined,
    "found a takeoff time whose landing cell the bar sweeps into",
  );
  // The predicate is consulted on every airborne cell of the arc, not only on
  // the touchdown cell, and each probe carries its own frame.
  const probed: { y: number; frames: number }[] = [];
  planJump(
    body,
    solids,
    1,
    T.runSpeed,
    arc.impulse,
    undefined,
    false,
    undefined,
    (point) => {
      probed.push({ y: point.y, frames: point.frames });
      return true;
    },
  );
  assert.ok(probed.length > 0, "clear was consulted");
  assert.ok(
    probed.some((point) => point.y < body.position.y - 16),
    "including cells high in the arc, far above the takeoff row",
  );
  assert.equal(
    new Set(probed.map((point) => point.frames)).size > 1,
    true,
    "and each probe carries its own frame, not one shared takeoff frame",
  );
  // Collect every landing the landing-time predicate still allows: the trapped
  // cell must not be among them.
  const allowed: number[] = [];
  planJump(
    body,
    solids,
    1,
    T.runSpeed,
    arc.impulse,
    (landing) => {
      allowed.push(landing.x);
      return true;
    },
    false,
    undefined,
    (point) =>
      !firebarHits(
        trap,
        trapped! + point.frames,
        point.x,
        point.y,
        half,
        tall,
      ),
  );
  assert.ok(
    allowed.length > 0,
    "the predicate rejects the trapped arc, not every arc",
  );
  assert.ok(
    !allowed.includes(target.x),
    `landing ${target.x} is swept by touchdown and must not be offered`,
  );
  // The two predicates are not interchangeable: asked about the very cell the
  // arc lands on, the takeoff-time question says clear and the landing-time
  // question says blocked.
  assert.equal(
    firebarHits(trap, trapped!, target.x, target.y, half, tall),
    false,
    "the landing cell is clear at takeoff",
  );
  assert.equal(
    firebarHits(
      trap,
      trapped! + target.frames,
      target.x,
      target.y,
      half,
      tall,
    ),
    true,
    "and occupied on the frame the arc actually lands",
  );
  s.physics.clear();
});

// #152: the jump planner used elapsed + k/60 while the collider added dt once
// per frame. Those clocks disagree by a spin step. Both now read one future
// frame off the simulation's integer counter.
test("firebar phase does not drift one step between planner and collider", () => {
  const s = castleGame("1-4");
  // Past the first frame where elapsed*60 and the integer counter disagree.
  for (let i = 0; i < 96; i++) s.step(dt, emptyInput());
  const bar = s.activeRoom.firebars[0]!;
  const flight = 128;
  assert.deepEqual(
    plannerFirebarBalls(bar, s.frame, flight),
    colliderFirebarBalls(bar, s.frame, flight),
  );
  assert.deepEqual(
    s.firebarBalls(s.activeRoom),
    s.activeRoom.firebars.flatMap((b) => colliderFirebarBalls(b, s.frame, 1)),
  );
  s.physics.clear();
});

// #132: the blockedFor escape hop is a standing jump, so it must use the same
// impulse the player's standing jump uses.
test("a blocked large NPC hops with the player standing-jump impulse, not the run arc", () => {
  assert.equal(STANDING_JUMP_IMPULSE, jumpArc(0).impulse);
  assert.equal(STANDING_JUMP_IMPULSE, T.jumpSpeed);
  assert.notEqual(STANDING_JUMP_IMPULSE, jumpArc(T.runSpeed).impulse);
  const s = castleGame("1-1");
  const n = s.npcs[0]!;
  for (const other of s.npcs.slice(1)) s.physics.remove(other.body);
  s.npcs = [n];
  s.player.saved = true;
  Body.setFrozen(s.player.body, true);
  n.warned = true;
  n.state = "run";
  n.wait = 0;
  n.scale = 2;
  n.body.ignoreWalls = false;
  // blockedFor arms after half a second without horizontal progress.
  n.blockedFor = 0.6;
  n.lastX = n.body.position.x;
  Body.setVelocity(n.body, { x: 0, y: 0 });
  let hop = 0;
  for (let frame = 0; frame < 30 && !hop; frame++) {
    const wasGrounded = n.grounded;
    s.step(dt, emptyInput());
    if (wasGrounded && !n.grounded) hop = Math.abs(n.body.velocity.y);
  }
  assert.ok(hop > 0, "the blocked NPC hopped");
  assert.ok(
    Math.abs(hop - STANDING_JUMP_IMPULSE) < 0.5,
    `standing hop ${hop} should be ${STANDING_JUMP_IMPULSE}, not ${jumpArc(T.runSpeed).impulse}`,
  );
  s.physics.clear();
});

// #136: the non-row-2 support branch aimed the detour at the row-2 slab, a
// depth an NPC standing on a lower slab already satisfies. updateNpcs clears
// navDetourBelow once feet reach the target, so it re-armed and cleared on
// consecutive frames forever. The target now sits below the actor's own
// support, which cannot be satisfied while standing on it.
test("a non-row-2 ceiling support cannot re-arm the below-detour every frame", () => {
  const s = castleGame("4-2");
  for (let frame = 0; frame < 60 * 20 && s.pipeIntro; frame++)
    s.step(dt, emptyInput());
  assert.equal(s.pipeIntro, false);
  const n = s.npcs[0]!;
  for (const other of s.npcs.slice(1)) s.physics.remove(other.body);
  s.npcs = [n];
  s.player.saved = true;
  Body.setFrozen(s.player.body, true);
  n.warned = true;
  n.state = "run";
  n.wait = 0;
  n.areaId = "41";
  const room = s.roomFor(n);
  const goal = room.data.goal;
  assert.equal(goal?.kind, "pipe");
  const ceilingTop = MAP_TOP + 2 * 32;
  // Supports near the pipe goal that are NOT the row-2 ceiling slab.
  const candidates = s.solids.filter(
    (solid) =>
      !solid.headOnly &&
      Math.abs(solid.position.x - room.goalX) < 480 &&
      solid.bounds.min.y < MAP_TOP + goal!.row * 32 - 40 &&
      Math.abs(solid.bounds.min.y - ceilingTop) >= 8,
  );
  assert.ok(candidates.length > 0, "4-2 has non-row-2 supports above the exit");
  let armed = 0;
  for (const slab of candidates) {
    assert.ok(
      slab.bounds.min.y > ceilingTop,
      "candidate sits below the row-2 ceiling",
    );
    Body.setPosition(n.body, {
      x: (slab.bounds.min.x + slab.bounds.max.x) / 2,
      y: slab.bounds.min.y - n.body.height / 2,
    });
    Body.setVelocity(n.body, { x: 0, y: 0 });
    n.navDetourBelow = undefined;
    n.navDrop = undefined;
    n.navBackoff = undefined;
    n.navRetry = 0;
    n.grounded = true;
    s.step(dt, emptyInput());
    if (n.navDetourBelow === undefined) continue;
    armed++;
    // updateNpcs clears navDetourBelow as soon as grounded feet reach the
    // target. A target the NPC already satisfies while standing here is what
    // let the detour clear and re-arm on consecutive frames.
    assert.ok(
      n.body.bounds.max.y < n.navDetourBelow,
      `detour ${n.navDetourBelow} is already satisfied by feet ${n.body.bounds.max.y} on slab top ${slab.bounds.min.y}`,
    );
    assert.ok(
      n.navDetourBelow > slab.bounds.max.y,
      `detour ${n.navDetourBelow} must lie below slab bottom ${slab.bounds.max.y}`,
    );
  }
  assert.ok(armed > 0, "at least one non-row-2 slab armed a detour");
  s.physics.clear();
});

// #153: planJump returned only its top-scored arc. A delayed landing that
// outscored every delay-0 arc made the firebar drop paths throw the whole
// result away, even though a delay-0 landing was valid.
test("planJump keeps a delay-0 landing when a delayed arc scores higher", () => {
  const body = new Body(0, 200, 24, 28);
  // Near ledge is the delay-0 touch. A hold falls past it onto the lower
  // floor, and that longer run scores higher, so the old single-best return
  // was the delayed arc.
  const near = new Body(100, 256, 80, 32, true);
  const far = new Body(180, 516, 200, 32, true);
  const solids = [near, far];
  const best = planJump(body, solids, 1, T.runSpeed, 0);
  const immediate = planJump(
    body,
    solids,
    1,
    T.runSpeed,
    0,
    undefined,
    false,
    undefined,
    undefined,
    0,
  );
  assert.ok(best, "an arc exists");
  assert.ok(immediate, "a delay-0 arc exists");
  assert.ok(best.delay > 0, `top arc delay ${best.delay} should be a hold`);
  assert.equal(immediate.delay, 0);
  assert.ok(
    best.score > immediate.score,
    `delayed score ${best.score} should beat delay-0 score ${immediate.score}`,
  );
  assert.ok(
    immediate.y < best.y,
    "the kept arc is the upper ledge, not the lower floor the hold reaches",
  );
});

// #154: updateNpcs used to fly the probe's vx and delay from wherever the NPC
// stood later. In a firebar room the launch re-solves from that body.
test("firebar backoff launches the arc solved at the launch position, not the probe", () => {
  const s = castleGame("1-4");
  assert.ok(s.activeRoom.firebars.length > 0, "1-4 has firebars");
  const n = s.npcs[0]!;
  for (const other of s.npcs.slice(1)) s.physics.remove(other.body);
  s.npcs = [n];
  s.player.saved = true;
  Body.setFrozen(s.player.body, true);
  const floor = new Body(200, 400, 400, 32, true);
  const land = new Body(520, 400, 160, 32, true);
  const low = new Body(360, 520, 120, 32, true);
  s.solids = [floor, land, low];
  const launchX = 264;
  const probeX = 200;
  const y = floor.bounds.min.y - n.body.height / 2;
  Body.setPosition(n.body, { x: launchX, y });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.warned = true;
  n.state = "run";
  n.wait = 0;
  n.speed = T.runSpeed;
  n.navDrop = undefined;
  n.navDetourBelow = undefined;
  n.navRetry = 0;
  n.grounded = true;
  const impulse = jumpArc(T.runSpeed).impulse;
  const probe = planJump(
    new Body(probeX, y, n.body.width, n.body.height),
    s.solids,
    1,
    T.runSpeed,
    impulse,
  );
  const solved = s.resolveBackoff(n);
  assert.ok(probe, "probe position has an arc");
  assert.ok(solved, "launch position has an arc");
  assert.notEqual(
    probe.delay,
    solved.delay,
    "probe and launch are different plans",
  );
  assert.equal(
    solved.delay,
    planJump(n.body, s.solids, 1, T.runSpeed, impulse)?.delay,
    "resolveBackoff is planJump at the launch body",
  );
  n.navBackoff = { x: launchX, vx: probe.vx, delay: probe.delay };
  s.step(dt, emptyInput());
  assert.equal(n.navBackoff, undefined, "the backoff was consumed");
  assert.equal(n.navDelay, solved.delay, "flew the launch delay, not the probe");
  assert.equal(n.navVx, solved.vx);
  assert.notEqual(n.navDelay, probe.delay);
  s.physics.clear();
});

// #156: the crossing replay stepped `pace` per frame and never asked whether
// a solid occupied that x. A fixture block in the span is enough to prove it.
test("a firebar crossing that hits a wall does not pass a solid inside the span", () => {
  const pace = T.runSpeed;
  const startX = 0;
  const exitX = 80;
  const y = 300;
  const bodyHalf = 12;
  const solidMin = 36;
  const solidMax = 52;
  const bar = {
    x: 40,
    y: y - 400,
    type: 0x1b as const,
    length: 6,
    nesSpeed: 0x28,
    clockwise: true,
  };
  const overlapsSolid = (x: number) =>
    x + bodyHalf > solidMin && x - bodyHalf < solidMax;
  const open = firebarCrossing(
    startX,
    y,
    pace,
    exitX,
    bodyHalf + 6,
    14 + 8,
    0,
    [bar],
    () => false,
  );
  assert.ok(open && open.length > 0, "without a wall the span can be crossed");
  let x = startX;
  let crossed = false;
  for (const move of open) {
    if (move) x += pace;
    if (overlapsSolid(x)) crossed = true;
  }
  assert.equal(crossed, true, "the open replay walks through the fixture solid");
  const blocked = firebarCrossing(
    startX,
    y,
    pace,
    exitX,
    bodyHalf + 6,
    14 + 8,
    0,
    [bar],
    overlapsSolid,
  );
  assert.equal(
    blocked,
    undefined,
    "consulting wall refuses a solid inside the span",
  );
});
