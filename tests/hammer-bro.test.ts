import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation, emptyInput } from "../src/game/simulation.ts";
import type { Actor, HammerBro, ItemKind } from "../src/game/simulation.ts";
import { Body } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import { TUNING as T } from "../src/game/config.ts";
import { areaData, campaignIndex } from "../src/game/levels.ts";
import { ENEMY_HAMMER_BRO, enemyRole } from "../src/game/room.ts";
import { HAMMER_BRO_SHEET } from "../src/game/smb-sprites.ts";

const dt = 1 / 60;

const PLACES: [number, number, number[]][] = [
  [3, 1, [113, 116]],
  [5, 2, [46, 81, 120, 124]],
  [7, 1, [84, 86, 135, 137]],
  [8, 3, [63, 65, 117, 119, 146, 159, 177, 185]],
  [8, 4, [273]],
];

function start(world: number, stage: number) {
  const s = new Simulation(() => 0.5, physics());
  s.levelIndex = campaignIndex(world, stage);
  s.reset();
  s.marioReturn = 1e6;
  return s;
}

function step(s: Simulation, frames = 1) {
  for (let i = 0; i < frames; i++) s.step(dt, emptyInput());
}

function landCount(s: Simulation) {
  return s.npcs.filter((n) => n.kind === "goomba" || n.kind === "koopa").length;
}

function columnX(s: Simulation, column: number) {
  const room = s.rooms.get(s.level.main)!;
  return room.offset + column * 32 + 16;
}

function broAt(s: Simulation, column: number) {
  const x = columnX(s, column);
  return s.hammerBros.find(
    (bro) => bro.alive && Math.abs(bro.body.position.x - x) < 1,
  );
}

function shrinks(s: Simulation) {
  return s.events.filter((event) => event === "shrink").length;
}

function give(s: Simulation, actor: Actor, kind: ItemKind) {
  const box = s.obstacles.find(
    (c) => c.question && !c.used && !c.hidden && c.content !== "1-up",
  );
  assert.ok(box, "question block");
  const previous = s.random;
  s.random = () => 0.5;
  s.hitBlock(box, s.player);
  s.random = previous;
  const item = s.items.at(-1);
  assert.ok(item);
  item.kind = kind;
  if (actor === s.mario) s.marioActive = true;
  s.collect(actor, item);
}

function holdBro(bro: HammerBro) {
  bro.jumpTimer = 300;
  bro.throwTimer = 300;
  bro.walkTimer = 300;
  Body.setVelocity(bro.body, { x: 0, y: 0 });
}

function park(s: Simulation) {
  for (const n of s.npcs) {
    Body.setPosition(n.body, { x: 5200, y: T.groundY - 40 });
    Body.setVelocity(n.body, { x: 0, y: 0 });
    n.idleWalking = false;
    n.wait = 99;
  }
}

test("one Hammer Bro spawns at each type-5 column, outside the land 30 and the rescue tally", () => {
  assert.equal(enemyRole(ENEMY_HAMMER_BRO), "hammer-bro");
  assert.equal(enemyRole(0), "other");
  for (const [world, stage, columns] of PLACES) {
    const s = start(world, stage);
    const placed = areaData(s.level.main).enemies.filter(
      (enemy) => enemy.type === ENEMY_HAMMER_BRO,
    );
    assert.deepEqual(
      placed.map((enemy) => enemy.column),
      columns,
      s.level.id,
    );
    assert.equal(s.hammerBros.length, columns.length, s.level.id);
    for (const column of columns) {
      const bro = broAt(s, column);
      assert.ok(bro, `${s.level.id} column ${column}`);
      assert.equal(bro.areaId, s.level.main);
    }
    assert.equal(landCount(s), T.population, s.level.id);
    assert.equal(
      s.npcs.some((n) => n.id === s.hammerBros[0]?.id),
      false,
      s.level.id,
    );
    assert.equal(s.warned, 0, s.level.id);
    assert.equal(s.saved, 0, s.level.id);
    assert.equal(s.died(), 0, s.level.id);
    s.physics.clear();
  }
  const plain = start(1, 1);
  assert.equal(plain.hammerBros.length, 0);
  assert.equal(landCount(plain), T.population);
  plain.physics.clear();
});

