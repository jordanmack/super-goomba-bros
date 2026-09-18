import { test } from "node:test";
import assert from "node:assert/strict";
import { Body } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
} from "../src/game/simulation.ts";
import { MAP_TOP, TUNING as T } from "../src/game/config.ts";
import { CAMPAIGN, areaData } from "../src/game/levels.ts";
import { isFirebarType } from "../src/game/castle.ts";
import type { Input } from "../src/game/simulation.ts";

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
  assert.equal(s.activeRoom.smashedTiles.has(`${axeCol},8`), true);
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
