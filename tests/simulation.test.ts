import { test } from "node:test";
import assert from "node:assert/strict";
import { Body, overlaps } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
  rescueImpossible,
} from "../src/game/simulation.ts";
import { GAPS, TUNING as T } from "../src/game/config.ts";
import type { Input } from "../src/game/simulation.ts";
import type { ItemKind, Actor } from "../src/game/simulation.ts";

class Simulation extends RulesSimulation {
  constructor(random = Math.random) { super(random, physics()); }
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

function give(s: Simulation, actor: Actor, kind: ItemKind) {
  const box = s.covers.find((c) => c.question && !c.used)!;
  s.hitBlock(box, s.player);
  const item = s.items.at(-1)!;
  item.kind = kind;
  s.collect(actor, item);
}

test("small and giant player jumps stay at standard height even when held", () => {
  const heights: number[] = [];
  for (const giant of [false, true]) {
    for (const held of [false, true]) {
      const s = game();
      if (giant) give(s, s.player, "mushroom");
      at(s, 100, T.groundY - 14 * s.player.scale);
      tick(s, 0.1);
      const startY = s.player.body.position.y;
      let peakY = startY;
      for (let frame = 0; frame < 100; frame++) {
        tick(s, dt, { jump: held || frame === 0 });
        peakY = Math.min(peakY, s.player.body.position.y);
      }
      const height = startY - peakY;
      assert.ok(height > 128 && height < 150, `standard jump: ${height}`);
      assert.equal(s.events.filter((event) => event === "jump").length, 1);
      heights.push(height);
    }
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) < 1);
});

test("active Mario collects a star by contact and its immunity expires", () => {
  const s = game();
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 250, y: 411 });
  const box = s.covers.find((c) => c.question)!;
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

