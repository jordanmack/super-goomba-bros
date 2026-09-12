import { test } from "node:test";
import assert from "node:assert/strict";
import { Body, overlaps } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
  rescueImpossible,
} from "../src/game/simulation.ts";
import { PHRASES, TUNING as T } from "../src/game/config.ts";
import { CAMPAIGN, areaData, areaGaps } from "../src/game/levels.ts";
import routes from "./fixtures/player-routes.json" with { type: "json" };
const FIRST_AREA = areaData("25");
const GOAL_X = FIRST_AREA.goal.column * 32 + 16;
const GAPS = areaGaps(FIRST_AREA);
import type { Input } from "../src/game/simulation.ts";
import type { ItemKind, Actor } from "../src/game/simulation.ts";

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
function at(s: Simulation, x: number, y = 415) {
  Body.setPosition(s.player.body, { x, y });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
}

function poleOf(s: Simulation) {
  const pole = s.activeRoom.flagpole;
  assert.ok(pole, "stage has a flagpole");
  return pole;
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
  assert.equal(tap.jumps, 1);
  assert.equal(hold.jumps, 1);
  assert.ok(tap.height > 50 && tap.height < 95, `tap jump ${tap.height}`);
  assert.ok(hold.height > 110 && hold.height < 145, `hold jump ${hold.height}`);
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

test("giant head hits break bricks and let NPCs on top fall safely", () => {
  const s = game();
  give(s, s.player, "mushroom");
  const brick = s.obstacles.find(
    (c) => c.kind === "brick" && !c.question && c.y > 300,
  )!;
  at(s, brick.x, brick.y + 16 + 14 * T.giantScale + 5);
  Body.setVelocity(s.player.body, { x: 0, y: -6 });
  const n = s.npcs[0];
  Body.setPosition(n.body, { x: brick.x, y: brick.y - 16 - 14 });
  n.idleWalking = false;
  n.idleWait = 2;
  tick(s, dt);
  assert.equal(brick.broken, true);
  assert.ok(!s.solids.includes(brick.body!));
  tick(s, 0.8);
  assert.ok(n.alive && n.body.position.y > brick.y);
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
  s.nextLevel();
  assert.equal(s.coins, 0);
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
      assert.equal(n.scale, 3);
      assert.equal(n.body.native!.allowRotation, false);
      assert.ok(Math.abs(n.body.bounds.max.x - n.body.bounds.min.x) >= 72);
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
  }
});

function parkNpcs(s: Simulation, keep: Actor[], x = 4000) {
  for (const n of s.npcs) {
    if (keep.includes(n)) continue;
    Body.setPosition(n.body, { x, y: 415 });
    Body.setVelocity(n.body, { x: 0, y: 0 });
  }
}