test("an offscreen Hammer Bro stays on his column until the view arrives", () => {
  const s = start(3, 1);
  const bro = broAt(s, 116);
  assert.ok(bro);
  const x = bro.body.position.x;
  const y = bro.body.position.y;
  park(s);
  Body.setFrozen(s.player.body, true);
  Body.setPosition(s.player.body, { x: 200, y: T.groundY - 40 });
  step(s, 180);
  assert.equal(bro.alive, true);
  assert.ok(Math.abs(bro.body.position.x - x) < 1, "offscreen Bro walked");
  assert.ok(Math.abs(bro.body.position.y - y) < 2, "offscreen Bro jumped");
  Body.setPosition(s.player.body, { x: x - 180, y: y - 120 });
  let moved = false;
  for (let frame = 0; frame < 50 && bro.alive; frame++) {
    step(s);
    if (
      Math.abs(bro.body.position.x - x) > 4 ||
      bro.body.position.y < y - 8
    )
      moved = true;
  }
  assert.equal(moved, true);
  s.physics.clear();
});

test("a Hammer Bro above the floor wakes when the player is underneath", () => {
  const s = start(5, 2);
  const bro = broAt(s, 124);
  assert.ok(bro);
  park(s);
  const x = bro.body.position.x;
  const y = bro.body.position.y;
  assert.ok(y < T.groundY - 200, "column 124 is the high Bro");
  Body.setFrozen(s.player.body, true);
  Body.setPosition(s.player.body, { x: x - 80, y: T.groundY - 20 });
  let moved = false;
  for (let frame = 0; frame < 40 && bro.alive; frame++) {
    step(s);
    if (Math.abs(bro.body.position.x - x) > 2 || bro.body.position.y < y - 8)
      moved = true;
  }
  assert.equal(moved, true);
  s.physics.clear();
});

test("a Hammer Bro walks and jumps, and a hammer arcs without breaking a brick", () => {
  const s = start(3, 1);
  const bro = broAt(s, 116);
  assert.ok(bro);
  park(s);
  Body.setFrozen(s.player.body, true);
  Body.setPosition(s.player.body, {
    x: bro.body.position.x - 180,
    y: bro.body.position.y - 120,
  });
  const startX = bro.body.position.x;
  const startY = bro.body.position.y;
  let walked = false;
  let jumped = false;
  for (let frame = 0; frame < 90 && bro.alive; frame++) {
    step(s);
    if (Math.abs(bro.body.position.x - startX) > 4) walked = true;
    if (bro.body.position.y < startY - 8) jumped = true;
  }
  assert.equal(walked, true);
  assert.equal(jumped, true);
  assert.equal(bro.alive, true);
  s.physics.clear();

  const arc = start(3, 1);
  const still = broAt(arc, 116);
  assert.ok(still);
  park(arc);
  still.jumpTimer = 400;
  still.walkTimer = 400;
  still.throwTimer = 0;
  Body.setFrozen(arc.player.body, true);
  Body.setPosition(arc.player.body, {
    x: still.body.position.x + 180,
    y: still.body.position.y - 120,
  });
  step(arc);
  const hammer = arc.hammers.find((item) => item.broId === still.id);
  assert.ok(hammer, "hammer left the Bro");
  let minY = hammer.y;
  let flew = false;
  let rose = false;
  let fell = false;
  for (let frame = 0; frame < 80; frame++) {
    step(arc);
    if (hammer.vx !== 0) flew = true;
    if (hammer.y < minY - 2) {
      rose = true;
      minY = hammer.y;
    }
    if (rose && hammer.y > minY + 4) fell = true;
  }
  assert.equal(flew, true);
  assert.equal(rose, true);
  assert.equal(fell, true);

  const brick = arc.obstacles.find(
    (c) => c.kind === "brick" && !c.broken && !c.question && c.body,
  );
  assert.ok(brick);
  hammer.windup = 0;
  hammer.vx = 3;
  hammer.vy = 0;
  hammer.x = brick.x;
  hammer.y = brick.y;
  const before = arc.events.filter((event) => event === "break").length;
  step(arc, 8);
  assert.equal(brick.broken, false);
  assert.equal(arc.events.filter((event) => event === "break").length, before);
  assert.notEqual(hammer.x, brick.x);
  arc.physics.clear();
});