test("giant head hits break bricks and let NPCs on top fall safely", () => {
  const s = game();
  give(s, s.player, "mushroom");
  const brick = s.covers.find(
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

test("player brick destruction releases an NPC hiding inside without killing it", () => {
  const s = game();
  give(s, s.player, "mushroom");
  const brick = s.covers.find((c) => c.kind === "brick" && !c.question)!;
  const n = s.npcs[0];
  n.state = "hidden";
  n.cover = brick.id;
  n.entry = { x: brick.x, y: brick.y - 32 };
  Body.setFrozen(n.body, true);
  s.hitBlock(brick, s.player);
  assert.ok(brick.broken && n.alive && !n.body.isStatic);
  assert.equal(n.cover, null);
  const box = s.covers.find((c) => c.question && !c.used)!;
  s.hitBlock(box, s.player);
  assert.ok(box.used && !box.broken);
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
  const brick = s.covers.find(
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
    const box = s.covers.find((c) => c.question)!;
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
    assert.ok(s.covers.filter((c) => c.question).every((c) => !c.used));
  }
});

test("NPCs pick up falling items by contact without being warned or seeking them", () => {
  for (const kind of ["star", "mushroom", "flower"] as const) {
    const s = game();
    const n = s.npcs[0];
    const box = s.covers.find((c) => c.question)!;
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
  assert.ok(s.particles.length >= 32);
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

test("giant player stomps kill Mario, play his death cue, and bounce the player upward", () => {
  const s = game();
  give(s, s.player, "mushroom");
  at(s, 100, 388 - 14 * T.giantScale);
  Body.setVelocity(s.player.body, { x: 0, y: 4 });
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 100, y: 411 });
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

test("player fireballs match Goomba size and keep the same one-second cooldown", () => {
  const s = game();
  give(s, s.player, "flower");
  tick(s, dt, { fire: true });
  assert.equal(s.fireballs.length, 1);
  assert.equal(s.fireballs[0].scale, 1);
  give(s, s.player, "mushroom");
  tick(s, 0.5, { fire: true });
  assert.equal(s.events.filter((event) => event === "fire").length, 1);
  tick(s, 0.6, { fire: true });
  assert.equal(s.events.filter((event) => event === "fire").length, 2);
  assert.equal(s.fireballs.at(-1)!.scale, T.playerFireballScale);
  assert.equal(s.fireballs[0].scale, 1);
});

test("flowers enable player fireballs; hits stun Mario and never hurt NPCs", () => {
  const s = game();
  give(s, s.player, "flower");
  s.marioActive = true;
  s.marioStun = 0.1;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 150, y: 411 });
  Body.setPosition(s.npcs[0].body, { x: 130, y: 415 });
  tick(s, 0.12, { fire: true });
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
    s.fireballs.push({ id: s.fireballs.length + 1, x: 140, y: 411, vx: 0, age: 0, owner: "player" });
    tick(s, dt);
    assert.equal(s.marioStage, expected);
    assert.equal(s.marioActive, true);
  }
  s.fireballs.push({ id: 3, x: 140, y: 411, vx: 0, age: 0, owner: "player" });
  tick(s, dt);
  assert.equal(s.marioActive, false);
  assert.ok(s.marioDeath);
});

test("touching an unwarned NPC automatically speaks and counts it once", () => {
  const s = game();
  const n = s.npcs[0];
  at(s, n.body.position.x);
  tick(s, dt);
  assert.equal(s.warned, 1);
  assert.ok(s.bubble.length > 0);
  assert.ok(s.events.includes("warn"));
  s.events.length = 0;
  s.cooldown = 0;
  tick(s, dt);
  assert.equal(s.warned, 1);
  assert.equal(s.events.includes("warn"), false);
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
    s.covers.filter((c) => c.kind === "pipe").map((c) => [c.x, c.height]),
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
    s.covers.filter((c) => c.kind === "brick" && !c.question).length,
    30,
  );
  assert.equal(s.covers.filter((c) => c.question).length, 13);
  assert.ok(s.covers.some((c) => c.question && c.x === 528 && c.y === 318));
  assert.ok(
    s.solids.some((b) => b.bounds.min.x === 6016 && b.bounds.min.y === 174),
  );
  assert.equal(T.goalX, 6544);
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

test("offscreen, hidden, saved, and dead NPCs do not add crowd pressure", () => {
  const s = crowdGame(6);
  s.cameraX = 1800;
  tick(s, 0.5);
  assert.equal(s.marioCrowd, 0);
  s.cameraX = 0;
  s.npcs[0].warned = false;
  s.npcs[1].state = "hidden";
  s.npcs[1].cover = 0;
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
    s.marioPipe = 10;
    Body.setPosition(s.mario.body, { x: 200, y: 411 });
    s.fireCooldown = 2;
    s.marioJumpWait = 2;
  }
  tick(quiet, 0.2);
  tick(loud, 0.2);
  assert.ok(loud.fireCooldown < quiet.fireCooldown);
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
  const pipe = s.covers.find((c) => c.kind === "pipe")!;
  a.homeX = GAPS[0][0] - 25;
  b.homeX = pipe.x - T.pipeWidth / 2 - 25;
  for (const n of [a, b])
    Body.setPosition(n.body, { x: n.homeX, y: 415 });
  tick(s, 12);
  assert.ok(a.alive && b.alive);
  assert.ok(a.body.position.x < GAPS[0][0] - 12);
  assert.ok(b.body.position.x < pipe.x - T.pipeWidth / 2 - 12);
  at(s, b.body.position.x);
  s.warn();
  tick(s, 0.8);
  assert.ok(b.warned);
  assert.equal(b.state, "run");
  assert.ok(b.body.velocity.x > T.idleSpeed);
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
  s.warn();
  assert.equal(s.warned, 0);
  at(s, s.npcs[0].body.position.x);
  s.warn();
  assert.equal(s.warned, 0);
  tick(s, T.warningCooldown + dt);
  s.warn();
  assert.equal(s.warned, 1);
});

test("cover input is ignored and characters remain exposed", () => {
  const s = game();
  at(s, s.covers[0].x);
  tick(s, 0.4, { hide: true });
  assert.equal(s.player.state, "idle");
  assert.equal(s.protected(s.player), false);
  assert.equal(s.protected(s.player), false);
});

test("entry cancels on movement and jumps remain non-attacking", () => {
  const s = game();
  at(s, s.covers[0].x);
  tick(s, 0.2, { hide: true });
  tick(s, dt, { hide: true, right: true });
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
  at(s, T.goalX + 5);
  tick(s, dt);
  assert.equal(s.mode, "playing");
  assert.ok(s.player.body.position.x < T.goalX);
  Body.setPosition(s.npcs[0].body, { x: T.goalX + 2, y: 415 });
  tick(s, dt);
  assert.equal(s.saved, 1);
  assert.equal(s.mode, "playing");
  s.save(s.npcs[0]);
  assert.equal(s.saved, 1);
});

test("safe player finish counts only arrivals before a fixed cutoff", () => {
  const s = game();
  s.npcs.slice(0, T.required).forEach((n) => s.save(n));
  at(s, T.goalX + 5);
  tick(s, dt);
  assert.equal(s.mode, "finishing");
  s.kill(s.player);
  assert.equal(s.player.alive, true);
  Body.setPosition(s.npcs[T.required].body, { x: T.goalX + 3, y: 415 });
  tick(s, 1);
  assert.equal(s.saved, T.required + 1);
  const left = s.finishLeft;
  s.finish();
  assert.equal(s.finishLeft, left);
  tick(s, 5);
  assert.equal(s.mode, "won");
  Body.setPosition(s.npcs[T.required + 1].body, {
    x: T.goalX + 3,
    y: 415,
  });
  tick(s, 2);
  assert.equal(s.saved, T.required + 1);
});

test("impossibility includes all living and saved NPCs", () => {
  assert.equal(rescueImpossible(4, 1, 5), false);
  assert.equal(rescueImpossible(4, 0, 5), true);
  const s = game();
  s.npcs.slice(0, T.population - T.required + 1).forEach((n) => s.kill(n));
  tick(s, dt);
  assert.equal(s.mode, "playing");
  assert.equal(s.doomed, true);
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
  s.elapsed = 100;
  s.covers[2].broken = true;
  s.fireballs.push({ id: 88, x: 0, y: 0, vx: 1, age: 0 });
  s.kill(s.player);
  assert.equal(s.mode, "dead");
  tick(s, T.deathSequenceSeconds + 0.1);
  assert.equal(s.mode, "playing");
  assert.equal(s.warned, 0);
  assert.equal(s.saved, 0);
  assert.equal(s.phase, 0);
  assert.equal(s.fireballs.length, 0);
  assert.equal(s.covers[2].broken, false);
  assert.equal(s.npcs.filter((n) => n.alive).length, T.population);
  assert.equal(s.bubbleLeft, 0);
  assert.equal(s.player.hideTime, 0);
});

test("time escalates Mario and returning does not reset it", () => {
  const s = game();
  s.elapsed = T.fireballsAt;
  tick(s, dt);
  assert.equal(s.phase, 2);
  s.marioReturn = 0;
  tick(s, dt);
  assert.equal(s.marioActive, true);
  Body.setPosition(s.mario.body, { x: T.goalX + 200, y: 400 });
  tick(s, dt);
  assert.equal(s.marioActive, false);
  assert.equal(s.phase, 2);
  s.marioReturn = 0;
  tick(s, dt);
  assert.equal(s.phase, 2);
});

test("Mario can attack players beside former cover locations", () => {
  const s = game();
  at(s, s.covers[0].x);
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: s.covers[0].x + 2, y: 390 });
  Body.setVelocity(s.mario.body, { x: 0, y: 2 });
  tick(s, dt);
  assert.equal(s.player.state, "idle");
});

test("bricks break without creating occupied hiding states", () => {
  const s = game();
  const brick = s.covers.find((c) => c.kind === "brick" && c.y > 300)!;
  at(s, brick.x, brick.y);
  tick(s, 0.6, { hide: true });
  assert.equal(s.protected(s.player), false);
  s.marioActive = true;
  s.brickTarget = brick.id;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: brick.x, y: brick.y + 38 });
  Body.setVelocity(s.mario.body, { x: 0, y: -6 });
  tick(s, dt, { hide: true });
  assert.equal(brick.broken, true);
  assert.equal(s.player.alive, true);
});

