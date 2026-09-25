import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation, emptyInput, hammerTurn } from "../src/game/simulation.ts";
import type { Actor, HammerBro, ItemKind } from "../src/game/simulation.ts";
import { Body } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import { BOWSER_PHRASES, HAMMER_BRO_PHRASES, TUNING as T } from "../src/game/config.ts";
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
  bro.shoutWait = 300;
  Body.setVelocity(bro.body, { x: 0, y: 0 });
}

function meetMario(s: Simulation, bro: HammerBro, dx = -180, y?: number) {
  s.marioActive = true;
  s.mario.alive = true;
  s.mario.areaId = bro.areaId;
  s.marioStun = 0;
  s.marioLook = 10;
  s.marioPause = 10;
  s.marioChase = 0;
  s.marioReaction = 1;
  s.cameraX = bro.body.position.x - 400;
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, {
    x: bro.body.position.x + dx,
    y: y ?? bro.body.position.y - 40,
  });
  Body.setVelocity(s.mario.body, { x: 0, y: 0 });
  Body.setFrozen(s.player.body, true);
  Body.setPosition(s.player.body, { x: 200, y: T.groundY - 20 });
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

test("an offscreen Hammer Bro stays on his column until Mario arrives", () => {
  const s = start(3, 1);
  const bro = broAt(s, 116);
  assert.ok(bro);
  const x = bro.body.position.x;
  const y = bro.body.position.y;
  park(s);
  Body.setFrozen(s.player.body, true);
  Body.setPosition(s.player.body, { x: x - 180, y: y - 120 });
  step(s, 40);
  assert.ok(Math.abs(bro.body.position.x - x) < 1, "player does not wake a Bro");
  assert.ok(Math.abs(bro.body.position.y - y) < 2, "player does not make him jump");
  s.marioActive = true;
  s.mario.alive = true;
  s.mario.areaId = bro.areaId;
  Body.setFrozen(s.mario.body, true);
  Body.setPosition(s.mario.body, { x: 200, y: T.groundY - 40 });
  step(s, 180);
  assert.equal(bro.alive, true);
  assert.ok(Math.abs(bro.body.position.x - x) < 1, "far Mario does not wake a Bro");
  assert.ok(Math.abs(bro.body.position.y - y) < 2, "far Mario does not make him jump");
  Body.setFrozen(s.mario.body, false);
  Body.setPosition(s.mario.body, { x: x - 180, y: y - 120 });
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

test("a Hammer Bro above the floor wakes when Mario is underneath", () => {
  const s = start(5, 2);
  const bro = broAt(s, 124);
  assert.ok(bro);
  park(s);
  const x = bro.body.position.x;
  const y = bro.body.position.y;
  assert.ok(y < T.groundY - 200, "column 124 is the high Bro");
  Body.setFrozen(s.player.body, true);
  Body.setPosition(s.player.body, { x: x - 80, y: T.groundY - 20 });
  step(s, 40);
  assert.ok(Math.abs(bro.body.position.x - x) < 1, "player underneath does not wake him");
  meetMario(s, bro, -80, T.groundY - 20);
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
  meetMario(s, bro, -180, bro.body.position.y - 120);
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
  still.shoutWait = 300;
  meetMario(arc, still, 180, still.body.position.y - 120);
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

test("a hammer spins a quarter-turn every 2 frames, in the hand and in the air", () => {
  const s = start(3, 1);
  const bro = broAt(s, 116);
  assert.ok(bro);
  park(s);
  bro.jumpTimer = 400;
  bro.walkTimer = 400;
  bro.throwTimer = 0;
  bro.shoutWait = 300;
  meetMario(s, bro, 180, bro.body.position.y - 120);
  step(s);
  const hammer = s.hammers.find((item) => item.broId === bro.id);
  assert.ok(hammer, "hammer in the hand");
  assert.ok(hammer.windup > 0);
  const turns: number[] = [hammerTurn(hammer)];
  let thrown = false;
  for (let frame = 0; frame < 24; frame++) {
    step(s);
    turns.push(hammerTurn(hammer));
    thrown ||= hammer.windup <= 0;
  }
  assert.ok(thrown, "the spin runs on into the throw");
  // Each quarter-turn holds for 2 frames, then the next, through all four.
  const changes = turns.filter((turn, i) => i && turn !== turns[i - 1]);
  assert.ok(changes.length >= 11 && changes.length <= 13, `${changes.length} turns`);
  for (let i = 1; i < turns.length; i++)
    assert.ok(
      turns[i] === turns[i - 1] || turns[i] === (turns[i - 1]! + 1) % 4,
      "quarter-turns in order",
    );
  assert.deepEqual([...new Set(turns)].sort(), [0, 1, 2, 3]);
  s.physics.clear();
});

test("Mario's stomp defeats the Bro, and the player does not stomp or rescue him", () => {
  const s = start(3, 1);
  const bro = broAt(s, 116);
  assert.ok(bro);
  park(s);
  holdBro(bro);
  const warned = s.warned;
  const saved = s.saved;
  const died = s.died();
  Body.setFrozen(s.player.body, false);
  Body.setPosition(s.player.body, {
    x: bro.body.position.x,
    y: bro.body.bounds.min.y - s.player.body.height / 2 - 2,
  });
  Body.setVelocity(s.player.body, { x: 0, y: 6 });
  step(s);
  assert.equal(bro.alive, true);
  assert.equal(s.player.alive, true);
  assert.equal(s.mode, "playing");
  assert.notEqual(s.player.body.velocity.y, -T.stompBounce);
  assert.equal(s.saved, saved);
  assert.equal(s.warned, warned);
  assert.equal(s.died(), died);
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
    spin: 0,
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

test("a hammer or Bro hurts Mario only, and he shouts", () => {
  assert.deepEqual(
    [...HAMMER_BRO_PHRASES],
    [
      "Run! I will hold the plumber here!",
      "Go! My hammers keep Mario back!",
      "Flee! I stand for the Mushroom Kingdom!",
      "Get clear! I will not let Mario pass!",
      "Run, friends! I answer to the king!",
    ],
  );
  for (const line of HAMMER_BRO_PHRASES)
    assert.equal(
      (BOWSER_PHRASES as readonly string[]).includes(line),
      false,
      line,
    );

  const overlap = start(3, 1);
  const overlapBro = broAt(overlap, 116);
  assert.ok(overlapBro);
  park(overlap);
  holdBro(overlapBro);
  overlap.setMarioStage(2);
  meetMario(overlap, overlapBro, 0);
  Body.setPosition(overlap.mario.body, { ...overlapBro.body.position });
  const npc = overlap.npcs[0]!;
  Body.setPosition(npc.body, { ...overlapBro.body.position });
  Body.setVelocity(npc.body, { x: 0, y: 0 });
  Body.setFrozen(overlap.player.body, true);
  Body.setPosition(overlap.player.body, { ...overlapBro.body.position });
  const diedBefore = overlap.died();
  step(overlap);
  assert.equal(overlap.marioStage, 1);
  assert.equal(overlap.mario.alive, true);
  assert.equal(overlap.player.alive, true);
  assert.equal(overlap.player.scale, 1);
  assert.equal(npc.alive, true);
  assert.equal(overlap.died(), diedBefore);
  assert.equal(overlapBro.alive, true);
  const drops = overlap.events.filter((event) => event === "shrink").length;
  step(overlap);
  assert.equal(overlap.marioStage, 1);
  assert.equal(overlap.events.filter((event) => event === "shrink").length, drops);
  assert.equal(overlap.died(), diedBefore);
  overlap.physics.clear();

  const wind = start(3, 1);
  const windBro = broAt(wind, 116);
  assert.ok(windBro);
  park(wind);
  holdBro(windBro);
  wind.setMarioStage(2);
  meetMario(wind, windBro, 0);
  const handX = windBro.body.position.x + 4;
  const handY = windBro.body.bounds.min.y - 8;
  Body.setFrozen(wind.mario.body, true);
  Body.setPosition(wind.mario.body, { x: handX, y: handY - 16 });
  wind.hammers.push({
    id: 9002,
    broId: windBro.id,
    areaId: windBro.areaId,
    x: handX,
    y: handY - 16,
    vx: 0,
    vy: 0,
    facing: -1,
    age: 0,
    windup: 8,
    spin: 0,
  });
  step(wind);
  assert.equal(wind.marioStage, 2, "a hammer still in the hand does not hit");
  const thrown = wind.hammers[0]!;
  thrown.windup = 0;
  thrown.vx = 0;
  thrown.vy = 0;
  thrown.x = wind.mario.body.position.x;
  thrown.y = wind.mario.body.position.y;
  step(wind);
  assert.equal(wind.marioStage, 1, "a thrown hammer drops one Mario stage");
  assert.equal(wind.player.alive, true);
  assert.equal(wind.died(), 0);
  wind.physics.clear();

  const starred = start(3, 1);
  const starBro = broAt(starred, 116);
  assert.ok(starBro);
  park(starred);
  holdBro(starBro);
  starred.setMarioStage(2);
  give(starred, starred.mario, "star");
  meetMario(starred, starBro, 0);
  Body.setPosition(starred.mario.body, { ...starBro.body.position });
  const starStage = starred.marioStage;
  step(starred);
  assert.equal(starred.mario.alive, true);
  assert.equal(starred.marioStage, starStage);
  assert.equal(starred.events.includes("shrink"), false);
  starred.physics.clear();

  const lone = start(3, 1);
  const loneBro = broAt(lone, 116);
  assert.ok(loneBro);
  park(lone);
  holdBro(loneBro);
  give(lone, lone.mario, "mushroom8x");
  assert.equal(lone.player.scale < T.hugeScale, true);
  assert.equal(lone.mario.scale, T.hugeScale);
  meetMario(lone, loneBro, 0);
  Body.setPosition(lone.mario.body, { ...loneBro.body.position });
  step(lone);
  assert.equal(lone.mario.alive, true);
  assert.equal(lone.mario.scale, T.hugeScale);
  assert.equal(lone.player.alive, true);
  assert.equal(lone.events.includes("shrink"), false);
  lone.physics.clear();

  const both = start(3, 1);
  const bothBro = broAt(both, 116);
  assert.ok(bothBro);
  park(both);
  holdBro(bothBro);
  give(both, both.player, "mushroom8x");
  give(both, both.mario, "mushroom8x");
  assert.equal(both.player.scale, T.hugeScale);
  assert.equal(both.mario.scale, T.hugeScale);
  meetMario(both, bothBro, 0);
  Body.setFrozen(both.mario.body, true);
  Body.setPosition(both.mario.body, { ...bothBro.body.position });
  Body.setFrozen(both.player.body, true);
  Body.setPosition(both.player.body, { x: 240, y: T.groundY - 20 });
  const before = shrinks(both);
  step(both);
  assert.equal(both.player.alive, true);
  assert.equal(both.player.scale, T.hugeScale);
  assert.equal(both.mario.alive, true);
  assert.equal(both.mario.scale, 1);
  assert.equal(shrinks(both), before + 1);
  both.marioStun = 0;
  Body.setPosition(both.mario.body, { ...bothBro.body.position });
  step(both);
  assert.equal(both.mario.scale, 1);
  assert.equal(both.player.scale, T.hugeScale);
  assert.equal(shrinks(both), before + 1);
  both.physics.clear();
});

// #221: a Bro shouts when the player or a rescue NPC passes, not Mario.
test("a Bro shouts his lines in order when the player or an NPC passes", () => {
  const s = start(3, 1);
  const bro = broAt(s, 116);
  assert.ok(bro);
  for (const n of s.npcs) s.physics.remove(n.body);
  s.npcs = [];
  const x = bro.body.position.x;
  // 3-1's other Bro stands close by, so keep to this one's bubbles.
  const lines = () =>
    s.shouts.filter(
      (shout) =>
        (HAMMER_BRO_PHRASES as readonly string[]).includes(shout.text) &&
        Math.abs(shout.x - x) < 2,
    );
  // Mario alone close by does not start it.
  meetMario(s, bro, -120);
  s.marioActive = false;
  bro.shoutWait = 0;
  step(s, 5);
  assert.equal(lines().length, 0, "nobody passing");
  // The player within bowserShoutRange does, from above the Bro, with the
  // warn event, and without the rescue random stream.
  Body.setPosition(s.player.body, {
    x: x - T.bowserShoutRange + 20,
    y: bro.body.position.y,
  });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  let calls = 0;
  const random = s.random;
  s.random = () => {
    calls++;
    return random();
  };
  const events = s.events.length;
  step(s);
  s.random = random;
  assert.equal(calls, 0);
  assert.equal(lines().length, 1);
  const first = lines()[0]!;
  assert.ok(Math.abs(first.x - x) < 2);
  assert.ok(first.y < bro.body.bounds.min.y);
  assert.ok(s.events.slice(events).includes("warn"));
  // The next lines follow the pool in order, one per cooldown, each with its
  // own bubble time.
  const said = [first.text];
  for (let i = 0; i < 4; i++) {
    for (let f = 0; f < 60 * T.bowserShoutCooldown + 2; f++) {
      Body.setPosition(s.player.body, {
        x: x - T.bowserShoutRange + 20,
        y: bro.body.position.y,
      });
      Body.setVelocity(s.player.body, { x: 0, y: 0 });
      step(s);
    }
    said.push(lines().at(-1)!.text);
  }
  const at = HAMMER_BRO_PHRASES.indexOf(first.text as never);
  assert.deepEqual(
    said,
    [0, 1, 2, 3, 4].map((i) => HAMMER_BRO_PHRASES[(at + i) % 5]),
  );
  s.physics.clear();

  // A living rescue NPC passing starts it too. A dead Bro never shouts.
  const t = start(3, 1);
  const other = broAt(t, 116)!;
  const walker = t.npcs[0]!;
  for (const n of t.npcs.slice(1)) t.physics.remove(n.body);
  t.npcs = [walker];
  Body.setPosition(walker.body, {
    x: other.body.position.x - 100,
    y: other.body.position.y,
  });
  Body.setVelocity(walker.body, { x: 0, y: 0 });
  other.shoutWait = 0;
  step(t);
  assert.ok(
    t.shouts.some((shout) =>
      (HAMMER_BRO_PHRASES as readonly string[]).includes(shout.text),
    ),
  );
  t.shouts = [];
  other.alive = false;
  other.shoutWait = 0;
  step(t, 10);
  assert.equal(t.shouts.length, 0);
  t.physics.clear();
});

test("Hammer Bro and hammer crops are the enemy-sheet frames", () => {
  assert.deepEqual(HAMMER_BRO_SHEET, {
    stand: { x: 120, y: 90, width: 16, height: 24 },
    walk: { x: 150, y: 90, width: 16, height: 24 },
    hammer: { x: 282, y: 86, width: 16, height: 16 },
  });
});