test("Mario's stomp defeats the Bro, and the player does not stomp or rescue him", () => {
  const s = start(3, 1);
  const bro = broAt(s, 116);
  assert.ok(bro);
  park(s);
  holdBro(bro);
  const warned = s.warned;
  const saved = s.saved;
  Body.setFrozen(s.player.body, false);
  Body.setPosition(s.player.body, {
    x: bro.body.position.x,
    y: bro.body.bounds.min.y - s.player.body.height / 2 - 2,
  });
  Body.setVelocity(s.player.body, { x: 0, y: 6 });
  step(s);
  assert.equal(bro.alive, true);
  assert.equal(s.player.alive, false);
  assert.equal(s.mode, "dead");
  assert.notEqual(s.player.body.velocity.y, -T.stompBounce);
  assert.equal(s.saved, saved);
  assert.equal(s.warned, warned);
  assert.equal(landCount(s), T.population);
  s.physics.clear();

  const hunt = start(3, 1);
  const prey = broAt(hunt, 116);
  assert.ok(prey);
  park(hunt);
  holdBro(prey);
  hunt.cameraX = prey.body.position.x - 400;
  hunt.marioActive = true;
  hunt.mario.alive = true;
  hunt.mario.areaId = prey.areaId;
  hunt.marioStun = 0;
  hunt.marioLook = 10;
  hunt.marioPause = 10;
  hunt.marioChase = 0;
  hunt.marioReaction = 1;
  Body.setFrozen(hunt.mario.body, false);
  Body.setPosition(hunt.mario.body, {
    x: prey.body.position.x,
    y: prey.body.bounds.min.y - hunt.mario.body.height / 2 - 4,
  });
  Body.setVelocity(hunt.mario.body, { x: 0, y: 6 });
  Body.setFrozen(hunt.player.body, true);
  Body.setPosition(hunt.player.body, { x: 200, y: T.groundY - 20 });
  const stage = hunt.marioStage;
  hunt.hammers.push({
    id: 9001,
    broId: prey.id,
    areaId: prey.areaId,
    x: hunt.mario.body.position.x,
    y: hunt.mario.body.position.y,
    vx: 0,
    vy: 0,
    facing: -1,
    age: 0,
    windup: 8,
  });
  step(hunt);
  assert.equal(prey.alive, false);
  assert.equal(hunt.mario.alive, true);
  assert.equal(hunt.marioStage, stage);
  assert.equal(
    hunt.hammers.some((hammer) => hammer.broId === prey.id && hammer.windup > 0),
    false,
  );
  assert.equal(hunt.mario.body.velocity.y, -T.stompBounce);
  assert.equal(hunt.saved, 0);
  assert.equal(hunt.died(), 0);
  assert.equal(hunt.warned, 0);
  assert.equal(landCount(hunt), T.population);
  hunt.physics.clear();
});