test("fireballs kill exposed players beside former cover locations", () => {
  const s = game();
  at(s, s.covers[0].x);
  s.fireballs.push({ id: 20, x: s.covers[0].x, y: 412, vx: 0, age: 0 });
  tick(s, dt);
  assert.equal(s.player.alive, false);
});

test("late Mario fires visible projectiles when pursuing", () => {
  const s = game();
  s.elapsed = T.fireballsAt;
  s.marioActive = true;
  s.marioStage = 2;
  s.fireCooldown = 0;
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
  assert.ok(s.events.includes("power"));
  assert.ok(s.events.includes("fire"));
});

test("fear traits produce different running urgency", () => {
  const s = game();
  const [shy, bold] = s.npcs;
  for (const n of [shy, bold]) {
    n.warned = true;
    Body.setPosition(n.body, { x: s.covers[0].x + 5, y: 415 });
  }
  shy.fear = 1;
  bold.fear = 0;
  s.marioActive = true;
  s.marioPipe = 10;
  Body.setPosition(s.mario.body, { x: 100, y: 410 });
  tick(s, 0.7);
  assert.equal(shy.state, "run");
  assert.equal(bold.state, "run");
  s.marioActive = false;
  s.marioReturn = 100;
  tick(s, dt);
  assert.equal(shy.state, "run");
});

