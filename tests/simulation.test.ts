import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Body,
  holdSpanOf,
  hugeFloorAt,
  hugeFloorSolid,
  hugeFlushVolume,
  hugeHoldAt,
  overlaps,
} from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
} from "../src/game/simulation.ts";
import { MAP_TOP, PHRASES, TUNING as T, blockDrawY, jumpArc } from "../src/game/config.ts";
import { firstEmptySpawnCell, spawnCellCenter } from "../src/game/spawn-cell.ts";
import { CAMPAIGN, areaData, areaGaps } from "../src/game/levels.ts";
import { ENEMY_BALANCE_LIFT, ENEMY_FISH } from "../src/game/room.ts";
import routes from "./fixtures/player-routes.json" with { type: "json" };
const FIRST_AREA = areaData("25");
const GOAL_X = FIRST_AREA.goal.column * 32 + 16;
const GAPS = areaGaps(FIRST_AREA);
import type { Input } from "../src/game/simulation.ts";
import type { ItemKind, Actor } from "../src/game/simulation.ts";
import {
  itemDrawY,
  itemHoldHidden,
  itemSpriteSize,
} from "../src/game/simulation.ts";
import { flagTextureKey } from "../src/game/smb-sprites.ts";

class Simulation extends RulesSimulation {
  constructor(random = Math.random) {
    super(random, physics());
  }
}

const dt = 1 / 60;
function game() {
  const s = new Simulation(() => 0.5);
  s.reset();
  s.marioReturn = 1e6;
  return s;
}
function tick(s: Simulation, seconds: number, input: Partial<Input> = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++)
    s.step(dt, { ...emptyInput(), ...input });
}
function finishPipeIntro(s: Simulation, input: Partial<Input> = {}) {
  for (
    let frame = 0;
    frame < 60 * 20 && (s.mode === "intro" || s.pipeIntro);
    frame++
  )
    s.step(dt, { ...emptyInput(), ...input });
  assert.equal(s.pipeIntro, false);
  assert.equal(s.mode, "playing");
}
function at(s: Simulation, x: number, y = 415) {
  Body.setPosition(s.player.body, { x, y });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
}

function poleOf(s: Simulation) {
  const pole = s.activeRoom.flagpole;
  assert.ok(pole, "stage has a flagpole");
  return pole;
}

function skipTally(s: Simulation) {
  s.timeLeft = 0;
  for (let i = 0; i < 12 && s.mode === "finishing"; i++) {
    s.tallyHold = 0;
    tick(s, dt);
  }
}

function give(s: Simulation, actor: Actor, kind: ItemKind) {
  const box = s.obstacles.find(
    (c) => c.question && !c.used && !c.hidden && c.content !== "1-up",
  )!;
  const previous = s.random;
  s.random = () => 0.5;
  s.hitBlock(box, s.player);
  s.random = previous;
  const item = s.items.at(-1)!;
  item.kind = kind;
  s.collect(actor, item);
}

function peakJump(
  input: Partial<Input>,
  giant = false,
) {
  const s = game();
  if (giant) give(s, s.player, "mushroom");
  at(s, 100, T.groundY - 14 * s.player.scale);
  tick(s, 0.1, input.run ? { run: true, right: true } : {});
  const startY = s.player.body.position.y;
  const startX = s.player.body.position.x;
  let peakY = startY,
    peakX = startX;
  for (let frame = 0; frame < 120; frame++) {
    tick(s, dt, frame === 0 ? { ...input, jump: true } : input);
    peakY = Math.min(peakY, s.player.body.position.y);
    peakX = Math.max(peakX, s.player.body.position.x);
    if (frame > 4 && s.player.grounded) break;
  }
  return {
    height: startY - peakY,
    distance: peakX - startX,
    jumps: s.events.filter((event) => event === "jump").length,
  };
}

test("holding jump adds height, and giant form uses the same jump", () => {
  const tap = peakJump({ right: true });
  const hold = peakJump({ right: true, jump: true });
  const giant = peakJump({ right: true, jump: true }, true);
  const stand = peakJump({ jump: true });
  const run = peakJump({ right: true, jump: true, run: true });
  assert.equal(tap.jumps, 1);
  assert.equal(hold.jumps, 1);
  // SMB1: held walk ~4 tiles, held run ~5 tiles; tap is shorter.
  // #96 measured small-player held run at 155 px = 4.84 tiles (in band; no retune).
  const tile = 32;
  assert.ok(tap.height > 30 && tap.height < 80, `tap jump ${tap.height}`);
  assert.ok(stand.height > 110 && stand.height < 145, `stand jump ${stand.height}`);
  assert.ok(hold.height > 120 && hold.height < 155, `walk jump ${hold.height}`);
  assert.ok(run.height > 145 && run.height < 180, `run jump ${run.height}`);
  assert.ok(
    stand.height / tile >= 3.5 && stand.height / tile < 4.5,
    `stand jump ${stand.height / tile} tiles`,
  );
  assert.ok(
    hold.height / tile >= 4 && hold.height / tile < 4.5,
    `walk jump ${hold.height / tile} tiles`,
  );
  assert.ok(
    run.height / tile >= 4 && run.height / tile <= 5,
    `run jump ${run.height / tile} tiles, want SMB1 4-5`,
  );
  assert.ok(run.height - hold.height > 15, "running jump is higher");
  assert.ok(hold.height - tap.height > 25, "hold jump is extra height");
  assert.ok(Math.abs(hold.height - giant.height) < 2);
});

test("running jump keeps run speed and travels farther than a walk jump", () => {
  const walk = peakJump({ right: true, jump: true });
  const run = peakJump({ right: true, jump: true, run: true });
  const sim = game();
  tick(sim, 0.2, { right: true });
  assert.equal(sim.player.body.velocity.x, T.walkSpeed);
  tick(sim, 0.2, { right: true, run: true });
  assert.equal(sim.player.body.velocity.x, T.runSpeed);
  tick(sim, 1 / 60, { right: true, run: true, jump: true });
  tick(sim, 0.15, { right: true, run: true });
  assert.equal(sim.player.grounded, false);
  assert.equal(sim.player.body.velocity.x, T.runSpeed);
  tick(sim, 0.1);
  assert.equal(
    sim.player.body.velocity.x,
    0,
    "releasing direction still stops horizontal motion",
  );
  assert.ok(run.distance > walk.distance + 40, `${run.distance} vs ${walk.distance}`);
  assert.ok(run.height > walk.height);
});

test("a delayed NPC launch takes off at ground pace and never speeds up in the air", () => {
  const s = game();
  const n = s.npcs[0];
  n.warned = true;
  n.state = "run";
  n.wait = 0;
  n.speed = T.runSpeed;
  Body.setPosition(n.body, { x: 400, y: T.groundY - 14 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.navBackoff = { x: 400, vx: T.runSpeed, delay: 8 };
  const startX = n.body.position.x;
  let takeoff = 0;
  let leftGround = false;
  let delayFrames = 0;
  const air: number[] = [];
  for (let i = 0; i < 40; i++) {
    const wasGrounded = n.grounded;
    s.step(dt, emptyInput());
    if (wasGrounded && !n.grounded) {
      leftGround = true;
      takeoff = Math.abs(n.body.velocity.x);
    }
    if (!n.grounded) {
      air.push(Math.abs(n.body.velocity.x));
      if (delayFrames < 8) {
        assert.ok(
          Math.abs(n.body.position.x - startX) < 1,
          `moved during delay frame ${delayFrames}`,
        );
        delayFrames++;
      }
    }
  }
  assert.ok(leftGround, "NPC left the ground");
  assert.equal(delayFrames, 8);
  assert.ok(takeoff <= T.runSpeed + 0.05, `takeoff ${takeoff} above run`);
  for (const vx of air)
    assert.ok(vx <= T.runSpeed + 0.05, `air ${vx} above run`);
});

test("active Mario collects a star by contact and its immunity expires", () => {
  const s = game();
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 250, y: 411 });
  const box = s.obstacles.find((c) => c.question)!;
  s.hitBlock(box, s.player);
  const item = s.items[0];
  item.kind = "star";
  item.emerge = 0;
  Body.setPosition(item.body, { ...s.mario.body.position });
  tick(s, dt);
  assert.equal(s.items.length, 0);
  assert.equal(s.mario.starLeft, T.starSeconds);
  assert.ok(s.events.includes("power"));
  const stage = s.marioStage;
  s.fireballs.push({
    id: 900,
    x: s.mario.body.position.x,
    y: s.mario.body.position.y,
    vx: 0,
    age: 0,
    owner: "player",
  });
  tick(s, dt);
  assert.equal(s.marioStage, stage);
  assert.ok(s.mario.starLeft < T.starSeconds);
  s.mario.starLeft = dt;
  tick(s, dt);
  assert.equal(s.mario.starLeft, 0);
});

test("Mario power pickups upgrade his stage only while he is active", () => {
  const s = game();
  give(s, s.mario, "star");
  assert.equal(s.mario.starLeft, 0);
  assert.equal(s.items.length, 1);
  s.marioActive = true;
  s.setMarioStage(0);
  give(s, s.mario, "mushroom");
  assert.equal(s.marioStage, 1);
  give(s, s.mario, "flower");
  assert.equal(s.marioStage, 2);
  give(s, s.mario, "mushroom");
  assert.equal(s.marioStage, 2);
  assert.equal(s.mario.scale, 1);
  assert.ok(s.mario.flower);
  assert.equal(s.score, 1000);
});

test("idle NPCs leave isolated blocks and stairs without rapidly flipping direction", () => {
  for (const [x, top] of [
    [528, 302],
    [4380, 302],
    [6040, 174],
    [928, 366],
  ]) {
    const s = game();
    const n = s.npcs[0];
    n.homeX = x;
    Body.setPosition(n.body, { x, y: top - 14 });
    let turns = 0,
      lastFacing = n.facing,
      landedBelow = false,
      lastTurn = -60;
    for (let i = 0; i < 12 * 60; i++) {
      tick(s, dt);
      if (n.facing !== lastFacing) {
        assert.ok(i - lastTurn >= 15, `NPC at ${x} reverses too soon`);
        lastTurn = i;
        turns++;
      }
      lastFacing = n.facing;
      landedBelow ||= n.grounded && n.body.position.y + 14 > top + 10;
    }
    assert.ok(n.alive && landedBelow, `NPC descends safely from ${x}`);
    assert.ok(turns < 20, `NPC at ${x} turned ${turns} times`);
    assert.equal(n.warned, false);
  }
});

function inPipeStairWell(n: Actor) {
  return (
    n.grounded &&
    n.body.position.x > 5792 &&
    n.body.position.x < 5824 &&
    n.body.position.y > 370
  );
}

test("a warned NPC leaves the World 1-1 last stair by the pipe and continues", () => {
  const s = game();
  const n = s.npcs[0];
  n.warned = true;
  n.state = "run";
  n.wait = 0;
  n.speed = 2.1;
  // Last pipe 5728-5792 top 366; first stair is a 32px well at 5792-5824 top 398.
  Body.setPosition(n.body, { x: 5808, y: 384 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  let leftPocket = false;
  for (let i = 0; i < 4 * 60; i++) {
    tick(s, dt);
    leftPocket ||=
      n.saved || n.body.position.x > 5856 || n.body.position.x < 5728;
    if (n.saved || n.body.position.x > 5900) break;
  }
  assert.ok(n.alive);
  assert.ok(leftPocket, "leaves the pipe-stair pocket");
  assert.ok(
    n.saved || n.body.position.x > 5900,
    `continues past the pocket: ${JSON.stringify(n.body.position)}`,
  );
});

test("a warned NPC reverses out of a one-tile well when the forward wall is too tall", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "2-1");
  s.reset();
  s.marioReturn = 1e6;
  const n = s.npcs[0];
  n.warned = true;
  n.state = "run";
  n.wait = 0;
  n.speed = 2.1;
  Body.setPosition(n.body, { x: 6064, y: 416 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  tick(s, 8);
  assert.ok(n.alive);
  assert.ok(
    n.saved || n.body.position.x < 6040 || n.body.position.x > 6144,
    `leaves the 2-1 well: ${JSON.stringify(n.body.position)}`,
  );
});

function soloNpc(s: Simulation, n = s.npcs[0]) {
  for (const other of s.npcs) {
    if (other === n) continue;
    s.physics.remove(other.body);
  }
  s.npcs = [n];
  s.player.saved = true;
  Body.setFrozen(s.player.body, true);
  return n;
}

function bonusPipe(s: Simulation) {
  const pipe = s.activeRoom.data.pipes.find((p) => p.direction === "down")!;
  const x = s.activeRoom.offset + (pipe.column + pipe.width / 2) * 32;
  const top = MAP_TOP + pipe.row * 32;
  return { pipe, x, top };
}

function standOnBonusPipe(s: Simulation, n: Actor) {
  const { x, top } = bonusPipe(s);
  Body.setPosition(n.body, { x, y: top - n.body.height / 2 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.grounded = true;
}

test("a warned NPC that enters a non-goal pipe is counted saved after the animation", () => {
  const s = game();
  const n = soloNpc(s);
  n.warned = true;
  n.state = "run";
  n.wait = 0;
  s.pipeEscapeRandom = () => 0;
  standOnBonusPipe(s, n);
  const startSaved = s.saved;
  const startArea = n.areaId;
  tick(s, dt);
  assert.ok(n.pipeTravel, "enters the pipe");
  assert.equal(n.pipeTravel?.phase, "enter");
  assert.equal(n.pipeTravel?.escape, true);
  assert.equal(n.saved, false);
  assert.equal(s.saved, startSaved);
  let frames = 0;
  while (n.pipeTravel && frames++ < 360) tick(s, dt);
  assert.equal(n.pipeTravel, undefined);
  assert.equal(n.saved, true);
  assert.equal(s.saved, startSaved + 1);
  assert.ok(s.events.includes("saved"));
  assert.equal(n.areaId, startArea);
  assert.equal(s.rooms.has("42"), false);
});

test("a failed NPC pipe-escape roll does not become a guaranteed entry", () => {
  const s = game();
  const n = soloNpc(s);
  n.warned = true;
  n.state = "run";
  n.wait = 0;
  let rolls = 0;
  s.pipeEscapeRandom = () => {
    rolls += 1;
    return rolls === 1 ? 0.99 : 0;
  };
  standOnBonusPipe(s, n);
  tick(s, 0.5);
  assert.ok(rolls >= 1, "rolled once at the pipe");
  assert.equal(n.saved, false);
  assert.equal(n.pipeTravel, undefined);
  assert.ok(
    rolls === 1 || !n.pipeEscapeTried,
    `re-rolled while still at the pipe: ${rolls} rolls`,
  );
});

test("an unwarned NPC ignores an enterable pipe", () => {
  const s = game();
  const n = soloNpc(s);
  n.warned = false;
  n.state = "idle";
  n.wait = 0;
  s.pipeEscapeRandom = () => 0;
  standOnBonusPipe(s, n);
  tick(s, 0.5);
  assert.equal(n.saved, false);
  assert.equal(n.pipeTravel, undefined);
  assert.equal(s.saved, 0);
});

test("a warned NPC on the World 1-1 last pipe does not stay in the stair well", () => {
  const s = game();
  const n = s.npcs[0];
  n.warned = true;
  n.state = "run";
  n.wait = 0;
  n.speed = 2.1;
  Body.setPosition(n.body, { x: 5760, y: 352 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  let groundedInWell = 0;
  for (let i = 0; i < 3 * 60; i++) {
    tick(s, dt);
    if (inPipeStairWell(n)) groundedInWell++;
    if (n.saved || n.body.position.x > 5900) break;
  }
  assert.ok(n.alive);
  assert.equal(groundedInWell, 0, "does not drop into the last-stair well");
  assert.ok(
    n.saved || n.body.position.x > 5856,
    `clears the last pipe and stair: ${JSON.stringify(n.body.position)}`,
  );
});

test("giant head hits break bricks and bounce NPCs on top without killing them", () => {
  const s = game();
  give(s, s.player, "mushroom");
  const brick = s.obstacles.find(
    (c) => c.kind === "brick" && !c.question && c.y > 300,
  )!;
  at(s, brick.x, brick.y + 16 + 14 * s.player.scale + 5);
  Body.setVelocity(s.player.body, { x: 0, y: -6 });
  const n = s.npcs[0];
  Body.setPosition(n.body, { x: brick.x, y: brick.y - 16 - 14 });
  n.idleWalking = false;
  n.idleWait = 2;
  tick(s, dt);
  assert.equal(brick.broken, true);
  assert.ok(!s.solids.includes(brick.body!));
  assert.equal(n.alive, true);
  assert.equal(n.body.velocity.y, -T.stompBounce);
  tick(s, 0.8);
  assert.ok(n.alive);
  assert.equal(
    s.particles.some((p) => p.color === "#bc0018"),
    false,
  );
});

function openBrick(s: Simulation) {
  return s.obstacles.find(
    (c) =>
      c.kind === "brick" &&
      !c.broken &&
      !c.question &&
      !c.hidden &&
      !c.used &&
      c.body &&
      !s.obstacles.some(
        (other) =>
          other !== c &&
          other.body &&
          !other.broken &&
          other.x < c.x &&
          c.x - other.x <= T.brickSize &&
          Math.abs(other.y - c.y) < T.brickSize,
      ),
  )!;
}

function shoot(
  s: Simulation,
  x: number,
  y: number,
  vx: number,
  scale: number,
  vy = 0,
  owner: "player" | "mario" = "player",
) {
  const fireball = {
    id: s.fireballs.length + 1,
    x,
    y,
    vx,
    vy,
    age: 0,
    owner,
    scale,
  };
  s.fireballs.push(fireball);
  return fireball;
}

test("giant player fireballs break ordinary bricks from the side or bottom", () => {
  const s = game();
  at(s, 80);
  const side = openBrick(s);
  const n = s.npcs[0];
  Body.setPosition(n.body, { x: side.x, y: side.y - T.brickSize / 2 - 14 });
  n.idleWalking = false;
  n.idleWait = 2;
  const radius = 6 * T.playerFireballScale;
  shoot(
    s,
    side.body!.bounds.min.x - radius - 8,
    side.y,
    6,
    T.playerFireballScale,
  );
  tick(s, 6 * dt);
  assert.equal(side.broken, true);
  assert.ok(!s.solids.includes(side.body!));
  assert.ok(s.events.includes("break"));
  tick(s, 0.8);
  assert.ok(n.alive && n.body.position.y > side.y);
  assert.equal(
    s.particles.some((p) => p.color === "#bc0018"),
    false,
  );

  const bottom = openBrick(s);
  shoot(
    s,
    bottom.x,
    bottom.body!.bounds.max.y + radius + 8,
    6,
    T.playerFireballScale,
    -6,
  );
  tick(s, 6 * dt);
  assert.equal(bottom.broken, true);
  assert.ok(!s.solids.includes(bottom.body!));
});

test("giant player fireballs bounce on brick tops and do not break them", () => {
  const s = game();
  at(s, 80);
  const brick = openBrick(s);
  const radius = 6 * T.playerFireballScale;
  const fireball = shoot(
    s,
    brick.x,
    brick.body!.bounds.min.y - radius - 4,
    1,
    T.playerFireballScale,
    2,
  );
  tick(s, 6 * dt);
  assert.equal(brick.broken, false);
  assert.ok(s.solids.includes(brick.body!));
  assert.ok(s.fireballs.includes(fireball));
  assert.ok((fireball.vy ?? 0) < 0);
  assert.equal(s.events.includes("break"), false);
});

test("small fireballs, question blocks, used blocks, and unbreakable tiles survive fireball hits", () => {
  const s = game();
  at(s, 80);
  const brick = openBrick(s);
  const radius = 6 * T.playerFireballScale;
  shoot(s, brick.body!.bounds.min.x - 6 - 8, brick.y, 6, 1);
  tick(s, 8 * dt);
  assert.equal(brick.broken, false);
  assert.ok(s.solids.includes(brick.body!));

  shoot(
    s,
    brick.body!.bounds.min.x - radius - 8,
    brick.y,
    6,
    T.playerFireballScale,
    0,
    "mario",
  );
  tick(s, 6 * dt);
  assert.equal(brick.broken, false);

  const question = s.obstacles.find((c) => c.question && !c.used && c.body)!;
  const used = s.obstacles.find(
    (c) => c.question && !c.used && c.body && c !== question,
  )!;
  s.hitBlock(used, s.player);
  const pipe = s.obstacles.find((c) => c.kind === "pipe" && c.body)!;
  for (const tile of [question, used, pipe]) {
    shoot(
      s,
      tile.body!.bounds.min.x - radius - 8,
      tile.y,
      6,
      T.playerFireballScale,
    );
    tick(s, 6 * dt);
    assert.equal(tile.broken, false, `${tile.kind} ${tile.x}`);
    assert.ok(s.solids.includes(tile.body!));
    if (tile.question) assert.equal(tile.used, tile === used);
  }
});

test("mixed NPC speeds cross every staircase and gap across different runs", () => {
  for (const start of [1, 3, 4, 9, 15]) {
    let seed = start;
    const s = new Simulation(
      () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646,
    );
    s.reset();
    s.marioReturn = 1e6;
    s.pipeEscapeRandom = () => 1;
    for (const n of s.npcs) n.warned = true;
    tick(s, 100);
    assert.equal(s.saved, T.population, `All NPCs escape in seed ${start}`);
  }
});

test("player head contact bumps a brick without removing its collision", () => {
  const s = game();
  const brick = s.obstacles.find(
    (c) => c.kind === "brick" && !c.question && c.y > 300,
  )!;
  at(s, brick.x);
  tick(s, 0.1);
  tick(s, 0.2, { jump: true });
  assert.ok(brick.bounce > 0);
  assert.equal(brick.broken, false);
  assert.ok(s.solids.includes(brick.body!));
  assert.ok(s.events.includes("bump"));
  tick(s, 0.5);
  assert.equal(brick.bounce, 0);
});

test("question-block items emit appear with bump, then power on collect", () => {
  const s = game();
  const box = s.obstacles.find((c) => c.question)!;
  s.hitBlock(box, s.player);
  assert.deepEqual(
    s.events.filter(
      (event) => event === "bump" || event === "appear" || event === "power",
    ),
    ["bump", "appear"],
  );
  const item = s.items[0];
  item.kind = "star";
  item.emerge = 0;
  s.collect(s.player, item);
  assert.ok(s.events.includes("power"));
  const brick = s.obstacles.find(
    (c) => c.kind === "brick" && !c.question && !c.hidden,
  )!;
  s.events.length = 0;
  s.hitBlock(brick, s.player);
  assert.ok(s.events.includes("bump"));
  assert.equal(s.events.includes("appear"), false);
});

function assertEmergeClip(s: Simulation, kind: ItemKind) {
  const box = s.obstacles.find((c) => c.question && !c.hidden && !c.used)!;
  s.hitBlock(box, s.player);
  const item = s.items[0];
  item.kind = kind;
  const size = itemSpriteSize(kind);
  assert.ok(item.emerge > 0);
  assert.ok(item.clip);
  let sawBelow = false;
  for (let i = 0; i < 40; i++) {
    tick(s, dt);
    if (item.emerge <= 0) {
      assert.equal(item.clip, undefined);
      break;
    }
    const top = blockDrawY(box.y, box.bounce) - T.brickSize / 2;
    const clip = item.clip!;
    assert.ok(
      clip.y + clip.h <= top + 1e-6,
      `clip bottom ${clip.y + clip.h} below block top ${top}`,
    );
    assert.ok(clip.x <= item.body.position.x - size / 2 + 1e-6);
    assert.ok(clip.x + clip.w >= item.body.position.x + size / 2 - 1e-6);
    if (itemDrawY(item) + size / 2 > top) sawBelow = true;
  }
  assert.ok(sawBelow, "item extends below the bouncing block during emerge");
  tick(s, 0.5);
  assert.equal(item.emerge, 0);
  assert.equal(item.clip, undefined);
}

test("emerging items stay clipped above the bouncing block", () => {
  assertEmergeClip(game(), "mushroom");
  assertEmergeClip(game(), "mushroom8x");
});

test("question blocks release each random item once, including on Mario hits", () => {
  for (const [roll, kind] of [
    [0, "coin"],
    [0.25, "star"],
    [0.5, "mushroom"],
    [0.99, "flower"],
  ] as const) {
    const s = game();
    s.random = () => roll;
    const box = s.obstacles.find((c) => c.question && !c.hidden)!;
    const coins = s.coins;
    s.hitBlock(box, s.mario);
    assert.equal(box.used, true);
    assert.equal(box.broken, false);
    if (kind === "coin") {
      assert.equal(s.items.length, 0);
      assert.equal(s.coins, coins);
      assert.equal(s.coinPops.length, 1);
      assert.ok(s.events.includes("coin"));
      assert.equal(s.events.includes("appear"), false);
      s.hitBlock(box, s.player);
      assert.equal(s.items.length, 0);
      assert.equal(s.coins, coins);
      assert.equal(s.coinPops.length, 1);
    } else {
      assert.equal(s.items[0].kind, kind);
      tick(s, 0.5);
      assert.ok(Number.isFinite(s.items[0].body.position.y));
      s.hitBlock(box, s.player);
      assert.equal(s.items.length, 1);
    }
    assert.ok(s.solids.includes(box.body!));
    s.reset();
    assert.equal(s.items.length, 0);
    assert.ok(s.obstacles.filter((c) => c.question).every((c) => !c.used));
  }
});

test("head hits collect coins sitting on the bumped block", () => {
  const s = game();
  const room = s.loadRoom("42");
  const sitting = room.coins.flatMap((coin) => {
    const block = room.obstacles.find(
      (c) =>
        c.kind === "brick" &&
        !c.question &&
        Math.abs(coin.x - c.x) < T.brickSize / 2 &&
        Math.abs(coin.y - (c.y - T.brickSize)) < T.brickSize / 2,
    );
    return block ? [{ coin, block }] : [];
  });
  assert.ok(sitting.length >= 3);
  const [small, broken, marioHit] = sitting;
  const stray = room.coins.find(
    (coin) =>
      !coin.collected && Math.abs(coin.x - small.block.x) >= T.brickSize / 2,
  );
  assert.ok(stray);
  s.hitBlock(small.block, s.player);
  assert.equal(small.coin.collected, true);
  assert.equal(small.block.broken, false);
  assert.ok(small.block.bounce > 0);
  assert.equal(s.coins, 1);
  assert.ok(s.events.includes("coin"));
  assert.equal(s.coinPops.length, 1);
  assert.equal(s.coinPops[0].x, small.coin.x);
  assert.equal(s.coinPops[0].y, small.coin.y);
  assert.equal(stray.collected, false);
  assert.equal(s.warned, 0);
  assert.equal(s.saved, 0);
  const box = s.obstacles.find((c) => c.question && !c.used)!;
  const qCoin = { x: box.x, y: box.y - T.brickSize, collected: false };
  s.activeRoom.coins.push(qCoin);
  s.hitBlock(box, s.player);
  assert.equal(qCoin.collected, true);
  assert.equal(box.broken, false);
  assert.equal(s.coins, 2);
  assert.equal(s.coinPops.length, 2);
  give(s, s.player, "mushroom");
  s.hitBlock(broken.block, s.player);
  assert.equal(broken.coin.collected, true);
  assert.equal(broken.block.broken, true);
  assert.equal(s.coins, 3);
  assert.equal(s.score, 3 * T.coinScore);
  assert.equal(s.coinPops.length, 3);
  s.events.length = 0;
  const score = s.score;
  s.hitBlock(marioHit.block, s.mario);
  assert.equal(marioHit.coin.collected, true);
  assert.equal(s.coins, 3);
  assert.equal(s.score, score);
  assert.ok(s.events.includes("coin"));
  assert.equal(s.coinPops.length, 4);
  assert.equal(s.coinPops[3].x, marioHit.coin.x);
  assert.equal(s.coinPops[3].y, marioHit.coin.y);
});

function standOn(n: Actor, block: { x: number; y: number }) {
  Body.setPosition(n.body, { x: block.x, y: block.y - 16 - 14 * n.scale });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.idleWalking = false;
  n.idleWait = 2;
}

test("player bump and break bounce an NPC on the block without killing it", () => {
  const s = game();
  const brick = s.obstacles.find(
    (c) => c.kind === "brick" && !c.question && !c.hidden && c.y > 300,
  )!;
  const n = s.npcs.find((npc) => npc.kind === "goomba")!;
  standOn(n, brick);
  s.hitBlock(brick, s.player);
  assert.equal(n.alive, true);
  assert.equal(brick.broken, false);
  assert.equal(n.body.velocity.y, -T.stompBounce);
  assert.equal(n.shell, "none");
  const koopa = s.npcs.find((npc) => npc.kind === "koopa")!;
  const other = s.obstacles.find(
    (c) =>
      c.kind === "brick" &&
      !c.question &&
      !c.hidden &&
      c !== brick &&
      c.y > 300,
  )!;
  standOn(koopa, other);
  s.hitBlock(other, s.player);
  assert.equal(koopa.alive, true);
  assert.equal(koopa.shell, "none");
  assert.equal(koopa.body.velocity.y, -T.stompBounce);

  give(s, s.player, "mushroom");
  const breakable = s.obstacles.find(
    (c) =>
      c.kind === "brick" &&
      !c.question &&
      !c.hidden &&
      !c.broken &&
      c !== brick &&
      c !== other &&
      c.y > 300,
  )!;
  const falling = s.npcs.find(
    (npc) => npc.alive && npc !== n && npc !== koopa,
  )!;
  standOn(falling, breakable);
  s.hitBlock(breakable, s.player);
  assert.equal(breakable.broken, true);
  assert.equal(falling.alive, true);
  assert.equal(falling.body.velocity.y, -T.stompBounce);
  assert.equal(
    s.particles.some((p) => p.color === "#bc0018"),
    false,
  );
});

test("Mario bump and break kill an NPC on the block", () => {
  const s = game();
  const box = s.obstacles.find((c) => c.question && !c.hidden)!;
  const n = s.npcs.find((npc) => npc.kind === "goomba")!;
  standOn(n, box);
  s.hitBlock(box, s.mario);
  assert.equal(n.alive, false);
  assert.equal(box.broken, false);
  assert.ok(s.particles.some((p) => p.color === "#bc0018"));

  const brick = s.obstacles.find(
    (c) => c.kind === "brick" && !c.question && !c.hidden && c.y > 300,
  )!;
  const koopa = s.npcs.find((npc) => npc.kind === "koopa")!;
  standOn(koopa, brick);
  s.hitBlock(brick, s.mario);
  assert.equal(koopa.alive, false);
  assert.equal(koopa.shell, "none");
  assert.equal(brick.broken, true);

  const s2 = game();
  const giantBrick = s2.obstacles.find(
    (c) => c.kind === "brick" && !c.question && !c.hidden && c.y > 300,
  )!;
  const giant = s2.npcs.find((npc) => npc.kind === "goomba")!;
  give(s2, giant, "mushroom");
  standOn(giant, giantBrick);
  s2.hitBlock(giantBrick, s2.mario);
  assert.equal(giant.alive, false);
  assert.equal(giant.scale, T.mushroomScale);

  const s3 = game();
  const starBrick = s3.obstacles.find(
    (c) => c.kind === "brick" && !c.question && !c.hidden && c.y > 300,
  )!;
  const starred = s3.npcs.find((npc) => npc.kind === "goomba")!;
  give(s3, starred, "star");
  standOn(starred, starBrick);
  s3.hitBlock(starBrick, s3.mario);
  assert.equal(starred.alive, true);
});

test("player coins increment a counter without changing rescue scores", () => {
  const s = game();
  const room = s.loadRoom("42");
  const coin = room.coins.find((c) => !c.collected);
  assert.ok(coin);
  const p = s.player.body.position;
  coin.x = p.x;
  coin.y = p.y;
  tick(s, dt);
  assert.equal(coin.collected, true);
  assert.equal(s.coins, 1);
  assert.equal(s.score, T.coinScore);
  assert.ok(s.events.includes("coin"));
  assert.equal(s.warned, 0);
  assert.equal(s.saved, 0);
  assert.equal(s.died(), 0);
  const second = room.coins.find((c) => !c.collected);
  assert.ok(second);
  second.x = p.x;
  second.y = p.y;
  tick(s, dt);
  assert.equal(s.coins, 2);
  assert.equal(s.score, 2 * T.coinScore);
  const npcCoin = room.coins.find((c) => !c.collected);
  assert.ok(npcCoin);
  const n = s.npcs[0];
  npcCoin.x = n.body.position.x;
  npcCoin.y = n.body.position.y;
  s.events.length = 0;
  tick(s, dt);
  assert.equal(npcCoin.collected, true);
  assert.equal(s.coins, 2);
  assert.equal(s.score, 2 * T.coinScore);
  assert.ok(s.events.includes("coin"));
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  const marioCoin = room.coins.find((c) => !c.collected);
  assert.ok(marioCoin);
  Body.setPosition(s.mario.body, { x: 280, y: 411 });
  marioCoin.x = s.mario.body.position.x;
  marioCoin.y = s.mario.body.position.y;
  s.events.length = 0;
  tick(s, dt);
  assert.equal(marioCoin.collected, true);
  assert.equal(s.coins, 2);
  assert.equal(s.score, 2 * T.coinScore);
  assert.ok(s.events.includes("coin"));
  s.reset();
  assert.equal(s.coins, 0);
  assert.equal(s.died(), 0);
  s.coins = 5;
  s.score = 400;
  s.nextLevel();
  assert.equal(s.coins, 5);
  assert.equal(s.score, 400);
  assert.equal(s.died(), 0);
});

test("Died counts NPC deaths only and partitions population with saved and living", () => {
  const s = game();
  assert.equal(s.died(), 0);
  assert.equal(s.died() + s.saved + s.living(), T.population);

  s.kill(s.npcs[0]);
  assert.equal(s.died(), 1);
  s.kill(s.npcs[0]);
  assert.equal(s.died(), 1);

  s.npcs[1].warned = true;
  s.warned = 1;
  s.kill(s.npcs[1]);
  assert.equal(s.warned, 1);
  assert.equal(s.died(), 2);

  s.save(s.npcs[2]);
  assert.equal(s.saved, 1);
  assert.equal(s.died(), 2);
  s.kill(s.npcs[2]);
  assert.equal(s.saved, 1);
  assert.equal(s.died(), 2);

  s.kill(s.player);
  assert.equal(s.mode, "dead");
  assert.equal(s.died(), 2);
  s.marioActive = true;
  s.kill(s.mario);
  assert.equal(s.died(), 2);
  assert.equal(s.died() + s.saved + s.living(), T.population);

  const pit = game();
  Body.setPosition(pit.npcs[0].body, {
    x: pit.npcs[0].body.position.x,
    y: 700,
  });
  tick(pit, dt);
  assert.equal(pit.died(), 1);
  assert.equal(pit.player.alive, true);
  assert.equal(pit.mode, "playing");

  const playerPit = game();
  Body.setPosition(playerPit.player.body, {
    x: playerPit.player.body.position.x,
    y: 700,
  });
  tick(playerPit, dt);
  assert.equal(playerPit.mode, "dead");
  assert.equal(playerPit.died(), 0);
  tick(playerPit, T.deathSequenceSeconds + 0.1);
  assert.equal(playerPit.mode, "intro");
  assert.equal(playerPit.died(), 0);
  tick(playerPit, T.introSeconds);
  assert.equal(playerPit.mode, "playing");
  assert.equal(playerPit.died(), 0);

  s.reset();
  assert.equal(s.died(), 0);
  s.kill(s.npcs[0]);
  s.nextLevel();
  assert.equal(s.died(), 0);
  assert.equal(s.died() + s.saved + s.living(), T.population);
});

test("NPCs pick up falling items by contact without being warned or seeking them", () => {
  for (const kind of ["star", "mushroom", "flower"] as const) {
    const s = game();
    const n = s.npcs[0];
    const box = s.obstacles.find((c) => c.question)!;
    s.hitBlock(box, s.player);
    const item = s.items[0];
    item.kind = kind;
    item.emerge = 0;
    Body.setFrozen(item.body, false);
    Body.setPosition(item.body, {
      x: n.body.position.x,
      y: n.body.position.y - 40,
    });
    Body.setVelocity(item.body, { x: 0, y: 3 });
    tick(s, 0.3);
    assert.equal(s.items.length, 0);
    assert.equal(n.warned, false);
    assert.equal(s.warned, 0);
    if (kind === "star") assert.ok(n.starLeft > 0);
    if (kind === "flower") assert.equal(n.flower, true);
    if (kind === "mushroom") {
      assert.equal(n.scale, T.mushroomScale);
      assert.equal(n.body.native!.allowRotation, false);
      assert.ok(Math.abs(n.body.bounds.max.x - n.body.bounds.min.x) >= 48);
    }
  }
});

test("a giant NPC can still complete the stair and pipe route", () => {
  const s = game();
  const n = s.npcs[0];
  give(s, n, "mushroom");
  n.warned = true;
  tick(s, 100);
  assert.equal(n.saved, true);
});

function takeoffsWhileFleeing(
  s: Simulation,
  n: Actor,
  seconds = 8,
) {
  const takeoffs: number[] = [];
  let lastGrounded = n.grounded;
  for (let i = 0; i < Math.round(seconds * 60) && n.alive && !n.saved; i++) {
    s.step(dt, emptyInput());
    if (lastGrounded && !n.grounded && n.body.velocity.y < 0)
      takeoffs.push(Math.abs(n.body.velocity.y));
    lastGrounded = n.grounded;
  }
  return takeoffs;
}

test("giant NPC takeoff uses the player jump model, never a size boost", () => {
  for (const kind of ["mushroom", "mushroom3x", "mushroom8x"] as const) {
    const s = game();
    s.pipeEscapeRandom = () => 1;
    const n = soloNpc(s);
    give(s, n, kind);
    n.warned = true;
    n.state = "run";
    n.wait = 0;
    const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
    Body.setPosition(n.body, {
      x: pipe.body!.bounds.min.x - 80,
      y: T.groundY - n.body.height / 2,
    });
    Body.setVelocity(n.body, { x: T.runSpeed, y: 0 });
    const takeoffs = takeoffsWhileFleeing(s, n, 6);
    assert.ok(takeoffs.length > 0, `${kind} NPC jumped`);
    for (const speed of takeoffs) {
      assert.ok(
        speed <= T.runJumpSpeed + 0.5,
        `${kind} NPC takeoff ${speed} exceeded player jump impulse`,
      );
    }
    s.physics.clear();
  }
});

test("Mario Super and 8x takeoff uses jumpArc only", () => {
  for (const form of ["super", "8x"] as const) {
    const s = game();
    for (const npc of s.npcs) s.kill(npc, false);
    s.marioActive = true;
    Body.setFrozen(s.mario.body, false);
    if (form === "super") s.setMarioStage(1);
    else give(s, s.mario, "mushroom8x");
    const gap = GAPS[0][0];
    Body.setPosition(s.mario.body, {
      x: gap - 120,
      y: T.groundY - s.mario.body.height / 2,
    });
    Body.setVelocity(s.mario.body, { x: T.runSpeed, y: 0 });
    s.cameraX = gap - 320;
    at(s, gap + 200, T.groundY - 14);
    s.mario.facing = 1;
    s.marioPause = 0;
    s.marioReaction = 0;
    s.marioLook = 10;
    s.marioJumpWait = 0;
    s.marioChase = 8;
    s.marioAim = gap + 200;
    s.marioDecision = 10;
    s.marioIgnore = 0;
    s.marioTarget = s.player.id;
    const takeoffs: number[] = [];
    let lastGrounded = s.mario.grounded;
    for (let i = 0; i < 240 && s.marioActive && s.mario.alive; i++) {
      s.cameraX = s.mario.body.position.x - 200;
      s.step(dt, emptyInput());
      if (lastGrounded && !s.mario.grounded && s.mario.body.velocity.y < 0)
        takeoffs.push(Math.abs(s.mario.body.velocity.y));
      lastGrounded = s.mario.grounded;
      if (takeoffs.length > 0) break;
    }
    assert.ok(takeoffs.length > 0, `${form} Mario jumped`);
    const expected = jumpArc(T.runSpeed).impulse;
    for (const speed of takeoffs) {
      assert.ok(
        speed <= expected + 0.5,
        `${form} Mario takeoff ${speed} used a size-boosted impulse`,
      );
    }
    s.physics.clear();
  }
});

test("a warned NPC on the World 1-2 ceiling above the exit leaves the slab", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-2");
  s.reset();
  s.marioReturn = 1e6;
  finishPipeIntro(s);
  const n = soloNpc(s);
  n.warned = true;
  n.state = "run";
  n.wait = 0;
  n.areaId = "40";
  s.pipeEscapeRandom = () => 1;
  const ceilingY = MAP_TOP + 2 * 32;
  Body.setPosition(n.body, { x: 5348, y: ceilingY - n.body.height / 2 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  let leftSlab = false;
  for (
    let frame = 0;
    frame < 60 * 30 && n.alive && !n.saved;
    frame++
  ) {
    s.step(dt, emptyInput());
    leftSlab ||= n.body.bounds.max.y > ceilingY + 24;
    if (n.saved || leftSlab) break;
  }
  assert.ok(n.alive);
  assert.ok(
    n.saved || leftSlab,
    `stayed on the 1-2 ceiling: ${JSON.stringify(n.body.position)} feet=${n.body.bounds.max.y}`,
  );
  if (!n.saved) {
    for (
      let frame = 0;
      frame < 60 * 45 && n.alive && !n.saved;
      frame++
    )
      s.step(dt, emptyInput());
  }
  assert.ok(
    n.saved,
    `left the slab but did not reach rescue: ${JSON.stringify(n.body.position)}`,
  );
  s.physics.clear();
});

test("a warned NPC on the World 4-2 ceiling above the exit leaves the slab", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "4-2");
  s.reset();
  s.marioReturn = 1e6;
  finishPipeIntro(s);
  const n = soloNpc(s);
  n.warned = true;
  n.state = "run";
  n.wait = 0;
  n.areaId = "41";
  s.pipeEscapeRandom = () => 1;
  const ceilingY = MAP_TOP + 2 * 32;
  const goalX = s.roomFor(n).goalX;
  Body.setPosition(n.body, { x: goalX, y: ceilingY - n.body.height / 2 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  let leftSlab = false;
  for (
    let frame = 0;
    frame < 60 * 30 && n.alive && !n.saved;
    frame++
  ) {
    s.step(dt, emptyInput());
    leftSlab ||= n.body.bounds.max.y > ceilingY + 24;
    if (n.saved || leftSlab) break;
  }
  assert.ok(n.alive);
  assert.ok(
    n.saved || leftSlab,
    `stayed on the 4-2 ceiling: ${JSON.stringify(n.body.position)} feet=${n.body.bounds.max.y}`,
  );
  if (!n.saved) {
    for (
      let frame = 0;
      frame < 60 * 90 && n.alive && !n.saved;
      frame++
    )
      s.step(dt, emptyInput());
  }
  assert.ok(
    n.saved,
    `left the slab but did not reach rescue: ${JSON.stringify(n.body.position)}`,
  );
  s.physics.clear();
});

test("Mario avoids stars and touching a star holder kills him until his return", () => {
  const s = game();
  give(s, s.player, "star");
  at(s, 200);
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 100, y: 411 });
  tick(s, dt);
  assert.ok(s.mario.body.velocity.x < 0);
  at(s, s.mario.body.position.x, s.mario.body.position.y);
  tick(s, dt);
  assert.equal(s.marioActive, false);
  assert.equal(s.mario.alive, false);
  assert.ok(s.player.alive);
  assert.ok(s.particles.length > 32);
  assert.equal(s.particles.length, T.bloodBurst);
  at(s, 800);
  s.cameraX = 400;
  tick(s, T.marioDefeatSeconds + dt);
  assert.ok(s.marioActive && s.mario.alive);
});

test("NPC star contact also kills Mario, but giant NPC contact does not", () => {
  for (const kind of ["star", "mushroom"] as const) {
    const s = game();
    const n = s.npcs[0];
    give(s, n, kind);
    s.marioActive = true;
    s.marioStun = 1;
    Body.setFrozen(s.mario.body, false);
    Body.setPosition(s.mario.body, { ...n.body.position });
    tick(s, dt);
    assert.equal(s.mario.alive, kind === "mushroom");
    assert.ok(n.alive);
    if (kind === "star") assert.equal(s.marioKills, 0);
  }
});

function parkNpcs(s: Simulation, keep: Actor[], x = 4000) {
  for (const n of s.npcs) {
    if (keep.includes(n)) continue;
    Body.setPosition(n.body, { x, y: 415 });
    Body.setVelocity(n.body, { x: 0, y: 0 });
  }
}

function troopa(s: Simulation) {
  return s.npcs.find((n) => n.kind === "koopa")!;
}

function bodiesOverlap(a: Actor, b: Actor) {
  return (
    Math.abs(a.body.position.x - b.body.position.x) <
      (a.body.width + b.body.width) / 2 &&
    Math.abs(a.body.position.y - b.body.position.y) <
      (a.body.height + b.body.height) / 2
  );
}

function edgeGap(a: Actor, b: Actor) {
  const dx = Math.max(
    0,
    Math.abs(a.body.position.x - b.body.position.x) -
      (a.body.width + b.body.width) / 2,
  );
  const dy = Math.max(
    0,
    Math.abs(a.body.position.y - b.body.position.y) -
      (a.body.height + b.body.height) / 2,
  );
  return Math.hypot(dx, dy);
}

function standBeside(s: Simulation, n: Actor, edge = 4) {
  const dx = (s.player.body.width + n.body.width) / 2 + edge;
  at(
    s,
    n.body.position.x - dx,
    n.body.bounds.max.y - s.player.body.height / 2,
  );
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.idleWalking = false;
  n.wait = 99;
}

test("a falling player lands on an NPC without hopping, killing, or warning it", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.idleWalking = false;
  n.wait = 99;
  at(s, 200, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.ok(s.player.body.velocity.y > 0);
  assert.notEqual(s.player.body.velocity.y, -T.stompBounce);
  tick(s, 0.8);
  assert.ok(s.player.grounded);
  assert.ok(edgeGap(s.player, n) <= T.warningRange);
  assert.ok(n.alive);
  assert.equal(n.warned, false);
  assert.equal(s.warned, 0);
  assert.equal(s.events.includes("warn"), false);
  assert.equal(s.events.includes("splat"), false);
});

test("a landed-on NPC can be warned after contact ends without leaving range", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.idleWalking = false;
  n.wait = 99;
  at(s, 200, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.ok(s.player.body.velocity.y > 0);
  tick(s, 0.8);
  assert.equal(n.warned, false);
  assert.equal(s.warned, 0);
  let separated = false;
  for (let i = 0; i < 40; i++) {
    tick(s, dt, { right: true });
    if (!bodiesOverlap(s.player, n)) {
      separated = true;
      break;
    }
  }
  assert.ok(separated);
  assert.ok(s.player.grounded);
  assert.ok(edgeGap(s.player, n) <= T.warningRange);
  tick(s, dt);
  assert.equal(n.warned, true);
});

test("falling onto an NPC from high above does not hop or warn it", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.idleWalking = false;
  n.wait = 99;
  at(s, 200, 300);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  let landed = false;
  for (let i = 0; i < 50; i++) {
    const playerBottom = s.player.body.bounds.max.y;
    const npcTop = n.body.bounds.min.y;
    tick(s, dt);
    assert.equal(n.warned, false);
    assert.notEqual(s.player.body.velocity.y, -T.stompBounce);
    assert.ok(s.player.body.velocity.y >= 0);
    if (playerBottom <= npcTop && s.player.body.bounds.max.y >= npcTop)
      landed = true;
  }
  assert.ok(landed);
  assert.ok(n.alive);
  assert.equal(s.warned, 0);
});

test("side overlap with an NPC does not bounce the player", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 136, y: 300 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  at(s, 120, 300);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.ok(s.player.body.velocity.y >= 0);
  assert.ok(n.alive);
});

test("a falling NPC does not bounce a player already below its top", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 140, y: 300 });
  Body.setVelocity(n.body, { x: 0, y: 4 });
  at(s, 120, 274);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.ok(s.player.body.velocity.y >= 0);
  assert.ok(n.alive);
});

test("shallow side overlap below an NPC top does not bounce the player", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 140, y: 300 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  at(s, 120, 280);
  Body.setVelocity(s.player.body, { x: T.walkSpeed, y: 4 });
  tick(s, dt);
  assert.ok(s.player.body.velocity.y >= 0);
  assert.ok(n.alive);
});

function stillMario(s: Simulation) {
  s.marioActive = true;
  s.marioStun = 0;
  s.marioLook = 10;
  s.marioPause = 10;
  s.marioChase = 0;
  s.marioReaction = 1;
  Body.setFrozen(s.mario.body, false);
}

function marioStomp(s: Simulation, target: Actor) {
  stillMario(s);
  const p = target.body.position;
  Body.setPosition(s.mario.body, {
    x: p.x,
    y: p.y - target.body.height / 2 - 5,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 4 });
}

function giantStompMario(s: Simulation) {
  stillMario(s);
  Body.setPosition(s.mario.body, { x: 100, y: 411 });
  at(s, 100, s.mario.body.bounds.min.y - s.player.body.height / 2 - 2);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
}

function mushroomKind(scale: number): ItemKind {
  return scale >= T.hugeScale
    ? "mushroom8x"
    : scale >= T.giantScale
      ? "mushroom3x"
      : "mushroom";
}

function airOverlap(s: Simulation, playerFeetDelta: number) {
  stillMario(s);
  parkNpcs(s, []);
  Body.setPosition(s.mario.body, { x: 200, y: 320 });
  at(
    s,
    200,
    s.mario.body.bounds.max.y + playerFeetDelta - s.player.body.height / 2,
  );
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
}

test("mushroom grow and shrink blink between the two sizes", () => {
  const s = game();
  give(s, s.player, "mushroom");
  assert.equal(s.player.scale, T.mushroomScale);
  assert.ok(s.player.transformLeft > 0);
  assert.equal(s.player.transformFrom, 1);
  const grown = new Set<number>();
  while (s.player.transformLeft > 0) {
    grown.add(s.displayScale(s.player));
    tick(s, dt);
  }
  assert.deepEqual([...grown].sort((a, b) => a - b), [1, T.mushroomScale]);
  assert.equal(s.displayScale(s.player), T.mushroomScale);
  parkNpcs(s, []);
  marioStomp(s, s.player);
  tick(s, dt);
  assert.equal(s.player.scale, 1);
  assert.ok(s.player.alive);
  const shrunk = new Set<number>();
  s.marioActive = false;
  while (s.player.transformLeft > 0) {
    shrunk.add(s.displayScale(s.player));
    tick(s, dt);
  }
  assert.deepEqual([...shrunk].sort((a, b) => a - b), [1, T.mushroomScale]);
  assert.equal(s.displayScale(s.player), 1);
});

test("first damaging stomp shrinks a mushroom player and strips the flower", () => {
  const s = game();
  give(s, s.player, "flower");
  give(s, s.player, "mushroom");
  parkNpcs(s, []);
  marioStomp(s, s.player);
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.scale, 1);
  assert.equal(s.player.flower, false);
  assert.ok(s.events.includes("shrink"));
  s.marioActive = false;
  tick(s, T.transformSeconds + dt, { fire: true });
  assert.equal(s.fireballs.length, 0);
  assert.equal(s.player.alive, true);
});

test("first damaging stomp shrinks a mushroom NPC and strips the flower", () => {
  const s = game();
  const n = s.npcs[0];
  give(s, n, "flower");
  give(s, n, "mushroom");
  parkNpcs(s, [n]);
  at(s, 4000);
  marioStomp(s, n);
  tick(s, dt);
  assert.equal(n.alive, true);
  assert.equal(n.scale, 1);
  assert.equal(n.flower, false);
  assert.ok(s.events.includes("shrink"));
});

test("a small actor who collects a flower stays small and gains fire", () => {
  const s = game();
  assert.equal(s.player.scale, 1);
  give(s, s.player, "flower");
  assert.equal(s.player.scale, 1);
  assert.equal(s.player.flower, true);
  tick(s, dt, { fire: true });
  assert.equal(s.fireballs.length, 1);
  assert.equal(s.fireballs[0]!.scale, 1);
  const n = s.npcs[0];
  give(s, n, "flower");
  assert.equal(n.scale, 1);
  assert.equal(n.flower, true);
});

test("first damaging stomp shrinks a mushroom NPC instead of killing it", () => {
  const s = game();
  const n = s.npcs[0];
  give(s, n, "mushroom");
  parkNpcs(s, [n]);
  at(s, 4000);
  marioStomp(s, n);
  tick(s, dt);
  assert.equal(n.alive, true);
  assert.equal(n.scale, 1);
  assert.ok(s.events.includes("shrink"));
  n.transformLeft = 0;
  marioStomp(s, n);
  tick(s, dt);
  assert.equal(n.alive, false);
});

test("star holders stay immune, including giants", () => {
  const s = game();
  give(s, s.player, "mushroom");
  give(s, s.player, "star");
  parkNpcs(s, []);
  marioStomp(s, s.player);
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.scale, T.mushroomScale);
  s.fireballs.push({
    id: 42,
    x: s.player.body.position.x,
    y: s.player.body.position.y,
    vx: 0,
    age: 0,
  });
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.scale, T.mushroomScale);
});

test("Mario still selects a giant player and giant NPCs", () => {
  const giantPlayer = game();
  give(giantPlayer, giantPlayer.player, "mushroom");
  assert.equal(giantPlayer.invincible(giantPlayer.player), false);
  giantPlayer.random = () => 0;
  stillMario(giantPlayer);
  giantPlayer.marioLook = 0;
  giantPlayer.marioPause = 0;
  giantPlayer.marioReaction = 0;
  Body.setPosition(giantPlayer.mario.body, { x: 0, y: 411 });
  tick(giantPlayer, dt);
  assert.equal(giantPlayer.marioTarget, giantPlayer.player.id);

  const s = game();
  const n = s.npcs[0];
  give(s, n, "mushroom");
  assert.equal(s.invincible(n), false);
  at(s, 900);
  s.random = () => 0.99;
  stillMario(s);
  s.marioLook = 0;
  s.marioPause = 0;
  s.marioReaction = 0;
  Body.setPosition(s.mario.body, { x: 300, y: 411 });
  tick(s, dt);
  assert.equal(s.marioTarget, n.id);
});

test("giant player stomps shrink powered Mario first, then a later stomp can defeat him", () => {
  const s = game();
  give(s, s.player, "mushroom");
  parkNpcs(s, []);
  assert.equal(s.marioStage, 1);
  giantStompMario(s);
  tick(s, dt);
  assert.equal(s.marioStage, 0);
  assert.ok(s.mario.alive && s.player.alive);
  assert.ok(s.events.includes("shrink"));
  assert.equal(s.events.includes("marioDeath"), false);
  assert.ok(s.player.body.velocity.y < 0);
  giantStompMario(s);
  tick(s, dt);
  assert.ok(s.marioDeath);
  assert.ok(!s.mario.alive && s.player.alive);
  assert.ok(s.events.includes("marioDeath"));
  assert.ok(s.player.body.velocity.y < 0);
  const start = s.marioDeath.y;
  tick(s, 0.4);
  assert.ok(s.marioDeath && s.marioDeath.y < start);
  tick(s, 0.8);
  assert.ok(s.marioDeath && s.marioDeath.y > start);
  assert.equal(s.events.filter((e) => e === "marioDeath").length, 1);
  s.cameraX = s.activeRoom.offset + 400;
  tick(s, 2);
  assert.ok(!s.marioDeath && s.marioActive && s.mario.alive);
});

test("player and NPC bodies scale with mushroom size; Mario small is half of big", () => {
  const goomba = { w: 24, h: 28 };
  for (const scale of [1, T.mushroomScale, T.giantScale, T.hugeScale]) {
    const s = game();
    const playerFeet = s.player.body.bounds.max.y;
    const n = s.npcs[0];
    const npcFeet = n.body.bounds.max.y;
    if (scale > 1) {
      give(s, s.player, mushroomKind(scale));
      give(s, n, mushroomKind(scale));
    }
    assert.equal(s.player.body.width, goomba.w * scale);
    assert.equal(s.player.body.height, goomba.h * scale);
    assert.equal(n.body.width, goomba.w * scale);
    assert.equal(n.body.height, goomba.h * scale);
    assert.ok(Math.abs(s.player.body.bounds.max.y - playerFeet) < 0.01);
    assert.ok(Math.abs(n.body.bounds.max.y - npcFeet) < 0.01);
    if (scale > 1) {
      assert.ok(s.player.transformLeft > 0);
      assert.equal(s.player.body.width, goomba.w * scale);
    }
  }
  const s = game();
  assert.equal(s.mario.body.width, 24);
  assert.equal(s.mario.body.height, 38);
  s.setMarioStage(0);
  assert.equal(s.mario.scale, 0.5);
  assert.equal(s.mario.body.width, 12);
  assert.equal(s.mario.body.height, 19);
  s.setMarioStage(2);
  assert.equal(s.marioStage, 2);
  assert.equal(s.mario.body.width, 24);
  assert.equal(s.mario.body.height, 38);
});

test("star vs small Mario overlap uses the scaled body, not unscaled 19", () => {
  const s = game();
  give(s, s.player, "star");
  stillMario(s);
  s.setMarioStage(0);
  parkNpcs(s, []);
  Body.setPosition(s.mario.body, { x: 200, y: 300 });
  const unscaled = s.player.body.height / 2 + 19;
  const scaled =
    s.player.body.height / 2 + s.mario.body.height / 2;
  assert.ok(unscaled > scaled + 5);
  const dy = (unscaled + scaled) / 2;
  at(s, 200, 300 - dy);
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(s.marioActive, true);
  assert.equal(s.mario.alive, true);
  assert.ok(s.player.alive);
});

test("player fireballs use Mario's scaled body, not unscaled 19", () => {
  const s = game();
  stillMario(s);
  s.setMarioStage(0);
  parkNpcs(s, []);
  Body.setPosition(s.mario.body, { x: 200, y: 300 });
  const radius = 6;
  const dy = (19 + s.mario.body.height / 2) / 2 + radius;
  s.fireballs.push({
    id: 1,
    x: 200,
    y: 300 - dy,
    vx: 0,
    age: 0,
    owner: "player",
  });
  tick(s, dt);
  assert.equal(s.marioStage, 0);
  assert.equal(s.marioActive, true);
});

test("small Mario head hits use the scaled body top", () => {
  const s = game();
  stillMario(s);
  s.marioDecision = 10;
  s.setMarioStage(0);
  parkNpcs(s, []);
  at(s, 400);
  const brick = s.obstacles.find(
    (c) =>
      c.kind === "brick" &&
      !c.question &&
      !c.hidden &&
      !c.broken &&
      !c.content &&
      c.body &&
      c.y > 300 &&
      c.x < 900,
  )!;
  const top = brick.body!.bounds.max.y;
  Body.setPosition(s.mario.body, {
    x: brick.x,
    y: top + s.mario.body.height / 2 + 1,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: -4 });
  tick(s, dt);
  assert.equal(brick.broken, true);
});

function owned(s: Simulation, owner: "player" | "mario") {
  return s.fireballs.filter((f) => f.owner === owner);
}

test("player fireballs match Goomba size and share a two-shot cap", () => {
  const s = game();
  give(s, s.player, "flower");
  tick(s, dt, { fire: true });
  assert.equal(s.fireballs.length, 1);
  const first = s.fireballs[0]!;
  assert.equal(first.scale, 1);
  give(s, s.player, "mushroom");
  tick(s, dt, { fire: true });
  assert.equal(s.fireballs.length, 2);
  assert.equal(s.events.filter((event) => event === "fire").length, 2);
  assert.equal(s.fireballs[0].scale, 1);
  assert.equal(s.fireballs[1].scale, T.mushroomScale);
  assert.equal(s.player.scale, T.mushroomScale);
  tick(s, dt, { fire: true });
  assert.equal(owned(s, "player").length, T.fireballSlots);
  assert.equal(s.events.filter((event) => event === "fire").length, 2);
  give(s, s.player, "mushroom3x");
  s.fireballs[1].age = 5;
  tick(s, 2 * dt, { fire: true });
  assert.equal(s.fireballs.at(-1)!.scale, T.giantScale);
  give(s, s.player, "mushroom8x");
  s.fireballs[0].age = 5;
  tick(s, 2 * dt, { fire: true });
  assert.equal(s.fireballs.at(-1)!.scale, T.hugeScale);
  assert.equal(first.scale, 1);
});

test("a 2x fireball collides at 2x and does not smash bricks", () => {
  const s = game();
  stillMario(s);
  s.setMarioStage(0);
  parkNpcs(s, []);
  Body.setPosition(s.mario.body, { x: 200, y: 300 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  const gap = s.mario.body.width / 2 + 9;
  s.fireballs.push({
    id: 1,
    x: 200 + gap,
    y: 300,
    vx: 0,
    age: 0,
    owner: "player",
    scale: 1,
  });
  tick(s, dt);
  assert.equal(s.marioStage, 0);
  assert.equal(s.marioActive, true);
  s.fireballs = [];
  Body.setPosition(s.mario.body, { x: 200, y: 300 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  s.fireballs.push({
    id: 2,
    x: 200 + gap,
    y: 300,
    vx: 0,
    age: 0,
    owner: "player",
    scale: T.mushroomScale,
  });
  tick(s, dt);
  assert.equal(s.marioActive, false);

  const bricks = game();
  at(bricks, 80);
  const brick = openBrick(bricks);
  shoot(
    bricks,
    brick.body!.bounds.min.x - 6 * T.mushroomScale - 8,
    brick.y,
    6,
    T.mushroomScale,
  );
  tick(bricks, 8 * dt);
  assert.equal(brick.broken, false);
  assert.ok(bricks.solids.includes(brick.body!));
});

test("Mario and the player each throw again when a fireball slot is free", () => {
  const s = game();
  give(s, s.player, "flower");
  s.elapsed = T.fireballsAt;
  s.marioActive = true;
  s.marioStage = 2;
  s.marioTarget = s.player.id;
  s.marioAim = 100;
  s.marioChase = 2;
  s.marioJumpWait = 10;
  s.marioLook = 1;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 0, y: 411 });
  tick(s, dt, { fire: true });
  tick(s, dt, { fire: true });
  tick(s, dt, { fire: true });
  assert.equal(owned(s, "player").length, T.fireballSlots);
  assert.equal(owned(s, "mario").length, T.fireballSlots);
  owned(s, "player")[0].age = 5;
  owned(s, "mario")[0].age = 5;
  tick(s, 2 * dt, { fire: true });
  assert.equal(owned(s, "player").length, T.fireballSlots);
  assert.equal(owned(s, "mario").length, T.fireballSlots);
  assert.ok(owned(s, "player").some((f) => f.age < 2 * dt));
  assert.ok(owned(s, "mario").some((f) => f.age < 2 * dt));
});

test("flowers enable player fireballs; hits stun Mario and never hurt NPCs", () => {
  const s = game();
  give(s, s.player, "flower");
  s.marioActive = true;
  s.marioStun = 0.1;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 150, y: 411 });
  Body.setPosition(s.npcs[0].body, { x: 130, y: 415 });
  tick(s, dt, { fire: true });
  tick(s, 0.12);
  assert.ok(s.marioStun > 1);
  assert.ok(s.mario.alive && s.npcs[0].alive);
  assert.equal(s.events.filter((e) => e === "fire").length, 1);
  s.reset();
  assert.equal(s.player.flower, false);
  assert.equal(s.player.scale, 1);
  assert.equal(s.player.starLeft, 0);
  tick(s, dt, { fire: true });
  assert.equal(s.fireballs.length, 0);
});

test("player fireballs step Mario from fire to big to small, then defeat him", () => {
  const s = game();
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 140, y: 411 });
  at(s, 140, 411);
  s.marioStage = 2;
  s.mario.flower = true;
  for (const expected of [1, 0]) {
    s.fireballs.push({
      id: s.fireballs.length + 1,
      x: 140,
      y: 411,
      vx: 0,
      age: 0,
      owner: "player",
    });
    tick(s, dt);
    assert.equal(s.marioStage, expected);
    assert.equal(s.marioActive, true);
  }
  s.fireballs.push({ id: 3, x: 140, y: 411, vx: 0, age: 0, owner: "player" });
  tick(s, dt);
  assert.equal(s.marioActive, false);
  assert.ok(s.marioDeath);
});

function overlapX(s: Simulation, n: Actor) {
  return (n.body.width + s.player.body.width) / 2 + 1;
}

test("an unwarned NPC near the player is warned without overlap", () => {
  const s = game();
  const n = s.npcs[0];
  Body.setPosition(n.body, { x: 400, y: 415 });
  const gap = overlapX(s, n) + 20;
  at(s, n.body.position.x - gap);
  assert.ok(gap > overlapX(s, n));
  assert.ok(edgeGap(s.player, n) <= T.warningRange);
  tick(s, dt);
  assert.equal(n.warned, true);
  assert.equal(s.warned, 1);
  assert.ok(s.bubble.length > 0);
  assert.ok(s.events.includes("warn"));
  assert.ok(n.exclaimLeft > 0);
  s.events.length = 0;
  tick(s, dt);
  assert.equal(s.warned, 1);
  assert.equal(s.events.includes("warn"), false);
  tick(s, T.exclaimTime + dt);
  assert.equal(n.exclaimLeft, 0);
  assert.equal(n.warned, true);
});

test("an unwarned NPC beyond the edge-gap range is not warned", () => {
  const s = game();
  const n = s.npcs[0];
  Body.setPosition(n.body, { x: 400, y: 415 });
  const reach =
    T.warningRange + (s.player.body.width + n.body.width) / 2 + 12;
  at(s, n.body.position.x - reach);
  assert.ok(edgeGap(s.player, n) > T.warningRange);
  tick(s, dt);
  assert.equal(n.warned, false);
  assert.equal(s.warned, 0);
  assert.equal(s.bubble, "");
});

test("an adjacent NPC is warned at 2x, 3x, and 8x", () => {
  for (const scale of [T.mushroomScale, T.giantScale, T.hugeScale]) {
    const s = game();
    const n = s.npcs[0];
    parkNpcs(s, [n]);
    give(s, s.player, mushroomKind(scale));
    Body.setPosition(n.body, { x: 400, y: 415 });
    standBeside(s, n, 2);
    assert.ok(!bodiesOverlap(s.player, n), `scale ${scale}: overlapping`);
    assert.ok(edgeGap(s.player, n) <= T.warningRange, `scale ${scale}: range`);
    tick(s, dt);
    assert.equal(n.warned, true, `scale ${scale}: not warned`);
    assert.equal(s.warned, 1, `scale ${scale}: warned count`);
  }
});

function springPad(s: Simulation) {
  const room = s.activeRoom;
  const spring = room.data.objects.find((o) => o.opcode === 33)!;
  return {
    x: room.offset + spring.column * 32 + 16,
    y: MAP_TOP + spring.row * 32,
  };
}

function standOnSpring(s: Simulation, xOffset = 0) {
  const pad = springPad(s);
  at(s, pad.x + xOffset, pad.y - s.player.body.height / 2);
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
}

function world21() {
  const s = game();
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "2-1");
  s.reset();
  s.marioReturn = 1e6;
  parkNpcs(s, []);
  return s;
}

function launchVy(s: Simulation) {
  tick(s, 0.15);
  assert.ok(s.player.grounded, "player should stand before jumping");
  s.events.length = 0;
  tick(s, dt, { jump: true });
  assert.ok(s.events.includes("jump"));
  return s.player.body.velocity.y;
}

test("a player jumping from a World 2-1 spring uses the spring impulse", () => {
  const spring = world21();
  standOnSpring(spring);
  const springVy = launchVy(spring);
  assert.ok(
    springVy < -T.springImpulse + 1,
    `spring launch ${springVy}`,
  );
  assert.ok(springVy < -T.jumpSpeed - 4, `spring vs walk jump ${springVy}`);

  const floor = world21();
  at(floor, 120, T.groundY - floor.player.body.height / 2);
  const floorVy = launchVy(floor);
  assert.ok(floorVy > -T.jumpSpeed - 1, `floor launch ${floorVy}`);
  assert.ok(springVy < floorVy - 4);
});

test("spring detection still launches 2x, 3x, and 8x players, including off-centre", () => {
  for (const scale of [T.mushroomScale, T.giantScale, T.hugeScale]) {
    const s = world21();
    give(s, s.player, mushroomKind(scale));
    const offset = 32;
    standOnSpring(s, offset);
    const vy = launchVy(s);
    assert.ok(
      vy < -T.springImpulse + 1,
      `scale ${scale} offset ${offset}: launch ${vy}`,
    );
  }
});

test("small Mario still detects a spring 26px off-centre", () => {
  const s = world21();
  s.setMarioStage(0);
  const pad = springPad(s);
  Body.setPosition(s.mario.body, {
    x: pad.x + 26,
    y: pad.y - s.mario.body.height / 2,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  assert.equal(s.mario.scale, 0.5);
  assert.equal(s.mario.body.width, 12);
  assert.equal(s.activeRoom.onSpring(s.mario), true);
});

test("warning cooldown and one-count still hold", () => {
  const s = game();
  const n = s.npcs[0];
  Body.setPosition(n.body, { x: 400, y: 415 });
  at(s, n.body.position.x - 40);
  tick(s, dt);
  assert.equal(s.warned, 1);
  assert.ok(s.events.includes("warn"));
  s.events.length = 0;
  tick(s, dt);
  assert.equal(s.warned, 1);
  assert.equal(s.events.includes("warn"), false);
  s.cooldown = 0;
  tick(s, dt);
  assert.equal(s.warned, 1);
  assert.equal(s.events.includes("warn"), false);
});

test("Mario still hears shouts beyond the warning radius", () => {
  const s = game();
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  at(s, 200);
  Body.setPosition(s.mario.body, { x: 380, y: 411 });
  s.warn();
  assert.equal(s.marioTarget, s.player.id);
  assert.ok(s.marioChase > 0);
  assert.equal(s.warned, 0);
});

test("warning shouts stack at the speak position and expire on their own", () => {
  const s = game();
  for (const n of s.npcs) n.warned = true;
  at(s, 200);
  s.warn();
  assert.equal(s.shouts.length, 1);
  const first = s.shouts[0]!;
  assert.equal(first.x, 200);
  assert.equal(first.left, T.bubbleTime);
  assert.ok(first.text.length > 0);
  const spokenY = first.y;
  tick(s, 1);
  assert.equal(s.shouts.length, 1);
  assert.ok(s.shouts[0]!.left < T.bubbleTime);
  at(s, 360, 300);
  s.warn();
  assert.equal(s.shouts.length, 2);
  assert.equal(s.shouts[0]!.x, 200);
  assert.equal(s.shouts[0]!.y, spokenY);
  assert.equal(s.shouts[1]!.x, 360);
  assert.notEqual(s.shouts[1]!.y, spokenY);
  assert.ok(s.shouts[0]!.left < s.shouts[1]!.left);
  at(s, 500);
  assert.equal(s.shouts[0]!.x, 200);
  assert.equal(s.shouts[1]!.x, 360);
  tick(s, s.shouts[0]!.left + dt);
  assert.equal(s.shouts.length, 1);
  assert.equal(s.shouts[0]!.x, 360);
  tick(s, T.bubbleTime);
  assert.equal(s.shouts.length, 0);
});

test("player death clears stacked shouts", () => {
  const s = game();
  for (const n of s.npcs) n.warned = true;
  s.warn();
  s.warn();
  assert.equal(s.shouts.length, 2);
  s.kill(s.player);
  assert.equal(s.shouts.length, 0);
  assert.equal(s.bubble, "");
  assert.equal(s.bubbleLeft, 0);
});

test("warning phrases stay urgent and include brotherhood lines", () => {
  assert.ok(PHRASES.includes("Run my brothers or perish!"));
  assert.ok(PHRASES.filter((line) => /brothers/i.test(line)).length >= 3);
  assert.ok(PHRASES.includes("RUUUUUUUUUUUUUUUN!"));
  assert.ok(PHRASES.includes("Everybody run! He'll kill us all!"));
  assert.ok(
    PHRASES.includes(
      "Hide yo kids, hide yo wife, hide everybody! He's stomping everybody out here!",
    ),
  );
  for (const line of PHRASES) {
    assert.match(line, /!/);
    assert.equal(/joke|banana|pizza/i.test(line), false);
  }
});

test("Mario fireball shrinks 2x and 3x, kills 1x, and ignores star", () => {
  for (const kind of ["mushroom", "mushroom3x"] as const) {
    const s = game();
    give(s, s.player, kind);
    parkNpcs(s, []);
    s.fireballs.push({
      id: 999,
      x: s.player.body.position.x,
      y: s.player.body.position.y,
      vx: 0,
      age: 0,
      owner: "mario",
      vy: 0,
    });
    tick(s, dt);
    assert.equal(s.player.alive, true, kind);
    assert.equal(s.player.scale, 1, kind);
    assert.ok(s.events.includes("shrink"), kind);
  }
  const small = game();
  parkNpcs(small, []);
  small.fireballs.push({
    id: 1,
    x: small.player.body.position.x,
    y: small.player.body.position.y,
    vx: 0,
    age: 0,
    owner: "mario",
    vy: 0,
  });
  tick(small, dt);
  assert.equal(small.player.alive, false);
  const starred = game();
  give(starred, starred.player, "star");
  parkNpcs(starred, []);
  starred.fireballs.push({
    id: 2,
    x: starred.player.body.position.x,
    y: starred.player.body.position.y,
    vx: 0,
    age: 0,
    owner: "mario",
    vy: 0,
  });
  tick(starred, dt);
  assert.equal(starred.player.alive, true);
  assert.ok(starred.player.starLeft > 0);
});

test("fixed population and unique traits per character across a run", () => {
  let seed = 1;
  const s = new Simulation(
    () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646,
  );
  s.reset();
  assert.equal(s.npcs.length, T.population);
  assert.ok(new Set(s.npcs.map((n) => n.speed)).size > 1);
  const traits = s.npcs.map((n) => [n.speed, n.fear, n.reaction]);
  s.mode = "playing";
  tick(s, 2);
  assert.deepEqual(
    s.npcs.map((n) => [n.speed, n.fear, n.reaction]),
    traits,
  );
});

function supportUnder(s: Simulation, actor: Actor) {
  const feet = actor.body.bounds.max.y,
    half = actor.body.width / 2;
  return s.solids.find(
    (solid) =>
      !solid.headOnly &&
      actor.body.position.x + half > solid.bounds.min.x &&
      actor.body.position.x - half < solid.bounds.max.x &&
      Math.abs(feet - solid.bounds.min.y) < 1.5,
  );
}

test("place does not always take the lowest floor and skips hidden blocks", () => {
  const s = game();
  const n = s.npcs[0];
  const brick = s.obstacles.find(
    (c) => c.kind === "brick" && !c.hidden && c.body,
  )!;
  s.activeRoom.place(n, brick.x);
  const lowY = n.body.position.y;
  assert.equal(s.activeRoom.place(n, brick.x, "brick"), true);
  assert.ok(n.body.position.y < lowY - 20, "raised spawn sits above the floor");
  assert.ok(Math.abs(n.body.bounds.max.y - brick.body!.bounds.min.y) < 1);
  assert.equal(overlaps(n.body, s.solids, 0.01).length, 0);
  const hidden = s.obstacles.find((c) => c.hidden && c.body)!;
  s.activeRoom.place(n, hidden.x, "brick");
  assert.ok(
    Math.abs(n.body.bounds.max.y - hidden.body!.bounds.min.y) > 2,
    "unrevealed hidden blocks are not standable starts",
  );
  const pipe = s.obstacles.find((c) => c.kind === "pipe" && c.body)!;
  assert.equal(s.activeRoom.place(n, pipe.x, "lid"), true);
  assert.ok(Math.abs(n.body.bounds.max.y - pipe.body!.bounds.min.y) < 1);
  assert.equal(overlaps(n.body, s.solids, 0.01).length, 0);
});

test("raised place refuses a second NPC in the same spawn cell", () => {
  const s = game();
  const a = s.npcs[0],
    b = s.npcs[1];
  const brick = s.obstacles.find(
    (c) => c.kind === "brick" && !c.hidden && c.body,
  )!;
  Body.setPosition(b.body, { x: 80, y: 80 });
  b.grounded = false;
  const occupied = new Set<string>();
  assert.equal(s.activeRoom.place(a, brick.x, "brick", occupied), true);
  const placed = s.activeRoom.place(b, brick.x, "brick", occupied);
  if (!placed) {
    assert.equal(b.grounded, false);
    return;
  }
  assert.ok(
    Math.abs(a.body.position.x - b.body.position.x) >= a.body.width,
    "stacked raised bodies",
  );
  assert.notEqual(
    `${Math.floor(a.body.position.x / 32)}:${Math.round(a.body.bounds.max.y)}`,
    `${Math.floor(b.body.position.x / 32)}:${Math.round(b.body.bounds.max.y)}`,
  );
});

test("a share of World 1-1 NPCs spawn on brick and question tops", () => {
  const s = game();
  assert.equal(s.npcs.length, T.population);
  assert.ok(
    Math.abs(s.player.body.bounds.max.y - T.groundY) < 2,
    "player still starts on the floor",
  );
  const cells = new Set<string>();
  let bricks = 0,
    floor = 0;
  for (const n of s.npcs) {
    assert.equal(n.areaId, s.level.main);
    assert.equal(overlaps(n.body, s.solids, 0.01).length, 0);
    const support = supportUnder(s, n);
    assert.ok(support, "NPC feet rest on a solid");
    assert.equal(support.headOnly, false);
    const cell = `${Math.floor(n.body.position.x / 32)}:${Math.round(support.bounds.min.y)}`;
    assert.equal(cells.has(cell), false, "two NPCs share a spawn cell");
    cells.add(cell);
    const block = s.obstacles.find((c) => c.body === support);
    if (block?.kind === "brick" && !block.hidden) bricks++;
    else if (Math.abs(support.bounds.min.y - T.groundY) < 4) floor++;
  }
  const brickTops = s.obstacles.filter(
    (c) => c.kind === "brick" && !c.hidden && c.body,
  ).length;
  assert.ok(brickTops >= T.population / 3, "1-1 has brick and question tops");
  assert.ok(
    bricks >= Math.round(T.population * T.elevatedSpawnShare),
    `brick/question spawns ${bricks}`,
  );
  assert.ok(floor > 0, "ground spawns remain");
  assert.ok(bricks < T.population, "not every NPC starts on a brick");
});

test("place lid sits on a moving platform above the floor", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-3");
  s.reset();
  s.marioReturn = 1e6;
  const platform = s.activeRoom.platforms.find((p) => {
    const x = p.body.position.x;
    return s.solids.some(
      (solid) =>
        solid !== p.body &&
        !solid.headOnly &&
        x > solid.bounds.min.x &&
        x < solid.bounds.max.x &&
        solid.bounds.min.y > p.body.bounds.min.y + 20 &&
        Math.abs(solid.bounds.min.y - T.groundY) < 8,
    );
  });
  assert.ok(platform, "1-3 has a platform over the floor");
  const n = s.npcs[0];
  s.activeRoom.place(n, platform.body.position.x, "low");
  const lowY = n.body.position.y;
  assert.equal(s.activeRoom.place(n, platform.body.position.x, "lid"), true);
  assert.ok(n.body.position.y < lowY - 20, "lid spawn sits above the floor");
  assert.ok(Math.abs(n.body.bounds.max.y - platform.body.bounds.min.y) < 1);
  assert.equal(overlaps(n.body, s.solids, 0.01).length, 0);
});

test("a pipe-heavy stage spawns NPCs on pipe lids", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "8-4");
  s.reset();
  s.marioReturn = 1e6;
  let onLid = 0;
  for (const n of s.npcs) {
    if (n.kind === "fish") continue;
    const support = supportUnder(s, n);
    assert.ok(support, "NPC feet rest on a solid");
    if (
      s.obstacles.some((c) => c.body === support && c.kind === "pipe") ||
      s.activeRoom.platforms.some((p) => p.body === support)
    )
      onLid++;
  }
  assert.ok(
    onLid >= Math.round(T.population * T.elevatedSpawnShare),
    `pipe-lid spawns ${onLid}`,
  );
});

test("NPC spawns do not overlap each other", () => {
  for (const [index, level] of CAMPAIGN.entries()) {
    const s = new Simulation(() => 0.5);
    s.levelIndex = index;
    s.reset();
    for (let i = 0; i < s.npcs.length; i++) {
      for (let j = i + 1; j < s.npcs.length; j++) {
        const a = s.npcs[i].body.bounds,
          b = s.npcs[j].body.bounds;
        assert.equal(
          a.max.x > b.min.x &&
            b.max.x > a.min.x &&
            a.max.y > b.min.y &&
            b.max.y > a.min.y,
          false,
          `${level.id} NPCs ${i} and ${j} overlap`,
        );
      }
    }
  }
});

test("World 1-1 has its original gaps, six pipe heights, block rows, and end stairs", () => {
  const s = game();
  assert.deepEqual(GAPS, [
    [2208, 2272],
    [2752, 2848],
    [4896, 4960],
  ]);
  assert.deepEqual(
    s.obstacles.filter((c) => c.kind === "pipe").map((c) => [c.x, c.height]),
    [
      [928, 64],
      [1248, 96],
      [1504, 128],
      [1856, 128],
      [5248, 64],
      [5760, 64],
    ],
  );
  assert.equal(
    s.obstacles.filter((c) => c.kind === "brick" && !c.question).length,
    30,
  );
  assert.equal(s.obstacles.filter((c) => c.question && !c.hidden).length, 13);
  assert.equal(s.obstacles.filter((c) => c.hidden).length, 1);
  assert.ok(s.obstacles.some((c) => c.question && c.x === 528 && c.y === 318));
  assert.ok(
    s.solids.some((b) => b.bounds.min.x === 6016 && b.bounds.min.y === 174),
  );
  assert.equal(GOAL_X, 6544);
});

function crowdGame(count: number) {
  const s = game();
  for (let i = 0; i < count; i++) {
    const n = s.npcs[i];
    n.warned = true;
    n.state = "run";
    Body.setPosition(n.body, { x: 340 + i * 30, y: 415 });
  }
  return s;
}

test("larger running crowds build more capped aggression, which falls when they stop", () => {
  const quiet = crowdGame(0),
    small = crowdGame(2),
    large = crowdGame(9);
  for (const s of [quiet, small, large]) tick(s, 0.7);
  assert.equal(quiet.marioPressure, 0);
  assert.ok(
    small.marioPressure > 0 && small.marioPressure < large.marioPressure,
  );
  assert.equal(large.marioPressure, 1);
  for (const n of large.npcs) n.warned = false;
  tick(large, 0.5);
  assert.ok(large.marioPressure > 0 && large.marioPressure < 1);
  tick(large, 2);
  assert.equal(large.marioPressure, 0);
  large.reset();
  assert.equal(large.marioCrowd, 0);
  assert.equal(large.marioPressure, 0);
});

test("offscreen, idle, saved, and dead NPCs do not add crowd pressure", () => {
  const s = crowdGame(6);
  s.cameraX = 1800;
  tick(s, 0.5);
  assert.equal(s.marioCrowd, 0);
  s.cameraX = 0;
  s.npcs[0].warned = false;
  s.npcs[1].state = "idle";
  s.npcs[1].wait = 5;
  s.save(s.npcs[2]);
  s.kill(s.npcs[3]);
  for (const n of s.npcs.slice(4)) n.warned = false;
  tick(s, 0.2);
  assert.equal(s.marioCrowd, 0);
});

test("running crowds attract Mario sooner and accelerate attack cooldowns", () => {
  const quiet = crowdGame(0),
    loud = crowdGame(6);
  tick(loud, 0.7);
  for (const s of [quiet, loud]) {
    s.marioActive = true;
    s.marioPause = 10;
    s.marioLook = 10;
    Body.setPosition(s.mario.body, { x: 200, y: 411 });
    s.marioJumpWait = 2;
  }
  tick(quiet, 0.2);
  tick(loud, 0.2);
  assert.ok(loud.marioJumpWait < quiet.marioJumpWait);
  for (const s of [quiet, loud]) {
    s.marioActive = false;
    s.marioReturn = 3;
  }
  tick(quiet, 0.3);
  tick(loud, 0.3);
  assert.ok(loud.marioReturn < quiet.marioReturn);
});

test("a loud crowd draws Mario from beyond normal sight range", () => {
  for (const pressure of [0, 1]) {
    const s = game();
    at(s, 4300);
    for (let i = 0; i < s.npcs.length; i++) {
      const n = s.npcs[i];
      n.warned = i < 6;
      n.fear = 0;
      n.state = i < 6 ? "run" : "idle";
      Body.setPosition(n.body, {
        x: i < 6 ? 630 + i * 20 : 2000,
        y: 415,
      });
    }
    s.marioPressure = pressure;
    s.marioActive = true;
    Body.setFrozen(s.mario.body, false);
    Body.setPosition(s.mario.body, { x: 0, y: 411 });
    tick(s, dt);
    assert.equal(s.marioTarget, pressure ? s.npcs[0].id : null);
  }
});

test("unwarned NPCs patrol locally, pause, and never count as warned or saved", () => {
  const s = game();
  const n = s.npcs[0];
  Body.setPosition(n.body, { x: 400, y: 415 });
  n.homeX = 400;
  const start = n.body.position.x;
  tick(s, 0.8);
  assert.ok(Math.abs(n.body.position.x - start) > 10);
  let paused = false,
    left = false,
    right = false;
  for (let i = 0; i < 60 * 20; i++) {
    tick(s, dt);
    paused ||= !n.idleWalking;
    left ||= n.body.velocity.x < 0;
    right ||= n.body.velocity.x > 0;
    assert.ok(Math.abs(n.body.position.x - start) <= T.idleRadius + 2);
  }
  assert.ok(paused && left && right);
  assert.equal(s.warned, 0);
  assert.equal(s.saved, 0);
  assert.ok(s.npcs.every((a) => a.alive));
});

test("idle patrol turns at gaps and pipes, and a warning starts escape", () => {
  const s = game();
  const [a, b] = s.npcs;
  const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
  a.homeX = GAPS[0][0] - 25;
  b.homeX = pipe.x - T.pipeWidth / 2 - 25;
  for (const n of [a, b]) Body.setPosition(n.body, { x: n.homeX, y: 415 });
  tick(s, 12);
  assert.ok(a.alive && b.alive);
  assert.ok(a.body.position.x < GAPS[0][0] - 12);
  assert.ok(b.body.position.x < pipe.x - T.pipeWidth / 2 - 12);
  at(s, b.body.position.x);
  const warningX = b.body.position.x;
  s.warn();
  tick(s, 2.2);
  assert.ok(b.warned);
  assert.equal(b.state, "run");
  assert.ok(
    b.body.position.x > warningX + 110,
    "escape progresses beyond idle patrol, including the jump past the pipe",
  );
});

test("warnings count nearby groups once, never rescue them", () => {
  const s = game();
  for (const n of s.npcs.slice(0, 2))
    Body.setPosition(n.body, { x: 130, y: 415 });
  s.warn();
  assert.equal(s.warned, 2);
  assert.equal(s.saved, 0);
  s.cooldown = 0;
  s.warn();
  assert.equal(s.warned, 2);
  s.kill(s.npcs[0]);
  assert.equal(s.warned, 2);
  assert.equal(s.saved, 0);
  assert.equal(s.npcs.length, T.population);
});

test("an unwarned NPC in range is warned the same step with no cooldown delay", () => {
  const s = game();
  const a = s.npcs[0];
  const b = s.npcs[1];
  parkNpcs(s, [a, b]);
  a.idleWalking = false;
  a.wait = 99;
  b.idleWalking = false;
  b.wait = 99;
  Body.setPosition(a.body, { x: 200, y: 415 });
  Body.setPosition(b.body, { x: 200 + T.warningRange + 40, y: 415 });
  Body.setVelocity(a.body, { x: 0, y: 0 });
  Body.setVelocity(b.body, { x: 0, y: 0 });
  at(s, a.body.position.x);
  tick(s, dt);
  assert.equal(a.warned, true);
  assert.equal(b.warned, false);
  assert.equal(s.warned, 1);
  assert.ok(s.cooldown > dt);
  at(s, b.body.position.x);
  tick(s, dt);
  assert.equal(b.warned, true);
  assert.equal(s.warned, 2);
});

test("warning cooldown and distance limit", () => {
  const s = game();
  const a = s.npcs[0];
  const b = s.npcs[1];
  parkNpcs(s, [a, b]);
  a.idleWalking = false;
  a.wait = 99;
  b.idleWalking = false;
  b.wait = 99;
  Body.setPosition(a.body, { x: 200, y: 415 });
  Body.setPosition(b.body, { x: 200 + T.warningRange + 40, y: 415 });
  Body.setVelocity(a.body, { x: 0, y: 0 });
  Body.setVelocity(b.body, { x: 0, y: 0 });
  assert.equal(T.warningRange, 96);
  at(s, 40);
  s.warn();
  assert.equal(s.warned, 0);
  at(s, a.body.position.x);
  s.warn();
  assert.equal(a.warned, true);
  assert.equal(b.warned, false);
  assert.equal(s.warned, 1);
  assert.ok(s.cooldown > 0);
  at(s, b.body.position.x);
  s.warn();
  assert.equal(b.warned, true);
  assert.equal(s.warned, 2);
  at(
    s,
    a.body.position.x -
      T.warningRange -
      (s.player.body.width + a.body.width) / 2 -
      12,
  );
  tick(s, dt);
  assert.equal(s.warned, 2);
});

test("walking and jumping keep nearby NPCs alive", () => {
  const s = game();
  at(s, 100);
  tick(s, 0.2, {});
  tick(s, dt, { right: true });
  assert.equal(s.player.state, "idle");
  tick(s, 1);
  tick(s, dt, { jump: true });
  assert.ok(s.player.body.velocity.y < 0);
  assert.ok(s.npcs.every((n) => n.alive));
});

test("NPCs complete the full route offscreen, including both gaps", () => {
  const s = game();
  for (const n of s.npcs) {
    n.warned = true;
    n.speed = 2.1;
  }
  tick(s, 90);
  assert.equal(
    s.saved,
    T.population,
    JSON.stringify(
      s.npcs.map((n) => ({
        x: n.body.position.x,
        y: n.body.position.y,
        alive: n.alive,
        state: n.state,
      })),
    ),
  );
});

test("the castle door is open with no save quota", () => {
  const s = game();
  at(s, GOAL_X + 5);
  tick(s, dt);
  assert.equal(s.mode, "finishing");
  assert.equal(s.saved, 0);
  assert.equal(s.player.saved, true);
  s.kill(s.player);
  assert.equal(s.player.alive, true);
  Body.setPosition(s.npcs[0].body, { x: GOAL_X + 2, y: 415 });
  tick(s, dt);
  assert.equal(s.saved, 1);
});

test("castle tally still counts saves after the player vanishes", () => {
  const s = game();
  s.timeLeft = 0;
  at(s, GOAL_X + 5);
  tick(s, dt);
  assert.equal(s.mode, "finishing");
  assert.equal(s.tallyPhase, "warned");
  Body.setPosition(s.npcs[0].body, { x: GOAL_X + 3, y: 415 });
  tick(s, dt);
  assert.equal(s.saved, 1);
  s.finish();
  assert.equal(s.mode, "finishing");
});

test("first player past the flagpole raises a mushroom flag", () => {
  const s = game();
  const pole = poleOf(s);
  assert.equal(pole.claim, null);
  assert.equal(pole.raise, 0);
  Body.setPosition(s.player.body, { x: pole.x - 40, y: pole.top });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(pole.claim, null);
  Body.setPosition(s.player.body, { x: pole.x, y: pole.top });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(pole.claim, "goomba");
  Body.setPosition(s.player.body, { x: pole.x + 80, y: pole.top });
  tick(s, 1);
  assert.equal(pole.claim, "goomba");
  assert.equal(flagTextureKey(pole.claim), "mushroomFlag");
  assert.equal(pole.raise, 1);
});

test("first Mario past the flagpole raises a Mario flag", () => {
  const s = game();
  const pole = poleOf(s);
  s.cameraX = pole.x - 400;
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: pole.x - 40, y: pole.top });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(pole.claim, null);
  Body.setPosition(s.mario.body, { x: pole.x, y: pole.top });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(pole.claim, "mario");
  assert.equal(flagTextureKey(pole.claim), "marioFlag");
  Body.setPosition(s.player.body, { x: pole.x, y: pole.top });
  tick(s, dt);
  assert.equal(pole.claim, "mario");
  assert.equal(flagTextureKey(pole.claim), "marioFlag");
  assert.ok(pole.raise > 0);
});

test("Mario crossing the flagpole first in the same step raises his flag", () => {
  const s = game();
  const pole = poleOf(s);
  s.cameraX = pole.x - 400;
  s.marioActive = true;
  s.marioIgnore = 1e6;
  s.marioChase = 0;
  s.marioLook = 1e6;
  s.marioPause = 1e6;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.player.body, { x: pole.x - 80, y: pole.top });
  Body.setPosition(s.mario.body, { x: pole.x - 20, y: pole.top });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(pole.claim, null);
  Body.setPosition(s.player.body, { x: pole.x + 40, y: pole.top });
  Body.setPosition(s.mario.body, { x: pole.x + 40, y: pole.top });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(pole.claim, "mario");
});

test("NPCs passing the flagpole do not claim it", () => {
  const s = game();
  const pole = poleOf(s);
  const n = s.npcs[0];
  n.warned = true;
  Body.setPosition(n.body, { x: pole.x, y: pole.top });
  Body.setVelocity(n.body, { x: T.walkSpeed, y: 0 });
  tick(s, 0.5);
  assert.equal(pole.claim, null);
  assert.equal(pole.raise, 0);
  Body.setPosition(s.player.body, { x: pole.x, y: pole.top });
  tick(s, dt);
  assert.equal(pole.claim, "goomba");
});

test("flagpole shaft adds no collision and does not change velocity", () => {
  const poleX = poleOf(game()).x;
  const sample = (x: number) => {
    const s = game();
    Body.setPosition(s.player.body, { x, y: poleOf(s).top });
    Body.setVelocity(s.player.body, { x: T.walkSpeed, y: 1 });
    tick(s, dt, { right: true });
    return {
      vx: s.player.body.velocity.x,
      vy: s.player.body.velocity.y,
      x: s.player.body.position.x,
    };
  };
  const clear = sample(200);
  const through = sample(poleX);
  assert.equal(through.vx, T.walkSpeed);
  assert.equal(through.vx, clear.vx);
  assert.equal(through.vy, clear.vy);
  assert.ok(through.x > poleX);
  const s = game();
  const pole = poleOf(s);
  const shaftHits = s.activeRoom.solids.filter(
    (solid) =>
      !solid.headOnly &&
      solid.bounds.min.x < pole.x + 8 &&
      solid.bounds.max.x > pole.x - 8 &&
      solid.bounds.min.y < pole.bottom &&
      solid.bounds.max.y > pole.top,
  );
  assert.equal(shaftHits.length, 0);
});

test("claiming the flagpole still leaves the castle door as the goal", () => {
  const s = game();
  const pole = poleOf(s);
  Body.setPosition(s.player.body, { x: pole.x, y: pole.top });
  tick(s, dt);
  assert.equal(pole.claim, "goomba");
  assert.equal(s.mode, "playing");
  at(s, GOAL_X + 5);
  tick(s, dt);
  assert.equal(s.mode, "finishing");
  assert.equal(pole.claim, "goomba");
  assert.equal(s.playerClaimedFlag(), true);
});

test("one hit plays the complete death sequence before resetting run state", () => {
  const s = game();
  s.warned = 8;
  s.saved = 3;
  s.kill(s.npcs[0]);
  s.coins = 4;
  s.elapsed = 100;
  s.obstacles[2].broken = true;
  s.fireballs.push({ id: 88, x: 0, y: 0, vx: 1, age: 0 });
  s.kill(s.player);
  assert.equal(s.mode, "dead");
  assert.equal(s.lives, T.startingLives - 1);
  tick(s, T.deathSequenceSeconds + 0.1);
  assert.equal(s.mode, "intro");
  assert.equal(s.warned, 0);
  assert.equal(s.saved, 0);
  assert.equal(s.died(), 0);
  assert.equal(s.coins, 4);
  assert.equal(s.phase, 0);
  assert.equal(s.fireballs.length, 0);
  assert.equal(s.obstacles[2].broken, false);
  assert.equal(s.npcs.filter((n) => n.alive).length, T.population);
  assert.equal(s.bubbleLeft, 0);
  assert.equal(s.player.pipeWait ?? 0, 0);
  assert.equal(s.playerDeath, null);
  tick(s, T.introSeconds + 0.1);
  assert.equal(s.mode, "playing");
  assert.equal(s.lives, T.startingLives - 1);
});

test("player death hops then falls, and pit deaths skip the hop", () => {
  const s = game();
  const startY = s.player.body.position.y;
  s.kill(s.player);
  assert.ok(s.events.includes("death"));
  assert.ok(s.playerDeath);
  tick(s, T.deathHopDelay);
  assert.equal(s.playerDeath?.y, startY);
  tick(s, 0.2);
  assert.ok(s.playerDeath && s.playerDeath.y < startY);
  const peak = s.playerDeath.y;
  tick(s, 0.8);
  assert.ok(s.playerDeath && s.playerDeath.y > peak);
  const pit = game();
  Body.setPosition(pit.player.body, {
    x: pit.player.body.position.x,
    y: 641,
  });
  pit.kill(pit.player, false);
  assert.equal(pit.mode, "dead");
  assert.ok(pit.playerDeath);
  const pitY = pit.playerDeath.y;
  assert.ok(pitY > 640);
  tick(pit, 0.3);
  assert.ok(pit.playerDeath && pit.playerDeath.y >= pitY);
});

function followCamera(s: Simulation) {
  const room = s.activeRoom;
  const width = s.viewWidth;
  s.cameraX = Math.max(
    room.offset,
    Math.min(
      room.offset + room.data.width * 32 - width,
      s.player.body.position.x - width * 0.36,
    ),
  );
}

function world12Main() {
  const s = game();
  s.nextLevel();
  s.reset("playing");
  assert.equal(s.level.id, "1-2");
  assert.equal(s.player.areaId, "40");
  s.cameraX = s.activeRoom.offset;
  return s;
}

function hunterSpawnedSafe(s: Simulation) {
  if (!s.marioActive) return true;
  const room = s.activeRoom;
  const col0 = room.offset;
  const inWall =
    s.mario.body.bounds.max.x > col0 &&
    s.mario.body.bounds.min.x < col0 + 32 &&
    s.mario.body.bounds.max.y > MAP_TOP + 64 &&
    s.mario.body.bounds.min.y < T.groundY;
  return (
    !inWall &&
    s.mario.body.bounds.max.x <= s.cameraX &&
    overlaps(s.mario.body, room.solids, 0.01).length === 0
  );
}

test("Mario first appears at three seconds, and later returns keep their delay", () => {
  const s = new Simulation(() => 0.5);
  s.reset();
  s.cameraX = s.activeRoom.offset + 400;
  assert.equal(s.marioActive, false);
  tick(s, 3 - dt);
  assert.equal(s.marioActive, false);
  tick(s, 2 * dt);
  assert.equal(s.marioActive, true);
  Body.setPosition(s.mario.body, { x: s.cameraX - 700, y: 400 });
  tick(s, dt);
  assert.equal(s.marioActive, false);
  tick(s, 3 + dt);
  assert.equal(s.marioActive, false);
});

test("time escalates Mario and returning does not reset it", () => {
  const s = game();
  s.cameraX = s.activeRoom.offset + 400;
  s.elapsed = T.fireballsAt;
  tick(s, dt);
  assert.equal(s.phase, 2);
  s.marioReturn = 0;
  tick(s, dt);
  assert.equal(s.marioActive, true);
  Body.setPosition(s.mario.body, { x: s.cameraX - 700, y: 400 });
  tick(s, dt);
  assert.equal(s.marioActive, false);
  assert.equal(s.phase, 2);
  s.marioReturn = 0;
  tick(s, dt);
  assert.equal(s.phase, 2);
});

test("World 1-2 start does not place hunter Mario in the column-0 brick wall", () => {
  const s = game();
  s.nextLevel();
  tick(s, T.introSeconds + dt);
  finishPipeIntro(s);
  assert.equal(s.player.areaId, "40");
  s.cameraX = s.activeRoom.offset;
  s.marioReturn = 0;
  s.step(dt, emptyInput());
  const col0 = s.activeRoom.offset;
  const inCol0Wall =
    s.mario.body.bounds.max.x > col0 &&
    s.mario.body.bounds.min.x < col0 + 32 &&
    s.mario.body.bounds.max.y > MAP_TOP + 64 &&
    s.mario.body.bounds.min.y < T.groundY;
  assert.equal(inCol0Wall, false);
  if (s.marioActive) {
    assert.ok(
      s.mario.body.bounds.max.x <= s.cameraX,
      "spawn stays fully left of the camera",
    );
    assert.equal(overlaps(s.mario.body, s.activeRoom.solids, 0.01).length, 0);
  } else assert.equal(s.marioActive, false);
  tick(s, T.firstMarioAt);
  assert.equal(s.marioActive, false);
});

test("hunter Mario walks in from off-camera left once 1-2 floor sits left of the camera", () => {
  const s = world12Main();
  s.cameraX = s.activeRoom.offset + 400;
  s.marioReturn = 0;
  s.step(dt, emptyInput());
  assert.equal(s.marioActive, true);
  assert.ok(s.mario.body.bounds.max.x <= s.cameraX);
  assert.ok(s.mario.body.bounds.min.x >= s.activeRoom.offset);
  assert.equal(overlaps(s.mario.body, s.activeRoom.solids, 0.01).length, 0);
});

test("hunter Mario retries later when 1-2 start has no off-camera floor", () => {
  const s = world12Main();
  s.marioReturn = 0;
  tick(s, 1);
  assert.equal(s.marioActive, false);
  s.cameraX = s.activeRoom.offset + 400;
  s.step(dt, emptyInput());
  assert.equal(s.marioActive, true);
  assert.ok(s.mario.body.bounds.max.x <= s.cameraX);
  assert.equal(overlaps(s.mario.body, s.activeRoom.solids, 0.01).length, 0);
});

test("hunter Mario prefers the current 16-tile page left when that floor is off-camera", () => {
  const s = game();
  s.cameraX = 400;
  s.marioReturn = 0;
  s.step(dt, emptyInput());
  assert.equal(s.marioActive, true);
  assert.ok(
    Math.abs(s.mario.body.position.x - 100) < 8,
    `page 0 spawn ${s.mario.body.position.x}`,
  );
  assert.ok(s.mario.body.bounds.max.x <= s.cameraX);
  assert.equal(overlaps(s.mario.body, s.activeRoom.solids, 0.01).length, 0);
  s.marioActive = false;
  Body.setFrozen(s.mario.body, true);
  s.cameraX = 512 + 200;
  s.marioReturn = 0;
  s.step(dt, emptyInput());
  assert.equal(s.marioActive, true);
  assert.ok(
    Math.abs(s.mario.body.position.x - (512 + 100)) < 8,
    `page 1 spawn ${s.mario.body.position.x}`,
  );
  assert.ok(s.mario.body.bounds.max.x <= s.cameraX);
});

test("hunter Mario uses the same off-camera floor rule in water and castle", () => {
  const cases = [
    { from: "1-3", id: "1-4", type: "castle" },
    { from: "2-1", id: "2-2", type: "water" },
  ];
  for (const c of cases) {
    const s = new Simulation(() => 0.5);
    s.levelIndex = CAMPAIGN.findIndex((level) => level.id === c.from);
    s.reset();
    s.marioReturn = 1e6;
    s.nextLevel();
    s.reset("playing");
    assert.equal(s.level.id, c.id);
    assert.equal(s.activeRoom.data.type, c.type);
    assert.equal(s.pipeIntro, false);
    s.cameraX = s.activeRoom.offset;
    s.marioReturn = 0;
    s.step(dt, emptyInput());
    assert.ok(hunterSpawnedSafe(s), c.id);
    s.cameraX = s.activeRoom.offset + 400;
    s.marioReturn = 0;
    s.step(dt, emptyInput());
    assert.equal(s.marioActive, true, c.id);
    assert.ok(s.mario.body.bounds.max.x <= s.cameraX, c.id);
    assert.ok(s.mario.body.position.x >= s.cameraX - 650, c.id);
    assert.equal(
      overlaps(s.mario.body, s.activeRoom.solids, 0.01).length,
      0,
      c.id,
    );
  }
});

test("hunter Mario spawn stays inside the live off-camera band", () => {
  const s = world12Main();
  for (const camera of [5664, 5800, 6100]) {
    s.marioActive = false;
    Body.setFrozen(s.mario.body, true);
    s.cameraX = s.activeRoom.offset + camera;
    s.marioReturn = 0;
    s.step(dt, emptyInput());
    if (s.marioActive) {
      assert.ok(
        s.mario.body.position.x >= s.cameraX - 650,
        `left cull cam ${camera} x ${s.mario.body.position.x}`,
      );
      assert.ok(
        s.mario.body.position.x <= s.activeRoom.goalX + 100,
        `goal cull cam ${camera} x ${s.mario.body.position.x}`,
      );
      assert.ok(s.mario.body.bounds.max.x <= s.cameraX);
      assert.equal(overlaps(s.mario.body, s.activeRoom.solids, 0.01).length, 0);
      s.step(dt, emptyInput());
      assert.equal(s.marioActive, true, `stayed active cam ${camera}`);
    } else {
      assert.ok(
        s.marioReturn <= 0,
        `cull delayed return ${s.marioReturn} cam ${camera}`,
      );
    }
  }
});

test("hunter Mario stands on free floor, not a brick, in World 3-1", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "3-1");
  s.reset("playing");
  s.cameraX = s.activeRoom.offset + 4224;
  s.marioReturn = 0;
  s.step(dt, emptyInput());
  assert.ok(hunterSpawnedSafe(s));
  if (s.marioActive) {
    const feet = s.mario.body.bounds.max.y;
    const onObject = s.activeRoom.obstacles.some(
      (o) =>
        o.body &&
        !o.broken &&
        Math.abs(o.body.bounds.min.y - feet) < 12 &&
        s.mario.body.bounds.max.x > o.body.bounds.min.x &&
        s.mario.body.bounds.min.x < o.body.bounds.max.x,
    );
    assert.equal(onObject, false);
  }
});

test("Mario can attack players beside former cover locations", () => {
  const s = game();
  at(s, s.obstacles[0].x);
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: s.obstacles[0].x + 2, y: 390 });
  Body.setVelocity(s.mario.body, { x: 0, y: 2 });
  tick(s, dt);
  assert.equal(s.player.state, "idle");
});

test("Mario can break a brick without harming a nearby player", () => {
  const s = game();
  const brick = s.obstacles.find((c) => c.kind === "brick" && c.y > 300)!;
  at(s, brick.x + 60);
  tick(s, 0.6);
  s.marioActive = true;
  s.brickTarget = brick.id;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: brick.x, y: brick.y + 38 });
  Body.setVelocity(s.mario.body, { x: 0, y: -6 });
  tick(s, dt, {});
  assert.equal(brick.broken, true);
  assert.equal(s.player.alive, true);
});

test("fireballs kill exposed players beside former cover locations", () => {
  const s = game();
  at(s, s.obstacles[0].x);
  s.fireballs.push({ id: 20, x: s.obstacles[0].x, y: 412, vx: 0, age: 0 });
  tick(s, dt);
  assert.equal(s.player.alive, false);
});

test("late Mario fires visible projectiles when pursuing", () => {
  const s = game();
  s.elapsed = T.fireballsAt;
  s.marioActive = true;
  s.marioStage = 2;
  s.marioTarget = s.player.id;
  s.marioAim = 100;
  s.marioChase = 2;
  s.marioJumpWait = 10;
  s.marioLook = 1;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 0, y: 411 });
  tick(s, dt);
  assert.equal(s.phase, 2);
  assert.equal(s.fireballs.length, 1);
  assert.equal(
    s.events.includes("power"),
    false,
    "elapsed time alone does not play a pickup cue",
  );
  assert.ok(s.events.includes("fire"));
});

test("fear traits produce different running urgency", () => {
  const s = game();
  const [shy, bold] = s.npcs;
  for (const n of [shy, bold]) {
    n.warned = true;
    Body.setPosition(n.body, { x: s.obstacles[0].x + 5, y: 415 });
  }
  shy.fear = 1;
  bold.fear = 0;
  s.marioActive = true;
  s.marioPause = 10;
  s.marioLook = 10;
  Body.setPosition(s.mario.body, { x: 100, y: 410 });
  tick(s, 0.7);
  assert.equal(shy.state, "run");
  assert.equal(bold.state, "run");
  s.marioActive = false;
  s.marioReturn = 100;
  tick(s, dt);
  assert.equal(shy.state, "run");
});

test("a recorded World 1-1 run can win with Mario active and without teleporting", () => {
  const s = new Simulation(() => 0.5);
  s.reset();
  s.marioReturn = 1e6;
  s.timeLeft = 9999;
  for (const n of s.npcs) n.warned = true;
  s.warned = s.npcs.length;
  tick(s, 3);
  s.elapsed = 0;
  s.marioReturn = T.firstMarioAt;
  s.marioActive = false;
  let marioAppeared = false;
  for (const [bits, frames] of routes["1-1"]) {
    for (let frame = 0; frame < frames; frame++) {
      followCamera(s);
      s.step(dt, {
        ...emptyInput(),
        left: !!(bits & 1),
        right: !!(bits & 2),
        jump: !!(bits & 4),
        down: !!(bits & 8),
        run: !!(bits & 16),
      });
      marioAppeared ||= s.marioActive;
      assert.notEqual(s.mode, "dead");
    }
  }
  assert.ok(s.mode === "finishing" || s.mode === "won");
  assert.ok(marioAppeared);
  assert.ok(s.activeRoom.atDoor(s.player));
});

test("side contact is not a stomp", () => {
  const s = game();
  tick(s, 0.1);
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 102, y: 411 });
  tick(s, dt);
  assert.equal(s.player.alive, true);
});

test("air overlap: giant player with higher feet stomps Mario even when not falling", () => {
  const s = game();
  give(s, s.player, "mushroom");
  airOverlap(s, -8);
  assert.ok(s.player.body.bounds.max.y < s.mario.body.bounds.max.y - 0.5);
  assert.ok(s.player.body.velocity.y <= 0);
  tick(s, dt);
  assert.equal(s.player.grounded, false);
  assert.equal(s.mario.grounded, false);
  assert.equal(s.marioStage, 0);
  assert.ok(s.player.alive && s.mario.alive);
  assert.ok(s.player.body.velocity.y < 0);
});

test("air overlap: Mario with higher feet hurts the player even when not falling", () => {
  const s = game();
  airOverlap(s, 8);
  assert.ok(s.mario.body.bounds.max.y < s.player.body.bounds.max.y - 0.5);
  assert.ok(s.mario.body.velocity.y <= 0);
  tick(s, dt);
  assert.equal(s.player.alive, false);
});

test("air overlap: small player with higher feet does not hurt Mario or take damage", () => {
  const s = game();
  airOverlap(s, -8);
  assert.ok(s.player.body.bounds.max.y < s.mario.body.bounds.max.y - 0.5);
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.mario.alive, true);
  assert.equal(s.marioStage, 1);
});

test("air overlap: equal feet is a side and not a stomp", () => {
  const s = game();
  give(s, s.player, "mushroom");
  airOverlap(s, 0);
  assert.ok(
    Math.abs(s.player.body.bounds.max.y - s.mario.body.bounds.max.y) < 0.01,
  );
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.marioStage, 1);
  assert.equal(s.mario.alive, true);
});

test("air overlap: a star still defeats Mario on contact", () => {
  const s = game();
  give(s, s.player, "star");
  airOverlap(s, 0);
  tick(s, dt);
  assert.equal(s.marioActive, false);
  assert.equal(s.mario.alive, false);
  assert.ok(s.player.alive);
});

test("air overlap: a later starred NPC still defeats Mario after equal feet", () => {
  const s = game();
  const n = s.npcs[0];
  give(s, n, "star");
  airOverlap(s, 0);
  Body.setPosition(n.body, { ...s.mario.body.position });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(s.marioActive, false);
  assert.equal(s.mario.alive, false);
  assert.ok(s.player.alive);
  assert.ok(n.alive);
});

test("air overlap: starred Mario still hurts the player", () => {
  const s = game();
  stillMario(s);
  give(s, s.mario, "star");
  airOverlap(s, 8);
  assert.ok(s.mario.body.bounds.max.y < s.player.body.bounds.max.y - 0.5);
  tick(s, dt);
  assert.equal(s.player.alive, false);
  assert.equal(s.mario.alive, true);
  assert.ok(s.mario.starLeft > 0);
});

test("Mario falling-from-above stomp uses current body extents, not a 34px floor", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  stillMario(s);
  s.setMarioStage(0);
  Body.setPosition(n.body, { x: 200, y: 320 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  const reach =
    (n.body.height + s.mario.body.height) / 2 + 2;
  Body.setPosition(s.mario.body, { x: 200, y: n.body.position.y - reach });
  Body.setVelocity(s.mario.body, { x: 0, y: 4 });
  assert.ok(
    Math.abs(n.body.position.y - s.mario.body.position.y) >
      (n.body.height + s.mario.body.height) / 2,
  );
  assert.ok(Math.abs(n.body.position.y - s.mario.body.position.y) < 34);
  tick(s, dt);
  assert.equal(n.alive, true);
  assert.equal(n.scale, 1);
});

test("Mario reacts before pursuing and does not update aim between observations", () => {
  const s = game();
  s.random = () => 0;
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 0, y: 411 });
  tick(s, dt);
  assert.equal(s.marioTarget, s.player.id);
  assert.ok(s.marioReaction >= T.marioReaction);
  assert.equal(s.mario.body.velocity.x, 0);
  const aim = s.marioAim;
  at(s, 200);
  tick(s, 0.2);
  assert.equal(s.marioAim, aim);
});

test("Mario actively acquires visible NPCs even on a high random roll", () => {
  const s = game();
  s.random = () => 0.99;
  at(s, 900);
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 300, y: 411 });
  tick(s, dt);
  assert.ok(s.marioChase > 0);
  assert.equal(s.marioTarget, s.npcs[0].id);
});

function huntReady(s: Simulation, x: number) {
  s.marioActive = true;
  s.marioPause = 0;
  s.marioReaction = 0;
  s.marioLook = 0;
  s.marioJumpWait = 10;
  s.marioChase = 0;
  s.marioIgnore = 0;
  s.marioDecision = 10;
  s.marioTarget = null;
  s.marioHuntItem = false;
  s.brickTarget = null;
  s.marioStun = 0;
  s.marioSeenAgo = 0;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, {
    x,
    y: T.groundY - s.mario.body.height / 2,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  s.mario.facing = 1;
  s.cameraX = Math.max(0, x - 200);
}

function stillNpc(n: Actor, x: number) {
  n.warned = false;
  n.state = "idle";
  n.idleWalking = false;
  n.wait = 99;
  n.homeX = x;
  Body.setPosition(n.body, { x, y: T.groundY - n.body.height / 2 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
}

function looseItem(s: Simulation, kind: ItemKind, x: number) {
  const box = s.obstacles.find(
    (c) => c.question && !c.used && !c.hidden && c.content !== "1-up",
  )!;
  const previous = s.random;
  s.random = () => 0.5;
  s.hitBlock(box, s.player);
  s.random = previous;
  const item = s.items.at(-1)!;
  item.kind = kind;
  item.emerge = 0;
  item.hold = 0;
  item.clip = undefined;
  Body.setFrozen(item.body, false);
  Body.setPosition(item.body, { x, y: T.groundY - 16 });
  Body.setVelocity(item.body, { x: 0, y: 0 });
  return item;
}

test("an elevated unreachable actor does not beat a loose power-up", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  at(s, 2500);
  stillNpc(n, 280);
  Body.setPosition(n.body, { x: 280, y: T.groundY - 200 });
  const item = looseItem(s, "mushroom", 360);
  huntReady(s, 200);
  tick(s, dt);
  assert.equal(s.marioTarget, item.id);
  assert.notEqual(s.marioTarget, n.id);
  assert.equal(s.marioHuntItem, true);
});

test("an easy nearby stomp beats a loose power-up", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  at(s, 2500);
  stillNpc(n, 280);
  const item = looseItem(s, "mushroom", 240);
  huntReady(s, 200);
  tick(s, dt);
  assert.equal(s.marioTarget, n.id);
  assert.equal(s.marioHuntItem, false);
  assert.notEqual(s.marioTarget, item.id);
  assert.ok(s.marioChase > T.marioItemDetourSeconds);
});

test("a fleeing crowd beats a question block, including when Mario is small", () => {
  const s = crowdGame(6);
  s.setMarioStage(0);
  parkNpcs(s, s.npcs.slice(0, 6));
  at(s, 2500);
  const block = s.obstacles.find(
    (c) => c.question && !c.used && !c.hidden && Math.abs(c.x - 528) < 1,
  )!;
  huntReady(s, 200);
  tick(s, dt);
  const crowdIds = new Set(s.npcs.slice(0, 6).map((n) => n.id));
  assert.ok(crowdIds.has(s.marioTarget!), `target ${s.marioTarget}`);
  assert.notEqual(s.brickTarget, block.id);
  assert.equal(s.marioHuntItem, false);
});

test("a visible loose star pulls Mario off a long empty chase", () => {
  const s = game();
  parkNpcs(s, []);
  at(s, 2500);
  const star = looseItem(s, "star", 280);
  huntReady(s, 200);
  s.marioTarget = s.player.id;
  s.marioChase = 5;
  s.marioHuntItem = false;
  s.marioLook = 0;
  tick(s, dt);
  assert.equal(s.marioTarget, star.id);
  assert.equal(s.marioHuntItem, true);
  assert.ok(s.marioChase > 0 && s.marioChase <= T.marioItemDetourSeconds);
  s.marioReaction = 0;
  tick(s, 0.2);
  assert.ok(s.mario.body.velocity.x > 0, "Mario runs toward the star");
});

test("small Mario does not dive a 2x or larger player", () => {
  const s = game();
  parkNpcs(s, []);
  give(s, s.player, "mushroom");
  huntReady(s, 200);
  s.setMarioStage(0);
  Body.setPosition(s.mario.body, {
    x: 200,
    y: T.groundY - s.mario.body.height / 2,
  });
  at(s, 280, T.groundY - s.player.body.height / 2);
  const item = looseItem(s, "flower", 360);
  s.marioLook = 0;
  s.marioTarget = null;
  s.marioChase = 0;
  tick(s, dt);
  assert.notEqual(s.marioTarget, s.player.id);
  assert.equal(s.marioTarget, item.id);

  const dive = game();
  parkNpcs(dive, []);
  give(dive, dive.player, "mushroom");
  huntReady(dive, 200);
  dive.setMarioStage(0);
  Body.setPosition(dive.mario.body, {
    x: 200,
    y: T.groundY - dive.mario.body.height / 2,
  });
  at(dive, 280, T.groundY - dive.player.body.height / 2);
  dive.marioTarget = dive.player.id;
  dive.marioHuntItem = false;
  dive.marioAim = dive.player.body.position.x;
  dive.marioChase = 2;
  dive.marioReaction = 0;
  dive.marioLook = 10;
  dive.marioJumpWait = 0;
  tick(dive, 0.25);
  assert.equal(dive.mario.grounded, true);
  assert.ok(dive.mario.body.velocity.y >= 0);

  const superDive = game();
  parkNpcs(superDive, []);
  give(superDive, superDive.player, "mushroom");
  huntReady(superDive, 200);
  superDive.setMarioStage(1);
  Body.setPosition(superDive.mario.body, {
    x: 200,
    y: T.groundY - superDive.mario.body.height / 2,
  });
  at(superDive, 280, T.groundY - superDive.player.body.height / 2);
  superDive.marioTarget = superDive.player.id;
  superDive.marioHuntItem = false;
  superDive.marioAim = superDive.player.body.position.x;
  superDive.marioChase = 2;
  superDive.marioReaction = 0;
  superDive.marioLook = 10;
  superDive.marioJumpWait = 0;
  tick(superDive, 0.25);
  assert.equal(superDive.mario.grounded, false);
  assert.ok(superDive.mario.body.velocity.y < 0);
});

test("a fleeing crowd beats a loose power-up", () => {
  const s = crowdGame(6);
  parkNpcs(s, s.npcs.slice(0, 6));
  at(s, 2500);
  const item = looseItem(s, "mushroom", 240);
  huntReady(s, 200);
  tick(s, dt);
  const crowdIds = new Set(s.npcs.slice(0, 6).map((n) => n.id));
  assert.ok(crowdIds.has(s.marioTarget!), `target ${s.marioTarget}`);
  assert.notEqual(s.marioTarget, item.id);
  assert.equal(s.marioHuntItem, false);
});

test("a loose power-up beats a question block", () => {
  const s = game();
  parkNpcs(s, []);
  at(s, 2500);
  const item = looseItem(s, "flower", 280);
  huntReady(s, 200);
  s.setMarioStage(0);
  Body.setPosition(s.mario.body, {
    x: 200,
    y: T.groundY - s.mario.body.height / 2,
  });
  tick(s, dt);
  assert.equal(s.marioTarget, item.id);
  assert.equal(s.marioHuntItem, true);
  assert.equal(s.brickTarget, null);
});

test("Super Mario still takes a nearby unused question block", () => {
  const s = game();
  parkNpcs(s, []);
  at(s, 2500);
  const block = s.obstacles.find(
    (c) => c.question && !c.used && !c.hidden && Math.abs(c.x - 528) < 1,
  )!;
  huntReady(s, 450);
  tick(s, dt);
  assert.equal(s.brickTarget, block.id);
  assert.equal(s.marioTarget, null);
  assert.equal(s.marioHuntItem, false);
  assert.ok(s.marioChase > 0 && s.marioChase <= T.marioItemDetourSeconds);
});

test("an item detour expiry does not immediately re-lock the same target", () => {
  const s = game();
  parkNpcs(s, []);
  at(s, 2500);
  const star = looseItem(s, "star", 280);
  huntReady(s, 200);
  s.marioTarget = star.id;
  s.marioHuntItem = true;
  s.marioChase = dt;
  s.marioLook = 0;
  s.marioIgnore = 0;
  tick(s, dt);
  assert.equal(s.marioTarget, null);
  assert.equal(s.marioHuntItem, false);
  assert.ok(s.marioIgnore > 0);
  s.marioLook = 0;
  tick(s, dt);
  assert.notEqual(s.marioTarget, star.id);
  assert.equal(s.marioHuntItem, false);
});

test("Mario drops a used question block instead of jumping at it", () => {
  const s = game();
  parkNpcs(s, []);
  at(s, 2500);
  const block = s.obstacles.find(
    (c) => c.question && !c.used && !c.hidden && Math.abs(c.x - 528) < 1,
  )!;
  block.used = true;
  huntReady(s, 450);
  s.brickTarget = block.id;
  s.marioChase = 2;
  s.marioLook = 10;
  s.marioJumpWait = 0;
  s.marioReaction = 0;
  tick(s, dt);
  assert.equal(s.brickTarget, null);
  assert.equal(s.marioChase, 0);
  assert.equal(s.mario.grounded, true);
});

test("collecting the hunted item clears Mario's item chase", () => {
  const s = game();
  parkNpcs(s, []);
  at(s, 2500);
  const star = looseItem(s, "star", 200);
  huntReady(s, 200);
  s.marioTarget = star.id;
  s.marioHuntItem = true;
  s.marioChase = 2;
  s.marioLook = 10;
  Body.setPosition(star.body, { ...s.mario.body.position });
  tick(s, dt);
  assert.equal(s.items.length, 0);
  assert.equal(s.marioTarget, null);
  assert.equal(s.marioHuntItem, false);
  assert.equal(s.marioChase, 0);
  assert.ok(s.mario.starLeft > 0);
});

test("small Mario walks farther for a question block than Super Mario", () => {
  const far = game();
  parkNpcs(far, []);
  at(far, 2500);
  const block = far.obstacles.find(
    (c) => c.question && !c.used && !c.hidden && Math.abs(c.x - 528) < 1,
  )!;
  huntReady(far, 200);
  far.setMarioStage(1);
  Body.setPosition(far.mario.body, {
    x: 200,
    y: T.groundY - far.mario.body.height / 2,
  });
  tick(far, dt);
  assert.notEqual(far.brickTarget, block.id);

  const small = game();
  parkNpcs(small, []);
  at(small, 2500);
  huntReady(small, 200);
  small.setMarioStage(0);
  Body.setPosition(small.mario.body, {
    x: 200,
    y: T.groundY - small.mario.body.height / 2,
  });
  tick(small, dt);
  assert.equal(small.brickTarget, block.id);
});

test("star and 8x runners do not add to crowd pressure", () => {
  const s = crowdGame(6);
  s.npcs[0].starLeft = T.starSeconds;
  give(s, s.npcs[1], "mushroom8x");
  tick(s, 0.7);
  assert.equal(s.marioCrowd, 4);
});

test("Mario jumps for an elevated hunted flower", () => {
  const s = game();
  parkNpcs(s, []);
  at(s, 2500);
  const flower = looseItem(s, "flower", 260);
  Body.setPosition(flower.body, { x: 260, y: T.groundY - 80 });
  huntReady(s, 220);
  s.marioTarget = flower.id;
  s.marioHuntItem = true;
  s.marioAim = flower.body.position.x;
  s.marioChase = 2;
  s.marioLook = 10;
  s.marioReaction = 0;
  s.marioJumpWait = 0;
  tick(s, dt);
  assert.equal(s.mario.grounded, false);
  assert.ok(s.mario.body.velocity.y < 0);
});

test("Fire Mario still shoots while chasing a loose item", () => {
  const s = game();
  parkNpcs(s, []);
  at(s, 2500);
  s.elapsed = T.fireballsAt;
  const star = looseItem(s, "star", 280);
  huntReady(s, 200);
  s.setMarioStage(2);
  s.marioTarget = star.id;
  s.marioHuntItem = true;
  s.marioAim = star.body.position.x;
  s.marioChase = 2;
  s.marioLook = 10;
  s.marioReaction = 0;
  s.marioJumpWait = 10;
  tick(s, dt);
  assert.equal(s.fireballs.length, 1);
  assert.equal(s.fireballs[0]!.owner, "mario");
});

test("an airborne easy stomp is not stolen by a loose item", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  at(s, 2500);
  stillNpc(n, 280);
  huntReady(s, 200);
  tick(s, dt);
  assert.equal(s.marioTarget, n.id);
  const item = looseItem(s, "mushroom", 240);
  s.marioLook = 0;
  s.mario.grounded = false;
  Body.setVelocity(s.mario.body, { x: 2, y: -6 });
  tick(s, dt);
  assert.equal(s.marioTarget, n.id);
  assert.notEqual(s.marioTarget, item.id);
  assert.equal(s.marioHuntItem, false);
});

test("another collector taking Mario's hunted item clears the detour", () => {
  const s = game();
  parkNpcs(s, []);
  at(s, 2500);
  const mushroom = looseItem(s, "mushroom", 360);
  huntReady(s, 200);
  s.marioTarget = mushroom.id;
  s.marioHuntItem = true;
  s.marioChase = 2;
  s.marioLook = 10;
  Body.setPosition(s.player.body, { ...mushroom.body.position });
  tick(s, dt);
  assert.equal(s.items.length, 0);
  assert.equal(s.marioTarget, null);
  assert.equal(s.marioHuntItem, false);
  assert.equal(s.marioChase, 0);
});

test("Mario does not seek coins or 1-up mushrooms", () => {
  const s = game();
  parkNpcs(s, []);
  at(s, 2500);
  const oneUp = looseItem(s, "oneUp", 280);
  s.activeRoom.coins.push({ x: 260, y: T.groundY - 16, collected: false });
  const mushroom = looseItem(s, "mushroom", 360);
  huntReady(s, 200);
  tick(s, dt);
  assert.equal(s.marioTarget, mushroom.id);
  assert.notEqual(s.marioTarget, oneUp.id);

  const idle = game();
  parkNpcs(idle, []);
  at(idle, 2500);
  const leftover = looseItem(idle, "oneUp", 280);
  huntReady(idle, 400);
  tick(idle, dt);
  assert.notEqual(idle.marioTarget, leftover.id);
  assert.equal(idle.marioHuntItem, false);
  idle.marioReaction = 0;
  tick(idle, 0.2);
  assert.ok(idle.mario.body.velocity.x >= 0);

  const coinsOnly = game();
  parkNpcs(coinsOnly, []);
  at(coinsOnly, 2500);
  coinsOnly.activeRoom.coins.push({
    x: 280,
    y: T.groundY - 16,
    collected: false,
  });
  huntReady(coinsOnly, 200);
  tick(coinsOnly, dt);
  assert.equal(coinsOnly.marioHuntItem, false);
  assert.equal(coinsOnly.marioTarget, null);
});

test("Mario cannot reverse a jump to follow a dodge", () => {
  const s = game();
  s.marioActive = true;
  s.marioChase = 2;
  s.marioTarget = s.player.id;
  s.marioLook = 1;
  s.marioAim = -100;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 0, y: 330 });
  Body.setVelocity(s.mario.body, { x: 2.2, y: -2 });
  tick(s, dt);
  assert.ok(s.mario.body.velocity.x > 2);
});

function isolateSolid(s: Simulation, keep: Body, width = 1600) {
  for (const solid of s.solids) if (solid !== keep) s.physics.remove(solid);
  const floor = s.physics.rectangle(
    keep.position.x,
    T.groundY + 80,
    width,
    160,
    true,
  );
  s.solids = [floor, keep];
  return floor;
}

function huntMario(s: Simulation, x: number, aim: number) {
  for (const npc of s.npcs) s.kill(npc, false);
  s.marioActive = true;
  s.marioPause = 0;
  s.marioReaction = 0;
  s.marioLook = 10;
  s.marioJumpWait = 10;
  s.marioChase = 8;
  s.marioTarget = s.player.id;
  s.marioAim = aim;
  s.marioDecision = 10;
  s.marioIgnore = 0;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, {
    x,
    y: T.groundY - 19 * s.mario.scale,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  s.mario.facing = 1;
}

function groundedStall(s: Simulation, nearX: number, seconds: number) {
  let streak = 0,
    worst = 0;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    s.step(dt, emptyInput());
    const still =
      s.marioActive &&
      s.mario.grounded &&
      Math.abs(s.mario.body.velocity.x) < 0.5 &&
      Math.abs(s.mario.body.position.x - nearX) < 8;
    streak = still ? streak + 1 : 0;
    worst = Math.max(worst, streak);
  }
  return worst;
}

function faceCamp(s: Simulation, nearX: number, seconds: number) {
  let streak = 0,
    near = 0,
    leftAlive = false;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    s.step(dt, emptyInput());
    const atFace = Math.abs(s.mario.body.position.x - nearX) < 8;
    streak = atFace ? streak + 1 : 0;
    near = Math.max(near, streak);
    if (
      s.marioActive &&
      s.mario.alive &&
      Math.abs(s.mario.body.position.x - nearX) > 24
    )
      leftAlive = true;
  }
  return { near, leftAlive, x: s.mario.body.position.x };
}

function tallWall(s: Simulation, height: number, x = 400) {
  for (const solid of [...s.solids]) s.physics.remove(solid);
  const floor = s.physics.rectangle(x, T.groundY + 80, 1600, 160, true);
  const wall = s.physics.rectangle(x, T.groundY - height / 2, 64, height, true);
  s.solids = [floor, wall];
  s.obstacles = [];
  return wall;
}

test("Mario walking right into a pipe does not remain still against it", () => {
  const s = game();
  const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
  isolateSolid(s, pipe.body!);
  s.obstacles = [pipe];
  const aim = pipe.x + 240;
  at(s, aim, T.groundY - 14);
  huntMario(s, pipe.body!.bounds.min.x - 80, aim);
  const contactX = pipe.body!.bounds.min.x - s.mario.body.width / 2;
  const worst = groundedStall(s, contactX, 4);
  assert.ok(
    worst < 60,
    `stalled ${worst} grounded frames at ${JSON.stringify(s.mario.body.position)} vx=${s.mario.body.velocity.x}`,
  );
  assert.ok(
    s.mario.body.position.x > pipe.x,
    `clears the pipe: ${JSON.stringify(s.mario.body.position)}`,
  );
});

test("marioPause does not freeze Mario against a wall he is walking into", () => {
  const s = game();
  const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
  isolateSolid(s, pipe.body!);
  s.obstacles = [pipe];
  const aim = pipe.x + 240;
  at(s, aim, T.groundY - 14);
  for (const npc of s.npcs) s.kill(npc, false);
  s.marioActive = true;
  s.marioPause = 10;
  s.marioReaction = 0;
  s.marioLook = 10;
  s.marioJumpWait = 10;
  s.marioChase = 8;
  s.marioTarget = s.player.id;
  s.marioAim = aim;
  s.marioDecision = 10;
  s.marioIgnore = 0;
  Body.setFrozen(s.mario.body, false);
  const contactX = pipe.body!.bounds.min.x - s.mario.body.width / 2;
  Body.setPosition(s.mario.body, {
    x: contactX - 4,
    y: T.groundY - 19 * s.mario.scale,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  s.mario.facing = 1;
  const worst = groundedStall(s, contactX, 4);
  assert.ok(s.marioPause > 0, `pause expired (${s.marioPause})`);
  assert.ok(
    worst < 60,
    `stalled ${worst} grounded frames at ${JSON.stringify(s.mario.body.position)} vx=${s.mario.body.velocity.x}`,
  );
  const x = s.mario.body.position.x;
  assert.ok(
    x > pipe.x || x < contactX - 20,
    `jump-clears or turns: ${JSON.stringify(s.mario.body.position)}`,
  );
});

test("Mario turns away from a wall that is too tall to jump", () => {
  const s = game();
  const wall = tallWall(s, 400);
  at(s, 800, T.groundY - 14);
  huntMario(s, wall.bounds.min.x - 80, 800);
  const contactX = wall.bounds.min.x - s.mario.body.width / 2;
  const camp = faceCamp(s, contactX, 4);
  assert.ok(
    camp.near < 120,
    `stalled ${camp.near} frames at ${JSON.stringify(s.mario.body.position)} vx=${s.mario.body.velocity.x}`,
  );
  assert.ok(
    s.mario.body.position.x < wall.bounds.min.x - 20,
    `turns from the tall wall: ${JSON.stringify(s.mario.body.position)}`,
  );
});

test("Mario turns from a five-tile wall his jump cannot clear", () => {
  const s = game();
  const wall = tallWall(s, 160);
  at(s, 800, T.groundY - 14);
  huntMario(s, wall.bounds.min.x - 80, 800);
  const contactX = wall.bounds.min.x - s.mario.body.width / 2;
  const camp = faceCamp(s, contactX, 4);
  assert.ok(
    camp.near < 120,
    `bounce-camped ${camp.near} frames at a 160px wall: ${JSON.stringify(s.mario.body.position)}`,
  );
  assert.ok(
    s.mario.body.position.x < wall.bounds.min.x - 20,
    `turns from a 160px wall: ${JSON.stringify(s.mario.body.position)}`,
  );
});

test("Mario star-evade does not camp when the flee path hits a pipe", () => {
  const s = game();
  give(s, s.player, "star");
  const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
  isolateSolid(s, pipe.body!);
  s.obstacles = [pipe];
  for (const npc of s.npcs) s.kill(npc, false);
  at(s, pipe.body!.bounds.min.x - 180, T.groundY - 14);
  s.marioActive = true;
  s.marioPause = 0;
  s.marioReaction = 0;
  s.marioLook = 10;
  s.marioChase = 0;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, {
    x: pipe.body!.bounds.min.x - 40,
    y: T.groundY - 19 * s.mario.scale,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  s.mario.facing = 1;
  const contactX = pipe.body!.bounds.min.x - s.mario.body.width / 2;
  const camp = faceCamp(s, contactX, 4);
  assert.ok(
    camp.near < 120,
    `star-evade camped ${camp.near} frames at ${JSON.stringify(s.mario.body.position)} vx=${s.mario.body.velocity.x}`,
  );
  assert.ok(
    camp.leftAlive,
    `star-evade leaves the pipe while alive: ${JSON.stringify({
      active: s.marioActive,
      alive: s.mario.alive,
      death: s.marioDeath,
      pos: s.mario.body.position,
    })}`,
  );
});

test("Mario star-evade does not camp on a five-tile wall", () => {
  const s = game();
  give(s, s.player, "star");
  const wall = tallWall(s, 160);
  for (const npc of s.npcs) s.kill(npc, false);
  const contactX = wall.bounds.min.x - s.mario.body.width / 2;
  at(s, contactX - 160, T.groundY - 14);
  s.marioActive = true;
  s.marioPause = 0;
  s.marioReaction = 0;
  s.marioLook = 10;
  s.marioChase = 0;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, {
    x: contactX - 8,
    y: T.groundY - 19 * s.mario.scale,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  s.mario.facing = 1;
  const camp = faceCamp(s, contactX, 4);
  assert.ok(
    camp.near < 120,
    `star-evade camped ${camp.near} frames at a 160px wall: ${JSON.stringify(s.mario.body.position)}`,
  );
  assert.ok(
    camp.leftAlive,
    `star-evade leaves a 160px wall while alive: ${JSON.stringify({
      active: s.marioActive,
      alive: s.mario.alive,
      death: s.marioDeath,
      pos: s.mario.body.position,
    })}`,
  );
});

test("returning Mario does not keep a leftover wall-jump velocity", () => {
  const s = game();
  const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
  isolateSolid(s, pipe.body!);
  s.obstacles = [pipe];
  const aim = pipe.x + 240;
  at(s, aim, T.groundY - 14);
  huntMario(s, pipe.body!.bounds.min.x - 80, aim);
  let leftover: number | undefined;
  for (let i = 0; i < 3 * 60; i++) {
    s.step(dt, emptyInput());
    if (!s.mario.grounded && s.mario.navVx !== undefined) {
      leftover = s.mario.navVx;
      break;
    }
  }
  assert.ok(
    leftover !== undefined && Math.abs(leftover) > 1,
    `wall jump never set navVx: grounded=${s.mario.grounded} navVx=${s.mario.navVx}`,
  );
  Body.setPosition(s.mario.body, {
    x: s.cameraX - 700,
    y: s.mario.body.position.y,
  });
  s.step(dt, emptyInput());
  assert.equal(s.marioActive, false);
  assert.equal(s.mario.navVx, undefined);
  s.cameraX = Math.max(s.cameraX, pipe.x);
  let returned = false;
  for (let i = 0; i < 5 * 60; i++) {
    s.step(dt, emptyInput());
    if (s.marioActive) {
      returned = true;
      break;
    }
  }
  assert.ok(returned && s.mario.alive, "Mario returns");
  assert.equal(s.mario.navVx, undefined);
  assert.ok(
    Math.abs(s.mario.body.velocity.x) < 1,
    `respawn vx ${s.mario.body.velocity.x} leftover was ${leftover}`,
  );
});

test("pursuit continues while the target stays exposed", () => {
  const s = game();
  at(s, 432);
  tick(s, 0.6, {});
  s.marioActive = true;
  s.marioChase = 3;
  s.marioTarget = s.player.id;
  s.marioAim = 300;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 0, y: 411 });
  tick(s, 1.5, {});
  assert.equal(s.marioTarget, s.player.id);
  assert.ok(s.marioChase > 0);
});

test("both player sizes can jump every pipe in both directions at standard height", () => {
  for (const giant of [false, true]) {
    for (const dir of [-1, 1]) {
      for (let pipeIndex = 0; pipeIndex < 6; pipeIndex++) {
        const s = game();
        if (giant) give(s, s.player, "mushroom");
        const pipe = s.obstacles.filter((c) => c.kind === "pipe")[pipeIndex];
        // Isolate the original pipe dimensions on flat ground. The last pipe
        // touches the end stairs, so a ground-height spawn to its right would
        // be inside solid stone. Separate route tests cover those stairs.
        for (const solid of s.solids)
          if (solid !== pipe.body) s.physics.remove(solid);
        const floor = s.physics.rectangle(
          pipe.x,
          T.groundY + 80,
          1200,
          160,
          true,
        );
        s.solids = [floor, pipe.body!];
        s.obstacles = [pipe];
        for (const npc of s.npcs) s.kill(npc, false);
        at(s, pipe.x - dir * 100, T.groundY - 14 * s.player.scale);
        tick(s, 1, { right: dir === 1, left: dir === -1 });
        assert.ok(
          (pipe.x - s.player.body.position.x) * dir > T.pipeWidth / 2,
          JSON.stringify({
            pipeIndex,
            dir,
            giant,
            position: s.player.body.position,
            velocity: s.player.body.velocity,
            mode: s.mode,
          }),
        );
        tick(s, 0.9, { right: dir === 1, left: dir === -1, jump: true });
        tick(s, 0.7, { right: dir === 1, left: dir === -1 });
        assert.ok(
          (s.player.body.position.x - pipe.x) * dir > T.pipeWidth / 2,
          JSON.stringify({
            pipeIndex,
            dir,
            giant,
            position: s.player.body.position,
            velocity: s.player.body.velocity,
            mode: s.mode,
          }),
        );
      }
    }
  }
});

function ridePipe(s: Simulation, hold: Partial<Input>, destId: string) {
  const start = s.activeRoom.data.id;
  s.step(dt, { ...emptyInput(), ...hold });
  assert.equal(
    s.activeRoom.data.id,
    start,
    "pipe travel is not a same-frame teleport",
  );
  assert.ok(s.player.pipeTravel);
  let frames = 1;
  while (s.activeRoom.data.id === start && frames++ < 180)
    s.step(dt, { ...emptyInput(), ...hold });
  assert.equal(s.activeRoom.data.id, destId);
  while (s.player.pipeTravel && frames++ < 360) s.step(dt, emptyInput());
  assert.equal(s.player.pipeTravel, undefined);
}

test("down-pipe travel slides in, hides, then falls into area 42 from the ceiling", () => {
  const s = game();
  const entry = s.activeRoom.data.pipes.find((p) => p.direction === "down")!;
  assert.equal(entry.column, 57);
  const mouth = MAP_TOP + entry.row * 32;
  at(s, (entry.column + entry.width / 2) * 32, mouth - 14);
  s.step(dt, { ...emptyInput(), down: true });
  assert.equal(s.activeRoom.data.id, "25");
  assert.equal(s.player.pipeTravel?.phase, "enter");
  assert.ok(s.events.includes("pipe"));
  const x = s.player.body.position.x;
  const startY = s.player.body.position.y;
  s.step(dt, { ...emptyInput(), right: true, jump: true, fire: true });
  assert.equal(s.player.body.position.x, x);
  assert.ok(s.player.body.position.y > startY);
  assert.equal(s.activeRoom.data.id, "25");
  const spriteHeight = 32 * s.player.scale;
  for (let i = 0; i < Math.floor(s.player.body.height / T.pipeSpeed); i++) {
    s.step(dt, { ...emptyInput(), down: true });
    assert.equal(
      s.activeRoom.data.id,
      "25",
      "collision height is not enough to hide the sprite",
    );
  }
  let deepest = startY,
    hideFrames = 0;
  while (s.activeRoom.data.id === "25" && hideFrames++ < 180) {
    deepest = Math.max(deepest, s.player.body.position.y);
    s.step(dt, { ...emptyInput(), down: true });
  }
  assert.ok(
    deepest - startY >= spriteHeight - T.pipeSpeed,
    "the traveler hides in the pipe before the area changes",
  );
  assert.equal(s.activeRoom.data.id, "42");
  assert.equal(s.player.pipeTravel, undefined);
  const exit = s.activeRoom.data.pipes[0];
  const destLeft = s.activeRoom.offset + exit.column * 32;
  assert.ok(
    s.player.body.position.x < destLeft - 80,
    "ceiling drop is not the column 13 side exit",
  );
  assert.equal(s.player.grounded, false);
  assert.ok(s.player.body.position.y < MAP_TOP + 4 * 32);
  assert.ok((s.player.pipeWait ?? 0) > 0);
  for (let i = 0; i < 180 && !s.player.grounded; i++) s.step(dt, emptyInput());
  assert.equal(s.player.grounded, true);
  assert.ok(s.player.body.position.y > MAP_TOP + 10 * 32);
});

test("1-2 bonus pipe falls through the two-tile shaft, not onto the roof", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-2");
  s.reset();
  s.marioReturn = 1e6;
  finishPipeIntro(s);
  tick(s, T.pipeCooldown + dt);
  const entry = s.activeRoom.data.pipes.find((p) => p.column === 103)!;
  at(
    s,
    s.activeRoom.offset + (entry.column + entry.width / 2) * 32,
    MAP_TOP + entry.row * 32 - 14,
  );
  ridePipe(s, { down: true }, "42");
  assert.equal(s.player.grounded, false);
  const local = s.player.body.position.x - s.activeRoom.offset;
  const pageX = local - 2 * 512;
  assert.ok(pageX > 32 && pageX < 96, `shaft x ${pageX}`);
  for (let i = 0; i < 180 && !s.player.grounded; i++) s.step(dt, emptyInput());
  assert.equal(s.player.grounded, true);
  assert.ok(s.player.body.position.y > MAP_TOP + 10 * 32);
});

test("a 2x player falls through the 1-2 two-tile shaft instead of the roof", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-2");
  s.reset();
  s.marioReturn = 1e6;
  finishPipeIntro(s);
  tick(s, T.pipeCooldown + dt);
  give(s, s.player, "mushroom");
  const entry = s.activeRoom.data.pipes.find((p) => p.column === 103)!;
  at(
    s,
    s.activeRoom.offset + (entry.column + entry.width / 2) * 32,
    MAP_TOP + entry.row * 32 - 14 * s.player.scale,
  );
  ridePipe(s, { down: true }, "42");
  assert.equal(s.player.grounded, false);
  const pageX = s.player.body.position.x - s.activeRoom.offset - 2 * 512;
  assert.ok(pageX > 32 && pageX < 96, `shaft x ${pageX}`);
  for (let i = 0; i < 180 && !s.player.grounded; i++) s.step(dt, emptyInput());
  assert.equal(s.player.grounded, true);
  assert.ok(s.player.body.position.y > MAP_TOP + 10 * 32);
});

test("NPCs and Mario cannot enter warp-zone pipes", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-2");
  s.reset();
  s.marioReturn = 1e6;
  finishPipeIntro(s);
  tick(s, T.pipeCooldown + dt);
  const pipe = s.activeRoom.data.pipes.find((p) => p.column === 178)!;
  const mouthX = s.activeRoom.offset + (pipe.column + pipe.width / 2) * 32;
  const mouthY = MAP_TOP + pipe.row * 32;
  const n = s.npcs[0];
  n.areaId = s.player.areaId;
  n.warned = true;
  n.state = "run";
  Body.setPosition(n.body, { x: mouthX, y: mouthY - n.body.height / 2 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  s.mario.areaId = s.player.areaId;
  Body.setPosition(s.mario.body, {
    x: mouthX,
    y: mouthY - s.mario.body.height / 2,
  });
  tick(s, 0.2);
  assert.equal(n.pipeTravel, undefined);
  assert.equal(s.mario.pipeTravel, undefined);
  assert.equal(s.level.id, "1-2");
  assert.equal(s.activeRoom.data.id, "40");
});

test("2-1 bonus pipe also falls into area 42 from the ceiling", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "2-1");
  s.reset();
  s.marioReturn = 1e6;
  const entry = s.activeRoom.data.pipes.find((p) => p.column === 103)!;
  at(
    s,
    s.activeRoom.offset + (entry.column + entry.width / 2) * 32,
    MAP_TOP + entry.row * 32 - 14,
  );
  ridePipe(s, { down: true }, "42");
  assert.equal(s.player.grounded, false);
  const exit = s.activeRoom.data.pipes[0];
  assert.ok(
    s.player.body.position.x <
      s.activeRoom.offset + exit.column * 32 - 80,
  );
});

test("a side-pipe rise onto a page with several null pipes uses column page*16+3", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "6-2");
  s.reset();
  s.marioReturn = 1e6;
  const bonus = s.loadRoom("42");
  const pipe = bonus.data.pipes.find((p) => p.column === 141)!;
  s.player.areaId = "42";
  at(
    s,
    bonus.offset + pipe.column * 32 - 12,
    MAP_TOP + pipe.row * 32 + 32,
  );
  ridePipe(s, { right: true }, "23");
  const dest = s.activeRoom.data.pipes.find((p) => p.column === 35)!;
  const center = s.activeRoom.offset + (dest.column + dest.width / 2) * 32;
  assert.ok(Math.abs(s.player.body.position.x - center) < 8);
});

test("8-4 castle down pipe rises from the water area null pipe", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "8-4");
  s.reset();
  s.marioReturn = 1e6;
  const entry = s.activeRoom.data.pipes.find((p) => p.column === 228)!;
  at(
    s,
    s.activeRoom.offset + (entry.column + entry.width / 2) * 32,
    MAP_TOP + entry.row * 32 - 14,
  );
  ridePipe(s, { down: true }, "02");
  const dest = s.activeRoom.data.pipes.find((p) => p.column === 3)!;
  const center = s.activeRoom.offset + (dest.column + dest.width / 2) * 32;
  assert.ok(Math.abs(s.player.body.position.x - center) < 8);
});

test("1-2 warp pipes skip to worlds 4, 3, and 2", () => {
  const cases: [number, string, string][] = [
    [178, "4-1", "22"],
    [182, "3-1", "24"],
    [186, "2-1", "28"],
  ];
  for (const [column, id, area] of cases) {
    const s = new Simulation(() => 0.5);
    s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-2");
    s.reset();
    s.marioReturn = 1e6;
    finishPipeIntro(s);
    tick(s, T.pipeCooldown + dt);
    s.player.flower = true;
    const score = s.score;
    const pipe = s.activeRoom.data.pipes.find((p) => p.column === column)!;
    at(
      s,
      s.activeRoom.offset + (pipe.column + pipe.width / 2) * 32,
      MAP_TOP + pipe.row * 32 - 14,
    );
    s.step(dt, { ...emptyInput(), down: true });
    let frames = 1;
    while (s.player.pipeTravel && frames++ < 360) s.step(dt, emptyInput());
    assert.equal(s.level.id, id);
    assert.equal(s.activeRoom.data.id, area);
    assert.equal(s.mode, "intro");
    assert.equal(s.player.flower, true);
    assert.equal(s.score, score);
    s.physics.clear();
  }
});

test("4-2 warp pipe starts world 5", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "4-2");
  s.reset();
  s.marioReturn = 1e6;
  finishPipeIntro(s);
  tick(s, T.pipeCooldown + dt);
  const pipe = s.activeRoom.data.pipes.find((p) => p.column === 214)!;
  at(
    s,
    s.activeRoom.offset + (pipe.column + pipe.width / 2) * 32,
    MAP_TOP + pipe.row * 32 - 14,
  );
  s.step(dt, { ...emptyInput(), down: true });
  let frames = 1;
  while (s.player.pipeTravel && frames++ < 360) s.step(dt, emptyInput());
  assert.equal(s.level.id, "5-1");
  assert.equal(s.activeRoom.data.id, "2a");
  assert.equal(s.mode, "intro");
});

test("side-pipe travel slides in, then emerges from the destination pipe", () => {
  const s = game();
  const entry = s.activeRoom.data.pipes.find((p) => p.direction === "down")!;
  at(s, (entry.column + entry.width / 2) * 32, MAP_TOP + entry.row * 32 - 14);
  ridePipe(s, { down: true }, "42");
  tick(s, T.pipeCooldown + dt);
  const exit = s.activeRoom.data.pipes[0];
  at(
    s,
    s.activeRoom.offset + exit.column * 32 - 12,
    MAP_TOP + exit.row * 32 + 32,
  );
  ridePipe(s, { right: true }, "25");
  const dest = s.activeRoom.data.pipes.find((p) => p.column === 163)!;
  const center = s.activeRoom.offset + (dest.column + dest.width / 2) * 32;
  assert.ok(Math.abs(s.player.body.position.x - center) < 8);
  assert.ok(
    Math.abs(s.player.body.bounds.max.y - (MAP_TOP + dest.row * 32)) < 2,
  );
});

test("an intro pipe stands at the dest page without a nearby-floor search", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = 1;
  s.reset();
  s.marioReturn = 1e6;
  assert.equal(s.activeRoom.data.id, "29");
  const pipe = s.activeRoom.data.pipes[0];
  at(
    s,
    s.activeRoom.offset + pipe.column * 32 - 12,
    MAP_TOP + pipe.row * 32 + 32,
  );
  const start = s.activeRoom.data.id;
  s.step(dt, { ...emptyInput(), right: true });
  let frames = 1;
  while (s.activeRoom.data.id === start && frames++ < 180)
    s.step(dt, { ...emptyInput(), right: true });
  assert.equal(s.activeRoom.data.id, s.level.main);
  while (s.player.pipeTravel && frames++ < 360) s.step(dt, emptyInput());
  assert.equal(s.player.pipeTravel, undefined);
  assert.ok(s.events.filter((event) => event === "pipe").length >= 2);
  assert.ok(
    Math.abs(s.player.body.position.x - (s.activeRoom.offset + 100)) < 8,
  );
  assert.equal(s.player.grounded, true);
});

test("1-2 after nextLevel from 1-1 goes through 29 without applying input", () => {
  const s = game();
  s.nextLevel();
  assert.equal(s.level.id, "1-2");
  assert.equal(s.mode, "intro");
  assert.equal(s.player.areaId, "29");
  assert.equal(s.pipeIntro, true);
  tick(s, T.introSeconds + dt);
  assert.equal(s.mode, "playing");
  assert.equal(s.player.areaId, "29");
  assert.equal(s.elapsed, 0);
  assert.equal(s.marioActive, false);
  const startX = s.player.body.position.x;
  const lives = s.lives;
  tick(s, 0.25, { left: true, jump: true, down: true, run: true, fire: true });
  assert.ok(s.player.body.position.x > startX);
  assert.equal(s.player.grounded, true);
  assert.equal(s.elapsed, 0);
  assert.equal(s.marioActive, false);
  assert.notEqual(s.mode, "dead");
  let reachedMain = false;
  for (
    let frame = 0;
    frame < 60 * 20 && (s.mode === "intro" || s.pipeIntro);
    frame++
  ) {
    s.step(dt, {
      ...emptyInput(),
      left: true,
      jump: true,
      down: true,
    });
    if (s.player.areaId === "40") {
      reachedMain = true;
      assert.equal(s.elapsed, 0);
      assert.equal(s.marioActive, false);
    }
    assert.notEqual(s.mode, "dead");
  }
  assert.equal(s.pipeIntro, false);
  assert.equal(s.mode, "playing");
  assert.equal(reachedMain, true);
  assert.equal(s.lives, lives);
  assert.equal(s.player.areaId, "40");
  assert.equal(s.player.pipeTravel, undefined);
  assert.equal(s.elapsed, 0);
  assert.notEqual(s.mode, "dead");
  const mainX = s.player.body.position.x;
  tick(s, 0.2, { right: true });
  assert.ok(s.player.body.position.x > mainX);
  assert.ok(s.elapsed > 0);
  s.marioReturn = 0;
  tick(s, dt);
  assert.ok(hunterSpawnedSafe(s));
  assert.equal(s.marioActive, false);
});

test("1-2 death retry skips area 29 and spawns on main 40", () => {
  const s = game();
  s.nextLevel();
  tick(s, T.introSeconds + dt);
  assert.equal(s.player.areaId, "29");
  s.kill(s.player);
  tick(s, T.deathSequenceSeconds + dt);
  assert.equal(s.mode, "intro");
  assert.equal(s.player.areaId, "40");
  assert.equal(s.pipeIntro, false);
  tick(s, T.introSeconds + dt);
  assert.equal(s.mode, "playing");
  assert.equal(s.player.areaId, "40");
  assert.equal(s.pipeIntro, false);
  const x = s.player.body.position.x;
  tick(s, dt, { right: true });
  assert.ok(s.player.body.position.x > x);
  assert.ok(s.elapsed > 0);
  s.reset("intro");
  assert.equal(s.player.areaId, "40");
  assert.equal(s.pipeIntro, false);
});

test("Pause Restart during the 1-2 strip skips to main 40", () => {
  const s = game();
  s.nextLevel();
  tick(s, T.introSeconds + dt);
  assert.equal(s.player.areaId, "29");
  assert.equal(s.pipeIntro, true);
  const lives = s.lives;
  s.reset("intro");
  assert.equal(s.mode, "intro");
  assert.equal(s.player.areaId, "40");
  assert.equal(s.pipeIntro, false);
  assert.equal(s.lives, lives);
  tick(s, T.introSeconds + 2 * dt);
  assert.equal(s.mode, "playing");
  assert.equal(s.player.areaId, "40");
  assert.ok(s.elapsed > 0);
});

test("pipe-intro stages script the shared strip once, then retry on main", () => {
  const cases = [
    { from: "1-1", id: "1-2", strip: "29", main: "40" },
    { from: "2-1", id: "2-2", strip: "29", main: "01" },
    { from: "4-1", id: "4-2", strip: "29", main: "41" },
    { from: "7-1", id: "7-2", strip: "29", main: "01" },
  ];
  for (const c of cases) {
    const s = new Simulation(() => 0.5);
    s.levelIndex = CAMPAIGN.findIndex((level) => level.id === c.from);
    s.reset();
    s.marioReturn = 1e6;
    s.nextLevel();
    assert.equal(s.level.id, c.id);
    tick(s, T.introSeconds + dt);
    assert.equal(s.player.areaId, c.strip, c.id);
    assert.equal(s.pipeIntro, true, c.id);
    assert.equal(s.elapsed, 0, c.id);
    assert.equal(s.marioActive, false, c.id);
    const lives = s.lives;
    finishPipeIntro(s, { left: true, jump: true });
    assert.equal(s.player.areaId, c.main, c.id);
    assert.equal(s.mode, "playing", c.id);
    assert.equal(s.lives, lives, c.id);
    s.kill(s.player);
    tick(s, T.deathSequenceSeconds + dt);
    assert.equal(s.mode, "intro", c.id);
    assert.equal(s.player.areaId, c.main, c.id);
    tick(s, T.introSeconds + 2 * dt);
    assert.equal(s.mode, "playing", c.id);
    assert.equal(s.player.areaId, c.main, c.id);
    assert.equal(s.pipeIntro, false, c.id);
    assert.ok(s.elapsed > 0, c.id);
    s.physics.clear();
  }
});

test("dest-page spawn uses the pipe nearest the dest page, not the first listed", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "6-2");
  s.reset();
  s.marioReturn = 1e6;
  const entry = s.activeRoom.data.pipes.find((p) => p.direction === "down")!;
  at(
    s,
    s.activeRoom.offset + (entry.column + entry.width / 2) * 32,
    MAP_TOP + entry.row * 32 - 14,
  );
  ridePipe(s, { down: true }, "42");
  tick(s, T.pipeCooldown + dt);
  const exit = s.activeRoom.data.pipes.find((p) => p.column === 141)!;
  at(
    s,
    s.activeRoom.offset + exit.column * 32 - 12,
    MAP_TOP + exit.row * 32 + 32,
  );
  ridePipe(s, { right: true }, "23");
  assert.ok(s.player.body.bounds.max.y > MAP_TOP + 10 * 32);
});

function inClip(
  clip: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
) {
  return x >= clip.x && x < clip.x + clip.w && y >= clip.y && y < clip.y + clip.h;
}

function assertLipClip(
  clip: { x: number; y: number; w: number; h: number },
  room: { offset: number },
  pipe: { column: number; row: number; width: number; height: number },
  dir: "down" | "up" | "right" | "left",
  spriteW: number,
  spriteH: number,
) {
  const mouthX = room.offset + pipe.column * 32;
  const mouthY = MAP_TOP + pipe.row * 32;
  const pipeW = pipe.width * 32;
  const pipeH = pipe.height * 32;
  if (dir === "down" || dir === "up") {
    assert.ok(clip.w >= spriteW, "vertical clip is not cropped to pipe width");
    assert.ok(clip.w > pipeW, "vertical clip is wider than the pipe");
    assert.ok(clip.y + clip.h <= mouthY + 1e-6, "vertical clip stops at the lip");
    assert.ok(
      inClip(clip, mouthX + pipeW / 2, mouthY - 4),
      "the part still above the lip is visible",
    );
    assert.ok(
      inClip(clip, mouthX - spriteW / 2, mouthY - 4),
      "overhang above the lip stays visible",
    );
    assert.equal(
      inClip(clip, mouthX + pipeW / 2, mouthY + 4),
      false,
      "the part below the lip is hidden",
    );
    assert.equal(
      inClip(clip, mouthX - spriteW / 2, mouthY + 4),
      false,
      "overhang beside the shaft is hidden once past the lip",
    );
  } else {
    assert.ok(clip.h >= spriteH, "side clip is not cropped to pipe height");
    assert.ok(clip.h > pipeH, "side clip is taller than the pipe");
    assert.ok(clip.x + clip.w <= mouthX + 1e-6, "side clip stops at the mouth");
    assert.ok(
      inClip(clip, mouthX - 4, mouthY + pipeH / 2),
      "the part still outside the mouth is visible",
    );
    assert.ok(
      inClip(clip, mouthX - 4, mouthY - spriteH / 2),
      "overhang outside the mouth stays visible",
    );
    assert.equal(
      inClip(clip, mouthX + 4, mouthY + pipeH / 2),
      false,
      "the part inside the opening is hidden",
    );
    assert.equal(
      inClip(clip, mouthX + 4, mouthY - spriteH / 2),
      false,
      "overhang above the shaft is hidden once inside",
    );
  }
}

function waitPipePhase(s: Simulation, actor: Actor, phase: "enter" | "exit") {
  let frames = 0;
  while (actor.pipeTravel?.phase !== phase && frames++ < 360)
    s.step(dt, emptyInput());
  assert.equal(actor.pipeTravel?.phase, phase);
}

test("3x and 8x pipe clips hide only the part past the lip", () => {
  const down = game();
  give(down, down.player, "mushroom3x");
  const entry = down.activeRoom.data.pipes.find((p) => p.direction === "down")!;
  const spriteW = 32 * down.player.scale;
  const spriteH = 32 * down.player.scale;
  at(
    down,
    (entry.column + entry.width / 2) * 32,
    MAP_TOP + entry.row * 32 - 14 * down.player.scale,
  );
  down.step(dt, { ...emptyInput(), down: true });
  assert.equal(down.player.pipeTravel?.phase, "enter");
  assert.equal(down.player.pipeTravel?.dir, "down");
  assertLipClip(
    down.player.pipeTravel!.clip!,
    down.activeRoom,
    entry,
    "down",
    spriteW,
    spriteH,
  );
  while (down.player.pipeTravel) down.step(dt, emptyInput());
  tick(down, T.pipeCooldown + dt);
  const dest = down.activeRoom.data.pipes[0];
  at(
    down,
    down.activeRoom.offset + dest.column * 32 - 12,
    MAP_TOP + dest.row * 32 + 32,
  );
  down.step(dt, { ...emptyInput(), right: true });
  assert.equal(down.player.pipeTravel?.phase, "enter");
  assert.equal(down.player.pipeTravel?.dir, "right");
  assertLipClip(
    down.player.pipeTravel!.clip!,
    down.activeRoom,
    dest,
    "right",
    spriteW,
    spriteH,
  );
  waitPipePhase(down, down.player, "exit");
  const emerge = down.activeRoom.data.pipes.find((p) => p.column === 163)!;
  assert.equal(down.player.pipeTravel?.dir, "up");
  assertLipClip(
    down.player.pipeTravel!.clip!,
    down.activeRoom,
    emerge,
    "up",
    spriteW,
    spriteH,
  );
  down.physics.clear();

  const npcPipe = goalPipeSim();
  const n = npcPipe.s.npcs[0];
  n.areaId = "40";
  n.warned = true;
  n.state = "run";
  parkNpcs(npcPipe.s, [n]);
  give(npcPipe.s, n, "mushroom3x");
  standOnPipe(n, npcPipe.goalPipe);
  tick(npcPipe.s, 0.15);
  assert.ok(n.pipeTravel);
  assert.equal(n.pipeTravel?.dir, "right");
  const npcSprite = 32 * n.scale;
  assertLipClip(
    n.pipeTravel!.clip!,
    npcPipe.sub,
    npcPipe.sub.data.pipes.find(
      (p) => p.column === npcPipe.sub.data.goal!.column,
    )!,
    "right",
    npcSprite,
    npcSprite,
  );
  waitPipePhase(npcPipe.s, n, "exit");
  assert.ok(n.pipeTravel?.clip);
  assert.ok(n.pipeTravel!.clip!.w > 64 || n.pipeTravel!.clip!.h > 64);
  npcPipe.s.physics.clear();

  const marioPipe = goalPipeSim();
  marioPipe.s.marioActive = true;
  marioPipe.s.mario.areaId = "40";
  stillMario(marioPipe.s);
  marioPipe.s.marioDecision = 0;
  marioPipe.s.marioChase = 0;
  marioPipe.s.marioPause = 0;
  marioPipe.s.marioReaction = 0;
  marioPipe.s.random = () => 0;
  for (const c of marioPipe.s.obstacles) {
    if (c.kind === "pipe" && c !== marioPipe.goalPipe) c.x = -1e6;
  }
  give(marioPipe.s, marioPipe.s.mario, "mushroom8x");
  standOnPipe(marioPipe.s.mario, marioPipe.goalPipe);
  marioPipe.s.cameraX = marioPipe.goalPipe.x - 400;
  tick(marioPipe.s, dt);
  assert.ok(marioPipe.s.mario.pipeTravel);
  const marioClip = marioPipe.s.mario.pipeTravel!.clip!;
  const goalData = marioPipe.sub.data.pipes.find(
    (p) => p.column === marioPipe.sub.data.goal!.column,
  )!;
  assertLipClip(
    marioClip,
    marioPipe.sub,
    goalData,
    "right",
    32 * T.hugeScale,
    64 * T.hugeScale,
  );
  marioPipe.s.physics.clear();

  const huge = goalPipeSim();
  give(huge.s, huge.s.player, "mushroom8x");
  standOnPipe(huge.s.player, huge.goalPipe);
  tick(huge.s, 0.1, { down: true });
  assert.ok(huge.s.player.pipeTravel);
  assertLipClip(
    huge.s.player.pipeTravel!.clip!,
    huge.sub,
    huge.sub.data.pipes.find((p) => p.column === huge.sub.data.goal!.column)!,
    "right",
    32 * T.hugeScale,
    32 * T.hugeScale,
  );
  huge.s.physics.clear();
});

test("Mario cannot stomp a traveler in a pipe", () => {
  const s = game();
  const entry = s.activeRoom.data.pipes.find((p) => p.direction === "down")!;
  at(
    s,
    (entry.column + entry.width / 2) * 32,
    MAP_TOP + entry.row * 32 - 14,
  );
  s.step(dt, { ...emptyInput(), down: true });
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, {
    x: s.player.body.position.x,
    y: s.player.body.position.y - 40,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 3 });
  s.step(dt, emptyInput());
  assert.equal(s.player.alive, true);
  assert.ok(s.player.pipeTravel);
});

test("decorative pipes stay solid when the Pipe control is pressed", () => {
  const s = game();
  const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
  at(s, pipe.x - 100);
  tick(s, 0.2, { right: true });
  assert.equal(s.player.state, "idle");
  tick(s, 1, { right: true });
  assert.equal(overlaps(s.player.body, [pipe.body!]).length, 0);
  assert.ok(
    Math.abs(s.player.body.bounds.max.x - pipe.body!.bounds.min.x) < 0.1,
  );
});

test("every floating brick has a solid top and can be destroyed and restored", () => {
  const s = game();
  const bricks = s.obstacles.filter((c) => c.kind === "brick" && !c.hidden);
  assert.ok(bricks.length > 20);
  for (const c of bricks) {
    at(s, c.x, c.y - 65);
    tick(s, 0.8);
    assert.ok(s.player.grounded, `land on brick ${c.id}`);
    assert.ok(Math.abs(s.player.body.bounds.max.y - c.body!.bounds.min.y) < 2);
  }
  for (const c of bricks) s.breakBrick(c);
  assert.ok(bricks.every((c) => !s.solids.includes(c.body!)));
  s.reset();
  assert.ok(
    s.obstacles
      .filter((c) => c.kind === "brick")
      .every((c) => !c.broken && s.solids.includes(c.body!)),
  );
});

test("Mario breaks ordinary bricks by striking from below, not merely standing nearby", () => {
  const s = game();
  const brick = s.obstacles.find(
    (c) =>
      c.kind === "brick" &&
      c.y > 300 &&
      !s.npcs.some((n) => supportUnder(s, n) === c.body),
  )!;
  at(s, 100);
  s.marioActive = true;
  s.marioLook = 10;
  s.marioDecision = 10;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: brick.x, y: brick.y + 16 + 22 });
  tick(s, dt);
  assert.equal(brick.broken, false);
  Body.setVelocity(s.mario.body, { x: 0, y: -7 });
  tick(s, dt);
  assert.equal(brick.broken, true);
  assert.equal(s.particles.length, T.brickBurst);
  assert.equal(T.brickBurst, 12);
});

test("brick debris does not settle and leaves the playfield", () => {
  const s = game();
  const brick = s.obstacles.find(
    (c) => c.kind === "brick" && !c.question && c.y > 300,
  )!;
  s.breakBrick(brick);
  assert.equal(s.particles.length, T.brickBurst);
  assert.ok(s.particles.every((p) => !p.blood && !p.settled));
  let fellPastGround = false;
  for (let i = 0; i < 300 && s.particles.length; i++) {
    tick(s, dt);
    assert.ok(s.particles.every((p) => !p.settled && !p.blood && p.y < 540));
    if (s.particles.some((p) => p.y > T.groundY)) fellPastGround = true;
  }
  assert.ok(fellPastGround);
  assert.equal(s.particles.length, 0);
});

test("kills emit blood once, stains settle, and all effects clear on restart", () => {
  const s = game();
  const n = s.npcs[0];
  s.kill(n);
  assert.ok(s.particles.length > 32);
  assert.equal(s.particles.length, T.bloodBurst);
  s.kill(n);
  assert.equal(s.particles.length, T.bloodBurst);
  assert.ok(s.particles.every((p) => p.blood));
  assert.ok(
    s.particles.every((p) => p.color === "#bc0018" || p.color === "#ff2030"),
  );
  tick(s, 2);
  assert.ok(s.particles.some((p) => p.settled));
  tick(s, 6);
  assert.equal(s.particles.length, 0);
  s.kill(s.player);
  const y = s.particles[0].y;
  tick(s, 0.1);
  assert.notEqual(s.particles[0].y, y);
  s.reset();
  assert.equal(s.particles.length, 0);
});

test("Mario hunts an NPC, lands a stomp, then acquires another victim", () => {
  const s = game();
  s.activeRoom.place(s.player, 4300);
  for (let i = 2; i < s.npcs.length; i++)
    Body.setPosition(s.npcs[i].body, { x: 4200, y: 415 });
  Body.setPosition(s.npcs[0].body, { x: 220, y: 415 });
  Body.setPosition(s.npcs[1].body, { x: 350, y: 415 });
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 100, y: 411 });
  tick(s, 5);
  assert.equal(
    s.npcs[0].alive,
    false,
    JSON.stringify({
      mario: s.mario.body.position,
      active: s.marioActive,
      target: s.marioTarget,
      npcs: s.npcs.slice(0, 2).map((n) => ({
        position: n.body.position,
        alive: n.alive,
        home: n.homeX,
      })),
    }),
  );
  assert.ok(
    !s.npcs[1].alive ||
      s.npcs[1].shell !== "none" ||
      s.marioTarget === s.npcs[1].id,
  );
  assert.ok(s.particles.some((p) => p.color === "#bc0018"));
});

test("hidden coins, hidden 1-ups, and 1-up bricks keep original contents", () => {
  const s = game();
  const visible = s.obstacles.find(
    (c) => c.question && !c.hidden && c.content !== "1-up",
  )!;
  s.random = () => 0.5;
  s.hitBlock(visible, s.player);
  assert.equal(s.items[0].kind, "mushroom");
  const hidden1up = s.obstacles.find((c) => c.hidden)!;
  assert.equal(hidden1up.content, "1-up");
  s.hitBlock(hidden1up, s.player);
  assert.equal(hidden1up.used, true);
  assert.equal(hidden1up.body!.headOnly, false);
  assert.equal(s.items.at(-1)!.kind, "oneUp");
  const before = s.lives;
  s.collect(s.player, s.items.at(-1)!);
  assert.equal(s.lives, before + 1);
  assert.ok(s.events.includes("oneUp"));
  assert.equal(s.player.scale, 1);

  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "2-1");
  s.reset();
  const hiddenCoin = s.obstacles.find(
    (c) => c.hidden && c.content === "coin",
  )!;
  const coins = s.coins;
  s.hitBlock(hiddenCoin, s.player);
  assert.equal(hiddenCoin.used, true);
  assert.equal(hiddenCoin.body!.headOnly, false);
  assert.equal(s.coins, coins + 1);
  assert.equal(s.items.length, 0);
  assert.equal(s.coinPops.length, 1);
  assert.ok(s.events.includes("coin"));
  s.hitBlock(hiddenCoin, s.player);
  assert.equal(s.coins, coins + 1);

  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "2-1");
  s.reset();
  const marioCoin = s.obstacles.find(
    (c) => c.hidden && c.content === "coin",
  )!;
  s.marioActive = true;
  s.score = 0;
  s.coins = 0;
  const lives = s.lives;
  s.hitBlock(marioCoin, s.mario);
  assert.equal(marioCoin.used, true);
  assert.equal(s.score, 0);
  assert.equal(s.coins, 0);
  assert.equal(s.lives, lives);
  assert.ok(s.events.includes("coin"));

  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-2");
  s.reset();
  const brick = s.obstacles.find((c) => c.content === "1-up" && !c.hidden)!;
  s.player.scale = T.giantScale;
  s.hitBlock(brick, s.player);
  assert.equal(brick.broken, false);
  assert.equal(brick.used, true);
  assert.equal(s.items[0].kind, "oneUp");
});

test("lives, world intro, and game over follow a campaign attempt", () => {
  const s = game();
  assert.equal(s.lives, T.startingLives);
  s.reset("intro");
  assert.equal(s.mode, "intro");
  tick(s, T.introSeconds - 0.05);
  assert.equal(s.mode, "intro");
  assert.equal(s.elapsed, 0);
  tick(s, 0.1);
  assert.equal(s.mode, "playing");

  s.lives = 2;
  s.saved = 4;
  s.nextLevel();
  assert.equal(s.mode, "intro");
  assert.equal(s.level.id, "1-2");
  assert.equal(s.lives, 2);
  assert.equal(s.saved, 0);
  tick(s, T.introSeconds + 0.05);
  assert.equal(s.mode, "playing");

  s.lives = 1;
  s.kill(s.player);
  assert.equal(s.lives, 0);
  assert.equal(s.mode, "dead");
  tick(s, T.deathSequenceSeconds + 0.05);
  assert.equal(s.mode, "gameover");
  assert.ok(s.events.includes("gameover"));
  tick(s, 0.2);
  assert.equal(s.mode, "gameover");
  tick(s, T.gameoverSeconds);
  assert.equal(s.mode, "title");
  assert.equal(s.levelIndex, 0);
  assert.equal(s.lives, T.startingLives);
});

test("mushrooms grow 2x, 3x, or timed 8x; same or smaller score 1000", () => {
  assert.equal(T.hugeSeconds, 15);
  assert.equal(T.starSeconds, 10);
  assert.notEqual(T.hugeSeconds, T.starSeconds);
  assert.ok(1 - T.mushroom3xChance - T.mushroom8xChance > T.mushroom3xChance);
  assert.ok(1 - T.mushroom3xChance - T.mushroom8xChance > T.mushroom8xChance);
  const s = game();
  give(s, s.player, "mushroom");
  assert.equal(s.player.scale, T.mushroomScale);
  assert.equal(s.player.hugeLeft, 0);
  assert.equal(s.score, 0);
  give(s, s.player, "mushroom");
  assert.equal(s.player.scale, T.mushroomScale);
  assert.equal(s.score, 1000);
  give(s, s.player, "mushroom3x");
  assert.equal(s.player.scale, T.giantScale);
  assert.equal(s.score, 1000);
  give(s, s.player, "mushroom8x");
  assert.equal(s.player.scale, T.hugeScale);
  assert.equal(s.player.hugeLeft, T.hugeSeconds);
  assert.equal(s.score, 1000);
  tick(s, 0.2, { right: true });
  assert.equal(s.player.body.velocity.x, T.walkSpeed);
  tick(s, T.hugeSeconds);
  assert.equal(s.player.scale, T.giantScale);
  assert.equal(s.player.hugeLeft, 0);
  give(s, s.player, "mushroom8x");
  tick(s, 0.5);
  const left = s.player.hugeLeft;
  assert.ok(left > 0 && left < T.hugeSeconds);
  s.events.length = 0;
  give(s, s.player, "mushroom");
  assert.equal(s.player.scale, T.hugeScale);
  assert.equal(s.player.hugeLeft, left);
  assert.equal(s.score, 2000);
  assert.ok(s.events.includes("power"));
  assert.equal(s.items.length, 0);
  give(s, s.player, "mushroom3x");
  assert.equal(s.player.scale, T.hugeScale);
  assert.equal(s.player.hugeLeft, left);
  assert.equal(s.score, 3000);
  give(s, s.player, "mushroom8x");
  assert.equal(s.player.scale, T.hugeScale);
  assert.equal(s.player.hugeLeft, left);
  assert.equal(s.score, 4000);
  const n = s.npcs[0];
  give(s, n, "mushroom8x");
  tick(s, 0.3);
  const npcLeft = n.hugeLeft;
  assert.ok(npcLeft > 0 && npcLeft < T.hugeSeconds);
  give(s, n, "mushroom");
  assert.equal(n.scale, T.hugeScale);
  assert.equal(n.hugeLeft, npcLeft);
  assert.equal(s.score, 4000);
  s.marioActive = true;
  s.setMarioStage(1);
  give(s, s.mario, "mushroom");
  assert.equal(s.marioStage, 1);
  assert.equal(s.score, 5000);
  s.setMarioStage(2);
  give(s, s.mario, "mushroom3x");
  assert.equal(s.marioStage, 2);
  assert.equal(s.score, 6000);
});

test("question blocks keep star and flower and roll rarer 3x and 8x mushrooms", () => {
  for (const [first, second, kind] of [
    [0.25, 0, "star"],
    [0.5, 0, "mushroom"],
    [0.5, 0.7, "mushroom3x"],
    [0.5, 0.95, "mushroom8x"],
    [0.99, 0, "flower"],
  ] as const) {
    const s = game();
    const rolls = [first, second];
    let i = 0;
    s.random = () => rolls[Math.min(i++, rolls.length - 1)]!;
    const box = s.obstacles.find(
      (c) => c.question && !c.hidden && c.content !== "1-up",
    )!;
    s.hitBlock(box, s.mario);
    assert.equal(s.items[0].kind, kind);
    assert.equal(box.used, true);
  }
});

test("visible question head-hit and 8x smash share the same prize rule including coin", () => {
  const cases = [
    { roll: 0, prize: "coin" },
    { roll: 0.25, prize: "star" },
    { roll: 0.5, prize: "mushroom" },
    { roll: 0.99, prize: "flower" },
  ] as const;
  for (const { roll, prize } of cases) {
    for (const authored of ["coin", "power-up"] as const) {
      const bump = game();
      const bumpBox = bump.obstacles.find(
        (c) => c.question && !c.hidden && !c.used && c.content === authored,
      )!;
      bump.random = () => roll;
      const bumpCoins = bump.coins;
      bump.hitBlock(bumpBox, bump.player);
      assert.equal(bumpBox.used, true, `head-hit used ${authored} ${roll}`);
      assert.equal(bumpBox.broken, false, `head-hit solid ${authored} ${roll}`);
      if (prize === "coin") {
        assert.equal(bump.items.length, 0, `head-hit coin ${authored}`);
        assert.equal(bump.coins, bumpCoins + 1);
        assert.ok(bump.events.includes("coin"));
        assert.equal(bump.events.includes("appear"), false);
      } else {
        assert.equal(bump.items[0].kind, prize, `head-hit ${authored} ${roll}`);
        assert.ok(bump.events.includes("appear"));
      }

      const smash = game();
      parkNpcs(smash, []);
      give(smash, smash.player, "mushroom8x");
      const smashBox = smash.obstacles.find(
        (c) =>
          c.question &&
          !c.hidden &&
          !c.used &&
          !c.broken &&
          c.content === authored &&
          c.y > 300 &&
          smash.obstacles.every(
            (other) =>
              other === c ||
              other.kind !== "brick" ||
              (!other.question && !other.content) ||
              other.hidden ||
              other.used ||
              other.broken ||
              Math.abs(other.x - c.x) > 200 ||
              Math.abs(other.y - c.y) > 200,
          ),
      )!;
      smash.random = () => roll;
      smash.events.length = 0;
      const smashCoins = smash.coins;
      at(smash, smashBox.x, smashBox.y);
      tick(smash, dt);
      assert.equal(smashBox.broken, true, `smash ${authored} ${roll}`);
      assert.ok(!smash.solids.includes(smashBox.body!));
      if (prize === "coin") {
        assert.equal(
          smash.items.some((item) => item.smash),
          false,
          `smash coin ${authored}`,
        );
        assert.equal(smash.coins, smashCoins + 1);
        assert.ok(smash.events.includes("coin"));
        assert.equal(smash.events.includes("appear"), false);
      } else {
        const item = smash.items.find((entry) => entry.smash);
        assert.ok(item, `smash item ${authored} ${roll}`);
        assert.equal(item.kind, prize);
        assert.equal(item.emerge, 0);
        assert.equal(smash.events.includes("appear"), false);
      }
    }
  }
});

test("Mario 8x uses player size, smash, and timer, then expires to Super", () => {
  const s = game();
  s.marioActive = true;
  parkNpcs(s, []);
  s.setMarioStage(0);
  const brick = s.obstacles.find(
    (c) =>
      c.kind === "brick" &&
      !c.question &&
      !c.hidden &&
      !c.content &&
      c.y > 300,
  )!;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: brick.x, y: T.groundY - 19 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  give(s, s.mario, "mushroom8x");
  assert.equal(s.mario.scale, T.hugeScale);
  assert.equal(s.mario.hugeLeft, T.hugeSeconds);
  assert.equal(s.marioStage, 1);
  assert.equal(s.mario.body.ignoreWalls, true);
  assert.equal(brick.broken, true);
  tick(s, 0.5);
  const left = s.mario.hugeLeft;
  assert.ok(left > 0 && left < T.hugeSeconds);
  const score = s.score;
  give(s, s.mario, "mushroom");
  assert.equal(s.mario.scale, T.hugeScale);
  assert.equal(s.mario.hugeLeft, left);
  assert.equal(s.score, score + 1000);
  give(s, s.mario, "mushroom8x");
  assert.equal(s.mario.hugeLeft, left);
  tick(s, T.hugeSeconds);
  assert.equal(s.mario.scale, 1);
  assert.equal(s.marioStage, 1);
  assert.equal(s.mario.flower, false);
  assert.equal(s.mario.hugeLeft, 0);
  assert.equal(s.mario.body.ignoreWalls, false);

  const fire = game();
  fire.marioActive = true;
  fire.setMarioStage(2);
  give(fire, fire.mario, "mushroom8x");
  assert.equal(fire.mario.scale, T.hugeScale);
  assert.equal(fire.marioStage, 2);
  tick(fire, T.hugeSeconds);
  assert.equal(fire.mario.scale, 1);
  assert.equal(fire.marioStage, 1);
  assert.equal(fire.mario.flower, false);
});

test("natural 8x expiry blinks, plays shrink, and stays damageable", () => {
  const blinkSeen = (s: Simulation, actor: Actor, from: number, to: number) => {
    const shown = new Set<number>();
    while (actor.transformLeft > 0 && shown.size < 2) {
      shown.add(s.displayScale(actor));
      tick(s, dt);
    }
    assert.deepEqual(
      [...shown].sort((a, b) => a - b),
      [to, from].sort((a, b) => a - b),
    );
    assert.ok(actor.transformLeft > 0);
  };

  const player = game();
  parkNpcs(player, []);
  give(player, player.player, "mushroom8x");
  player.events.length = 0;
  tick(player, T.hugeSeconds);
  assert.equal(player.player.scale, T.giantScale);
  assert.equal(player.player.hugeLeft, 0);
  assert.equal(player.player.transformFrom, T.hugeScale);
  assert.ok(player.player.transformLeft > 0);
  assert.ok(player.events.includes("shrink"));
  blinkSeen(player, player.player, T.hugeScale, T.giantScale);
  player.events.length = 0;
  marioStomp(player, player.player);
  tick(player, dt);
  assert.equal(player.player.alive, true);
  assert.equal(player.player.scale, 1);
  assert.ok(player.events.includes("shrink"));

  const npcSim = game();
  const n = npcSim.npcs[0];
  parkNpcs(npcSim, [n]);
  give(npcSim, n, "mushroom8x");
  npcSim.events.length = 0;
  tick(npcSim, T.hugeSeconds);
  assert.equal(n.scale, T.giantScale);
  assert.equal(n.hugeLeft, 0);
  assert.equal(n.transformFrom, T.hugeScale);
  assert.ok(n.transformLeft > 0);
  assert.ok(npcSim.events.includes("shrink"));
  blinkSeen(npcSim, n, T.hugeScale, T.giantScale);
  npcSim.events.length = 0;
  marioStomp(npcSim, n);
  tick(npcSim, dt);
  assert.equal(n.alive, true);
  assert.equal(n.scale, 1);
  assert.ok(npcSim.events.includes("shrink"));

  const mario = game();
  mario.marioActive = true;
  parkNpcs(mario, []);
  stillMario(mario);
  mario.marioPause = T.hugeSeconds + 1;
  mario.marioLook = T.hugeSeconds + 1;
  give(mario, mario.mario, "mushroom8x");
  mario.events.length = 0;
  tick(mario, T.hugeSeconds);
  assert.equal(mario.mario.scale, 1);
  assert.equal(mario.marioStage, 1);
  assert.equal(mario.mario.hugeLeft, 0);
  assert.equal(mario.mario.transformFrom, T.hugeScale);
  assert.ok(mario.mario.transformLeft > 0);
  assert.ok(mario.events.includes("shrink"));
  stillMario(mario);
  blinkSeen(mario, mario.mario, T.hugeScale, 1);
  give(mario, mario.player, "mushroom");
  mario.events.length = 0;
  giantStompMario(mario);
  tick(mario, dt);
  assert.equal(mario.mario.alive, true);
  assert.equal(mario.marioStage, 0);
  assert.ok(mario.events.includes("shrink"));
});

function cellSolid(s: Simulation, column: number, row: number) {
  const room = s.activeRoom;
  const x = room.offset + column * 32 + 16;
  const y = MAP_TOP + row * 32 + 16;
  return s.solids.some(
    (sol) =>
      !sol.headOnly &&
      sol.bounds.min.x < x &&
      sol.bounds.max.x > x &&
      sol.bounds.min.y < y &&
      sol.bounds.max.y > y,
  );
}

test("8x walking smashes bricks, questions, pipes, and walls; items fly out", () => {
  const s = game();
  parkNpcs(s, []);
  const brick = s.obstacles.find(
    (c) =>
      c.kind === "brick" &&
      !c.question &&
      !c.hidden &&
      !c.content &&
      c.y > 300,
  )!;
  const star = s.obstacles.find((c) => c.content === "star")!;
  const question = s.obstacles.find(
    (c) =>
      c.question &&
      !c.used &&
      !c.hidden &&
      c.content === "power-up" &&
      c.y > 300 &&
      Math.abs(c.x - star.x) > 400 &&
      Math.abs(c.x - brick.x) > 400,
  )!;
  const hidden = s.obstacles.find((c) => c.hidden && !c.used)!;
  s.random = () => 0;
  at(s, star.x, T.groundY - 14);
  give(s, s.player, "mushroom8x");
  assert.equal(star.broken, true);
  assert.ok(!s.solids.includes(star.body!));
  const prize = s.items.find((item) => item.kind === "star")!;
  assert.equal(prize.emerge, 0);
  assert.equal(prize.body.frozen, false);
  assert.equal(prize.smash, true);
  assert.ok(prize.body.velocity.y < 0 || Math.abs(prize.body.velocity.x) > 0);
  assert.equal(
    s.events.filter((event) => event === "appear").length,
    1,
    "smash must not emit appear; give already used one question",
  );
  const origin = { x: prize.body.position.x, y: prize.body.position.y };
  tick(s, 0.2);
  const flown = s.items.find((item) => item.kind === "star");
  assert.ok(flown, "smasher must not collect the prize while overlapping");
  assert.equal(flown.emerge, 0);
  assert.equal(flown.body.frozen, false);
  assert.ok(
    Math.abs(flown.body.position.x - origin.x) > 1 ||
      Math.abs(flown.body.position.y - origin.y) > 1,
  );

  at(s, brick.x, T.groundY - 14 * s.player.scale);
  tick(s, dt);
  assert.equal(brick.broken, true);
  assert.ok(s.events.includes("break"));
  at(s, question.x, T.groundY - 14 * s.player.scale);
  const beforeItems = s.items.length;
  const pops = s.coinPops.length;
  tick(s, dt);
  assert.equal(question.broken, true);
  assert.ok(!s.solids.includes(question.body!));
  assert.ok(
    s.items.length > beforeItems ||
      s.player.starLeft > 0 ||
      s.player.flower ||
      s.coinPops.length > pops,
  );

  at(s, hidden.x, T.groundY - 14 * s.player.scale);
  tick(s, dt);
  assert.equal(hidden.broken, false);
  assert.equal(hidden.used, false);
  assert.equal(hidden.body!.headOnly, true);

  const coinBox = s.obstacles.find(
    (c) => c.question && !c.hidden && !c.used && !c.broken && c.y > 300,
  )!;
  const coinsBefore = s.coins;
  s.random = () => 0;
  at(s, coinBox.x, T.groundY - 14 * s.player.scale);
  tick(s, dt);
  assert.equal(coinBox.broken, true);
  assert.equal(s.coins, coinsBefore + 1);
  assert.ok(!s.solids.includes(coinBox.body!));

  const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
  at(s, pipe.x - 150, T.groundY - 14 * s.player.scale);
  tick(s, 0.15);
  tick(s, 2.4, { right: true });
  assert.equal(pipe.broken, true);
  assert.ok(!s.solids.includes(pipe.body!));
  assert.ok(s.player.body.position.x > pipe.x);
  assert.equal(s.player.grounded, true);
  assert.equal(s.player.alive, true);

  const intact = s.obstacles.find((c) => c.kind === "pipe" && !c.broken)!;
  const lid = intact.body!.bounds.min.y;
  at(s, intact.x, lid - 14 * s.player.scale);
  tick(s, 0.1, { down: true });
  assert.equal(intact.broken, true);
  assert.ok(!s.solids.includes(intact.body!));
  assert.equal(s.player.pipeTravel, undefined);
});

test("8x smash launches each item kind on a real step without emerge", () => {
  const cases: {
    id?: string;
    area?: string;
    kind: ItemKind;
    roll: number;
    pick: (s: Simulation) => (typeof s.obstacles)[number];
  }[] = [
    {
      kind: "star",
      roll: 0,
      pick: (s) => s.obstacles.find((c) => c.content === "star")!,
    },
    {
      id: "1-2",
      area: "40",
      kind: "oneUp",
      roll: 0,
      pick: (s) =>
        s.obstacles.find((c) => c.content === "1-up" && !c.hidden)!,
    },
    {
      kind: "flower",
      roll: 0.99,
      pick: (s) =>
        s.obstacles.find(
          (c) =>
            c.question &&
            !c.used &&
            !c.hidden &&
            c.content === "power-up" &&
            c.y > 300,
        )!,
    },
  ];
  for (const c of cases) {
    const s = new Simulation(() => 0.5);
    if (c.id)
      s.levelIndex = CAMPAIGN.findIndex((level) => level.id === c.id);
    s.reset();
    s.marioReturn = 1e6;
    if (c.area) s.player.areaId = c.area;
    parkNpcs(s, []);
    s.random = () => c.roll;
    const block = c.pick(s);
    give(s, s.player, "mushroom8x");
    at(s, block.x, block.y);
    tick(s, dt);
    const item = s.items.find((i) => i.kind === c.kind);
    assert.ok(item, c.kind);
    assert.equal(item.emerge, 0, c.kind);
    assert.equal(item.body.frozen, false, c.kind);
    assert.equal(item.smash, true, c.kind);
    const origin = { x: item.body.position.x, y: item.body.position.y };
    tick(s, 0.15);
    const live = s.items.find((i) => i.id === item.id);
    assert.ok(live, `${c.kind} still in play`);
    assert.equal(live.emerge, 0, c.kind);
    assert.ok(
      Math.abs(live.body.position.x - origin.x) > 1 ||
        Math.abs(live.body.position.y - origin.y) > 1,
      c.kind,
    );
    s.physics.clear();
  }
});

test("multi-coin bricks yield one coin per head hit until spent or the SMB1 window ends", () => {
  const s = game();
  const multi = s.obstacles.find((c) => c.content === "coins")!;
  assert.equal(multi.coinsLeft, T.multiCoinCount);
  assert.equal(multi.hidden, false);
  assert.equal(multi.question, false);
  const score = s.score;
  s.hitBlock(multi, s.player);
  assert.equal(multi.broken, false);
  assert.equal(multi.used, false);
  assert.equal(s.coins, 1);
  assert.equal(s.score, score + T.coinScore);
  assert.equal(multi.coinsLeft, T.multiCoinCount - 1);
  assert.equal(multi.coinTimerFrames, T.multiCoinTimerFrames);
  assert.ok(s.events.includes("coin"));
  assert.ok(s.events.includes("bump"));
  assert.equal(s.coinPops.length, 1);
  for (let n = 2; n <= T.multiCoinCount; n++) {
    multi.bounce = 0;
    s.hitBlock(multi, s.player);
    assert.equal(s.coins, n);
    assert.equal(s.score, score + T.coinScore * n);
    assert.equal(multi.coinsLeft, T.multiCoinCount - n);
  }
  assert.equal(multi.used, true);
  assert.equal(multi.broken, false);
  assert.ok(s.solids.includes(multi.body!));
  s.events.length = 0;
  multi.bounce = 0;
  s.hitBlock(multi, s.player);
  assert.equal(s.coins, T.multiCoinCount);
  assert.equal(multi.used, true);
  assert.equal(s.events.includes("coin"), false);
  assert.ok(s.events.includes("bump"));

  const large = game();
  const largeBrick = large.obstacles.find((c) => c.content === "coins")!;
  give(large, large.player, "mushroom");
  assert.ok(large.player.scale > 1);
  large.hitBlock(largeBrick, large.player);
  assert.equal(largeBrick.broken, false);
  assert.equal(largeBrick.used, false);
  assert.equal(large.coins, 1);
  assert.equal(largeBrick.coinsLeft, T.multiCoinCount - 1);

  const marioHit = game();
  marioHit.marioActive = true;
  const marioBrick = marioHit.obstacles.find((c) => c.content === "coins")!;
  marioHit.score = 0;
  marioHit.coins = 0;
  marioHit.hitBlock(marioBrick, marioHit.mario);
  assert.equal(marioBrick.broken, false);
  assert.equal(marioBrick.used, false);
  assert.equal(marioHit.coins, 0);
  assert.equal(marioHit.score, 0);
  assert.ok(marioHit.events.includes("coin"));
  assert.equal(marioHit.coinPops.length, 1);

  const npcHit = game();
  const n = npcHit.npcs[0]!;
  const npcBrick = npcHit.obstacles.find((c) => c.content === "coins")!;
  npcHit.score = 0;
  npcHit.coins = 0;
  npcHit.events.length = 0;
  npcHit.hitBlock(npcBrick, n);
  assert.equal(npcBrick.broken, false);
  assert.equal(npcHit.coins, 0);
  assert.equal(npcHit.score, 0);
  assert.ok(npcHit.events.includes("coin"));
  assert.equal(npcHit.coinPops.length, 1);

  const timed = game();
  parkNpcs(timed, []);
  const timedBrick = timed.obstacles.find((c) => c.content === "coins")!;
  timed.hitBlock(timedBrick, timed.player);
  assert.equal(timed.coins, 1);
  assert.equal(timedBrick.used, false);
  at(timed, 80);
  tick(timed, T.multiCoinTimerFrames / 60);
  assert.equal(timedBrick.coinTimerFrames, 0);
  timedBrick.bounce = 0;
  timed.hitBlock(timedBrick, timed.player);
  assert.equal(timed.coins, 2);
  assert.equal(timedBrick.used, true);
  assert.ok((timedBrick.coinsLeft ?? 0) > 0);
  assert.equal(timedBrick.broken, false);

  const fire = game();
  const fireBrick = fire.obstacles.find((c) => c.content === "coins")!;
  isolateSolid(fire, fireBrick.body!);
  fire.obstacles = [fireBrick];
  const radius = 6 * T.playerFireballScale;
  shoot(
    fire,
    fireBrick.body!.bounds.min.x - radius - 8,
    fireBrick.y,
    6,
    T.playerFireballScale,
  );
  tick(fire, 6 * dt);
  assert.equal(fireBrick.broken, false);
  assert.equal(fireBrick.used, false);
  assert.equal(fire.coins, 0);
});

test("8x smash claims remaining multi-coins for the player; NPC smash pops without scoring", () => {
  const s = game();
  parkNpcs(s, []);
  const multi = s.obstacles.find((c) => c.content === "coins")!;
  const coins = s.coins;
  const score = s.score;
  at(s, multi.x, T.groundY - 14);
  give(s, s.player, "mushroom8x");
  assert.equal(multi.broken, true);
  assert.equal(s.coins, coins + T.multiCoinCount);
  assert.equal(s.score, score + T.coinScore * T.multiCoinCount);
  assert.ok(!s.solids.includes(multi.body!));

  const partial = game();
  parkNpcs(partial, []);
  const partialBrick = partial.obstacles.find((c) => c.content === "coins")!;
  partial.hitBlock(partialBrick, partial.player);
  partialBrick.bounce = 0;
  partial.hitBlock(partialBrick, partial.player);
  const left = partialBrick.coinsLeft!;
  assert.equal(left, T.multiCoinCount - 2);
  const partialCoins = partial.coins;
  const partialScore = partial.score;
  at(partial, partialBrick.x, T.groundY - 14);
  give(partial, partial.player, "mushroom8x");
  assert.equal(partialBrick.broken, true);
  assert.equal(partial.coins, partialCoins + left);
  assert.equal(partial.score, partialScore + T.coinScore * left);

  const s2 = game();
  const n = s2.npcs[0];
  parkNpcs(s2, [n]);
  const npcMulti = s2.obstacles.find((c) => c.content === "coins")!;
  const brick = s2.obstacles.find(
    (c) =>
      c.kind === "brick" &&
      !c.question &&
      !c.hidden &&
      !c.content &&
      c.y > 300,
  )!;
  s2.score = 0;
  s2.coins = 0;
  Body.setPosition(n.body, { x: npcMulti.x, y: T.groundY - 14 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  s2.events.length = 0;
  give(s2, n, "mushroom8x");
  assert.equal(npcMulti.broken, true);
  assert.equal(s2.coins, 0);
  assert.equal(s2.score, 0);
  assert.ok(s2.events.includes("coin"));
  assert.ok(s2.coinPops.length >= T.multiCoinCount);
  const coinBox = s2.obstacles.find(
    (c) => c.question && !c.hidden && !c.used && !c.broken && c.y > 300,
  )!;
  const pops = s2.coinPops.length;
  s2.events.length = 0;
  s2.random = () => 0;
  Body.setPosition(n.body, {
    x: coinBox.x,
    y: T.groundY - 14 * n.scale,
  });
  tick(s2, dt);
  assert.equal(coinBox.broken, true);
  assert.equal(s2.coins, 0);
  assert.equal(s2.score, 0);
  assert.ok(s2.events.includes("coin"));
  assert.ok(s2.coinPops.length > pops);
  Body.setPosition(n.body, { x: brick.x, y: T.groundY - 14 * n.scale });
  tick(s2, dt);
  assert.equal(brick.broken, true);

  const s3 = game();
  s3.marioActive = true;
  parkNpcs(s3, []);
  const marioMulti = s3.obstacles.find((c) => c.content === "coins")!;
  s3.score = 0;
  s3.coins = 0;
  Body.setFrozen(s3.mario.body, false);
  Body.setPosition(s3.mario.body, { x: marioMulti.x, y: T.groundY - 19 });
  Body.setVelocity(s3.mario.body, { x: 0, y: 0 });
  s3.events.length = 0;
  give(s3, s3.mario, "mushroom8x");
  assert.equal(marioMulti.broken, true);
  assert.equal(s3.coins, 0);
  assert.equal(s3.score, 0);
  assert.ok(s3.events.includes("coin"));
  assert.ok(s3.coinPops.length >= T.multiCoinCount);
});

test("8x does not smash floors, flagpole, goal pipe, springs, castle bridges, or an elevated flush walk volume", () => {
  const s = game();
  parkNpcs(s, []);
  give(s, s.player, "mushroom8x");
  const pole = poleOf(s);
  const poleCol = Math.floor((pole.x - s.activeRoom.offset) / 32);
  at(s, pole.x, T.groundY - 14 * s.player.scale);
  tick(s, dt);
  assert.ok(s.activeRoom.flagpole);
  assert.equal(s.activeRoom.smashedTiles.has(`${poleCol},12`), false);
  assert.equal(cellSolid(s, 4, 13), true);

  let smashedStairFill = false;
  for (let column = 0; column < s.activeRoom.data.width; column++) {
    for (let row = 6; row <= 11; row++) {
      const tile = s.activeRoom.data.tiles[row][column];
      if (tile !== 97 || s.activeRoom.data.tiles[row - 1][column] !== 97)
        continue;
      if (
        s.activeRoom.data.objects.some(
          (o) => o.opcode === 35 && o.column === column,
        )
      )
        continue;
      at(
        s,
        s.activeRoom.offset + column * 32 + 16,
        T.groundY - 14 * s.player.scale,
      );
      tick(s, dt);
      assert.equal(s.activeRoom.smashedTiles.has(`${column},${row}`), true);
      assert.equal(cellSolid(s, column, 13), true);
      smashedStairFill = true;
      column = s.activeRoom.data.width;
      break;
    }
  }
  assert.equal(smashedStairFill, true);

  const castle = new Simulation(() => 0.5);
  castle.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-4");
  castle.reset();
  castle.marioReturn = 1e6;
  parkNpcs(castle, []);
  give(castle, castle.player, "mushroom8x");
  const area = castle.activeRoom.data;
  let bridgeCol = -1;
  for (let column = 0; column < area.width; column++)
    for (let row = 0; row < area.height; row++)
      if (area.tiles[row][column] === 137) {
        bridgeCol = column;
        at(
          castle,
          castle.activeRoom.offset + column * 32 + 16,
          MAP_TOP + row * 32 - 14 * castle.player.scale,
        );
        tick(castle, 0.15);
        assert.equal(castle.player.alive, true);
        assert.equal(castle.activeRoom.smashedTiles.has(`${column},${row}`), false);
        assert.equal(cellSolid(castle, column, row), true);
        column = area.width;
        break;
      }
  assert.ok(bridgeCol >= 0);
  const pair = campaignMergedPair(castle);
  assert.ok(pair, "1-4 has a merged wall+floor above groundY");
  const towardLeft = Math.abs(pair.wall.bounds.max.x - pair.floor.bounds.min.x) < 1;
  const startX = towardLeft
    ? Math.min(pair.floor.position.x, pair.floor.bounds.min.x + 48)
    : Math.max(pair.floor.position.x, pair.floor.bounds.max.x - 48);
  at(castle, startX, pair.floorY - 14 * castle.player.scale);
  tick(castle, 0.15);
  const liveFloor = hugeFloorSolid(
    castle.player.body.bounds.max.y,
    castle.player.body.bounds.min.x,
    castle.player.body.width,
    castle.roomFor(castle.player).solids,
  );
  const liveWall = liveFloor
    ? hugeFlushVolume(
        castle.player.body.bounds.max.y,
        castle.player.body.bounds.min.x,
        castle.player.body.width,
        castle.roomFor(castle.player).solids,
        liveFloor,
      )
    : undefined;
  assert.ok(liveFloor);
  assert.ok(liveWall);
  const room = castle.activeRoom;
  const col0 = Math.floor((liveWall.bounds.min.x - room.offset) / 32);
  const col1 = Math.floor((liveWall.bounds.max.x - room.offset - 0.01) / 32);
  const row0 = Math.floor((liveWall.bounds.min.y - MAP_TOP) / 32);
  const row1 = Math.floor((liveWall.bounds.max.y - MAP_TOP - 0.01) / 32);
  let volumeTile = false;
  for (let column = col0; column <= col1; column++) {
    for (let row = Math.max(2, row0); row <= Math.min(12, row1); row++) {
      const tile = room.data.tiles[row]?.[column] ?? 0;
      if (!tile) continue;
      const x = room.offset + column * 32 + 16;
      const y = MAP_TOP + row * 32 + 16;
      if (
        castle.player.body.bounds.max.x <= x - 16 + 0.1 ||
        castle.player.body.bounds.min.x >= x + 16 - 0.1 ||
        castle.player.body.bounds.max.y <= y - 16 + 0.1 ||
        castle.player.body.bounds.min.y >= y + 16 - 0.1
      )
        continue;
      volumeTile = true;
      assert.equal(
        room.smashedTiles.has(`${column},${row}`),
        false,
        `walk volume ${column},${row}`,
      );
    }
  }
  assert.equal(volumeTile, true);
  let overheadSmashed = false;
  const floorCol0 = Math.floor((liveFloor.bounds.min.x - room.offset) / 32);
  const floorCol1 = Math.floor((liveFloor.bounds.max.x - room.offset - 0.01) / 32);
  const above = Math.floor((liveFloor.bounds.min.y - MAP_TOP) / 32) - 1;
  for (let column = floorCol0; column <= floorCol1; column++) {
    for (let row = 2; row <= above; row++) {
      if (!room.smashedTiles.has(`${column},${row}`)) continue;
      const x = room.offset + column * 32 + 16;
      const y = MAP_TOP + row * 32 + 16;
      if (
        castle.player.body.bounds.max.x <= x - 16 + 0.1 ||
        castle.player.body.bounds.min.x >= x + 16 - 0.1 ||
        castle.player.body.bounds.max.y <= y - 16 + 0.1 ||
        castle.player.body.bounds.min.y >= y + 16 - 0.1
      )
        continue;
      overheadSmashed = true;
    }
  }
  assert.equal(overheadSmashed, true);
  castle.physics.clear();

  const underground = new Simulation(() => 0.5);
  underground.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-2");
  underground.reset();
  underground.marioReturn = 1e6;
  parkNpcs(underground, []);
  underground.player.areaId = "40";
  const sub = underground.loadRoom("40");
  give(underground, underground.player, "mushroom8x");
  const goal = sub.data.goal!;
  assert.equal(goal.kind, "pipe");
  const goalData = sub.data.pipes.find(
    (p) => p.column === goal.column && p.row === goal.row,
  )!;
  const goalPipe = underground.obstacles.find((c) => {
    const x = sub.offset + (goalData.column + goalData.width / 2) * 32;
    return c.kind === "pipe" && Math.abs(c.x - x) < 1;
  })!;
  at(
    underground,
    goalPipe.x,
    T.groundY - 14 * underground.player.scale,
  );
  tick(underground, dt);
  assert.equal(goalPipe.broken, false);
  assert.ok(underground.solids.includes(goalPipe.body!));
  tick(underground, 0.1, { right: true, down: true });
  assert.ok(
    underground.player.pipeTravel || underground.events.includes("pipe"),
  );
  assert.equal(underground.player.scale, T.giantScale);
  assert.equal(underground.player.hugeLeft, 0);
  underground.physics.clear();

  const springLevel = new Simulation(() => 0.5);
  springLevel.levelIndex = CAMPAIGN.findIndex((level) => level.id === "2-1");
  springLevel.reset();
  springLevel.marioReturn = 1e6;
  parkNpcs(springLevel, []);
  give(springLevel, springLevel.player, "mushroom8x");
  const spring = springLevel.activeRoom.data.objects.find((o) => o.opcode === 33)!;
  const springCol = spring.column;
  const springRow = spring.row;
  at(
    springLevel,
    springLevel.activeRoom.offset + springCol * 32 + 16,
    T.groundY - 14 * springLevel.player.scale,
  );
  tick(springLevel, dt);
  assert.equal(
    springLevel.activeRoom.smashedTiles.has(`${springCol},${springRow}`),
    false,
  );
  assert.equal(
    springLevel.activeRoom.smashedTiles.has(`${springCol},${springRow + 1}`),
    false,
  );
  springLevel.physics.clear();

  const usedFloor = new Simulation(() => 0.5);
  usedFloor.levelIndex = CAMPAIGN.findIndex((level) => level.id === "2-4");
  usedFloor.reset();
  usedFloor.marioReturn = 1e6;
  parkNpcs(usedFloor, []);
  give(usedFloor, usedFloor.player, "mushroom8x");
  const floorCol = 43;
  at(
    usedFloor,
    usedFloor.activeRoom.offset + floorCol * 32 + 16,
    T.groundY - 14 * usedFloor.player.scale,
  );
  tick(usedFloor, 0.2, { jump: true });
  assert.equal(usedFloor.activeRoom.smashedTiles.has(`${floorCol},13`), false);
  assert.equal(cellSolid(usedFloor, floorCol, 13), true);
  usedFloor.physics.clear();
});

test("8x smash of a ground pipe keeps the floor in that column", () => {
  const s = game();
  parkNpcs(s, []);
  give(s, s.player, "mushroom8x");
  const room = s.loadRoom("65");
  s.player.areaId = "65";
  const data = room.data.pipes.find(
    (p) => p.row + p.height > 13 && p.direction !== "right",
  )!;
  const pipe = s.obstacles.find((c) => {
    const x = room.offset + (data.column + data.width / 2) * 32;
    return c.kind === "pipe" && Math.abs(c.x - x) < 1;
  })!;
  at(s, pipe.x, T.groundY - 14 * s.player.scale);
  tick(s, dt);
  assert.equal(pipe.broken, true);
  assert.ok(!s.solids.includes(pipe.body!));
  at(s, pipe.x, T.groundY - 14 * s.player.scale);
  tick(s, 0.15);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.grounded, true);
  assert.ok(Math.abs(s.player.body.bounds.max.y - T.groundY) < 16);
  assert.equal(cellSolid(s, data.column, 13), true);
  s.physics.clear();
});

test("8x walking keeps the floor through merged stair columns", () => {
  const s = game();
  give(s, s.player, "mushroom8x");
  const stairsX = 184 * 32;
  at(s, stairsX - 180, T.groundY - 14 * s.player.scale);
  tick(s, 0.2);
  const startY = s.player.body.position.y;
  tick(s, 2.5, { right: true });
  assert.equal(s.player.alive, true);
  assert.equal(s.player.grounded, true);
  assert.ok(s.player.body.position.x > stairsX - 40);
  assert.ok(s.player.body.position.y < startY + 40);
  assert.ok(s.player.body.position.y > 200);
  at(s, stairsX - 120, T.groundY - 14 * s.player.scale);
  tick(s, 0.1);
  const beforeJump = s.player.body.position.y;
  tick(s, 0.25, { jump: true });
  assert.ok(s.player.body.position.y < beforeJump - 40);
  assert.equal(s.player.grounded, false);
});

test("8x volume-hold keeps a body on standable floors above groundY", () => {
  const cases = [
    { id: "1-1" },
    { id: "1-4" },
    { id: "1-2", area: "40" },
  ] as const;
  for (const c of cases) {
    const s = new Simulation(() => 0.5, physics());
    s.levelIndex = CAMPAIGN.findIndex((level) => level.id === c.id);
    s.reset();
    s.marioReturn = 1e6;
    if ("area" in c) s.player.areaId = c.area;
    parkNpcs(s, []);
    give(s, s.player, "mushroom8x");
    const floor = s.roomFor(s.player).solids.find(
      (sol) =>
        !sol.headOnly &&
        sol.passHuge !== "top" &&
        sol.width >= 64 &&
        sol.bounds.min.y < T.groundY - 20 &&
        sol.bounds.min.y > MAP_TOP + 64,
    );
    assert.ok(floor, c.id);
    const floorY = floor.bounds.min.y;
    at(s, floor.position.x, floorY - 14 * s.player.scale);
    tick(s, 0.15);
    const feet = s.player.body.bounds.max.y;
    assert.equal(s.player.alive, true, c.id);
    assert.equal(s.player.grounded, true, c.id);
    assert.ok(
      Math.abs(feet - floorY) < 16,
      JSON.stringify({
        id: c.id,
        floorY,
        feet,
        y: s.player.body.position.y,
      }),
    );
    const heldY = s.player.body.position.y;
    tick(s, 0.4, { right: true });
    assert.equal(s.player.alive, true, c.id);
    assert.equal(s.player.grounded, true, c.id);
    assert.ok(
      s.player.body.position.y < heldY + 16,
      JSON.stringify({
        id: c.id,
        heldY,
        y: s.player.body.position.y,
      }),
    );
    s.physics.clear();
  }
});

test("8x does not snag on a distant floor height inside a tall column", () => {
  const s = new Simulation(() => 0.5, physics());
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-4");
  s.reset();
  s.marioReturn = 1e6;
  parkNpcs(s, []);
  give(s, s.player, "mushroom8x");
  const solids = s.activeRoom.solids.filter(
    (sol) => !sol.headOnly && sol.passHuge !== "top",
  );
  const floorYs = [...new Set(solids.map((sol) => sol.bounds.min.y))];
  const tall = solids.find((sol) => {
    if (sol.width < 300) return false;
    return floorYs.some(
      (y) =>
        y > sol.bounds.min.y + 20 &&
        y < T.groundY - 20 &&
        y < sol.bounds.max.y - 20,
    );
  });
  assert.ok(tall);
  const ghostY = floorYs.find(
    (y) =>
      y > tall.bounds.min.y + 20 &&
      y < T.groundY - 20 &&
      y < tall.bounds.max.y - 20,
  )!;
  at(s, tall.position.x, ghostY - 14 * s.player.scale);
  tick(s, 0.2);
  assert.ok(
    Math.abs(s.player.body.bounds.max.y - ghostY) > 16,
    JSON.stringify({
      ghostY,
      feet: s.player.body.bounds.max.y,
      grounded: s.player.grounded,
    }),
  );
  s.physics.clear();
});

test("8x does not snag on a nearby ledge it does not overlap", () => {
  const s = new Simulation(() => 0.5, physics());
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-4");
  s.reset();
  s.marioReturn = 1e6;
  parkNpcs(s, []);
  give(s, s.player, "mushroom8x");
  const solids = s.activeRoom.solids.filter(
    (sol) => !sol.headOnly && sol.passHuge !== "top",
  );
  const half = s.player.body.width / 2;
  let placed = false;
  for (const tall of solids) {
    if (tall.width < 300) continue;
    for (const ledge of solids) {
      const floorY = ledge.bounds.min.y;
      if (floorY <= tall.bounds.min.y + 20 || floorY >= T.groundY - 20)
        continue;
      if (floorY >= tall.bounds.max.y - 20) continue;
      const gapLeft = ledge.bounds.min.x - tall.bounds.max.x;
      const gapRight = tall.bounds.min.x - ledge.bounds.max.x;
      const side =
        gapLeft >= 0 && gapLeft <= 40
          ? "right"
          : gapRight >= 0 && gapRight <= 40
            ? "left"
            : null;
      if (!side) continue;
      const x =
        side === "right"
          ? tall.bounds.max.x - half - 1
          : tall.bounds.min.x + half + 1;
      if (x + half > ledge.bounds.min.x && x - half < ledge.bounds.max.x)
        continue;
      at(s, x, floorY - 14 * s.player.scale);
      placed = true;
      tick(s, 0.2);
      assert.ok(
        Math.abs(s.player.body.bounds.max.y - floorY) > 16,
        JSON.stringify({
          floorY,
          feet: s.player.body.bounds.max.y,
          x,
          tall: tall.bounds,
          ledge: ledge.bounds,
        }),
      );
      break;
    }
    if (placed) break;
  }
  assert.ok(placed, "castle has a tall column beside a higher floor");
  s.physics.clear();
});

test("8x stays on a merged wall+floor after floor-AABB overlap ends", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = world.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  const wall = world.rectangle(200, floorY - 32 + wallH / 2, 400, wallH, true);
  const body = world.rectangle(
    464,
    floorY - 112,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  const overlapsFloor = () =>
    body.bounds.max.x > floor.bounds.min.x &&
    body.bounds.min.x < floor.bounds.max.x;
  assert.equal(overlapsFloor(), true);
  assert.equal(wall.bounds.max.x, floor.bounds.min.x);
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  const heldY = body.position.y;
  for (let i = 0; i < 24; i++) world.step(dt);
  assert.equal(overlapsFloor(), false);
  assert.ok(
    body.bounds.min.x < wall.bounds.max.x &&
      body.bounds.max.x > wall.bounds.min.x,
  );
  assert.ok(
    Math.abs(body.bounds.max.y - floorY) < 2,
    JSON.stringify({
      floorY,
      feet: body.bounds.max.y,
      y: body.position.y,
      heldY,
      vy: body.velocity.y,
    }),
  );
  assert.equal(body.velocity.y, 0);
  assert.ok(Math.abs(heldY - body.position.y) < 2);
  assert.equal(body.volumeHoldFloor, floor);
  assert.equal(body.volumeHoldVolume, wall);
  world.clear();
});

test("8x volume-hold still supports lookahead far from the stood-on floor", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = world.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  const wall = world.rectangle(-136, floorY - 32 + wallH / 2, 1072, wallH, true);
  assert.equal(wall.bounds.max.x, floor.bounds.min.x);
  const body = world.rectangle(
    464,
    floorY - 112,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  const overlapsFloor = () =>
    body.bounds.max.x > floor.bounds.min.x &&
    body.bounds.min.x < floor.bounds.max.x;
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  Body.setPosition(body, {
    x: floor.bounds.min.x - 450,
    y: body.position.y,
  });
  Body.setVelocity(body, { x: 0, y: 0 });
  world.step(dt);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.volumeHoldFloor, floor);
  const nearby = [...world.bodies].filter(
    (s) =>
      !s.headOnly &&
      s.bounds.max.x > body.position.x - 400 &&
      s.bounds.min.x < body.position.x + 400,
  );
  assert.equal(nearby.includes(floor), false);
  const ahead = body.bounds.min.x - 8;
  assert.equal(hugeHoldAt(floorY, ahead, 1, nearby, body), false);
  assert.equal(hugeHoldAt(floorY, ahead, 1, world.bodies, body), true);
  world.clear();
});

test("8x volume-hold does not snap a non-persist hold to a farther floor", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floor = world.rectangle(200, floorY + 128, 128, 256, true);
  const higher = world.rectangle(200, floorY - 8 + 128, 128, 256, true);
  const body = world.rectangle(
    200,
    floorY - 14 * T.hugeScale,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: 0, y: 1 });
  for (let i = 0; i < 12; i++) world.step(dt);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.velocity.y, 0);
  assert.equal(body.volumeHoldFloor, floor);
  assert.notEqual(body.volumeHoldFloor, higher);
  world.clear();
});

test("8x does not grab a merged wall+floor it never stood on", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  world.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  const wall = world.rectangle(200, floorY - 32 + wallH / 2, 400, wallH, true);
  const body = world.rectangle(
    200,
    floorY - 112,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  assert.ok(body.bounds.max.x < wall.bounds.max.x - 8);
  for (let i = 0; i < 12; i++) world.step(dt);
  assert.ok(
    Math.abs(body.bounds.max.y - floorY) > 16,
    JSON.stringify({
      floorY,
      feet: body.bounds.max.y,
      groundedY: body.position.y,
    }),
  );
  world.clear();
});

test("8x volume-hold does not snag a non-overlapping ledge after latching", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = world.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  world.rectangle(200, floorY - 32 + wallH / 2, 400, wallH, true);
  const ledge = world.rectangle(700, floorY + 16, 96, 32, true);
  const body = world.rectangle(
    464,
    floorY - 112,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  const overlapsFloor = () =>
    body.bounds.max.x > floor.bounds.min.x &&
    body.bounds.min.x < floor.bounds.max.x;
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.volumeHoldFloor, floor);
  const heldY = body.position.y;
  Body.setPosition(body, {
    x: ledge.bounds.max.x + body.width / 2 + 8,
    y: heldY,
  });
  Body.setVelocity(body, { x: 0, y: 0 });
  assert.equal(
    body.bounds.max.x > ledge.bounds.min.x &&
      body.bounds.min.x < ledge.bounds.max.x,
    false,
  );
  for (let i = 0; i < 12; i++) world.step(dt);
  assert.ok(Math.abs(body.bounds.max.y - floorY) > 16);
  assert.ok(Math.abs(body.bounds.max.y - ledge.bounds.min.y) > 16);
  assert.equal(body.volumeHoldFloor, undefined);
  world.clear();
});

test("8x volume-hold does not transfer across a gap to another column", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = world.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  world.rectangle(200, floorY - 32 + wallH / 2, 400, wallH, true);
  const otherFloor = world.rectangle(
    1364,
    floorY + floorH / 2,
    128,
    floorH,
    true,
  );
  const otherWall = world.rectangle(
    1100,
    floorY - 32 + wallH / 2,
    400,
    wallH,
    true,
  );
  const body = world.rectangle(
    464,
    floorY - 112,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  const overlapsFloor = () =>
    body.bounds.max.x > floor.bounds.min.x &&
    body.bounds.min.x < floor.bounds.max.x;
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.velocity.y, 0);
  Body.setPosition(body, { x: otherWall.position.x, y: body.position.y });
  Body.setVelocity(body, { x: 0, y: 0 });
  assert.equal(
    body.bounds.max.x > otherFloor.bounds.min.x &&
      body.bounds.min.x < otherFloor.bounds.max.x,
    false,
  );
  for (let i = 0; i < 12; i++) world.step(dt);
  assert.ok(
    Math.abs(body.bounds.max.y - floorY) > 16,
    JSON.stringify({
      floorY,
      feet: body.bounds.max.y,
      otherWall: otherWall.bounds,
      otherFloor: otherFloor.bounds,
    }),
  );
  world.clear();
});

test("8x volume-hold does not transfer to another column on the same floor", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = world.rectangle(600, floorY + floorH / 2, 400, floorH, true);
  const wallL = world.rectangle(200, floorY - 32 + wallH / 2, 400, wallH, true);
  const wallR = world.rectangle(1000, floorY - 32 + wallH / 2, 400, wallH, true);
  assert.equal(wallL.bounds.max.x, floor.bounds.min.x);
  assert.equal(floor.bounds.max.x, wallR.bounds.min.x);
  const body = world.rectangle(
    floor.bounds.min.x + 32,
    floorY - 112,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  const overlapsFloor = () =>
    body.bounds.max.x > floor.bounds.min.x &&
    body.bounds.min.x < floor.bounds.max.x;
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.velocity.y, 0);
  assert.equal(body.volumeHoldFloor, floor);
  assert.equal(body.volumeHoldVolume, wallL);
  const heldY = body.position.y;
  Body.setPosition(body, {
    x: wallR.bounds.min.x + body.width / 2 + 8,
    y: heldY,
  });
  Body.setVelocity(body, { x: 0, y: 0 });
  assert.equal(overlapsFloor(), false);
  assert.ok(body.bounds.min.x >= wallR.bounds.min.x);
  for (let i = 0; i < 12; i++) world.step(dt);
  assert.ok(
    Math.abs(body.bounds.max.y - floorY) > 16,
    JSON.stringify({
      floorY,
      feet: body.bounds.max.y,
      hold: body.volumeHoldVolume === wallR,
    }),
  );
  assert.equal(body.volumeHoldVolume, undefined);
  assert.equal(body.volumeHoldFloor, undefined);
  world.clear();
});

test("8x volume-hold arms the wall with the stronger overlap, not the first match", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = world.rectangle(600, floorY + floorH / 2, 96, floorH, true);
  const wallL = world.rectangle(352, floorY - 32 + wallH / 2, 400, wallH, true);
  const wallR = world.rectangle(848, floorY - 32 + wallH / 2, 400, wallH, true);
  assert.equal(wallL.bounds.max.x, floor.bounds.min.x);
  assert.equal(floor.bounds.max.x, wallR.bounds.min.x);
  const body = world.rectangle(
    floor.bounds.min.x + 28,
    floorY - 112,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  assert.ok(body.bounds.min.x < wallL.bounds.max.x);
  assert.ok(body.bounds.max.x > wallR.bounds.min.x);
  for (let i = 0; i < 12; i++) world.step(dt);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.velocity.y, 0);
  assert.equal(body.volumeHoldFloor, floor);
  assert.equal(body.volumeHoldVolume, wallL);
  const heldY = body.position.y;
  Body.setPosition(body, {
    x: wallR.bounds.min.x + body.width / 2 + 8,
    y: heldY,
  });
  Body.setVelocity(body, { x: 0, y: 0 });
  for (let i = 0; i < 12; i++) world.step(dt);
  assert.ok(Math.abs(body.bounds.max.y - floorY) > 16);
  assert.equal(body.volumeHoldVolume, undefined);
  assert.equal(body.volumeHoldFloor, undefined);
  world.clear();
});

test("8x volume-hold lands a jump inside the stood-on merged wall", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 416;
  const floor = world.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  const wall = world.rectangle(200, floorY - 160 + wallH / 2, 400, wallH, true);
  const body = world.rectangle(
    464,
    floorY - 112,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  const overlapsFloor = () =>
    body.bounds.max.x > floor.bounds.min.x &&
    body.bounds.min.x < floor.bounds.max.x;
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.velocity.y, 0);
  assert.ok(body.bounds.max.x > wall.bounds.min.x);
  const landJump = () => {
    Body.setVelocity(body, { x: 0, y: -T.jumpSpeed });
    let peaked = false;
    let landed = false;
    for (let i = 0; i < 90; i++) {
      world.step(dt);
      if (body.bounds.max.y < floorY - 24) peaked = true;
      if (
        peaked &&
        Math.abs(body.velocity.y) < 0.1 &&
        Math.abs(body.bounds.max.y - floorY) < 2
      ) {
        landed = true;
        break;
      }
    }
    assert.equal(peaked, true);
    assert.equal(landed, true);
    for (let i = 0; i < 12; i++) world.step(dt);
  };
  landJump();
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.velocity.y, 0);
  assert.equal(body.volumeHoldFloor, floor);
  const supportY = body.bounds.max.y;
  landJump();
  assert.ok(Math.abs(body.bounds.max.y - supportY) < 1);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.velocity.y, 0);
  assert.equal(body.volumeHoldFloor, floor);
  world.clear();
});

test("8x volume-hold keeps the stood-on floor after that body is rebuilt", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = world.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  const wall = world.rectangle(200, floorY - 32 + wallH / 2, 400, wallH, true);
  const body = world.rectangle(
    464,
    floorY - 112,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  const overlapsFloor = () =>
    body.bounds.max.x > floor.bounds.min.x &&
    body.bounds.min.x < floor.bounds.max.x;
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.velocity.y, 0);
  assert.equal(body.volumeHoldFloor, floor);
  const held = {
    x: floor.position.x,
    y: floor.position.y,
    w: floor.width,
    h: floor.height,
  };
  world.remove(floor);
  const far = world.rectangle(
    held.x + held.w / 4,
    held.y,
    held.w / 2,
    held.h,
    true,
  );
  const rebuilt = world.rectangle(
    held.x - held.w / 4,
    held.y,
    held.w / 2,
    held.h,
    true,
  );
  assert.ok(far.bounds.min.x >= rebuilt.bounds.max.x - 1);
  assert.ok(rebuilt.bounds.max.x > held.x - held.w / 2);
  assert.ok(far.bounds.min.x < held.x + held.w / 2);
  for (let i = 0; i < 24; i++) world.step(dt);
  assert.ok(
    body.bounds.min.x < wall.bounds.max.x &&
      body.bounds.max.x > wall.bounds.min.x,
  );
  assert.ok(
    Math.abs(body.bounds.max.y - floorY) < 2,
    JSON.stringify({
      floorY,
      feet: body.bounds.max.y,
      vy: body.velocity.y,
      hold: body.volumeHoldFloor === rebuilt,
    }),
  );
  assert.equal(body.velocity.y, 0);
  assert.equal(body.volumeHoldFloor, rebuilt);
  assert.notEqual(body.volumeHoldFloor, far);
  world.clear();
});

test("8x volume-hold does not rebind to an abutting neighbor after rebuild", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = world.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  const wall = world.rectangle(200, floorY - 32 + wallH / 2, 400, wallH, true);
  const body = world.rectangle(464, floorY - 112, 24 * T.hugeScale, 28 * T.hugeScale);
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  const overlapsFloor = () =>
    body.bounds.max.x > floor.bounds.min.x &&
    body.bounds.min.x < floor.bounds.max.x;
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.velocity.y, 0);
  assert.equal(body.volumeHoldFloor, floor);
  assert.ok(
    body.bounds.max.x > wall.bounds.min.x &&
      body.bounds.min.x < wall.bounds.max.x,
  );
  const savedMax = floor.bounds.max.x;
  world.remove(floor);
  const neighbor = world.rectangle(
    savedMax + 64,
    floorY + floorH / 2,
    128,
    floorH,
    true,
  );
  world.rectangle(savedMax + 264, floorY - 32 + wallH / 2, 400, wallH, true);
  assert.equal(neighbor.bounds.min.x, savedMax);
  assert.ok(body.bounds.max.x <= neighbor.bounds.min.x);
  for (let i = 0; i < 24; i++) world.step(dt);
  assert.ok(
    Math.abs(body.bounds.max.y - floorY) > 16,
    JSON.stringify({
      floorY,
      feet: body.bounds.max.y,
      hold: body.volumeHoldFloor === neighbor,
    }),
  );
  assert.equal(body.volumeHoldFloor, undefined);
  assert.equal(body.volumeHoldVolume, undefined);
  world.clear();
});

test("8x volume-hold keeps a split wall remnant that still touches the floor", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = world.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  const wall = world.rectangle(200, floorY - 32 + wallH / 2, 400, wallH, true);
  const body = world.rectangle(
    464,
    floorY - 112,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  const overlapsFloor = () =>
    body.bounds.max.x > floor.bounds.min.x &&
    body.bounds.min.x < floor.bounds.max.x;
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.volumeHoldVolume, wall);
  Body.setPosition(body, { x: 200, y: body.position.y });
  Body.setVelocity(body, { x: 0, y: 0 });
  world.step(dt);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  const held = {
    y: wall.position.y,
    h: wall.height,
  };
  world.remove(wall);
  const far = world.rectangle(100, held.y, 200, held.h, true);
  const remnant = world.rectangle(316, held.y, 168, held.h, true);
  assert.equal(far.bounds.max.x, 200);
  assert.equal(remnant.bounds.max.x, floor.bounds.min.x);
  assert.ok(body.bounds.max.x > remnant.bounds.min.x);
  for (let i = 0; i < 24; i++) world.step(dt);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.velocity.y, 0);
  assert.equal(body.volumeHoldFloor, floor);
  assert.equal(body.volumeHoldVolume, remnant);
  assert.notEqual(body.volumeHoldVolume, far);
  world.clear();
});

test("8x volume-hold lands on a short wall lid instead of snapping back", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = world.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  const wall = world.rectangle(200, floorY - 32 + wallH / 2, 400, wallH, true);
  const body = world.rectangle(
    464,
    floorY - 112,
    24 * T.hugeScale,
    28 * T.hugeScale,
  );
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  const overlapsFloor = () =>
    body.bounds.max.x > floor.bounds.min.x &&
    body.bounds.min.x < floor.bounds.max.x;
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.volumeHoldFloor, floor);
  assert.equal(body.volumeHoldVolume, wall);
  const lidY = wall.bounds.min.y;
  assert.ok(lidY < floorY - 16);
  Body.setVelocity(body, { x: 0, y: -T.jumpSpeed });
  let peaked = false;
  let landed = false;
  for (let i = 0; i < 90; i++) {
    world.step(dt);
    if (body.bounds.max.y < lidY - 8) peaked = true;
    if (
      peaked &&
      Math.abs(body.velocity.y) < 0.1 &&
      Math.abs(body.bounds.max.y - lidY) < 2
    ) {
      landed = true;
      break;
    }
  }
  assert.equal(peaked, true);
  assert.equal(landed, true);
  assert.ok(Math.abs(body.bounds.max.y - lidY) < 2);
  assert.ok(Math.abs(body.bounds.max.y - floorY) > 16);
  assert.equal(body.volumeHoldFloor, undefined);
  assert.equal(body.volumeHoldVolume, undefined);
  world.clear();
});

test("8x volume-hold ends after leaving the merged volume", () => {
  const world = physics();
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = world.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  const wall = world.rectangle(200, floorY - 32 + wallH / 2, 400, wallH, true);
  const body = world.rectangle(464, floorY - 112, 24 * T.hugeScale, 28 * T.hugeScale);
  body.ignoreWalls = true;
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  const overlapsFloor = () =>
    body.bounds.max.x > floor.bounds.min.x &&
    body.bounds.min.x < floor.bounds.max.x;
  const inWall = () =>
    body.bounds.max.x > wall.bounds.min.x &&
    body.bounds.min.x < wall.bounds.max.x;
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    world.step(dt);
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  assert.ok(Math.abs(body.bounds.max.y - floorY) < 2);
  assert.equal(body.velocity.y, 0);
  Body.setVelocity(body, { x: -T.walkSpeed, y: 0 });
  let leftWall = false;
  for (let i = 0; i < 300; i++) {
    world.step(dt);
    if (!inWall()) {
      leftWall = true;
      break;
    }
    assert.ok(
      Math.abs(body.bounds.max.y - floorY) < 2,
      JSON.stringify({
        i,
        floorY,
        feet: body.bounds.max.y,
        vy: body.velocity.y,
      }),
    );
    assert.equal(body.velocity.y, 0);
  }
  assert.equal(leftWall, true);
  for (let i = 0; i < 24; i++) world.step(dt);
  assert.ok(
    Math.abs(body.bounds.max.y - floorY) > 16,
    JSON.stringify({
      floorY,
      feet: body.bounds.max.y,
      vy: body.velocity.y,
    }),
  );
  world.clear();
});

test("8x stays grounded after floor-AABB overlap ends", () => {
  const s = game();
  parkNpcs(s, []);
  give(s, s.player, "mushroom8x");
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = s.physics.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  const wall = s.physics.rectangle(200, floorY - 32 + wallH / 2, 400, wallH, true);
  s.solids.push(floor, wall);
  at(s, floor.position.x, floorY - 14 * s.player.scale);
  const overlapsFloor = () =>
    s.player.body.bounds.max.x > floor.bounds.min.x &&
    s.player.body.bounds.min.x < floor.bounds.max.x;
  assert.equal(overlapsFloor(), true);
  tick(s, 0.15);
  let leftFloor = false;
  for (let i = 0; i < 120; i++) {
    s.step(dt, { ...emptyInput(), left: true });
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.grounded, true);
  assert.ok(Math.abs(s.player.body.bounds.max.y - floorY) < 2);
  assert.equal(s.player.body.velocity.y, 0);
  s.physics.clear();
});

function campaignMergedPairs(s: Simulation) {
  const solids = s.roomFor(s.player).solids.filter(
    (sol) => !sol.headOnly && sol.passHuge !== "top",
  );
  const pairs: { floor: Body; wall: Body; floorY: number }[] = [];
  for (const floor of solids) {
    const floorY = floor.bounds.min.y;
    if (floorY >= T.groundY - 20 || floorY <= MAP_TOP + 64) continue;
    if (floor.width < 128) continue;
    const wall = solids.find((sol) => {
      if (sol === floor) return false;
      if (Math.abs(sol.bounds.max.y - floor.bounds.max.y) >= 12) return false;
      if (sol.bounds.min.y >= floorY - 20) return false;
      const left = Math.abs(sol.bounds.max.x - floor.bounds.min.x) < 1;
      const right = Math.abs(sol.bounds.min.x - floor.bounds.max.x) < 1;
      return left || right;
    });
    if (wall) pairs.push({ floor, wall, floorY });
  }
  return pairs;
}
function campaignMergedPair(s: Simulation) {
  return campaignMergedPairs(s)[0];
}

test("8x campaign floor stays after smash rebuilds terrainRects", () => {
  const s = new Simulation(() => 0.5, physics());
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-4");
  s.reset();
  s.marioReturn = 1e6;
  parkNpcs(s, []);
  give(s, s.player, "mushroom8x");
  const pair = campaignMergedPair(s);
  assert.ok(pair, "1-4 has a merged wall+floor above groundY");
  const { floor, floorY } = pair;
  const span = {
    minX: floor.bounds.min.x,
    maxX: floor.bounds.max.x,
    minY: floor.bounds.min.y,
  };
  at(s, floor.position.x, floorY - 14 * s.player.scale);
  tick(s, 0.15);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.grounded, true);
  assert.ok(Math.abs(s.player.body.bounds.max.y - floorY) < 2);
  assert.equal(s.player.body.velocity.y, 0);
  assert.ok(s.activeRoom.smashedTiles.size > 0);
  assert.equal(s.physics.bodies.has(floor), false);
  const rebound = [...s.physics.bodies].find(
    (sol) =>
      sol.fixed &&
      !sol.headOnly &&
      sol.passHuge !== "top" &&
      Math.abs(sol.bounds.min.y - span.minY) < 2 &&
      sol.bounds.max.x > span.minX &&
      sol.bounds.min.x < span.maxX,
  );
  assert.ok(rebound, "rebuilt terrain still covers the original floor span");
  assert.ok(rebound.bounds.min.x <= span.minX + 1);
  assert.ok(rebound.bounds.max.x >= span.maxX - 1);
  assert.ok(
    s.player.body.bounds.max.x > rebound.bounds.min.x &&
      s.player.body.bounds.min.x < rebound.bounds.max.x,
  );
  s.physics.clear();
});

test("8x stays on campaign merged wall+floor after floor-AABB overlap ends", () => {
  const s = new Simulation(() => 0.5, physics());
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-4");
  s.reset();
  s.marioReturn = 1e6;
  parkNpcs(s, []);
  give(s, s.player, "mushroom8x");
  const pair = campaignMergedPairs(s).find(
    (entry) => entry.wall.width >= 24 * T.hugeScale,
  );
  assert.ok(pair, "1-4 has a merged wall wide enough to hold 8x after walk-off");
  const { floor, wall, floorY } = pair;
  const towardLeft = Math.abs(wall.bounds.max.x - floor.bounds.min.x) < 1;
  const startX = towardLeft
    ? Math.min(floor.position.x, floor.bounds.min.x + 48)
    : Math.max(floor.position.x, floor.bounds.max.x - 48);
  at(s, startX, floorY - 14 * s.player.scale);
  tick(s, 0.15);
  assert.ok(Math.abs(s.player.body.bounds.max.y - floorY) < 2);
  assert.equal(s.player.body.velocity.y, 0);
  assert.ok(s.player.body.volumeHoldFloor);
  assert.ok(s.player.body.volumeHoldVolume);
  let leftFloor = false;
  let heldY = floorY;
  for (let i = 0; i < 180; i++) {
    const body = s.player.body;
    const liveFloor = body.volumeHoldFloor;
    const liveWall = body.volumeHoldVolume;
    const smashBefore = s.activeRoom.smashedTiles.size;
    const span = liveFloor
      ? { minX: liveFloor.bounds.min.x, maxX: liveFloor.bounds.max.x }
      : undefined;
    s.step(dt, {
      ...emptyInput(),
      left: towardLeft,
      right: !towardLeft,
    });
    if (!liveFloor || !liveWall || !span) continue;
    const overlapsFloor =
      body.bounds.max.x > span.minX && body.bounds.min.x < span.maxX;
    if (overlapsFloor) continue;
    leftFloor = true;
    heldY = liveFloor.bounds.min.y;
    assert.equal(
      s.activeRoom.smashedTiles.size,
      smashBefore,
      "leaving step must not smash",
    );
    assert.equal(s.physics.bodies.has(liveFloor), true);
    assert.equal(s.physics.bodies.has(liveWall), true);
    assert.equal(body.volumeHoldFloor, liveFloor);
    assert.equal(body.volumeHoldVolume, liveWall);
    assert.equal(s.player.alive, true);
    assert.equal(s.player.grounded, true);
    assert.ok(
      Math.abs(body.bounds.max.y - heldY) < 2,
      JSON.stringify({
        floorY: heldY,
        feet: body.bounds.max.y,
        vy: body.velocity.y,
        x: body.position.x,
      }),
    );
    assert.equal(body.velocity.y, 0);
    assert.ok(
      body.bounds.max.x > liveWall.bounds.min.x &&
        body.bounds.min.x < liveWall.bounds.max.x,
    );
    assert.equal(
      hugeFloorAt(
        body.bounds.max.y,
        body.bounds.min.x,
        body.width,
        s.roomFor(s.player).solids,
      ),
      false,
      "smash rebuild must not leave a standable floor under the body",
    );
    break;
  }
  assert.equal(leftFloor, true);
  tick(s, 0.2);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.grounded, true);
  assert.ok(Math.abs(s.player.body.bounds.max.y - heldY) < 2);
  assert.equal(s.player.body.velocity.y, 0);
  s.physics.clear();
});

test("8x NPC stays on a merged wall+floor after floor-AABB overlap ends", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  n.warned = true;
  n.state = "run";
  give(s, n, "mushroom8x");
  const floorY = T.groundY - 96;
  const floorH = 256;
  const wallH = 288;
  const floor = s.physics.rectangle(464, floorY + floorH / 2, 128, floorH, true);
  const wall = s.physics.rectangle(728, floorY - 32 + wallH / 2, 400, wallH, true);
  s.solids.push(floor, wall);
  assert.equal(floor.bounds.max.x, wall.bounds.min.x);
  Body.setPosition(n.body, {
    x: floor.position.x,
    y: floorY - 14 * n.scale,
  });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.body.volumeHoldY = floorY;
  n.body.volumeHoldFloor = floor;
  n.body.volumeHoldVolume = wall;
  n.body.volumeHoldFloorSpan = holdSpanOf(floor);
  n.body.volumeHoldVolumeSpan = holdSpanOf(wall);
  tick(s, dt);
  const overlapsFloor = () =>
    n.body.bounds.max.x > floor.bounds.min.x &&
    n.body.bounds.min.x < floor.bounds.max.x;
  let leftFloor = false;
  for (let i = 0; i < 180; i++) {
    s.step(dt, emptyInput());
    if (!overlapsFloor()) {
      leftFloor = true;
      break;
    }
  }
  assert.equal(leftFloor, true);
  for (let i = 0; i < 15; i++) {
    s.step(dt, emptyInput());
    assert.equal(n.grounded, true);
    assert.equal(n.body.velocity.y, 0);
    assert.ok(Math.abs(n.body.bounds.max.y - floorY) < 2);
  }
  assert.equal(n.alive, true);
  assert.ok(n.body.volumeHoldFloor);
  assert.ok(n.body.volumeHoldVolume);
  s.physics.clear();
});

test("8x still falls through a pipe interior", () => {
  const s = game();
  parkNpcs(s, []);
  give(s, s.player, "mushroom8x");
  const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
  const top = pipe.body!.bounds.min.y;
  at(s, pipe.x, top + 20 - 14 * s.player.scale);
  const startY = s.player.body.position.y;
  tick(s, 0.25);
  assert.equal(pipe.broken, true);
  assert.ok(
    s.player.body.position.y > startY + 16,
    JSON.stringify({
      startY,
      y: s.player.body.position.y,
      grounded: s.player.grounded,
    }),
  );
});

test("8x NPCs keep running and use the same size ladder", () => {
  const s = game();
  const n = s.npcs[0];
  n.warned = true;
  n.state = "run";
  give(s, n, "mushroom8x");
  tick(s, 0.2);
  assert.equal(n.scale, T.hugeScale);
  assert.equal(n.state, "run");
  assert.ok(n.alive && !n.saved);
  const stairsX = 184 * 32;
  Body.setPosition(n.body, {
    x: stairsX - 220,
    y: T.groundY - 14 * n.scale,
  });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  const startX = n.body.position.x;
  tick(s, 2.5);
  assert.equal(n.state, "run");
  assert.ok(n.alive && !n.saved);
  assert.ok(n.body.position.x > startX + 80);
});

test("8x player survives a Mario stomp with the same scale and vy", () => {
  const s = game();
  give(s, s.player, "mushroom8x");
  parkNpcs(s, []);
  tick(s, 0.1);
  marioStomp(s, s.player);
  const scale = s.player.scale;
  const vy = s.player.body.velocity.y;
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.scale, scale);
  assert.equal(s.player.scale, T.hugeScale);
  assert.equal(s.player.body.velocity.y, vy);
  assert.ok(s.player.hugeLeft > 0);
  assert.equal(s.player.body.ignoreWalls, true);
  assert.notEqual(s.mario.body.velocity.y, -T.stompBounce);
  assert.ok(s.mario.body.velocity.y > 0);
  assert.equal(s.marioStage, 0);
  assert.ok(s.events.includes("shrink"));
  assert.equal(s.events.includes("splat"), false);
});

test("8x NPC survives a Mario stomp with the same scale and vy", () => {
  for (const kind of ["goomba", "koopa"] as const) {
    const s = game();
    const n =
      kind === "koopa"
        ? troopa(s)
        : s.npcs.find((npc) => npc.kind === "goomba")!;
    give(s, n, "mushroom8x");
    parkNpcs(s, [n]);
    n.idleWalking = false;
    n.idleWait = 99;
    n.wait = 99;
    tick(s, 0.1);
    marioStomp(s, n);
    const scale = n.scale;
    const vy = n.body.velocity.y;
    tick(s, dt);
    assert.equal(n.alive, true, kind);
    assert.equal(n.scale, scale, kind);
    assert.equal(n.scale, T.hugeScale, kind);
    assert.equal(n.body.velocity.y, vy, kind);
    assert.equal(n.shell, "none", kind);
    assert.notEqual(s.mario.body.velocity.y, -T.stompBounce, kind);
    assert.ok(s.mario.body.velocity.y > 0, kind);
    assert.equal(s.marioStage, 0, kind);
    assert.ok(s.events.includes("shrink"), kind);
    assert.equal(s.events.includes("splat"), false, kind);
  }
});

test("Mario fireball does not kill 8x", () => {
  for (const who of ["player", "npc"] as const) {
    const s = game();
    const target = who === "player" ? s.player : s.npcs[0];
    give(s, target, "mushroom8x");
    parkNpcs(s, who === "npc" ? [target] : []);
    stillMario(s);
    Body.setPosition(s.mario.body, { x: 4000, y: 411 });
    s.fireballs.push({
      id: 42,
      x: target.body.position.x,
      y: target.body.position.y,
      vx: 0,
      age: 0,
      owner: "mario",
      vy: 0,
    });
    tick(s, dt);
    assert.equal(target.alive, true, who);
    assert.equal(target.scale, T.hugeScale, who);
    assert.equal(s.events.includes("splat"), false, who);
  }
});

test("first damaging stomp still shrinks 2x and 3x", () => {
  for (const kind of ["mushroom", "mushroom3x"] as const) {
    const s = game();
    give(s, s.player, kind);
    parkNpcs(s, []);
    marioStomp(s, s.player);
    tick(s, dt);
    assert.equal(s.player.alive, true, kind);
    assert.equal(s.player.scale, 1, kind);
    assert.ok(s.events.includes("shrink"), kind);
  }
});

test("8x contact is one hit, stays hunted, dies in a pit, then 3x is vulnerable", () => {
  const hit = game();
  give(hit, hit.player, "mushroom8x");
  parkNpcs(hit, []);
  assert.equal(hit.invincible(hit.player), false);
  stillMario(hit);
  Body.setPosition(hit.mario.body, { ...hit.player.body.position });
  Body.setVelocity(hit.mario.body, { x: 0, y: 0 });
  Body.setVelocity(hit.player.body, { x: 0, y: 0 });
  tick(hit, dt);
  assert.equal(hit.marioStage, 0);
  assert.ok(hit.player.alive && hit.mario.alive);
  assert.equal(hit.player.scale, T.hugeScale);
  assert.equal(hit.events.includes("marioDeath"), false);

  const hunt = game();
  give(hunt, hunt.player, "mushroom8x");
  hunt.random = () => 0;
  stillMario(hunt);
  hunt.marioLook = 0;
  hunt.marioPause = 0;
  hunt.marioReaction = 0;
  Body.setPosition(hunt.mario.body, { x: 0, y: 411 });
  tick(hunt, dt);
  assert.equal(hunt.marioTarget, hunt.player.id);

  const pit = game();
  give(pit, pit.player, "mushroom8x");
  parkNpcs(pit, []);
  Body.setPosition(pit.player.body, { x: 200, y: 700 });
  tick(pit, dt);
  assert.equal(pit.player.alive, false);
  assert.equal(pit.mode, "dead");
  assert.equal(pit.lives, T.startingLives - 1);

  const later = game();
  give(later, later.player, "mushroom8x");
  parkNpcs(later, []);
  tick(later, T.hugeSeconds);
  assert.equal(later.player.scale, T.giantScale);
  later.player.transformLeft = 0;
  marioStomp(later, later.player);
  tick(later, dt);
  assert.equal(later.player.alive, true);
  assert.equal(later.player.scale, 1);
  assert.ok(later.events.includes("shrink"));
});

test("air overlap: Mario with higher feet does not hurt 8x", () => {
  const s = game();
  give(s, s.player, "mushroom8x");
  airOverlap(s, 8);
  assert.ok(s.mario.body.bounds.max.y < s.player.body.bounds.max.y - 0.5);
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.scale, T.hugeScale);
  assert.equal(s.marioStage, 0);
  assert.ok(s.events.includes("shrink"));
  assert.equal(s.events.includes("splat"), false);
});

test("a moving shell does not hurt 8x", () => {
  for (const who of ["player", "npc"] as const) {
    const s = game();
    const target = who === "player" ? s.player : s.npcs[0];
    give(s, target, "mushroom8x");
    const n = troopa(s);
    parkNpcs(s, who === "npc" ? [target, n] : [n]);
    n.idleWalking = false;
    n.wait = 99;
    n.shell = "moving";
    n.facing = 1;
    n.kickIgnore = 0;
    Body.setPosition(n.body, { x: 200, y: 415 });
    Body.setVelocity(n.body, { x: T.shellSpeed, y: 0 });
    const y = T.groundY - 14 * target.scale;
    if (who === "player") at(s, n.body.position.x + 8, y);
    else {
      Body.setPosition(target.body, { x: n.body.position.x + 8, y });
      Body.setVelocity(target.body, { x: 0, y: 0 });
      target.idleWalking = false;
      target.idleWait = 99;
    }
    tick(s, dt);
    assert.equal(target.alive, true, who);
    assert.equal(target.scale, T.hugeScale, who);
    assert.equal(s.events.includes("shrink"), false, who);
    assert.equal(s.events.includes("splat"), false, who);
  }
});

test("Mario side contact does not kick a stopped 8x Koopa shell", () => {
  const s = game();
  const n = troopa(s);
  give(s, n, "mushroom8x");
  parkNpcs(s, [n]);
  at(s, 4000);
  n.idleWalking = false;
  n.wait = 99;
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  Body.setPosition(n.body, { x: 200, y: T.groundY - 14 * n.scale });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  stillMario(s);
  Body.setPosition(s.mario.body, {
    x: n.body.position.x + 20,
    y: n.body.position.y,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(n.alive, true);
  assert.equal(n.scale, T.hugeScale);
  assert.equal(n.shell, "stopped");
  assert.equal(s.events.includes("kick"), false);
  assert.notEqual(s.mario.body.velocity.y, -T.stompBounce);
});

function overlapWithMario(s: Simulation, actor: Actor) {
  stillMario(s);
  Body.setPosition(s.mario.body, {
    x: actor.body.position.x,
    y: actor.body.position.y,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  Body.setVelocity(actor.body, { x: 0, y: 0 });
}

test("8x NPC fireball shrinks 2x and 3x and kills 1x", () => {
  for (const kind of ["mushroom", "mushroom3x"] as const) {
    const s = game();
    const n = s.npcs[0];
    give(s, n, kind);
    parkNpcs(s, [n]);
    at(s, 4000);
    s.fireballs.push({
      id: 7,
      x: n.body.position.x,
      y: n.body.position.y,
      vx: 0,
      age: 0,
      owner: "mario",
      vy: 0,
    });
    tick(s, dt);
    assert.equal(n.alive, true, kind);
    assert.equal(n.scale, 1, kind);
    assert.ok(s.events.includes("shrink"), kind);
  }
  const small = game();
  const n = small.npcs[0];
  parkNpcs(small, [n]);
  at(small, 4000);
  small.fireballs.push({
    id: 8,
    x: n.body.position.x,
    y: n.body.position.y,
    vx: 0,
    age: 0,
    owner: "mario",
    vy: 0,
  });
  tick(small, dt);
  assert.equal(n.alive, false);
});

test("8x contact pairs drop one stage, both 8x miss, and star still wins", () => {
  const playerHit = game();
  playerHit.setMarioStage(2);
  give(playerHit, playerHit.player, "mushroom8x");
  parkNpcs(playerHit, []);
  overlapWithMario(playerHit, playerHit.player);
  tick(playerHit, dt);
  assert.equal(playerHit.marioStage, 1);
  assert.equal(playerHit.mario.alive, true);
  assert.equal(playerHit.player.scale, T.hugeScale);

  const npcHit = game();
  const n = npcHit.npcs[0];
  give(npcHit, n, "mushroom8x");
  parkNpcs(npcHit, [n]);
  at(npcHit, 4000);
  overlapWithMario(npcHit, n);
  tick(npcHit, dt);
  assert.equal(npcHit.marioStage, 0);
  assert.equal(n.alive, true);
  assert.equal(n.scale, T.hugeScale);

  const marioVsSmall = game();
  marioVsSmall.marioActive = true;
  give(marioVsSmall, marioVsSmall.mario, "mushroom8x");
  parkNpcs(marioVsSmall, []);
  overlapWithMario(marioVsSmall, marioVsSmall.player);
  tick(marioVsSmall, dt);
  assert.equal(marioVsSmall.player.alive, false);
  assert.equal(marioVsSmall.mario.scale, T.hugeScale);

  for (const kind of ["mushroom", "mushroom3x"] as const) {
    const s = game();
    s.marioActive = true;
    give(s, s.player, kind);
    give(s, s.mario, "mushroom8x");
    parkNpcs(s, []);
    overlapWithMario(s, s.player);
    tick(s, dt);
    assert.equal(s.player.alive, true, kind);
    assert.equal(s.player.scale, 1, kind);
    assert.equal(s.mario.scale, T.hugeScale, kind);
  }

  const marioVsNpc = game();
  const victim = marioVsNpc.npcs[0];
  marioVsNpc.marioActive = true;
  give(marioVsNpc, marioVsNpc.mario, "mushroom8x");
  parkNpcs(marioVsNpc, [victim]);
  at(marioVsNpc, 4000);
  overlapWithMario(marioVsNpc, victim);
  tick(marioVsNpc, dt);
  assert.equal(victim.alive, false);
  assert.equal(marioVsNpc.mario.scale, T.hugeScale);

  const both = game();
  const other = both.npcs[0];
  both.marioActive = true;
  give(both, both.player, "mushroom8x");
  give(both, both.mario, "mushroom8x");
  parkNpcs(both, [other]);
  overlapWithMario(both, both.player);
  tick(both, dt);
  assert.equal(both.player.alive, true);
  assert.equal(both.player.scale, T.hugeScale);
  assert.equal(both.mario.alive, true);
  assert.equal(both.mario.scale, T.hugeScale);
  assert.equal(both.marioStage, 1);
  give(both, other, "mushroom8x");
  overlapWithMario(both, other);
  tick(both, dt);
  assert.equal(other.alive, true);
  assert.equal(other.scale, T.hugeScale);
  assert.equal(both.mario.scale, T.hugeScale);

  const starred = game();
  starred.marioActive = true;
  give(starred, starred.player, "star");
  give(starred, starred.mario, "mushroom8x");
  parkNpcs(starred, []);
  overlapWithMario(starred, starred.player);
  tick(starred, dt);
  assert.equal(starred.mario.alive, false);
  assert.equal(starred.marioActive, false);
  assert.ok(starred.player.alive);
});

test("8x player, NPC, and Mario die in a pit; TIME 0 still kills 8x", () => {
  const player = game();
  give(player, player.player, "mushroom8x");
  parkNpcs(player, []);
  Body.setPosition(player.player.body, { x: 200, y: 700 });
  tick(player, dt);
  assert.equal(player.player.alive, false);
  assert.equal(player.mode, "dead");
  assert.equal(player.lives, T.startingLives - 1);
  assert.ok(player.playerDeath);
  const pitY = player.playerDeath.y;
  tick(player, 0.3);
  assert.ok(player.playerDeath && player.playerDeath.y >= pitY);

  const npc = game();
  const n = npc.npcs[0];
  give(npc, n, "mushroom8x");
  parkNpcs(npc, [n]);
  Body.setPosition(n.body, { x: 200, y: 700 });
  tick(npc, dt);
  assert.equal(n.alive, false);
  assert.equal(npc.died(), 1);

  const normalMario = game();
  normalMario.marioActive = true;
  parkNpcs(normalMario, []);
  stillMario(normalMario);
  Body.setPosition(normalMario.mario.body, { x: 200, y: 700 });
  tick(normalMario, dt);

  const mario = game();
  mario.marioActive = true;
  give(mario, mario.mario, "mushroom8x");
  parkNpcs(mario, []);
  stillMario(mario);
  Body.setPosition(mario.mario.body, { x: 200, y: 700 });
  tick(mario, dt);
  assert.equal(mario.marioActive, false);
  assert.equal(mario.marioActive, normalMario.marioActive);
  assert.equal(mario.marioReturn, normalMario.marioReturn);
  assert.ok(mario.mario.body.position.y > 620);

  const time = game();
  give(time, time.player, "mushroom8x");
  time.timeLeft = 1;
  tick(time, T.timerTickFrames / 60);
  assert.equal(time.timeLeft, 0);
  assert.equal(time.mode, "dead");
  assert.equal(time.player.alive, false);
});

test("player fireballs and stomps do not drop 8x Mario", () => {
  const s = game();
  s.marioActive = true;
  give(s, s.player, "flower");
  give(s, s.mario, "mushroom8x");
  parkNpcs(s, []);
  stillMario(s);
  s.fireballs.push({
    id: 11,
    x: s.mario.body.position.x,
    y: s.mario.body.position.y,
    vx: 0,
    age: 0,
    owner: "player",
    vy: 0,
  });
  tick(s, dt);
  assert.equal(s.mario.scale, T.hugeScale);
  assert.equal(s.marioStage, 1);
  assert.equal(s.mario.alive, true);
  give(s, s.player, "mushroom3x");
  giantStompMario(s);
  tick(s, dt);
  assert.equal(s.mario.scale, T.hugeScale);
  assert.equal(s.mario.alive, true);
  assert.equal(s.events.includes("marioDeath"), false);
});

function goalPipeSim() {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-2");
  s.reset();
  s.marioReturn = 1e6;
  parkNpcs(s, []);
  s.player.areaId = "40";
  const sub = s.loadRoom("40");
  const goal = sub.data.goal!;
  const goalData = sub.data.pipes.find(
    (p) => p.column === goal.column && p.row === goal.row,
  )!;
  const goalPipe = s.obstacles.find((c) => {
    const x = sub.offset + (goalData.column + goalData.width / 2) * 32;
    return c.kind === "pipe" && Math.abs(c.x - x) < 1;
  })!;
  return { s, sub, goalPipe };
}

function standOnPipe(actor: Actor, pipe: { x: number; body?: { bounds: { min: { y: number } } } }) {
  Body.setPosition(actor.body, {
    x: pipe.x,
    y: pipe.body!.bounds.min.y - actor.body.height / 2,
  });
  Body.setVelocity(actor.body, { x: 0, y: 0 });
}

test("8x shrinks to fallback then enters a goal pipe or castle door", () => {
  const playerPipe = goalPipeSim();
  give(playerPipe.s, playerPipe.s.player, "mushroom8x");
  standOnPipe(playerPipe.s.player, playerPipe.goalPipe);
  tick(playerPipe.s, 0.1, { down: true });
  assert.ok(playerPipe.s.player.pipeTravel);
  assert.equal(playerPipe.s.player.scale, T.giantScale);
  assert.equal(playerPipe.s.player.hugeLeft, 0);
  assert.ok(playerPipe.s.player.transformLeft > 0);
  assert.equal(playerPipe.s.player.transformFrom, T.hugeScale);
  assert.ok(playerPipe.s.events.includes("shrink"));
  assert.equal(playerPipe.s.events.includes("pipe"), false);
  playerPipe.s.physics.clear();

  const npcPipe = goalPipeSim();
  const n = npcPipe.s.npcs[0];
  n.areaId = "40";
  n.warned = true;
  n.state = "run";
  parkNpcs(npcPipe.s, [n]);
  give(npcPipe.s, n, "mushroom8x");
  standOnPipe(n, npcPipe.goalPipe);
  tick(npcPipe.s, 0.15);
  assert.ok(n.pipeTravel);
  assert.equal(n.scale, T.giantScale);
  assert.equal(n.hugeLeft, 0);
  assert.ok(n.transformLeft > 0);
  assert.equal(n.transformFrom, T.hugeScale);
  assert.ok(npcPipe.s.events.includes("shrink"));
  npcPipe.s.physics.clear();

  const marioPipe = goalPipeSim();
  marioPipe.s.marioActive = true;
  marioPipe.s.mario.areaId = "40";
  stillMario(marioPipe.s);
  marioPipe.s.marioDecision = 0;
  marioPipe.s.marioChase = 0;
  marioPipe.s.marioPause = 0;
  marioPipe.s.marioReaction = 0;
  marioPipe.s.random = () => 0;
  for (const c of marioPipe.s.obstacles) {
    if (c.kind === "pipe" && c !== marioPipe.goalPipe) c.x = -1e6;
  }
  give(marioPipe.s, marioPipe.s.mario, "mushroom8x");
  standOnPipe(marioPipe.s.mario, marioPipe.goalPipe);
  marioPipe.s.cameraX = marioPipe.goalPipe.x - 400;
  tick(marioPipe.s, dt);
  assert.ok(marioPipe.s.mario.pipeTravel);
  assert.equal(marioPipe.s.mario.scale, 1);
  assert.equal(marioPipe.s.marioStage, 1);
  assert.equal(marioPipe.s.mario.hugeLeft, 0);
  assert.ok(marioPipe.s.mario.transformLeft > 0);
  assert.equal(marioPipe.s.mario.transformFrom, T.hugeScale);
  assert.ok(marioPipe.s.events.includes("shrink"));
  marioPipe.s.physics.clear();

  const door = game();
  parkNpcs(door, []);
  give(door, door.player, "mushroom8x");
  const room = door.activeRoom;
  Body.setPosition(door.player.body, {
    x: room.goalX + 4,
    y: T.groundY - 14 * door.player.scale,
  });
  Body.setVelocity(door.player.body, { x: 0, y: 0 });
  tick(door, dt, { right: true });
  assert.equal(door.mode, "finishing");
  assert.equal(door.player.scale, T.giantScale);
  assert.equal(door.player.hugeLeft, 0);
  assert.equal(door.player.transformLeft, 0);
  assert.equal(door.events.includes("shrink"), false);
  assert.ok(door.events.includes("win"));

  const npcDoor = game();
  const saved = npcDoor.npcs[0];
  saved.warned = true;
  parkNpcs(npcDoor, [saved]);
  give(npcDoor, saved, "mushroom8x");
  Body.setPosition(saved.body, {
    x: npcDoor.activeRoom.goalX + 4,
    y: T.groundY - 14 * saved.scale,
  });
  Body.setVelocity(saved.body, { x: 0, y: 0 });
  tick(npcDoor, dt);
  assert.equal(saved.saved, true);
  assert.equal(saved.scale, T.giantScale);
  assert.equal(saved.hugeLeft, 0);
  assert.equal(saved.transformLeft, 0);
  assert.equal(npcDoor.events.includes("shrink"), false);

  const marioDoor = game();
  marioDoor.marioActive = true;
  stillMario(marioDoor);
  parkNpcs(marioDoor, []);
  give(marioDoor, marioDoor.mario, "mushroom8x");
  Body.setPosition(marioDoor.mario.body, {
    x: marioDoor.activeRoom.goalX + 4,
    y: T.groundY - 14 * marioDoor.mario.scale,
  });
  Body.setVelocity(marioDoor.mario.body, { x: 0, y: 0 });
  const marioDoorReturn = marioDoor.marioReturn;
  tick(marioDoor, dt);
  assert.equal(marioDoor.mario.scale, 1);
  assert.equal(marioDoor.marioStage, 1);
  assert.equal(marioDoor.mario.hugeLeft, 0);
  assert.equal(marioDoor.mario.transformLeft, 0);
  assert.equal(marioDoor.events.includes("shrink"), false);
  assert.equal(marioDoor.mario.alive, true);
  assert.equal(marioDoor.marioActive, false);
  assert.equal(marioDoor.mario.body.frozen, true);
  assert.equal(marioDoor.marioReturn, marioDoorReturn);
  marioDoor.marioReturn = 0;
  tick(marioDoor, 5);
  assert.equal(marioDoor.marioActive, false);
});

function parkMarioAtDoor(s: Simulation) {
  s.marioActive = true;
  stillMario(s);
  parkNpcs(s, []);
  Body.setPosition(s.mario.body, {
    x: s.activeRoom.goalX + 4,
    y: T.groundY - 14 * s.mario.scale,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
}

function assertMarioEnteredDoor(s: Simulation) {
  const kills = s.marioKills;
  const ret = s.marioReturn;
  const goalX = s.activeRoom.goalX;
  tick(s, dt);
  assert.equal(s.marioActive, false);
  assert.equal(s.mario.alive, true);
  assert.equal(s.mario.body.frozen, true);
  assert.equal(s.marioReturn, ret);
  assert.ok(
    s.mario.body.position.x <= goalX + 32,
    `Mario walked past the door to ${s.mario.body.position.x}, door ${goalX}`,
  );
  assert.equal(s.marioKills, kills);
  s.marioReturn = 0;
  tick(s, 5);
  assert.equal(s.marioActive, false);
  assert.equal(s.marioKills, kills);
}

test("any-size Mario enters a castle door and does not return", () => {
  const superMario = game();
  parkMarioAtDoor(superMario);
  assertMarioEnteredDoor(superMario);

  const small = game();
  small.setMarioStage(0);
  parkMarioAtDoor(small);
  assertMarioEnteredDoor(small);

  const fire = game();
  fire.setMarioStage(2);
  parkMarioAtDoor(fire);
  assertMarioEnteredDoor(fire);
});

test("Mario walking to the castle door never passes it", () => {
  const s = game();
  parkNpcs(s, []);
  s.marioActive = true;
  s.marioStun = 0;
  s.marioLook = 10;
  s.marioPause = 0;
  s.marioChase = 0;
  s.marioReaction = 0;
  s.marioDecision = 99;
  s.marioJumpWait = 99;
  Body.setFrozen(s.mario.body, false);
  const goalX = s.activeRoom.goalX;
  Body.setPosition(s.mario.body, {
    x: goalX - 48,
    y: T.groundY - 14 * s.mario.scale,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  s.mario.facing = 1;
  s.cameraX = goalX - 400;
  const ret = s.marioReturn;
  let farthest = s.mario.body.position.x;
  for (let i = 0; i < 180; i++) {
    tick(s, dt);
    farthest = Math.max(farthest, s.mario.body.position.x);
    assert.ok(
      s.mario.body.position.x < goalX + 32,
      `Mario passed the door to ${s.mario.body.position.x} on frame ${i}`,
    );
    if (!s.marioActive) break;
  }
  assert.equal(s.marioActive, false);
  assert.equal(s.mario.body.frozen, true);
  assert.ok(farthest < goalX + 32, `farthest ${farthest} door ${goalX}`);
  assert.equal(s.marioReturn, ret);
  s.marioReturn = 0;
  tick(s, 5);
  assert.equal(s.marioActive, false);
});

test("MARIO tally still counts after Mario enters the door", () => {
  const s = game();
  s.marioKills = 1;
  parkMarioAtDoor(s);
  assertMarioEnteredDoor(s);
  assert.equal(s.marioKills, 1);
  s.timeLeft = 0;
  s.score = 0;
  s.finish();
  s.tallyPhase = "mario";
  s.tallyHold = T.tallyLineSeconds;
  tick(s, dt);
  assert.equal(s.score, T.marioScore);
});

test("star-defeating 8x Mario does not shrink-blink or play pipe", () => {
  const s = game();
  parkNpcs(s, []);
  stillMario(s);
  give(s, s.mario, "mushroom8x");
  give(s, s.player, "star");
  s.events.length = 0;
  Body.setPosition(s.mario.body, { ...s.player.body.position });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(s.mario.alive, false);
  assert.ok(s.mario.scale < T.hugeScale);
  assert.equal(s.mario.hugeLeft, 0);
  assert.equal(s.mario.transformLeft, 0);
  assert.equal(s.events.includes("shrink"), false);
  assert.ok(s.events.includes("marioDeath"));
});

test("8x Mario contact kills a stopped 1x shell instead of kicking it", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  s.marioActive = true;
  give(s, s.mario, "mushroom8x");
  overlapWithMario(s, n);
  tick(s, dt);
  assert.equal(n.alive, false);
  assert.equal(s.events.includes("kick"), false);
  assert.notEqual(s.mario.body.velocity.y, -T.stompBounce);
  assert.equal(s.mario.scale, T.hugeScale);
});

test("a falling player does not shell an 8x Koopa", () => {
  const s = game();
  const n = troopa(s);
  give(s, n, "mushroom8x");
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  Body.setPosition(n.body, { x: 200, y: T.groundY - 14 * n.scale });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  at(s, 200, n.body.bounds.min.y - s.player.body.height / 2 - 2);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.equal(n.alive, true);
  assert.equal(n.scale, T.hugeScale);
  assert.equal(n.shell, "none");
});

test("a falling player does not shell a walking Koopa, hop, or kill it", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.warned = true;
  n.state = "run";
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  at(s, 200, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.ok(s.player.body.velocity.y > 0);
  assert.notEqual(s.player.body.velocity.y, -T.stompBounce);
  assert.ok(n.alive);
  assert.equal(n.saved, false);
  assert.equal(n.shell, "none");
  assert.equal(n.warned, true);
  assert.equal(s.living(), T.population);
  assert.equal(s.events.includes("splat"), false);
  assert.equal(s.particles.length, 0);
});

test("a falling player landing on an unwarned walking Koopa does not shell or warn it", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  at(s, 200, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.ok(s.player.body.velocity.y > 0);
  assert.notEqual(s.player.body.velocity.y, -T.stompBounce);
  assert.ok(n.alive);
  assert.equal(n.shell, "none");
  assert.equal(n.warned, false);
  assert.equal(s.warned, 0);
  assert.equal(s.events.includes("warn"), false);
  assert.equal(s.events.includes("splat"), false);
});

test("Mario stomps a walking Koopa, shells it, and bounces", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  at(s, 4000);
  marioStomp(s, n);
  tick(s, dt);
  assert.ok(s.mario.body.velocity.y < 0);
  assert.ok(n.alive);
  assert.equal(n.shell, "stopped");
  assert.equal(s.events.includes("splat"), false);
});

test("a falling player landing still leaves a Goomba unshellable", () => {
  const s = game();
  const n = s.npcs[0];
  assert.equal(n.kind, "goomba");
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  at(s, 200, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.ok(s.player.body.velocity.y > 0);
  assert.notEqual(s.player.body.velocity.y, -T.stompBounce);
  assert.ok(n.alive);
  assert.equal(n.shell, "none");
  assert.equal(s.events.includes("splat"), false);
});

test("side contact with a walking Koopa does not hurt or shell it", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  Body.setPosition(n.body, { x: 200, y: 415 });
  at(s, 180, 415);
  tick(s, dt);
  assert.ok(s.player.alive);
  assert.equal(n.shell, "none");
  assert.ok(n.alive);
  assert.equal(s.events.includes("splat"), false);
  assert.equal(s.events.includes("kick"), false);
});

test("Mario kicks a stopped shell at original shell speed", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.idleWalking = false;
  n.wait = 99;
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  at(s, 4000);
  stillMario(s);
  Body.setPosition(s.mario.body, { x: 192, y: 415 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(n.shell, "moving");
  assert.equal(n.facing, 1);
  assert.equal(n.body.velocity.x, T.shellSpeed);
  assert.equal(T.shellSpeed, 6);
  assert.ok(s.events.includes("kick"));
  assert.ok(n.alive);
  tick(s, 2 * dt);
  assert.ok(
    bodiesOverlap(s.mario, n),
    "still overlapping, so Mario survival is from kick grace",
  );
  assert.ok(s.mario.alive);
});

test("player side contact does not kick a stopped shell", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.idleWalking = false;
  n.wait = 99;
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  at(s, 180, 415);
  tick(s, dt);
  assert.equal(n.shell, "stopped");
  assert.equal(n.body.velocity.x, 0);
  assert.equal(s.events.includes("kick"), false);
  assert.ok(n.alive);
  assert.ok(s.player.alive);
});

test("Mario stomping a stopped shell kicks it Mario's way", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  at(s, 4000);
  stillMario(s);
  Body.setPosition(s.mario.body, { x: 188, y: 375 });
  Body.setVelocity(s.mario.body, { x: 0, y: 10 });
  const kicks = s.events.filter((e) => e === "kick").length;
  tick(s, dt);
  assert.equal(n.shell, "moving");
  assert.equal(n.facing, 1);
  assert.equal(n.body.velocity.x, T.shellSpeed);
  assert.equal(s.events.filter((e) => e === "kick").length, kicks + 1);
  assert.ok(s.mario.body.velocity.y < 0);
  assert.ok(n.alive);
});

test("a falling player does not kick a stopped shell", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  Body.setPosition(n.body, { x: 200, y: 415 });
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  at(s, 188, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.equal(n.shell, "stopped");
  assert.equal(s.events.includes("kick"), false);
  assert.ok(s.player.body.velocity.y > 0);
  assert.notEqual(s.player.body.velocity.y, -T.stompBounce);
  assert.ok(s.player.alive);
  assert.ok(n.alive);
});

test("a falling player does not stop a moving shell and dies", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  n.idleWalking = false;
  n.wait = 99;
  n.shell = "moving";
  n.facing = 1;
  n.kickIgnore = 0;
  Body.setVelocity(n.body, { x: T.shellSpeed, y: 0 });
  at(s, n.body.position.x, n.body.position.y - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.equal(n.shell, "moving");
  assert.equal(s.player.alive, false);
  assert.ok(s.events.includes("splat"));
});

test("player side contact with a moving shell kills after no kick grace", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  n.idleWalking = false;
  n.wait = 99;
  n.shell = "moving";
  n.facing = 1;
  n.kickIgnore = 0;
  Body.setVelocity(n.body, { x: T.shellSpeed, y: 0 });
  at(s, n.body.position.x + 8, 415);
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(n.shell, "moving");
  assert.equal(s.player.alive, false);
  assert.ok(s.events.includes("splat"));
});

test("a stopped shell wakes on the original timer and keeps warned or idle", () => {
  assert.equal(T.shellWake, 5.6);
  assert.equal(T.shellShake, 1.4);
  for (const warned of [false, true]) {
    const s = game();
    const n = troopa(s);
    parkNpcs(s, [n]);
    n.warned = warned;
    n.state = warned ? "run" : "idle";
    Body.setPosition(n.body, { x: 200, y: 415 });
    n.idleWalking = false;
    n.wait = 99;
    n.shell = "stopped";
    n.wakeLeft = T.shellWake;
    at(s, 40, 415);
    tick(s, T.shellWake - 0.05);
    assert.equal(n.shell, "stopped");
    assert.ok(n.wakeLeft <= T.shellShake);
    tick(s, 0.1);
    assert.equal(n.shell, "none");
    assert.equal(n.warned, warned);
    assert.equal(n.state, warned ? "run" : "idle");
    assert.ok(n.alive);
  }
});

test("fireballs, pits, and other moving shells still kill; a shelled Koopa can be saved", () => {
  const s = game();
  const shells = s.npcs.filter((n) => n.kind === "koopa");
  const n = shells[0]!;
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  s.fireballs.push({
    id: 99,
    x: 200,
    y: 415,
    vx: 0,
    age: 0,
    owner: "mario",
    vy: 0,
  });
  tick(s, dt);
  assert.equal(n.alive, false);
  assert.ok(s.events.includes("splat"));

  const s2 = game();
  const pit = troopa(s2);
  parkNpcs(s2, [pit]);
  pit.shell = "stopped";
  pit.wakeLeft = T.shellWake;
  Body.setPosition(pit.body, { x: 200, y: 700 });
  tick(s2, dt);
  assert.equal(pit.alive, false);
  assert.equal(s2.events.includes("splat"), false);

  const s3 = game();
  const a = s3.npcs.filter((npc) => npc.kind === "koopa")[0]!;
  const b = s3.npcs.filter((npc) => npc.kind === "koopa")[1]!;
  parkNpcs(s3, [a, b]);
  Body.setPosition(a.body, { x: 200, y: 415 });
  Body.setPosition(b.body, { x: 214, y: 415 });
  a.shell = "moving";
  a.facing = 1;
  a.kickIgnore = 0;
  Body.setVelocity(a.body, { x: T.shellSpeed, y: 0 });
  b.shell = "stopped";
  b.wakeLeft = T.shellWake;
  tick(s3, dt);
  assert.ok(a.alive);
  assert.equal(b.alive, false);
  assert.ok(s3.events.includes("splat"));

  const sStar = game();
  const starred = troopa(sStar);
  const hurter = sStar.npcs.filter((npc) => npc.kind === "koopa")[1]!;
  parkNpcs(sStar, [starred, hurter]);
  starred.starLeft = T.starSeconds;
  Body.setPosition(starred.body, { x: 214, y: 415 });
  Body.setPosition(hurter.body, { x: 200, y: 415 });
  hurter.shell = "moving";
  hurter.facing = 1;
  hurter.kickIgnore = 0;
  Body.setVelocity(hurter.body, { x: T.shellSpeed, y: 0 });
  tick(sStar, dt);
  assert.ok(starred.alive);
  assert.equal(starred.starLeft > 0, true);

  const s4 = game();
  const saved = troopa(s4);
  parkNpcs(s4, [saved], 80);
  saved.shell = "stopped";
  saved.wakeLeft = T.shellWake;
  Body.setPosition(saved.body, { x: GOAL_X + 2, y: 415 });
  tick(s4, dt);
  assert.ok(saved.alive);
  assert.equal(saved.saved, true);
  assert.equal(s4.saved, 1);
  assert.ok(s4.events.includes("saved"));
});

test("Mario hunt overlap with a moving shell does not stomp from the side", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  n.shell = "moving";
  n.facing = 1;
  n.kickIgnore = 0;
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  s.marioActive = true;
  s.setMarioStage(2);
  s.marioLook = 10;
  s.marioPause = 10;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 210, y: 400 });
  Body.setVelocity(s.mario.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.equal(n.shell, "moving");
  assert.equal(s.marioStage, 1);
  assert.ok(s.events.includes("shrink"));
});

test("Mario side-falling into a moving shell takes damage instead of stomping", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  n.shell = "moving";
  n.facing = 1;
  n.kickIgnore = 0;
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  s.marioActive = true;
  s.setMarioStage(2);
  s.marioLook = 10;
  s.marioPause = 10;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 220, y: 410 });
  Body.setVelocity(s.mario.body, { x: 0, y: 2 });
  tick(s, dt);
  assert.equal(n.shell, "moving");
  assert.equal(s.marioStage, 1);
  assert.ok(s.events.includes("shrink"));
});

test("Mario falling onto a moving shell stops it instead of taking damage", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  n.shell = "moving";
  n.facing = 1;
  n.kickIgnore = 0;
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: T.shellSpeed, y: 0 });
  s.marioActive = true;
  s.setMarioStage(2);
  s.marioLook = 10;
  s.marioPause = 10;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 200, y: 375 });
  Body.setVelocity(s.mario.body, { x: 0, y: 10 });
  tick(s, dt);
  assert.equal(n.shell, "stopped");
  assert.ok(s.mario.alive);
  assert.equal(s.marioStage, 2);
  assert.ok(s.mario.body.velocity.y < 0);
  assert.equal(s.events.includes("shrink"), false);
});

test("Mario stomps shell a Koopa; a moving shell uses his damage stages", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  n.idleWalking = false;
  n.wait = 99;
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 200, y: 392 });
  Body.setVelocity(s.mario.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.ok(n.alive);
  assert.equal(n.shell, "stopped");
  assert.equal(s.events.includes("splat"), false);
  assert.ok(s.mario.body.velocity.y < 0);

  n.shell = "moving";
  n.facing = 1;
  n.kickIgnore = 0;
  Body.setVelocity(n.body, { x: T.shellSpeed, y: 0 });
  s.setMarioStage(2);
  s.marioLook = 10;
  s.marioPause = 10;
  Body.setPosition(s.mario.body, { x: 214, y: 411 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(s.marioStage, 1);
  assert.ok(s.events.includes("shrink"));
  assert.ok(s.mario.alive);
  tick(s, 0.2);
  assert.equal(s.marioStage, 1);
  assert.ok(s.mario.alive);
  assert.ok(s.marioActive);
});

test("moving green shells reverse on walls and fall off ledges", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
  Body.setPosition(n.body, { x: pipe.x - 48, y: 415 });
  n.shell = "moving";
  n.facing = 1;
  n.kickIgnore = 0;
  Body.setVelocity(n.body, { x: T.shellSpeed, y: 0 });
  let reversed = false;
  for (let i = 0; i < 90; i++) {
    tick(s, dt);
    if (n.facing < 0) {
      reversed = true;
      break;
    }
  }
  assert.ok(reversed);
  assert.ok(n.alive);
  assert.equal(n.shell, "moving");

  const [gapLeft] = GAPS[0];
  Body.setPosition(n.body, { x: gapLeft - 10, y: 415 });
  n.facing = 1;
  Body.setVelocity(n.body, { x: T.shellSpeed, y: 0 });
  let fell = false;
  for (let i = 0; i < 90; i++) {
    tick(s, dt);
    if (n.body.position.y > 430) {
      fell = true;
      break;
    }
  }
  assert.ok(fell);
});

test("a moving shell kills another moving shell and keeps going", () => {
  const s = game();
  const [a, b] = s.npcs.filter((n) => n.kind === "koopa");
  parkNpcs(s, [a, b]);
  Body.setPosition(a.body, { x: 200, y: 415 });
  Body.setPosition(b.body, { x: 214, y: 415 });
  a.shell = "moving";
  b.shell = "moving";
  a.facing = 1;
  b.facing = -1;
  a.kickIgnore = 0;
  b.kickIgnore = 0;
  Body.setVelocity(a.body, { x: T.shellSpeed, y: 0 });
  Body.setVelocity(b.body, { x: -T.shellSpeed, y: 0 });
  tick(s, dt);
  const dead = [a, b].filter((n) => !n.alive);
  const live = [a, b].filter((n) => n.alive);
  assert.equal(dead.length, 1);
  assert.equal(live.length, 1);
  assert.equal(live[0]!.shell, "moving");
  assert.ok(s.events.includes("splat"));
});

function waterGame() {
  const s = game();
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "2-2");
  s.reset();
  s.marioReturn = 1e6;
  finishPipeIntro(s);
  assert.equal(s.activeRoom.data.type, "water");
  s.mario.areaId = s.player.areaId;
  return s;
}

function waterStillMario(s: Simulation) {
  stillMario(s);
  s.marioReaction = 0;
  s.marioPause = 10;
  s.marioChase = 0;
  s.marioLook = 10;
  s.mario.areaId = s.player.areaId;
}

function floorTopBelow(s: Simulation, x: number, fromY: number, half = 12) {
  let best: number | undefined;
  for (const solid of s.activeRoom.solids) {
    if (solid.headOnly) continue;
    if (x + half <= solid.bounds.min.x || x - half >= solid.bounds.max.x)
      continue;
    const top = solid.bounds.min.y;
    if (top < fromY) continue;
    if (best === undefined || top < best) best = top;
  }
  return best;
}

function openWaterX(s: Simulation, y = 200) {
  const room = s.activeRoom;
  const dummy = s.player.body;
  const half = dummy.width / 2;
  for (let x = room.offset + 96; x < room.goalX - 96; x += 16) {
    const hits = room.solids.some(
      (solid) =>
        !solid.headOnly &&
        x + half > solid.bounds.min.x &&
        x - half < solid.bounds.max.x &&
        y + dummy.height / 2 > solid.bounds.min.y &&
        y - dummy.height / 2 < solid.bounds.max.y,
    );
    if (!hits) return x;
  }
  throw new Error("no open water column");
}

function waterDrop(s: Simulation) {
  const room = s.activeRoom;
  const fromY = 120;
  for (let x = room.offset + 80; x < room.goalX - 80; x += 8) {
    const here = floorTopBelow(s, x, fromY);
    const ahead = floorTopBelow(s, x + 40, fromY);
    if (here !== undefined && ahead !== undefined && ahead - here >= 24)
      return { x, facing: 1 as const, from: here, to: ahead };
    if (here !== undefined && ahead !== undefined && here - ahead >= 24)
      return { x: x + 40, facing: -1 as const, from: ahead, to: here };
  }
  throw new Error("no stepped water floor");
}

function waterRise(s: Simulation) {
  const room = s.activeRoom;
  const fromY = 120;
  for (let x = room.offset + 80; x < room.goalX - 80; x += 8) {
    const here = floorTopBelow(s, x, fromY);
    const ahead = floorTopBelow(s, x + 40, fromY);
    if (
      here !== undefined &&
      ahead !== undefined &&
      here - ahead >= 24 &&
      here - ahead <= T.brickSize
    )
      return { x, facing: 1 as const, from: here, to: ahead };
    if (
      here !== undefined &&
      ahead !== undefined &&
      ahead - here >= 24 &&
      ahead - here <= T.brickSize
    )
      return { x: x + 40, facing: -1 as const, from: ahead, to: here };
  }
  throw new Error("no climbable water step");
}

test("a stopped water shell does not keep leftover swim speed", () => {
  const s = waterGame();
  const n = troopa(s);
  parkNpcs(s, [n]);
  const x = openWaterX(s);
  const startY = 200;
  Body.setPosition(n.body, { x, y: startY });
  n.grounded = false;
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  Body.setVelocity(n.body, { x: 0, y: 3 });
  tick(s, 0.2);
  assert.equal(n.shell, "stopped");
  assert.ok(
    n.body.position.y > startY + 8,
    `stopped water shell must sink, y ${n.body.position.y} start ${startY}`,
  );
});

function waterGrant(s: Simulation, actor: Actor, kind: ItemKind) {
  s.loadRoom("25");
  give(s, actor, kind);
}

test("a mid-water moving shell sinks then follows a stepped floor", () => {
  const s = waterGame();
  const n = troopa(s);
  parkNpcs(s, [n]);
  const x = openWaterX(s);
  const startY = 180;
  const sinkFloor = floorTopBelow(s, x, startY);
  assert.ok(sinkFloor !== undefined);
  Body.setPosition(n.body, { x, y: startY });
  n.grounded = false;
  n.shell = "moving";
  n.facing = 1;
  n.wakeLeft = 0;
  n.kickIgnore = 0;
  Body.setVelocity(n.body, { x: T.shellSpeed, y: T.swimFallSpeed });
  let hitFloor = false;
  for (let i = 0; i < 180; i++) {
    const y = n.body.position.y;
    tick(s, dt);
    if (!hitFloor) {
      assert.ok(n.body.position.y >= y - 0.5);
      const floorNow = floorTopBelow(s, n.body.position.x, startY);
      if (floorNow !== undefined && n.body.bounds.max.y >= floorNow - 4)
        hitFloor = true;
    }
    if (hitFloor) break;
  }
  assert.ok(hitFloor, "moving water shell never reached the floor");

  const drop = waterDrop(s);
  const standY = drop.from - n.body.height / 2;
  Body.setPosition(n.body, { x: drop.x, y: standY });
  n.grounded = true;
  n.facing = drop.facing;
  Body.setVelocity(n.body, {
    x: drop.facing * T.shellSpeed,
    y: 0,
  });
  const yOnFloor = n.body.position.y;
  for (let i = 0; i < 40; i++) tick(s, dt);
  assert.equal(n.shell, "moving");
  assert.ok(
    (n.body.position.x - drop.x) * drop.facing > 8,
    "moving water shell must keep traveling on the floor",
  );
  const laterFloor = floorTopBelow(
    s,
    n.body.position.x,
    n.body.position.y - 32,
  );
  assert.ok(laterFloor !== undefined, "shell left the floor");
  assert.ok(
    Math.abs(n.body.bounds.max.y - laterFloor) < 16,
    `shell feet ${n.body.bounds.max.y} floor ${laterFloor}`,
  );
  assert.ok(
    n.body.position.y > yOnFloor + 8,
    `shell must drop with the floor, y ${n.body.position.y} start ${yOnFloor}`,
  );
});

test("a moving water shell climbs a stepped floor", () => {
  const s = waterGame();
  const n = troopa(s);
  parkNpcs(s, [n]);
  const rise = waterRise(s);
  const standY = rise.from - n.body.height / 2;
  Body.setPosition(n.body, { x: rise.x, y: standY });
  n.grounded = true;
  n.shell = "moving";
  n.facing = rise.facing;
  n.wakeLeft = 0;
  n.kickIgnore = 0;
  Body.setVelocity(n.body, { x: rise.facing * T.shellSpeed, y: 0 });
  const yStart = n.body.position.y;
  let climbed = false;
  for (let i = 0; i < 120; i++) {
    tick(s, dt);
    if (
      n.body.position.y < yStart - 8 &&
      (n.body.position.x - rise.x) * rise.facing > 24 &&
      Math.abs(n.body.bounds.max.y - rise.to) < 16
    ) {
      climbed = true;
      break;
    }
  }
  assert.equal(n.shell, "moving");
  assert.ok(
    climbed,
    `shell did not climb, y ${n.body.position.y} start ${yStart} x ${n.body.position.x} from ${rise.x} to ${rise.to}`,
  );
});

test("a water kick above the floor does not snap y in one step", () => {
  const s = waterGame();
  const n = troopa(s);
  parkNpcs(s, [n]);
  const x = openWaterX(s);
  const startY = 200;
  const floor = floorTopBelow(s, x, startY);
  assert.ok(floor !== undefined && floor - startY > 40);
  Body.setPosition(n.body, { x, y: startY });
  n.grounded = false;
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  Body.setVelocity(n.body, { x: 0, y: 0 });
  at(s, 4000);
  waterStillMario(s);
  Body.setPosition(s.mario.body, { x: x - 20, y: startY });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(n.shell, "moving");
  assert.ok(n.alive);
  assert.ok(n.body.position.y >= startY);
  assert.ok(
    n.body.position.y < startY + 20,
    `kick snapped y ${n.body.position.y} from ${startY} toward floor ${floor}`,
  );
  assert.ok(n.body.bounds.max.y < floor! - 16);
});

test("a stopped water shell settles on the floor instead of hovering", () => {
  const s = waterGame();
  const n = troopa(s);
  parkNpcs(s, [n]);
  const x = openWaterX(s);
  const startY = 200;
  const floor = floorTopBelow(s, x, startY);
  assert.ok(floor !== undefined);
  Body.setPosition(n.body, { x, y: startY });
  n.grounded = false;
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  Body.setVelocity(n.body, { x: 0, y: 0 });
  for (let i = 0; i < 240; i++) tick(s, dt);
  assert.equal(n.shell, "stopped");
  assert.ok(
    Math.abs(n.body.bounds.max.y - floor!) < 8,
    `settled feet ${n.body.bounds.max.y} floor ${floor}`,
  );
  const restY = n.body.position.y;
  tick(s, 0.2);
  assert.ok(Math.abs(n.body.position.y - restY) < 2);
  assert.equal(n.wakeLeft > 0, true);
});

test("water overlap from above, below, and the side hurts the player", () => {
  for (const offset of [
    { name: "above", x: 0, y: -18 },
    { name: "below", x: 0, y: 18 },
    { name: "side", x: 18, y: 0 },
  ] as const) {
    const s = waterGame();
    parkNpcs(s, []);
    const x = openWaterX(s);
    at(s, x, 240);
    waterStillMario(s);
    Body.setPosition(s.mario.body, {
      x: x + offset.x,
      y: 240 + offset.y,
    });
    Body.setVelocity(s.mario.body, { x: 0, y: 0 });
    Body.setVelocity(s.player.body, { x: 0, y: 0 });
    assert.equal(s.player.alive, true, offset.name);
    tick(s, dt);
    assert.equal(s.player.alive, false, offset.name);
    assert.equal(s.mario.alive, true, offset.name);
    assert.equal(s.marioStage, 1, offset.name);
  }
});

test("a player on the seabed is hurt by Mario contact in water", () => {
  const s = waterGame();
  parkNpcs(s, []);
  const x = openWaterX(s, 400);
  const floor = floorTopBelow(s, x, 120);
  assert.ok(floor !== undefined);
  at(s, x, floor! - s.player.body.height / 2);
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  tick(s, 0.1);
  assert.equal(s.player.grounded, true);
  waterStillMario(s);
  Body.setPosition(s.mario.body, {
    x,
    y: s.player.body.position.y - 10,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(s.player.alive, false);
});

test("Mario swimming through water NPCs hurts at most one per 0.15s lock", () => {
  const s = waterGame();
  const pack = s.npcs.filter((n) => n.kind !== "fish").slice(0, 3);
  parkNpcs(s, pack);
  const x = openWaterX(s);
  const y = 240;
  for (const n of pack) {
    Body.setPosition(n.body, { x, y });
    Body.setVelocity(n.body, { x: 0, y: 0 });
    n.idleWalking = false;
    n.wait = 99;
    n.swimPath = [{ x, y }];
  }
  at(s, 4000);
  waterStillMario(s);
  Body.setPosition(s.mario.body, { x, y });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  const hold = () => {
    for (const n of pack.filter((npc) => npc.alive)) {
      Body.setPosition(n.body, { x, y });
      Body.setVelocity(n.body, { x: 0, y: 0 });
    }
    Body.setPosition(s.mario.body, { x, y });
    Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  };
  hold();
  tick(s, dt);
  assert.equal(pack.filter((n) => !n.alive).length, 1);
  for (let i = 0; i < 8; i++) {
    hold();
    s.step(dt, emptyInput());
  }
  assert.equal(pack.filter((n) => !n.alive).length, 1);
  for (let i = 0; i < 12; i++) {
    hold();
    s.step(dt, emptyInput());
    if (pack.filter((n) => !n.alive).length >= 2) break;
  }
  assert.equal(pack.filter((n) => !n.alive).length, 2);
});

test("water contact does not hurt the player while marioStun is active", () => {
  const s = waterGame();
  parkNpcs(s, []);
  const x = openWaterX(s);
  at(s, x, 240);
  waterStillMario(s);
  s.marioStun = T.marioStunSeconds;
  Body.setPosition(s.mario.body, { x, y: 240 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.mario.alive, true);
});

test("water contact still hurts during Mario's observe delay", () => {
  const s = waterGame();
  parkNpcs(s, []);
  const x = openWaterX(s);
  at(s, x, 240);
  waterStillMario(s);
  s.marioReaction = T.marioReaction;
  Body.setPosition(s.mario.body, { x, y: 240 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(s.player.alive, false);
});

test("a falling Mario on a walking water Koopa does not create a shell", () => {
  const s = waterGame();
  const n = troopa(s);
  parkNpcs(s, [n]);
  const x = openWaterX(s);
  Body.setPosition(n.body, { x, y: 260 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.shell = "none";
  n.idleWalking = false;
  n.wait = 99;
  at(s, 4000);
  waterStillMario(s);
  Body.setPosition(s.mario.body, { x, y: 230 });
  Body.setVelocity(s.mario.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.equal(n.shell, "none");
  assert.equal(n.alive, false);
});

test("a water body hit does not create a shell", () => {
  const s = waterGame();
  const n = troopa(s);
  parkNpcs(s, [n]);
  const x = openWaterX(s);
  Body.setPosition(n.body, { x, y: 240 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.shell = "none";
  n.idleWalking = false;
  n.wait = 99;
  at(s, 4000);
  waterStillMario(s);
  Body.setPosition(s.mario.body, { x, y: 240 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(n.shell, "none");
  assert.equal(n.alive, false);
});

test("star and 8x still defeat on water contact", () => {
  const star = waterGame();
  parkNpcs(star, []);
  waterGrant(star, star.player, "star");
  const x = openWaterX(star);
  at(star, x, 240);
  waterStillMario(star);
  Body.setPosition(star.mario.body, { x, y: 240 });
  tick(star, dt);
  assert.equal(star.mario.alive, false);
  assert.ok(star.player.alive);
  assert.ok(star.marioKills >= 1);

  const huge = waterGame();
  parkNpcs(huge, []);
  waterGrant(huge, huge.player, "mushroom8x");
  const hx = openWaterX(huge);
  at(huge, hx, 240);
  waterStillMario(huge);
  huge.setMarioStage(1);
  Body.setPosition(huge.mario.body, { x: hx, y: 240 });
  tick(huge, dt);
  assert.ok(huge.player.alive);
  assert.ok(huge.mario.alive);
  assert.equal(huge.marioStun > 0, true);
});

test("a swimming player pulls away from a pursuing water Mario", () => {
  const s = waterGame();
  parkNpcs(s, []);
  assert.ok(T.marioSwimSpeed < T.walkSpeed);
  const x = openWaterX(s);
  at(s, x + 40, 240);
  waterStillMario(s);
  s.marioPause = 0;
  s.marioChase = 6;
  s.marioTarget = s.player.id;
  s.marioRunning = true;
  s.mario.areaId = s.player.areaId;
  Body.setPosition(s.mario.body, { x, y: 240 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  const start = Math.abs(s.player.body.position.x - s.mario.body.position.x);
  tick(s, 0.8, { right: true });
  const later = Math.abs(s.player.body.position.x - s.mario.body.position.x);
  assert.ok(
    later > start + 8,
    `player did not pull away: start ${start} later ${later}`,
  );
  assert.ok(s.player.alive);
});

test("a giant player cannot hurt Mario by water contact", () => {
  const s = waterGame();
  parkNpcs(s, []);
  waterGrant(s, s.player, "mushroom");
  const x = openWaterX(s);
  at(s, x, 222);
  waterStillMario(s);
  Body.setPosition(s.mario.body, { x, y: 248 });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  assert.ok(s.player.body.bounds.max.y < s.mario.body.bounds.max.y - 0.5);
  tick(s, dt);
  assert.equal(s.marioStage, 1);
  assert.ok(s.mario.alive);
  assert.equal(s.player.scale, 1);
});

test("a moving water shell still kills on overlap", () => {
  const s = waterGame();
  const n = troopa(s);
  parkNpcs(s, [n]);
  const x = openWaterX(s);
  Body.setPosition(n.body, { x: x + 10, y: 240 });
  n.shell = "moving";
  n.facing = -1;
  n.kickIgnore = 0;
  Body.setVelocity(n.body, { x: -T.shellSpeed, y: 0 });
  at(s, x, 240);
  tick(s, dt);
  assert.equal(s.player.alive, false);
  assert.ok(n.alive);
  assert.equal(n.shell, "moving");
});

test("TIME counts down from the stage timer and kills at 0", () => {
  const s = game();
  assert.equal(s.timeLeft, 300);
  tick(s, T.timerTickFrames / 60);
  assert.equal(s.timeLeft, 299);
  assert.equal(s.hurry, false);
  s.timeLeft = T.hurryAt + 1;
  tick(s, T.timerTickFrames / 60);
  assert.equal(s.timeLeft, T.hurryAt);
  assert.equal(s.hurry, true);
  assert.ok(s.events.includes("hurry"));
  s.timeLeft = 1;
  give(s, s.player, "mushroom8x");
  tick(s, T.timerTickFrames / 60);
  assert.equal(s.timeLeft, 0);
  assert.equal(s.mode, "dead");
  assert.equal(s.player.alive, false);
});

test("TIME waits until the player has control on the main area", () => {
  const s = game();
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-2");
  s.reset();
  s.marioReturn = 1e6;
  assert.equal(s.player.areaId, "29");
  assert.equal(s.timeLeft, 300);
  for (let frame = 0; frame < 60 * 20 && s.pipeIntro; frame++) {
    if (s.player.areaId !== s.level.main || s.player.pipeTravel)
      assert.equal(s.timeLeft, 300);
    s.step(dt, emptyInput());
  }
  assert.equal(s.pipeIntro, false);
  assert.equal(s.player.areaId, s.level.main);
  const left = s.timeLeft;
  tick(s, T.timerTickFrames / 60);
  assert.equal(s.timeLeft, left - 1);
});

test("a player coin scores 200 and 100 coins grant a 1-up", () => {
  const s = game();
  const room = s.loadRoom("42");
  const coin = room.coins.find((c) => !c.collected)!;
  coin.x = s.player.body.position.x;
  coin.y = s.player.body.position.y;
  tick(s, dt);
  assert.equal(s.coins, 1);
  assert.equal(s.score, T.coinScore);
  s.coins = T.coinsForLife - 1;
  const next = room.coins.find((c) => !c.collected)!;
  next.x = s.player.body.position.x;
  next.y = s.player.body.position.y;
  const lives = s.lives;
  tick(s, dt);
  assert.equal(s.coins, 0);
  assert.equal(s.lives, lives + 1);
  assert.ok(s.events.includes("oneUp"));
});

test("SCORE persists across a lost life and zeros on GAME OVER", () => {
  const s = game();
  s.score = 2500;
  s.coins = 7;
  s.kill(s.player);
  tick(s, T.deathSequenceSeconds + 0.1);
  assert.equal(s.mode, "intro");
  assert.equal(s.score, 2500);
  assert.equal(s.coins, 7);
  const over = game();
  over.score = 2500;
  over.lives = 1;
  over.kill(over.player);
  tick(over, T.deathSequenceSeconds + 0.1);
  assert.equal(over.mode, "gameover");
  assert.equal(over.score, 0);
  tick(over, T.gameoverSeconds + 0.1);
  assert.equal(over.mode, "title");
  assert.equal(over.score, 0);
  assert.equal(over.coins, 0);
});

test("leftover TIME tally drains a 400-unit stage in a few seconds at +50 each", () => {
  assert.equal(T.timerTallyFrames, 1);
  const s = game();
  parkNpcs(s, []);
  s.timeLeft = 400;
  s.score = 0;
  s.finish();
  s.events.length = 0;
  while (s.tallyPhase === "time") tick(s, dt);
  assert.equal(s.timeLeft, 0);
  assert.equal(s.tallyPhase, "warned");
  assert.equal(s.score, 400 * T.timeScore);
  assert.equal(
    s.events.filter((event) => event === "tally").length,
    400,
  );
  assert.ok(
    s.finishElapsed < 8,
    `400-unit drain took ${s.finishElapsed}s, expected a few seconds not ~27`,
  );
  assert.ok(s.finishElapsed > 400 / 60 - dt);
});

test("leftover TIME and castle lines add to SCORE then auto-continue", () => {
  const s = game();
  s.warned = 2;
  s.save(s.npcs[0]);
  s.kill(s.npcs[1]);
  const pole = poleOf(s);
  pole.claim = "goomba";
  s.marioKills = 1;
  s.timeLeft = 2;
  s.score = 0;
  s.finish();
  assert.equal(s.mode, "finishing");
  assert.equal(s.player.saved, true);
  tick(s, T.timerTallyFrames / 60);
  assert.equal(s.timeLeft, 1);
  assert.equal(s.score, T.timeScore);
  tick(s, T.timerTallyFrames / 60);
  assert.equal(s.timeLeft, 0);
  while (s.tallyPhase === "time") tick(s, dt);
  assert.equal(s.tallyPhase, "warned");
  assert.equal(s.score, T.timeScore * 2 + 2 * T.warnedScore);
  skipTally(s);
  assert.equal(s.mode, "intro");
  assert.equal(s.level.id, "1-2");
  assert.equal(
    s.score,
    T.timeScore * 2 +
      2 * T.warnedScore +
      T.savedScore +
      T.diedScore +
      T.flagScore +
      T.marioScore,
  );
});

test("World 8-4 tally holds through world-clear then returns to the title", () => {
  const reachEnding = (dyingMario: boolean) => {
    const s = game();
    s.levelIndex = CAMPAIGN.length - 1;
    s.reset();
    s.marioReturn = 1e6;
    for (const n of s.npcs) {
      n.warned = true;
      n.wait = 99;
      n.idleWalking = false;
    }
    // Leftover TIME lets the clear cue finish before world-clear starts.
    s.timeLeft = 400;
    s.finish();
    while (s.mode === "finishing" && s.tallyPhase === "time") tick(s, dt);
    if (dyingMario) {
      while (s.mode === "finishing" && s.tallyPhase !== "mario") {
        s.tallyHold = 0;
        tick(s, dt);
      }
      const n = s.npcs.find((npc) => npc.alive && !npc.saved);
      assert.ok(n, "living NPC can touch Mario");
      n.starLeft = T.starSeconds;
      stillMario(s);
      Body.setPosition(s.mario.body, { ...n.body.position });
      Body.setVelocity(s.mario.body, { x: 0, y: 0 });
      tick(s, dt);
      assert.ok(s.marioDeath);
    }
    while (s.mode === "finishing" && s.tallyPhase !== "ending") {
      s.tallyHold = 0;
      tick(s, dt);
    }
    assert.equal(s.tallyPhase, "ending");
    return s;
  };

  const alive = reachEnding(false);
  const aliveHold = alive.tallyHold;
  const droppedSlack = T.endingSeconds + T.deathSequenceSeconds - aliveHold;
  assert.ok(
    Math.abs(droppedSlack - T.deathSequenceSeconds) < 0.25,
    `alive hold ${aliveHold} drops death slack by ${droppedSlack}`,
  );
  tick(alive, aliveHold - dt);
  assert.equal(alive.mode, "finishing");
  tick(alive, 2 * dt);
  assert.equal(alive.mode, "title");
  assert.equal(alive.levelIndex, 0);
  assert.equal(alive.score, 0);

  const dying = reachEnding(true);
  assert.ok(dying.marioDeath);
  assert.ok(
    Math.abs(dying.tallyHold - aliveHold - T.deathSequenceSeconds) < 0.25,
    `dying hold ${dying.tallyHold} alive ${aliveHold}`,
  );
});

test("leftover TIME tally starts from a fresh accumulator", () => {
  const s = game();
  tick(s, (T.timerTickFrames - 1) / 60);
  assert.equal(s.timeLeft, 300);
  s.timeLeft = 3;
  s.score = 0;
  s.finish();
  tick(s, T.timerTallyFrames / 60);
  assert.equal(s.timeLeft, 2);
  assert.equal(s.score, T.timeScore);
});

test("a Mario-kicked shell that defeats Mario does not score MARIO points", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  n.shell = "moving";
  n.facing = 1;
  n.shellKicker = s.mario.id;
  n.kickIgnore = 0;
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: T.shellSpeed, y: 0 });
  s.marioActive = true;
  s.setMarioStage(0);
  s.marioLook = 10;
  s.marioPause = 10;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 220, y: 411 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.equal(s.mario.alive, false);
  assert.equal(s.marioKills, 0);
});

test("an NPC star kill does not count on the MARIO tally line", () => {
  const s = game();
  const n = s.npcs[0];
  give(s, n, "star");
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { ...n.body.position });
  tick(s, dt);
  assert.equal(s.mario.alive, false);
  assert.equal(s.marioKills, 0);
  s.timeLeft = 0;
  s.score = 0;
  s.finish();
  s.tallyPhase = "mario";
  s.tallyHold = T.tallyLineSeconds;
  tick(s, dt);
  assert.equal(s.score, 0);
});

test("SCORE may go negative from died penalties", () => {
  const s = game();
  s.timeLeft = 0;
  s.score = 0;
  s.npcs.slice(0, 3).forEach((n) => s.kill(n));
  s.finish();
  s.tallyPhase = "died";
  s.tallyHold = T.tallyLineSeconds;
  tick(s, dt);
  assert.ok(s.score < 0);
});

function rescue(s: Simulation, count: number) {
  parkNpcs(s, s.npcs.slice(0, count));
  for (const n of s.npcs.slice(0, count)) s.save(n);
}

function playFireworks(s: Simulation) {
  s.timeLeft = 0;
  s.events.length = 0;
  for (let i = 0; i < Math.round((T.fireworkInterval * 6 + 3 * dt) * 60); i++) {
    s.tallyHold = 99;
    s.step(dt, emptyInput());
  }
  return s.events.filter((event) => event === "firework").length;
}

test("flagpole fireworks match each rescue threshold and add 500 each", () => {
  const cases = [
    [T.fireworkModest - 1, 0],
    [T.fireworkModest, 1],
    [T.fireworkGood - 1, 1],
    [T.fireworkGood, 3],
    [T.fireworkStrong - 1, 3],
    [T.fireworkStrong, 6],
  ] as const;
  for (const [saved, count] of cases) {
    const s = game();
    rescue(s, saved);
    s.timeLeft = 0;
    s.score = 0;
    s.finish();
    assert.equal(s.fireworksTotal, count, `saved ${saved}`);
    assert.equal(s.fireworkCount(), count);
    s.tallyHold = 99;
    s.events.length = 0;
    const before = s.score;
    tick(s, dt);
    if (count === 0) {
      assert.equal(s.events.filter((event) => event === "firework").length, 0);
      assert.equal(s.score, before);
      continue;
    }
    assert.equal(s.events.filter((event) => event === "firework").length, 1);
    assert.equal(s.score, before + T.fireworkScore);
    const sky = s.particles.filter((p) => p.firework);
    assert.ok(sky.length >= T.fireworkBurst);
    assert.ok(sky.every((p) => p.y > 0 && p.y < MAP_TOP + 8 * 32));
    assert.ok(sky.every((p) => Math.abs(p.x - s.goalX) < 120));
    tick(s, T.fireworkInterval * 6 + 2 * dt);
    assert.equal(
      s.events.filter((event) => event === "firework").length,
      count,
      `saved ${saved} fired`,
    );
    assert.equal(s.score, before + count * T.fireworkScore);
    assert.equal(s.mode, "finishing");
  }
});

test("castle-room and pipe-goal stages produce no fireworks", () => {
  const castle = new Simulation(() => 0.5);
  castle.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-4");
  castle.reset();
  castle.marioReturn = 1e6;
  rescue(castle, T.fireworkStrong);
  castle.timeLeft = 0;
  castle.finish();
  assert.equal(castle.activeRoom.data.goal?.kind, "castle-room");
  assert.equal(castle.fireworkCount(), 0);
  assert.equal(castle.fireworksTotal, 0);
  assert.equal(playFireworks(castle), 0);

  const pipe = new Simulation(() => 0.5);
  pipe.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-2");
  pipe.reset();
  pipe.marioReturn = 1e6;
  rescue(pipe, T.fireworkStrong);
  pipe.timeLeft = 0;
  pipe.finish();
  assert.equal(areaData(pipe.level.main).goal?.kind, "pipe");
  assert.equal(pipe.fireworkCount(), 0);
  assert.equal(pipe.fireworksTotal, 0);
  assert.equal(playFireworks(pipe), 0);
});

test("tall castle-door fireworks burst above the roof against the sky", () => {
  const s = new Simulation(() => 0.5);
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-3");
  s.reset();
  s.marioReturn = 1e6;
  rescue(s, T.fireworkModest);
  s.timeLeft = 0;
  s.finish();
  s.tallyHold = 99;
  tick(s, dt);
  const roof = MAP_TOP + 2 * 32;
  const sky = s.particles.filter((p) => p.firework);
  assert.equal(s.activeRoom.data.goal?.kind, "castle-door");
  assert.ok(sky.length >= T.fireworkBurst);
  assert.ok(sky.every((p) => p.y < roof), `burst at ${sky[0]?.y} vs roof ${roof}`);
  assert.ok(sky.every((p) => p.y > 0));
});

test("flagpole fireworks start after leftover TIME and do not hold auto-advance", () => {
  const s = game();
  rescue(s, T.fireworkStrong);
  s.timeLeft = 3;
  s.score = 0;
  s.finish();
  assert.equal(s.tallyPhase, "time");
  assert.equal(s.fireworksTotal, 0);
  while (s.tallyPhase === "time") tick(s, dt);
  assert.equal(s.tallyPhase, "warned");
  assert.equal(s.fireworksTotal, 6);
  let fired = s.events.filter((event) => event === "firework").length;
  assert.equal(fired, 1);
  s.events.length = 0;
  for (let i = 0; i < 60 * 10 && s.mode === "finishing"; i++) {
    tick(s, dt);
    fired += s.events.filter((event) => event === "firework").length;
    s.events.length = 0;
  }
  assert.equal(s.mode, "intro");
  assert.equal(s.level.id, "1-2");
  assert.equal(fired, 6);
});

test("8x mushroom draw shares the 32px item's visible bottom", () => {
  const s = game();
  const box = s.obstacles.find((c) => c.question && !c.hidden && !c.used)!;
  s.hitBlock(box, s.player);
  const item = s.items[0];
  item.kind = "mushroom";
  const bottom32 = itemDrawY(item) + itemSpriteSize("mushroom") / 2;
  assert.equal(itemDrawY(item), item.body.position.y);
  item.kind = "mushroom8x";
  const bottom8x = itemDrawY(item) + itemSpriteSize("mushroom8x") / 2;
  assert.equal(bottom8x, bottom32);
  assert.equal(itemDrawY(item), item.body.position.y - 8);
  item.kind = "flower";
  assert.equal(itemDrawY(item), item.body.position.y);
  item.kind = "star";
  assert.equal(itemDrawY(item), item.body.position.y);
  item.kind = "oneUp";
  assert.equal(itemDrawY(item), item.body.position.y);
});

test("cheat drop hangs in the sky, blinks, then falls straight down", () => {
  const s = game();
  const room = s.activeRoom;
  const p = s.player.body.position;
  const cell = firstEmptySpawnCell(
    room.solids,
    room.offset,
    room.data.width,
    p.x,
    p.y,
    0,
  );
  assert.ok(cell);
  const item = s.dropCheatItem("star");
  assert.ok(item);
  assert.equal(item.kind, "star");
  assert.equal(item.emerge, 0);
  assert.equal(item.hold, T.cheatDropHold);
  assert.equal(item.drop, true);
  assert.equal(item.body.frozen, true);
  assert.equal(item.body.position.x, cell.x);
  assert.equal(item.body.position.y, cell.y);
  assert.ok(item.body.position.y < MAP_TOP + T.brickSize);
  assert.ok(s.events.includes("appear"));
  const hangX = item.body.position.x;
  const hangY = item.body.position.y;
  const hidden = new Set<boolean>();
  at(s, hangX + 240);
  for (let i = 0; i < Math.round((T.cheatDropHold / 2) * 60); i++) {
    hidden.add(itemHoldHidden(item));
    tick(s, dt);
  }
  assert.ok(item.hold > 0);
  assert.equal(item.body.frozen, true);
  assert.equal(item.body.position.x, hangX);
  assert.equal(item.body.position.y, hangY);
  assert.equal(item.body.velocity.x, 0);
  assert.equal(hidden.has(true) && hidden.has(false), true);
  Body.setPosition(s.player.body, { x: hangX, y: hangY });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  tick(s, dt);
  assert.ok(s.items.includes(item), "not collectable during the hold");
  tick(s, item.hold + dt);
  assert.equal(item.hold, 0);
  assert.equal(item.body.frozen, false);
  const fallY = item.body.position.y;
  tick(s, 0.15);
  assert.equal(item.body.position.x, hangX);
  assert.ok(item.body.position.y > fallY);
  assert.equal(item.body.velocity.x, 0);
  assert.ok(s.items.includes(item), "not collectable while falling");
  at(s, hangX + 240);
  tick(s, 2);
  assert.equal(item.drop, false);
  assert.ok(item.body.position.y > hangY + 40);
  const brick = s.obstacles.find(
    (c) => c.kind === "brick" && !c.hidden && c.body && c.y < p.y - 40,
  )!;
  at(s, brick.x, brick.y + 96);
  const under = firstEmptySpawnCell(
    s.activeRoom.solids,
    s.activeRoom.offset,
    s.activeRoom.data.width,
    s.player.body.position.x,
    s.player.body.position.y,
    0,
  )!;
  s.events.length = 0;
  const dropped = s.dropCheatItem("mushroom");
  assert.ok(dropped);
  assert.equal(dropped.body.position.x, under.x);
  assert.equal(dropped.body.position.y, under.y);
  assert.ok(dropped.body.position.y > brick.y);
  assert.ok(s.events.includes("appear"));
});

test("cheat drop hangs under a solid ceiling instead of on the roof", () => {
  const s = game();
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "1-2");
  s.reset();
  s.marioReturn = 1e6;
  s.player.areaId = "40";
  const room = s.loadRoom("40");
  at(s, room.offset + 10 * T.brickSize + 16, T.groundY - 14);
  const cell = firstEmptySpawnCell(
    room.solids,
    room.offset,
    room.data.width,
    s.player.body.position.x,
    s.player.body.position.y,
    0,
  );
  assert.ok(cell);
  assert.ok(cell.y > spawnCellCenter(room.offset, 0, 0).y);
  const item = s.dropCheatItem("star");
  assert.ok(item);
  assert.equal(item.body.position.x, cell.x);
  assert.equal(item.body.position.y, cell.y);
  assert.equal(
    room.solids.some((solid) => {
      if (solid.headOnly) return false;
      const b = solid.bounds;
      const p = item.body.position;
      return (
        p.x + 12 > b.min.x &&
        p.x - 12 < b.max.x &&
        p.y + 14 > b.min.y &&
        p.y - 14 < b.max.y
      );
    }),
    false,
  );
});

test("cheat drop does not land on a hidden head-only block", () => {
  const s = game();
  const item = s.dropCheatItem("mushroom");
  assert.ok(item);
  const trap = s.physics.rectangle(item.body.position.x, 200, 32, 32, true);
  trap.headOnly = true;
  s.solids.push(trap);
  at(s, item.body.position.x + 400);
  tick(s, T.cheatDropHold + dt);
  let passed = false;
  for (let i = 0; i < 180 && s.items.includes(item); i++) {
    tick(s, dt);
    const b = item.body.bounds;
    if (b.max.y > trap.bounds.min.y && b.min.y < trap.bounds.max.y) {
      passed = true;
      assert.equal(item.drop, true);
      assert.equal(item.body.velocity.x, 0);
    }
    if (item.drop === false) break;
  }
  assert.ok(passed, "fell through the hidden block");
  assert.equal(item.drop, false);
  assert.ok(item.body.position.y > trap.bounds.max.y + 20);
});

test("cheat drop is collectable by any character after it lands", () => {
  const collectAfterLand = (who: "player" | "npc" | "mario") => {
    const s = game();
    parkNpcs(s, []);
    const item = s.dropCheatItem("mushroom");
    assert.ok(item);
    at(s, item.body.position.x + 400);
    tick(s, T.cheatDropHold + 2);
    assert.equal(item.drop, false);
    assert.ok(s.items.includes(item));
    if (who === "mario") {
      s.marioActive = true;
      Body.setFrozen(s.mario.body, false);
    }
    const actor =
      who === "player" ? s.player : who === "npc" ? s.npcs[0] : s.mario;
    if (who === "npc") {
      actor.alive = true;
      actor.saved = false;
    }
    Body.setPosition(actor.body, { ...item.body.position });
    tick(s, dt);
    assert.equal(s.items.includes(item), false, `${who} collects after land`);
  };
  collectAfterLand("player");
  collectAfterLand("npc");
  collectAfterLand("mario");
});

test("head-hit and smash item spawns do not use the cheat-drop hold", () => {
  const s = game();
  const box = s.obstacles.find((c) => c.question && !c.hidden && !c.used)!;
  s.hitBlock(box, s.player);
  const emerging = s.items[0];
  assert.ok(emerging.emerge > 0);
  assert.equal(emerging.hold, 0);
  assert.equal(emerging.drop, undefined);
  const smash = game();
  parkNpcs(smash, []);
  give(smash, smash.player, "mushroom8x");
  const smashBox = smash.obstacles.find(
    (c) => c.question && !c.hidden && !c.used && !c.broken && c.y > 300,
  )!;
  smash.random = () => 0.5;
  at(smash, smashBox.x, smashBox.y);
  tick(smash, dt);
  const flying = smash.items.find((entry) => entry.smash);
  assert.ok(flying);
  assert.equal(flying.emerge, 0);
  assert.equal(flying.hold, 0);
  assert.equal(flying.drop, undefined);
});

test("cheat drop ignores title, intro, dead, finishing, and pipe travel", () => {
  const title = new Simulation(() => 0.5);
  assert.equal(title.mode, "title");
  assert.equal(title.dropCheatItem("star"), null);
  const s = game();
  s.mode = "intro";
  assert.equal(s.dropCheatItem("flower"), null);
  s.mode = "playing";
  s.player.pipeTravel = {
    phase: "enter",
    dir: "down",
    remaining: 1,
    destArea: s.level.main,
    destPage: 0,
  };
  assert.equal(s.dropCheatItem("oneUp"), null);
  s.player.pipeTravel = undefined;
  s.mode = "dead";
  assert.equal(s.dropCheatItem("star"), null);
  s.mode = "finishing";
  assert.equal(s.dropCheatItem("star"), null);
  s.mode = "gameover";
  assert.equal(s.dropCheatItem("star"), null);
});

test("balance lifts are not land NPC spawn lids", () => {
  const s = game();
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "3-3");
  s.reset();
  const lifts = new Set(
    s.activeRoom.platforms
      .filter((p) => p.kind === ENEMY_BALANCE_LIFT)
      .map((p) => p.body),
  );
  assert.ok(lifts.size >= 2);
  for (const n of s.npcs) {
    assert.equal(
      lifts.has(
        s.solids.find(
          (solid) =>
            !solid.headOnly &&
            n.body.position.x + n.body.width / 2 > solid.bounds.min.x &&
            n.body.position.x - n.body.width / 2 < solid.bounds.max.x &&
            Math.abs(n.body.bounds.max.y - solid.bounds.min.y) < 4,
        )!,
      ),
      false,
      "NPC started on a coupled lift",
    );
  }
});

test("water stages spawn type-7 fish and land stages do not", () => {
  const land = game();
  assert.equal(
    land.npcs.filter((n) => n.kind === "fish").length,
    0,
  );
  const water = game();
  water.levelIndex = CAMPAIGN.findIndex((level) => level.id === "2-2");
  water.reset();
  const fish = water.npcs.filter((n) => n.kind === "fish");
  const placed = areaData("01").enemies.filter((e) => e.type === ENEMY_FISH);
  assert.equal(fish.length, placed.length);
  assert.ok(fish.length >= 14);
  assert.equal(water.npcs.length, T.population + fish.length);
  assert.equal(
    water.died() + water.saved + water.living(),
    water.npcs.length,
  );
  for (const n of water.npcs.filter((npc) => npc.kind !== "fish"))
    assert.ok(n.kind === "goomba" || n.kind === "koopa");
  const side = game();
  side.levelIndex = CAMPAIGN.findIndex((level) => level.id === "5-2");
  side.reset();
  const fromBonus = areaData("00").enemies.filter((e) => e.type === ENEMY_FISH);
  assert.equal(
    side.npcs.filter((n) => n.kind === "fish").length,
    fromBonus.length,
  );
  assert.equal(side.npcs.length, T.population + fromBonus.length);
});

test("a warned fish reaches the 2-2 rescue door", { timeout: 20000 }, () => {
  const s = game();
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "2-2");
  s.reset();
  s.marioReturn = 1e6;
  finishPipeIntro(s);
  const fish = s.npcs
    .filter((n) => n.kind === "fish" && n.alive)
    .sort((a, b) => b.body.position.x - a.body.position.x)[0];
  assert.ok(fish, "2-2 has fish");
  parkNpcs(s, [fish]);
  at(s, fish.body.position.x, fish.body.position.y);
  tick(s, 0.2);
  assert.equal(fish.warned, true);
  assert.ok(s.warned >= 1);
  fish.wait = 0;
  fish.state = "run";
  const room = s.roomFor(fish);
  let frames = 0;
  for (
    ;
    frames < 60 * 90 && fish.alive && !fish.saved;
    frames++
  )
    s.step(dt, emptyInput());
  assert.equal(fish.saved, true, JSON.stringify({
    frames,
    pos: fish.body.position,
    area: fish.areaId,
    goal: room.goalX,
    alive: fish.alive,
  }));
  assert.ok(s.saved >= 1);
});

test("a coupled balance lift pair moves in opposite directions under load", () => {
  const s = game();
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "3-3");
  s.reset();
  const room = s.activeRoom;
  const lift = room.platforms.find(
    (p) => p.kind === ENEMY_BALANCE_LIFT && p.partner != null,
  );
  assert.ok(lift, "3-3 has a paired balance lift");
  const partner = room.platforms[lift.partner!]!;
  assert.equal(partner.kind, ENEMY_BALANCE_LIFT);
  assert.ok(room.balanceRopes.length >= 1);
  const rider = s.player;
  Body.setPosition(rider.body, {
    x: lift.body.position.x,
    y: lift.body.bounds.min.y - rider.body.height / 2,
  });
  Body.setVelocity(rider.body, { x: 0, y: 0 });
  const yA = lift.body.position.y;
  const yB = partner.body.position.y;
  room.updatePlatforms(0, [rider]);
  room.updatePlatforms(0.5, [rider]);
  assert.ok(lift.body.position.y > yA + 8, "weighted lift lowers");
  assert.ok(partner.body.position.y < yB - 8, "partner rises");
  assert.ok(
    Math.abs(lift.body.position.y - yA + (partner.body.position.y - yB)) < 0.01,
  );
  for (const rope of room.balanceRopes) {
    assert.ok(rope.pulleyY < lift.body.bounds.min.y);
    assert.ok(rope.pulleyY < partner.body.bounds.min.y);
    assert.ok(rope.leftY - rope.pulleyY > 8);
    assert.ok(rope.rightY - rope.pulleyY > 8);
  }
  const loadedA = lift.body.position.y;
  const loadedB = partner.body.position.y;
  room.updatePlatforms(1.0, []);
  assert.ok(lift.body.position.y < loadedA, "unloaded lift reverses");
  assert.ok(partner.body.position.y > loadedB, "partner reverses");
  const sine = room.platforms.find((p) => p.kind === 40);
  assert.ok(sine, "3-3 still has ordinary moving platforms");
  const sx = sine.body.position.x;
  const sy = sine.origin.y;
  room.updatePlatforms(1.0 + Math.PI / 2, []);
  assert.equal(sine.body.position.y, sy);
  assert.notEqual(sine.body.position.x, sx);
});

function vineStage() {
  const s = game();
  s.levelIndex = CAMPAIGN.findIndex((level) => level.id === "2-1");
  s.reset();
  return s;
}

test("a vine block sprouts instead of breaking when hit by a large body", () => {
  const s = vineStage();
  const brick = s.obstacles.find((c) => c.content === "vine")!;
  s.player.scale = T.giantScale;
  s.hitBlock(brick, s.player);
  assert.equal(brick.broken, false);
  assert.equal(brick.used, true);
  assert.equal(s.vines.length, 1);
  const vine = s.vines[0]!;
  const grown = vine.height;
  tick(s, 0.25);
  assert.ok(vine.height > grown, "vine grows upward after the hit");
  assert.ok(vine.height <= vine.maxHeight);

  const marioHit = vineStage();
  const marioBrick = marioHit.obstacles.find((c) => c.content === "vine")!;
  marioHit.marioActive = true;
  marioHit.hitBlock(marioBrick, marioHit.mario);
  assert.equal(marioBrick.broken, false);
  assert.equal(marioBrick.used, true);
  assert.equal(marioHit.vines.length, 1);

  const fire = vineStage();
  const fireBrick = fire.obstacles.find((c) => c.content === "vine")!;
  isolateSolid(fire, fireBrick.body!);
  fire.obstacles = [fireBrick];
  const radius = 6 * T.playerFireballScale;
  shoot(
    fire,
    fireBrick.body!.bounds.min.x - radius - 8,
    fireBrick.y,
    6,
    T.playerFireballScale,
  );
  tick(fire, 6 * dt);
  assert.equal(fireBrick.broken, false);
  assert.equal(fireBrick.used, true);
  assert.equal(fire.vines.length, 1);
});

test("climbing a vine reaches the destination area", () => {
  const s = vineStage();
  const brick = s.obstacles.find((c) => c.content === "vine")!;
  s.hitBlock(brick, s.player);
  const vine = s.vines[0]!;
  while (vine.height < vine.maxHeight) s.step(dt, emptyInput());
  Body.setPosition(s.player.body, {
    x: vine.x,
    y: vine.bottomY - s.player.body.height / 2 - 4,
  });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  s.step(dt, emptyInput());
  assert.ok(s.player.climbing, "player grabs the grown vine by contact");
  const start = s.activeRoom.data.id;
  let frames = 0;
  while (s.activeRoom.data.id === start && frames++ < 600)
    s.step(dt, { ...emptyInput(), up: true });
  assert.equal(s.activeRoom.data.id, "2b");
  assert.ok(s.player.climbing);
});

test("a vine brick stays used when 8x overlaps it, and jump-off does not re-grab", () => {
  const s = vineStage();
  const brick = s.obstacles.find((c) => c.content === "vine")!;
  give(s, s.player, "mushroom8x");
  Body.setPosition(s.player.body, { x: brick.x, y: brick.y });
  tick(s, dt);
  assert.equal(brick.broken, false);
  assert.equal(brick.used, true);
  assert.equal(s.vines.length, 1);
  assert.equal(s.player.climbing, undefined);
  assert.equal(s.player.scale, T.hugeScale);

  const climb = vineStage();
  const vineBrick = climb.obstacles.find((c) => c.content === "vine")!;
  climb.hitBlock(vineBrick, climb.player);
  const vine = climb.vines[0]!;
  while (vine.height < vine.maxHeight) climb.step(dt, emptyInput());
  Body.setPosition(climb.player.body, {
    x: vine.x,
    y: vine.bottomY - climb.player.body.height / 2 - 4,
  });
  Body.setVelocity(climb.player.body, { x: 0, y: 0 });
  climb.step(dt, emptyInput());
  assert.ok(climb.player.climbing);
  climb.step(dt, { ...emptyInput(), up: true });
  assert.ok(climb.player.climbing, "Up climbs instead of jumping off");
  climb.step(dt, { ...emptyInput(), up: true, jump: true });
  assert.equal(climb.player.climbing, undefined, "jump leaves while Up is held");
  climb.step(dt, emptyInput());
  assert.equal(climb.player.climbing, undefined, "jump-off does not re-grab");

  const huge = vineStage();
  const hugeBrick = huge.obstacles.find((c) => c.content === "vine")!;
  huge.hitBlock(hugeBrick, huge.player);
  const hugeVine = huge.vines[0]!;
  while (hugeVine.height < hugeVine.maxHeight) huge.step(dt, emptyInput());
  Body.setPosition(huge.player.body, {
    x: hugeVine.x,
    y: hugeVine.bottomY - huge.player.body.height / 2 - 4,
  });
  Body.setVelocity(huge.player.body, { x: 0, y: 0 });
  huge.step(dt, emptyInput());
  assert.ok(huge.player.climbing);
  const area = huge.activeRoom.data.id;
  give(huge, huge.player, "mushroom8x");
  huge.step(dt, { ...emptyInput(), up: true });
  assert.equal(huge.player.climbing, undefined);
  assert.equal(huge.activeRoom.data.id, area);
});

test("falling from a vine cloud destination returns to the overworld page", () => {
  const s = vineStage();
  const brick = s.obstacles.find((c) => c.content === "vine")!;
  s.hitBlock(brick, s.player);
  const vine = s.vines[0]!;
  while (vine.height < vine.maxHeight) s.step(dt, emptyInput());
  Body.setPosition(s.player.body, {
    x: vine.x,
    y: vine.bottomY - s.player.body.height / 2 - 4,
  });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  s.step(dt, emptyInput());
  let frames = 0;
  while (s.activeRoom.data.id === "28" && frames++ < 600)
    s.step(dt, { ...emptyInput(), up: true });
  assert.equal(s.activeRoom.data.id, "2b");
  s.step(dt, { ...emptyInput(), jump: true });
  Body.setPosition(s.player.body, {
    x: s.player.body.position.x,
    y: 700,
  });
  s.step(dt, emptyInput());
  assert.equal(s.activeRoom.data.id, "28");
  assert.ok(s.player.alive);
  assert.ok(s.player.body.position.y < 640);
});