test("a hammer or Bro uses hurt rules, including star, lone 8x, and one 8x demotion", () => {
  const killed = start(3, 1);
  const victimBro = broAt(killed, 116);
  assert.ok(victimBro);
  park(killed);
  holdBro(victimBro);
  const npc = killed.npcs[0]!;
  Body.setPosition(npc.body, { ...victimBro.body.position });
  Body.setVelocity(npc.body, { x: 0, y: 0 });
  const diedBefore = killed.died();
  step(killed);
  assert.equal(npc.alive, false);
  assert.equal(killed.died(), diedBefore + 1);
  assert.equal(victimBro.alive, true);
  killed.physics.clear();

  const stage = start(3, 1);
  const stageBro = broAt(stage, 116);
  assert.ok(stageBro);
  park(stage);
  holdBro(stageBro);
  stage.cameraX = stageBro.body.position.x - 400;
  stage.marioActive = true;
  stage.setMarioStage(2);
  stage.mario.areaId = stageBro.areaId;
  stage.marioStun = 0;
  stage.marioLook = 10;
  stage.marioPause = 10;
  stage.marioReaction = 1;
  Body.setFrozen(stage.mario.body, false);
  Body.setPosition(stage.mario.body, { ...stageBro.body.position });
  Body.setVelocity(stage.mario.body, { x: 0, y: 0 });
  Body.setFrozen(stage.player.body, true);
  Body.setPosition(stage.player.body, { x: 240, y: T.groundY - 20 });
  step(stage);
  assert.equal(stage.marioStage, 1);
  assert.equal(stage.mario.alive, true);
  assert.equal(stageBro.alive, true);
  const drops = stage.events.filter((event) => event === "shrink").length;
  step(stage);
  assert.equal(stage.marioStage, 1);
  assert.equal(
    stage.events.filter((event) => event === "shrink").length,
    drops,
  );
  stage.physics.clear();

  const wind = start(3, 1);
  const windBro = broAt(wind, 116);
  assert.ok(windBro);
  park(wind);
  holdBro(windBro);
  wind.cameraX = windBro.body.position.x - 400;
  wind.marioActive = true;
  wind.setMarioStage(2);
  wind.mario.areaId = windBro.areaId;
  wind.marioStun = 0;
  wind.marioLook = 10;
  wind.marioPause = 10;
  Body.setFrozen(wind.mario.body, true);
  Body.setPosition(wind.mario.body, {
    x: windBro.body.position.x + 120,
    y: windBro.body.position.y,
  });
  Body.setVelocity(wind.mario.body, { x: 0, y: 0 });
  Body.setFrozen(wind.player.body, true);
  Body.setPosition(wind.player.body, { x: 240, y: T.groundY - 20 });
  wind.hammers.push({
    id: 9002,
    broId: windBro.id,
    areaId: windBro.areaId,
    x: wind.mario.body.position.x,
    y: wind.mario.body.position.y,
    vx: 0,
    vy: 0,
    facing: -1,
    age: 0,
    windup: 8,
  });
  step(wind);
  assert.equal(wind.marioStage, 2);
  assert.equal(wind.mario.alive, true);
  assert.equal(windBro.alive, true);
  wind.physics.clear();

  const starred = start(3, 1);
  const starBro = broAt(starred, 116);
  assert.ok(starBro);
  park(starred);
  holdBro(starBro);
  give(starred, starred.player, "star");
  Body.setFrozen(starred.player.body, true);
  Body.setPosition(starred.player.body, { ...starBro.body.position });
  step(starred);
  assert.equal(starred.player.alive, true);
  assert.equal(starred.player.scale, 1);
  assert.equal(starred.events.includes("shrink"), false);
  assert.equal(starred.events.includes("splat"), false);
  starred.physics.clear();

  const lone = start(3, 1);
  const loneBro = broAt(lone, 116);
  assert.ok(loneBro);
  park(lone);
  holdBro(loneBro);
  give(lone, lone.player, "mushroom8x");
  assert.equal(lone.mario.scale < T.hugeScale, true);
  Body.setFrozen(lone.player.body, true);
  Body.setPosition(lone.player.body, { ...loneBro.body.position });
  step(lone);
  assert.equal(lone.player.alive, true);
  assert.equal(lone.player.scale, T.hugeScale);
  assert.equal(lone.events.includes("shrink"), false);
  lone.physics.clear();

  const both = start(3, 1);
  const bothBro = broAt(both, 116);
  assert.ok(bothBro);
  park(both);
  holdBro(bothBro);
  both.cameraX = bothBro.body.position.x - 400;
  both.marioActive = true;
  give(both, both.player, "mushroom8x");
  give(both, both.mario, "mushroom8x");
  assert.equal(both.player.scale, T.hugeScale);
  assert.equal(both.mario.scale, T.hugeScale);
  both.mario.areaId = "24";
  Body.setFrozen(both.mario.body, true);
  Body.setPosition(both.mario.body, {
    x: bothBro.body.position.x + 500,
    y: bothBro.body.position.y,
  });
  Body.setFrozen(both.player.body, true);
  Body.setPosition(both.player.body, { ...bothBro.body.position });
  const before = shrinks(both);
  step(both);
  assert.equal(both.player.alive, true);
  assert.equal(both.player.scale, T.giantScale);
  assert.equal(both.mario.scale, T.hugeScale);
  assert.equal(shrinks(both), before + 1);
  step(both);
  assert.equal(both.player.scale, T.giantScale);
  assert.equal(shrinks(both), before + 1);
  both.physics.clear();

  const starredHuge = start(3, 1);
  const hugeBro = broAt(starredHuge, 116);
  assert.ok(hugeBro);
  park(starredHuge);
  holdBro(hugeBro);
  starredHuge.cameraX = hugeBro.body.position.x - 400;
  starredHuge.marioActive = true;
  give(starredHuge, starredHuge.player, "mushroom8x");
  give(starredHuge, starredHuge.mario, "mushroom8x");
  give(starredHuge, starredHuge.player, "star");
  assert.equal(starredHuge.player.scale, T.hugeScale);
  assert.equal(starredHuge.mario.scale, T.hugeScale);
  starredHuge.mario.areaId = "24";
  Body.setFrozen(starredHuge.mario.body, true);
  Body.setPosition(starredHuge.mario.body, {
    x: hugeBro.body.position.x + 500,
    y: hugeBro.body.position.y,
  });
  Body.setFrozen(starredHuge.player.body, true);
  Body.setPosition(starredHuge.player.body, { ...hugeBro.body.position });
  const starShrinks = shrinks(starredHuge);
  step(starredHuge);
  assert.equal(starredHuge.player.alive, true);
  assert.equal(starredHuge.player.scale, T.hugeScale);
  assert.equal(starredHuge.mario.scale, T.hugeScale);
  assert.equal(shrinks(starredHuge), starShrinks);
  starredHuge.physics.clear();
});

test("Hammer Bro and hammer crops are the enemy-sheet frames", () => {
  assert.deepEqual(HAMMER_BRO_SHEET, {
    stand: { x: 120, y: 90, width: 16, height: 24 },
    walk: { x: 150, y: 90, width: 16, height: 24 },
    hammer: { x: 282, y: 86, width: 16, height: 16 },
  });
});