test("a falling player bounces on an NPC without killing or warning it", () => {
  const s = game();
  const n = s.npcs[0];
  parkNpcs(s, [n]);
  Body.setPosition(n.body, { x: 200, y: 415 });
  Body.setVelocity(n.body, { x: 0, y: 0 });
  at(s, 200, 415 - 30);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  tick(s, dt);
  assert.equal(s.player.body.velocity.y, -T.stompBounce);
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

test("a bounced NPC can be warned after the player leaves range", () => {
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
  assert.equal(s.player.body.velocity.y, -T.stompBounce);
  tick(s, 0.8);
  assert.equal(n.warned, false);
  assert.ok(s.cooldown > 0);
  tick(s, 1, { left: true });
  assert.ok(s.player.grounded);
  assert.ok(
    Math.hypot(
      n.body.position.x - s.player.body.position.x,
      n.body.position.y - s.player.body.position.y,
    ) > T.warningRange,
  );
  tick(s, T.warningCooldown + dt);
  tick(s, 1.2, { right: true });
  assert.equal(n.warned, true);
});

test("falling onto an NPC from above warning range bounces without warning it", () => {
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
  let bounced = false;
  for (let i = 0; i < 50; i++) {
    tick(s, dt);
    assert.equal(n.warned, false);
    if (s.player.body.velocity.y === -T.stompBounce) bounced = true;
  }
  assert.ok(bounced);
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
    y: p.y - 14 * target.scale - 5,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 4 });
}

function giantStompMario(s: Simulation) {
  stillMario(s);
  const marioTop = 411 - 19 * s.mario.scale;
  at(s, 100, marioTop - 14 * s.player.scale - 2);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  Body.setPosition(s.mario.body, { x: 100, y: 411 });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
}

test("mushroom grow and shrink blink between the two sizes", () => {
  const s = game();
  give(s, s.player, "mushroom");
  assert.equal(s.player.scale, T.giantScale);
  assert.ok(s.player.transformLeft > 0);
  assert.equal(s.player.transformFrom, 1);
  const grown = new Set<number>();
  while (s.player.transformLeft > 0) {
    grown.add(s.displayScale(s.player));
    tick(s, dt);
  }
  assert.deepEqual([...grown].sort((a, b) => a - b), [1, T.giantScale]);
  assert.equal(s.displayScale(s.player), T.giantScale);
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
  assert.deepEqual([...shrunk].sort((a, b) => a - b), [1, T.giantScale]);
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
  assert.equal(s.player.scale, T.giantScale);
  s.fireballs.push({
    id: 42,
    x: s.player.body.position.x,
    y: s.player.body.position.y,
    vx: 0,
    age: 0,
  });
  tick(s, dt);
  assert.equal(s.player.alive, true);
  assert.equal(s.player.scale, T.giantScale);
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

function owned(s: Simulation, owner: "player" | "mario") {
  return s.fireballs.filter((f) => f.owner === owner);
}

test("player fireballs match Goomba size and share a two-shot cap", () => {
  const s = game();
  give(s, s.player, "flower");
  tick(s, dt, { fire: true });
  assert.equal(s.fireballs.length, 1);
  assert.equal(s.fireballs[0].scale, 1);
  give(s, s.player, "mushroom");
  tick(s, dt, { fire: true });
  assert.equal(s.fireballs.length, 2);
  assert.equal(s.events.filter((event) => event === "fire").length, 2);
  assert.equal(s.fireballs[0].scale, 1);
  assert.equal(s.fireballs[1].scale, T.playerFireballScale);
  tick(s, dt, { fire: true });
  assert.equal(owned(s, "player").length, T.fireballSlots);
  assert.equal(s.events.filter((event) => event === "fire").length, 2);
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
  return 12 * n.scale + 13 * s.player.scale;
}

test("an unwarned NPC inside 96px is warned without overlap", () => {
  const s = game();
  const n = s.npcs[0];
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
  s.cooldown = 0;
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
  at(s, n.body.position.x - T.warningRange - 12);
  tick(s, dt);
  assert.equal(n.warned, false);
  assert.equal(s.warned, 0);
  assert.equal(s.bubble, "");
});

test("warning cooldown and one-count still hold", () => {
  const s = game();
  const n = s.npcs[0];
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

test("warning cooldown and distance limit", () => {
  const s = game();
  assert.equal(T.warningRange, 96);
  s.warn();
  assert.equal(s.warned, 0);
  at(s, s.npcs[0].body.position.x);
  s.warn();
  assert.equal(s.warned, 0);
  tick(s, T.warningCooldown + dt);
  s.warn();
  assert.equal(s.warned, 1);
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

test("NPCs can enter safety before quota unlocks the player goal", () => {
  const s = game();
  at(s, GOAL_X + 5);
  tick(s, dt);
  assert.equal(s.mode, "playing");
  assert.ok(s.player.body.position.x < GOAL_X);
  Body.setPosition(s.npcs[0].body, { x: GOAL_X + 2, y: 415 });
  tick(s, dt);
  assert.equal(s.saved, 1);
  assert.equal(s.mode, "playing");
  s.save(s.npcs[0]);
  assert.equal(s.saved, 1);
});

test("safe player finish counts only arrivals before a fixed cutoff", () => {
  const s = game();
  s.npcs.slice(0, T.required).forEach((n) => s.save(n));
  at(s, GOAL_X + 5);
  tick(s, dt);
  assert.equal(s.mode, "finishing");
  s.kill(s.player);
  assert.equal(s.player.alive, true);
  Body.setPosition(s.npcs[T.required].body, { x: GOAL_X + 3, y: 415 });
  tick(s, 1);
  assert.equal(s.saved, T.required + 1);
  const left = s.finishLeft;
  s.finish();
  assert.equal(s.finishLeft, left);
  tick(s, 5);
  assert.equal(s.mode, "won");
  Body.setPosition(s.npcs[T.required + 1].body, {
    x: GOAL_X + 3,
    y: 415,
  });
  tick(s, 2);
  assert.equal(s.saved, T.required + 1);
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
  Body.setPosition(s.player.body, { x: pole.x, y: pole.top });
  tick(s, dt);
  assert.equal(pole.claim, "mario");
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
  s.npcs.slice(0, T.required).forEach((n) => s.save(n));
  Body.setPosition(s.player.body, { x: pole.x, y: pole.top });
  tick(s, dt);
  assert.equal(pole.claim, "goomba");
  assert.equal(s.mode, "playing");
  at(s, GOAL_X + 5);
  tick(s, dt);
  assert.equal(s.mode, "finishing");
  assert.equal(pole.claim, "goomba");
});

test("impossibility includes all living and saved NPCs", () => {
  assert.equal(rescueImpossible(4, 1, 5), false);
  assert.equal(rescueImpossible(4, 0, 5), true);
  const s = game();
  s.npcs.slice(0, T.population - T.required + 1).forEach((n) => s.kill(n));
  tick(s, dt);
  assert.equal(s.mode, "playing");
  assert.equal(s.doomed, true);
  assert.equal(s.died(), T.population - T.required + 1);
  assert.equal(s.saved + s.living(), T.required - 1);
  assert.equal(rescueImpossible(s.saved, s.living(), T.required), true);
  s.finish();
  assert.equal(s.mode, "playing");
  s.marioReturn = 0;
  tick(s, dt);
  assert.ok(s.marioActive);
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
  assert.equal(s.coins, 0);
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
  assert.ok(s.saved >= T.required);
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
  const brick = s.obstacles.find((c) => c.kind === "brick" && c.y > 300)!;
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
  assert.ok(!s.npcs[1].alive || s.marioTarget === s.npcs[1].id);
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