test("a full seeded run can win with Mario active and without teleporting", () => {
  let seed = 1;
  const s = new Simulation(
    () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646,
  );
  s.reset();
  let marioAppeared = false;
  for (let i = 0; i < 60 * 90 && !["dead", "won"].includes(s.mode); i++) {
    const p = s.player.body.position;
    const waiting = p.x >= 5390 && s.saved < T.required;
    const nearGap = GAPS.some(([l, r]) => p.x + 20 > l && p.x + 20 < r);
    const landing =
      nearGap &&
      !s.player.grounded &&
      s.player.body.velocity.y >= 0 &&
      GAPS.some(([l]) => p.x < l && p.x + 20 > l);
    const jump =
      s.player.grounded &&
      (nearGap ||
        s.solids.some(
          (b) =>
            p.x + 35 > b.bounds.min.x &&
            p.x + 35 < b.bounds.max.x &&
            p.y + 14 > b.bounds.min.y + 5 &&
            p.y < b.bounds.max.y,
        ));
    s.cameraX = Math.max(0, Math.min(T.worldWidth - 960, p.x - 960 * 0.36));
    s.step(dt, {
      ...emptyInput(),
      right: !waiting && !landing,
      jump,
      hide: waiting,
      warn: !waiting && s.cooldown <= 0,
    });
    marioAppeared ||= s.marioActive;
  }
  assert.equal(s.mode, "won");
  assert.ok(s.saved >= T.required);
  assert.ok(marioAppeared);
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

test("cover input does not break pursuit or create an invisible target", () => {
  const s = game();
  at(s, s.covers[0].x);
  tick(s, 0.6, { hide: true });
  s.marioActive = true;
  s.marioChase = 3;
  s.marioTarget = s.player.id;
  s.marioAim = 300;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 0, y: 411 });
  tick(s, 1.5, { hide: true });
  assert.equal(s.marioTarget, s.player.id);
  assert.ok(s.marioChase > 0);
});

test("both player sizes can jump every pipe in both directions at standard height", () => {
  for (const giant of [false, true]) {
    for (const dir of [-1, 1]) {
      for (let pipeIndex = 0; pipeIndex < 6; pipeIndex++) {
        const s = game();
        if (giant) give(s, s.player, "mushroom");
        const pipe = s.covers.filter((c) => c.kind === "pipe")[pipeIndex];
        at(s, pipe.x - dir * 100, T.groundY - 14 * s.player.scale);
        tick(s, 1, { right: dir === 1, left: dir === -1 });
        assert.ok((pipe.x - s.player.body.position.x) * dir > T.pipeWidth / 2);
        tick(s, 0.9, { right: dir === 1, left: dir === -1, jump: true });
        tick(s, 0.7, { right: dir === 1, left: dir === -1 });
        assert.ok(
          (s.player.body.position.x - pipe.x) * dir > T.pipeWidth / 2,
          `pipe ${pipeIndex}, direction ${dir}, giant ${giant}`,
        );
      }
    }
  }
});

test("pipes remain solid obstacles and are not hiding entrances", () => {
  const s = game();
  const pipe = s.covers.find((c) => c.kind === "pipe")!;
  at(s, pipe.x - 100);
  tick(s, 0.2, { hide: true, right: true });
  assert.equal(s.player.state, "idle");
  tick(s, 1, { right: true });
  assert.equal(overlaps(s.player.body, [pipe.body!]).length, 0);
  assert.ok(Math.abs(s.player.body.bounds.max.x - pipe.body!.bounds.min.x) < 0.1);
});

test("every floating brick has a solid top and can be destroyed and restored", () => {
  const s = game();
  const bricks = s.covers.filter((c) => c.kind === "brick");
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
    s.covers
      .filter((c) => c.kind === "brick")
      .every((c) => !c.broken && s.solids.includes(c.body!)),
  );
});

test("Mario breaks ordinary bricks by striking from below, not merely standing nearby", () => {
  const s = game();
  const brick = s.covers.find((c) => c.kind === "brick" && c.y > 300)!;
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
  assert.ok(s.particles.length >= 12);
});

test("kills emit blood once, stains settle, and all effects clear on restart", () => {
  const s = game();
  const n = s.npcs[0];
  s.kill(n);
  assert.equal(s.particles.length, 32);
  s.kill(n);
  assert.equal(s.particles.length, 32);
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
  at(s, 4300);
  for (let i = 2; i < s.npcs.length; i++)
    Body.setPosition(s.npcs[i].body, { x: 4200, y: 415 });
  Body.setPosition(s.npcs[0].body, { x: 220, y: 415 });
  Body.setPosition(s.npcs[1].body, { x: 350, y: 415 });
  s.marioActive = true;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: 100, y: 411 });
  tick(s, 5);
  assert.equal(s.npcs[0].alive, false);
  assert.ok(!s.npcs[1].alive || s.marioTarget === s.npcs[1].id);
  assert.ok(s.particles.some((p) => p.color === "#bc0018"));
});
