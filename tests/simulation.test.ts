import { test } from "node:test";
import assert from "node:assert/strict";
import { Body, overlaps } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
} from "../src/game/simulation.ts";
import { MAP_TOP, PHRASES, TUNING as T, blockDrawY } from "../src/game/config.ts";
import { CAMPAIGN, areaData, areaGaps } from "../src/game/levels.ts";
import routes from "./fixtures/player-routes.json" with { type: "json" };
const FIRST_AREA = areaData("25");
const GOAL_X = FIRST_AREA.goal.column * 32 + 16;
const GAPS = areaGaps(FIRST_AREA);
import type { Input } from "../src/game/simulation.ts";
import type { ItemKind, Actor } from "../src/game/simulation.ts";
import { itemSpriteSize } from "../src/game/simulation.ts";
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
  s.hitBlock(box, s.player);
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
  assert.ok(tap.height > 30 && tap.height < 80, `tap jump ${tap.height}`);
  assert.ok(stand.height > 110 && stand.height < 145, `stand jump ${stand.height}`);
  assert.ok(hold.height > 120 && hold.height < 155, `walk jump ${hold.height}`);
  assert.ok(run.height > 145 && run.height < 180, `run jump ${run.height}`);
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
  let takeoff = 0;
  let leftGround = false;
  const air: number[] = [];
  for (let i = 0; i < 40; i++) {
    const wasGrounded = n.grounded;
    s.step(dt, emptyInput());
    if (wasGrounded && !n.grounded) {
      leftGround = true;
      takeoff = Math.abs(n.body.velocity.x);
    }
    if (!n.grounded) air.push(Math.abs(n.body.velocity.x));
  }
  assert.ok(leftGround, "NPC left the ground");
  assert.ok(takeoff > 0, `takeoff ${takeoff}`);
  assert.ok(takeoff <= T.runSpeed + 0.05, `takeoff ${takeoff} above run`);
  for (const vx of air)
    assert.ok(vx <= takeoff + 0.05, `air ${vx} > takeoff ${takeoff}`);
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
    if (item.body.position.y + size / 2 > top) sawBelow = true;
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
    [0, "star"],
    [0.5, "mushroom"],
    [0.99, "flower"],
  ] as const) {
    const s = game();
    s.random = () => roll;
    const box = s.obstacles.find((c) => c.question && !c.hidden)!;
    s.hitBlock(box, s.mario);
    assert.equal(s.items[0].kind, kind);
    assert.equal(box.used, true);
    assert.equal(box.broken, false);
    tick(s, 0.5);
    assert.ok(Number.isFinite(s.items[0].body.position.y));
    s.hitBlock(box, s.player);
    assert.equal(s.items.length, 1);
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
  assert.equal(s.coinPops.length, 3);
  s.events.length = 0;
  s.hitBlock(marioHit.block, s.mario);
  assert.equal(marioHit.coin.collected, true);
  assert.equal(s.coins, 3);
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
  const npcCoin = room.coins.find((c) => !c.collected);
  assert.ok(npcCoin);
  const n = s.npcs[0];
  npcCoin.x = n.body.position.x;
  npcCoin.y = n.body.position.y;
  tick(s, dt);
  assert.equal(npcCoin.collected, true);
  assert.equal(s.coins, 2);
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

test("a falling player lands on an NPC without hopping, killing, or warning it", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  at(s, 200, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.ok(s.player.body.velocity.y > 0);
  assert.notEqual(s.player.body.velocity.y, -T.stompBounce);
  tick(s, 0.8);
  assert.ok(s.player.grounded);
  assert.ok(
    Math.hypot(
      n.body.position.x - s.player.body.position.x,
      n.body.position.y - s.player.body.position.y,
    ) <= T.warningRange,
  );
  assert.ok(n.alive);
  assert.equal(n.warned, false);
  assert.equal(s.warned, 0);
  assert.equal(s.events.includes("warn"), false);
  assert.equal(s.events.includes("splat"), false);
});

test("a landed-on NPC can be warned after the player leaves range", () => {
  const s = game();
  const n = s.npcs[0];
  const other = s.npcs[1];
  parkNpcs(s, [n, other]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setPosition(other.body, { x: 260, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  Body.setVelocity(other.body, { x: 0, y: 0 });
  n.idleWalking = false;
  n.wait = 99;
  other.idleWalking = false;
  other.wait = 99;
  at(s, 200, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.ok(s.player.body.velocity.y > 0);
  tick(s, 0.8);
  assert.equal(n.warned, false);
  assert.equal(other.warned, true);
  tick(s, 1, { left: true });
  assert.ok(s.player.grounded);
  assert.ok(
    Math.hypot(
      n.body.position.x - s.player.body.position.x,
      n.body.position.y - s.player.body.position.y,
    ) > T.warningRange,
  );
  tick(s, 1.2, { right: true });
  assert.equal(n.warned, true);
});

test("falling onto an NPC from above warning range does not hop or warn it", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  at(s, 200, 300);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  assert.ok(
    Math.hypot(0, n.body.position.y - s.player.body.position.y) >
      T.warningRange,
  );
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

test("first damaging stomp shrinks a mushroom player and keeps the flower", () => {
  const s = game();
  give(s, s.player, "flower");
  give(s, s.player, "mushroom");
  parkNpcs(s, []);
  marioStomp(s, s.player);
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.scale, 1);
  assert.equal(s.player.flower, true);
  assert.ok(s.events.includes("shrink"));
  s.marioActive = false;
  tick(s, T.transformSeconds + dt, { fire: true });
  assert.equal(s.fireballs.length, T.fireballSlots);
  assert.ok(s.fireballs.every((f) => (f.scale ?? 1) === 1));
  assert.equal(s.player.alive, true);
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
  assert.equal(s.fireballs[1].scale, 1);
  assert.equal(s.player.scale, T.mushroomScale);
  tick(s, dt, { fire: true });
  assert.equal(owned(s, "player").length, T.fireballSlots);
  assert.equal(s.events.filter((event) => event === "fire").length, 2);
  give(s, s.player, "mushroom3x");
  s.fireballs[1].age = 5;
  tick(s, 2 * dt, { fire: true });
  assert.equal(s.fireballs.at(-1)!.scale, T.playerFireballScale);
  give(s, s.player, "mushroom8x");
  s.fireballs[0].age = 5;
  tick(s, 2 * dt, { fire: true });
  assert.equal(s.fireballs.at(-1)!.scale, T.hugeScale);
  assert.equal(first.scale, 1);
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

test("an unwarned NPC inside 96px is warned without overlap", () => {
  const s = game();
  const n = s.npcs[0];
  Body.setPosition(n.body, { x: 400, y: 415 });
  const gap = overlapX(s, n) + 20;
  at(s, n.body.position.x - gap);
  assert.ok(gap > overlapX(s, n));
  assert.ok(
    Math.hypot(gap, n.body.position.y - s.player.body.position.y) <=
      T.warningRange,
  );
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

test("an unwarned NPC outside 96px is not warned", () => {
  const s = game();
  const n = s.npcs[0];
  Body.setPosition(n.body, { x: 400, y: 415 });
  at(s, n.body.position.x - T.warningRange - 12);
  tick(s, dt);
  assert.equal(n.warned, false);
  assert.equal(s.warned, 0);
  assert.equal(s.bubble, "");
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
  for (const line of PHRASES) {
    assert.match(line, /!/);
    assert.equal(/joke|banana|pizza/i.test(line), false);
  }
});

test("stars block Mario fireballs, while giant characters are still vulnerable", () => {
  for (const kind of ["star", "mushroom"] as const) {
    const s = game();
    give(s, s.player, kind);
    s.fireballs.push({
      id: 999,
      x: s.player.body.position.x,
      y: s.player.body.position.y,
      vx: 0,
      age: 0,
    });
    tick(s, dt);
    assert.equal(s.player.alive, kind === "star");
    if (kind === "star") {
      s.player.starLeft = dt;
      s.fireballs.push({
        id: 1000,
        x: s.player.body.position.x,
        y: s.player.body.position.y,
        vx: 0,
        age: 0,
      });
      tick(s, dt);
      assert.equal(s.player.alive, false);
    }
  }
});

test("fixed population and unique traits per character across a run", () => {
  let seed = 1;
  const s = new Simulation(
    () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646,
  );
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
  at(s, a.body.position.x - T.warningRange - 12);
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

test("first player past the flagpole raises a Goomba flag", () => {
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
  assert.equal(flagTextureKey(pole.claim), "goombaFlag");
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

test("Mario first appears at three seconds, and later returns keep their delay", () => {
  const s = new Simulation(() => 0.5);
  s.reset();
  assert.equal(s.marioActive, false);
  tick(s, 3 - dt);
  assert.equal(s.marioActive, false);
  tick(s, 2 * dt);
  assert.equal(s.marioActive, true);
  Body.setPosition(s.mario.body, { x: GOAL_X + 200, y: 400 });
  tick(s, dt);
  assert.equal(s.marioActive, false);
  tick(s, 3 + dt);
  assert.equal(s.marioActive, false);
});

test("time escalates Mario and returning does not reset it", () => {
  const s = game();
  s.elapsed = T.fireballsAt;
  tick(s, dt);
  assert.equal(s.phase, 2);
  s.marioReturn = 0;
  tick(s, dt);
  assert.equal(s.marioActive, true);
  Body.setPosition(s.mario.body, { x: GOAL_X + 200, y: 400 });
  tick(s, dt);
  assert.equal(s.marioActive, false);
  assert.equal(s.phase, 2);
  s.marioReturn = 0;
  tick(s, dt);
  assert.equal(s.phase, 2);
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

test("down-pipe travel slides in, warps after hiding, and emerges from the dest pipe", () => {
  const s = game();
  const entry = s.activeRoom.data.pipes.find((p) => p.direction === "down")!;
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
  assert.equal(s.player.pipeTravel?.phase, "exit");
  while (s.player.pipeTravel) s.step(dt, emptyInput());
  const dest = s.activeRoom.data.pipes[0];
  const destLeft = s.activeRoom.offset + dest.column * 32;
  assert.ok(
    s.player.body.position.x < destLeft,
    "emerge from the dest pipe opening, not a nearby floor snap",
  );
  assert.ok(s.player.body.position.x > destLeft - 80);
  assert.ok((s.player.pipeWait ?? 0) > 0);
  assert.ok(s.events.filter((event) => event === "pipe").length >= 2);
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

test("an intro pipe emerges at the dest page without a nearby-floor search", () => {
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
  assert.equal(s.player.pipeTravel?.phase, "exit");
  assert.ok(s.player.body.position.x < s.activeRoom.offset + 100);
  while (s.player.pipeTravel && frames++ < 360) s.step(dt, emptyInput());
  assert.equal(s.events.filter((event) => event === "pipe").length, 2);
  assert.ok(
    Math.abs(s.player.body.position.x - (s.activeRoom.offset + 100)) < 8,
  );
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
  let sawExit = false;
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
    if (s.player.areaId === "40" && s.player.pipeTravel?.phase === "exit") {
      sawExit = true;
      assert.equal(s.elapsed, 0);
      assert.equal(s.marioActive, false);
      assert.equal(s.pipeIntro, true);
    }
    assert.notEqual(s.mode, "dead");
  }
  assert.equal(s.pipeIntro, false);
  assert.equal(s.mode, "playing");
  assert.equal(sawExit, true);
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
  assert.equal(s.marioActive, true);
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

test("a giant traveler is clipped to the pipe opening while sliding in", () => {
  const s = game();
  give(s, s.player, "mushroom3x");
  const entry = s.activeRoom.data.pipes.find((p) => p.direction === "down")!;
  at(
    s,
    (entry.column + entry.width / 2) * 32,
    MAP_TOP + entry.row * 32 - 14 * s.player.scale,
  );
  s.step(dt, { ...emptyInput(), down: true });
  const clip = s.player.pipeTravel?.clip;
  assert.ok(clip);
  assert.equal(clip.w, entry.width * 32);
  assert.ok(clip.w < 32 * s.player.scale);
  assert.equal(clip.h, entry.row * 32);
  assert.ok(
    clip.h > 0,
    "clip is the space outside the mouth, not the pipe interior",
  );
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
  assert.equal(T.hugeSeconds, T.starSeconds);
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
    [0, 0, "star"],
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

test("Mario still uses original small and big from any mushroom", () => {
  const s = game();
  s.marioActive = true;
  s.setMarioStage(0);
  give(s, s.mario, "mushroom8x");
  assert.equal(s.marioStage, 1);
  assert.equal(s.mario.scale, 1);
  assert.equal(s.mario.hugeLeft, 0);
  give(s, s.mario, "mushroom3x");
  assert.equal(s.marioStage, 1);
  assert.equal(s.score, 1000);
});

test("8x walking smashes bricks, passes pipes, and still enters a pipe", () => {
  const s = game();
  const brick = s.obstacles.find(
    (c) => c.kind === "brick" && !c.question && !c.hidden && c.y > 300,
  )!;
  const question = s.obstacles.find(
    (c) => c.question && !c.used && c.y > 300,
  )!;
  give(s, s.player, "mushroom8x");
  at(s, brick.x, T.groundY - 14 * s.player.scale);
  tick(s, dt);
  assert.equal(brick.broken, true);
  at(s, question.x, T.groundY - 14 * s.player.scale);
  tick(s, dt);
  assert.equal(question.broken, false);
  assert.ok(s.solids.includes(question.body!));
  const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
  at(s, pipe.x - 150, T.groundY - 14 * s.player.scale);
  tick(s, 0.15);
  tick(s, 2.4, { right: true });
  assert.ok(s.player.body.position.x > pipe.x);
  assert.equal(s.player.grounded, true);
  const room = s.activeRoom;
  const down = room.data.pipes.find((p) => p.direction === "down")!;
  const mouthX = room.offset + (down.column + down.width / 2) * 32;
  const mouthTop = MAP_TOP + down.row * 32;
  at(s, mouthX, mouthTop - 14 * s.player.scale);
  tick(s, 0.1);
  ridePipe(s, { down: true }, down.destinations[0]!.area);
  assert.ok(s.events.includes("pipe"));
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

test("8x still falls through a pipe interior", () => {
  const s = game();
  parkNpcs(s, []);
  give(s, s.player, "mushroom8x");
  const pipe = s.obstacles.find((c) => c.kind === "pipe")!;
  const top = pipe.body!.bounds.min.y;
  at(s, pipe.x, top + 20 - 14 * s.player.scale);
  const startY = s.player.body.position.y;
  tick(s, 0.25);
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
  assert.equal(s.events.includes("shrink"), false);
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
    assert.equal(s.events.includes("shrink"), false, kind);
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

test("8x still stomps Mario, stays hunted, dies in a pit, then 3x is vulnerable", () => {
  const stomp = game();
  give(stomp, stomp.player, "mushroom8x");
  parkNpcs(stomp, []);
  assert.equal(stomp.invincible(stomp.player), false);
  giantStompMario(stomp);
  tick(stomp, dt);
  assert.equal(stomp.marioStage, 0);
  assert.ok(stomp.player.alive && stomp.mario.alive);
  assert.equal(stomp.player.scale, T.hugeScale);
  assert.ok(stomp.player.body.velocity.y < 0);

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
  assert.equal(pit.events.includes("splat"), false);

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
  assert.equal(s.events.includes("shrink"), false);
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

test("stomping a walking Koopa shells it without a player hop, and is not a death", () => {
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
  assert.equal(n.shell, "stopped");
  assert.equal(n.warned, true);
  assert.equal(s.living(), T.population);
  assert.equal(s.events.includes("splat"), false);
  assert.equal(s.particles.length, 0);
});

test("a falling player shells an unwarned walking Koopa without hopping or warning it", () => {
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
  assert.equal(n.shell, "stopped");
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

test("a stopped shell is kicked by a side bump at original shell speed", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  n.idleWalking = false;
  n.wait = 99;
  at(s, 200, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.equal(n.shell, "stopped");
  at(s, 100, 415);
  tick(s, dt);
  at(s, 180, 415);
  tick(s, dt);
  assert.equal(n.shell, "moving");
  assert.equal(n.facing, 1);
  assert.equal(n.body.velocity.x, T.shellSpeed);
  assert.equal(T.shellSpeed, 6);
  assert.ok(s.events.includes("kick"));
  assert.ok(n.alive);
});

test("stomping a stopped shell kicks it the kicker's way", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  n.idleWalking = false;
  n.wait = 99;
  Body.setPosition(n.body, { x: 200, y: 415 });
  at(s, 200, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.equal(n.shell, "stopped");
  at(s, 80, 415);
  tick(s, dt);
  at(s, 188, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  const kicks = s.events.filter((e) => e === "kick").length;
  tick(s, dt);
  assert.equal(n.shell, "moving");
  assert.equal(n.facing, 1);
  assert.equal(n.body.velocity.x, T.shellSpeed);
  assert.equal(s.events.filter((e) => e === "kick").length, kicks + 1);
  assert.ok(s.player.body.velocity.y > 0);
  assert.notEqual(s.player.body.velocity.y, -T.stompBounce);
  assert.ok(s.player.alive);
});

test("stomping a moving shell stops it; side contact kills after kick grace", () => {
  const s = game();
  const n = troopa(s);
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  n.idleWalking = false;
  n.wait = 99;
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  at(s, 192, 415);
  tick(s, dt);
  assert.equal(n.shell, "moving");
  assert.ok(s.player.alive);
  tick(s, 2 * dt);
  assert.ok(
    Math.abs(n.body.position.x - s.player.body.position.x) < 24,
    "still overlapping, so survival is from kick grace",
  );
  assert.ok(s.player.alive);
  tick(s, 0.3);
  assert.ok(s.player.alive);
  at(s, n.body.position.x, n.body.position.y - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.equal(n.shell, "stopped");
  assert.ok(s.player.body.velocity.y > 0);
  assert.notEqual(s.player.body.velocity.y, -T.stompBounce);
  assert.ok(s.player.alive);
  at(s, 80, 415);
  tick(s, dt);
  n.shell = "moving";
  n.facing = 1;
  Body.setVelocity(n.body, { x: T.shellSpeed, y: 0 });
  at(s, n.body.position.x + 8, 415);
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  tick(s, dt);
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
    at(s, 200, 415 - 30);
    Body.setVelocity(s.player.body, { x: 0, y: 4 });
    tick(s, dt);
    assert.equal(n.shell, "stopped");
    at(s, 80, 415);
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

test("a stopped water shell does not keep leftover swim speed", () => {
  const s = game();
  s.levelIndex = 5;
  s.reset();
  s.marioReturn = 1e6;
  finishPipeIntro(s);
  const n = troopa(s);
  assert.equal(s.roomFor(n).data.type, "water");
  parkNpcs(s, [n]);
  const y = n.body.position.y;
  n.shell = "stopped";
  n.wakeLeft = T.shellWake;
  Body.setVelocity(n.body, { x: 0, y: 3 });
  tick(s, 0.2);
  assert.equal(n.shell, "stopped");
  assert.equal(n.body.velocity.y, 0);
  assert.ok(Math.abs(n.body.position.y - y) < 2);
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
  const s = game();
  s.levelIndex = CAMPAIGN.length - 1;
  s.reset();
  s.marioReturn = 1e6;
  s.timeLeft = 0;
  s.finish();
  while (s.mode === "finishing" && s.tallyPhase !== "ending") {
    s.tallyHold = 0;
    tick(s, dt);
  }
  assert.equal(s.tallyPhase, "ending");
  assert.ok(
    s.tallyHold >= T.endingSeconds + T.deathSequenceSeconds - dt,
    `hold ${s.tallyHold}`,
  );
  const hold = s.tallyHold;
  tick(s, hold - dt);
  assert.equal(s.mode, "finishing");
  tick(s, 2 * dt);
  assert.equal(s.mode, "title");
  assert.equal(s.levelIndex, 0);
  assert.equal(s.score, 0);
});

test("leftover TIME tally starts from a fresh 4-frame accumulator", () => {
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
