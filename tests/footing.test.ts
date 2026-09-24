import { test } from "node:test";
import assert from "node:assert/strict";
import { Body, footingWidth, overlaps } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import { TUNING as T } from "../src/game/config.ts";
import {
  Simulation as RulesSimulation,
  emptyInput,
} from "../src/game/simulation.ts";
import type { ItemKind, Actor } from "../src/game/simulation.ts";
import type { PhysicsWorld } from "../src/game/physics.ts";

class Simulation extends RulesSimulation {
  constructor() {
    super(() => 0.5, physics());
  }
}

const dt = 1 / 60;
const TILE = 32;

function give(s: Simulation, actor: Actor, kind: ItemKind) {
  const box = s.obstacles.find(
    (c) => c.question && !c.used && !c.hidden && c.content !== "1-up",
  )!;
  s.hitBlock(box, s.player);
  const item = s.items.at(-1)!;
  item.kind = kind;
  s.collect(actor, item);
}

// Drop a body from above a gap. The body is not already inside the hole.
// Returns whether the stepped body fell past the lip or stayed on it.
function drop(
  width: number,
  height: number,
  gap: number,
  ignoreWalls = false,
  body?: Body,
  world?: PhysicsWorld,
  slot = 0,
) {
  const sim = world ?? physics();
  const floorY = body ? -2400 : 280;
  const cx = (body ? -4000 : 400) + slot * 800;
  const floorH = 180;
  const side = 220;
  const gapLeft = cx - gap / 2;
  const left = sim.rectangle(
    gapLeft - side / 2,
    floorY + floorH / 2,
    side,
    floorH,
    true,
  );
  const right = sim.rectangle(
    cx + gap / 2 + side / 2,
    floorY + floorH / 2,
    side,
    floorH,
    true,
  );
  const actor =
    body ?? sim.rectangle(cx, floorY - 48 - height / 2, width, height);
  if (body) Body.setPosition(actor, { x: cx, y: floorY - 48 - height / 2 });
  if (ignoreWalls) actor.ignoreWalls = true;
  Body.setVelocity(actor, { x: 0, y: 0 });
  assert.ok(
    actor.bounds.max.y < floorY - 1,
    `feet start inside the gap: ${actor.bounds.max.y} floor ${floorY}`,
  );
  assert.equal(overlaps(actor, [left, right]).length, 0);
  let fell = false;
  let held = false;
  for (let i = 0; i < 180; i++) {
    sim.step(dt);
    const feet = actor.bounds.max.y;
    if (feet > floorY + TILE) {
      fell = true;
      break;
    }
    if (i > 30 && Math.abs(feet - floorY) < 2 && Math.abs(actor.velocity.y) < 1) {
      held = true;
      break;
    }
  }
  return { sim, actor, floorY, fell, held };
}

test("a 3x body falls through a two-tile gap and a one-tile gap holds it", () => {
  const width = 24 * T.giantScale;
  const height = 28 * T.giantScale;
  assert.equal(width, 72);
  assert.ok(footingWidth(width) < width);
  assert.ok(footingWidth(width) < TILE * 2);
  assert.ok(footingWidth(width) > TILE);

  const through = drop(width, height, TILE * 2);
  assert.equal(through.actor.width, 72);
  assert.equal(through.fell, true, `feet ${through.actor.bounds.max.y}`);
  assert.equal(through.held, false);
  through.sim.clear();

  const held = drop(width, height, TILE);
  assert.equal(held.actor.width, 72);
  assert.equal(held.fell, false, `feet ${held.actor.bounds.max.y}`);
  assert.equal(held.held, true);
  held.sim.clear();
});

test("a walking 3x body does not bridge a two-tile gap", () => {
  const width = 24 * T.giantScale;
  const height = 28 * T.giantScale;
  const world = physics();
  const floorY = 300;
  const gap = TILE * 2;
  const left = world.rectangle(200, floorY + 80, 400, 160, true);
  const right = world.rectangle(
    left.bounds.max.x + gap + 200,
    floorY + 80,
    400,
    160,
    true,
  );
  assert.equal(right.bounds.min.x - left.bounds.max.x, gap);
  const body = world.rectangle(
    left.bounds.max.x - width / 2 - 4,
    floorY - height / 2,
    width,
    height,
  );
  assert.equal(overlaps(body, [left]).length, 0);
  Body.setVelocity(body, { x: T.runSpeed, y: 0 });
  let fell = false;
  let bridged = false;
  for (let i = 0; i < 180; i++) {
    world.step(dt);
    Body.setVelocity(body, { x: T.runSpeed, y: body.velocity.y });
    if (body.bounds.max.y > floorY + TILE) {
      fell = true;
      break;
    }
    if (
      body.position.x > right.bounds.min.x &&
      Math.abs(body.bounds.max.y - floorY) < 3
    ) {
      bridged = true;
      break;
    }
  }
  assert.equal(fell, true, `feet ${body.bounds.max.y} x ${body.position.x}`);
  assert.equal(bridged, false);
  assert.equal(body.width, 72);
  world.clear();
});

test("3x wall, ceiling, and overlap stay the full 72 width", () => {
  const width = 24 * T.giantScale;
  const height = 28 * T.giantScale;
  const world = physics();
  const floorY = 400;
  const wallLeft = 520;
  const floor = world.rectangle(360, floorY + 40, 400, 80, true);
  const wall = world.rectangle(wallLeft + 16, floorY - 80, 32, 160, true);
  const body = world.rectangle(
    wallLeft - width / 2 - 12,
    floorY - height / 2,
    width,
    height,
  );
  assert.equal(overlaps(body, [wall, floor]).length, 0);
  assert.ok(body.bounds.max.x < wall.bounds.min.x);
  Body.setVelocity(body, { x: T.walkSpeed, y: 0 });
  for (let i = 0; i < 40; i++) world.step(dt);
  assert.equal(body.width, 72);
  assert.ok(
    Math.abs(body.bounds.max.x - wall.bounds.min.x) <= 1,
    `wall gap ${wall.bounds.min.x - body.bounds.max.x}`,
  );
  assert.ok(body.bounds.max.x <= wall.bounds.min.x + 0.2);

  const shoulder = new Body(
    body.bounds.max.x - 2,
    body.position.y,
    4,
    10,
    true,
  );
  const outside = new Body(body.bounds.max.x + 8, body.position.y, 4, 10, true);
  assert.equal(overlaps(body, [shoulder]).length, 1);
  assert.equal(overlaps(body, [outside]).length, 0);
  const foot = footingWidth(body.width);
  const footMax = body.position.x + foot / 2;
  assert.ok(shoulder.bounds.min.x >= footMax);

  const ceilWorld = physics();
  const jumper = ceilWorld.rectangle(400, 320, width, height);
  const ceilBottom = jumper.bounds.min.y - 16;
  const slab = ceilWorld.rectangle(
    jumper.bounds.max.x - 2,
    ceilBottom - 16,
    4,
    32,
    true,
  );
  assert.ok(slab.bounds.min.x > jumper.position.x + foot / 2);
  assert.ok(slab.bounds.max.x <= jumper.bounds.max.x + 0.01);
  assert.equal(overlaps(jumper, [slab]).length, 0);
  Body.setVelocity(jumper, { x: 0, y: -6 });
  let bonked = false;
  for (let i = 0; i < 30; i++) {
    ceilWorld.step(dt);
    if (jumper.bounds.min.y <= slab.bounds.max.y + 1) {
      bonked = true;
      break;
    }
  }
  assert.equal(jumper.width, 72);
  assert.equal(bonked, true);
  assert.ok(
    jumper.bounds.min.y >= slab.bounds.max.y - 1,
    `head ${jumper.bounds.min.y} ceil ${slab.bounds.max.y}`,
  );
  world.clear();
  ceilWorld.clear();
});

test("1x, 2x, and 8x still stand on their full width", () => {
  for (const scale of [1, T.mushroomScale, T.hugeScale]) {
    const width = 24 * scale;
    const height = 28 * scale;
    assert.equal(footingWidth(width), width);
    const holds = drop(width, height, width - 8, scale === T.hugeScale);
    assert.equal(holds.fell, false, `scale ${scale} feet ${holds.actor.bounds.max.y}`);
    assert.equal(holds.held, true, `scale ${scale} was not held`);
    holds.sim.clear();
    const drops = drop(width, height, width + 8, scale === T.hugeScale);
    assert.equal(drops.fell, true, `scale ${scale} feet ${drops.actor.bounds.max.y}`);
    assert.equal(drops.held, false);
    drops.sim.clear();
  }
});

test("a 3x body stays on a rising lift", () => {
  const s = new Simulation();
  s.reset();
  give(s, s.player, "mushroom3x");
  assert.equal(s.player.body.width, 72);
  const room = s.activeRoom;
  const origin = { x: room.offset + 180, y: 120 };
  const pad = s.physics.rectangle(origin.x, origin.y, 96, 16, true);
  room.platforms.push({
    body: pad,
    origin: { ...origin },
    kind: 37,
    phase: Math.PI,
  });
  room.solids.push(pad);
  s.solids.push(pad);
  const stand = () =>
    Body.setPosition(s.player.body, {
      x: origin.x,
      y: pad.bounds.min.y - s.player.body.height / 2,
    });
  stand();
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  let rose = false;
  const startTop = pad.bounds.min.y;
  for (let i = 0; i < 40; i++) {
    s.step(dt, emptyInput());
    const feet = s.player.body.bounds.max.y;
    const top = pad.bounds.min.y;
    assert.ok(
      Math.abs(feet - top) < 3,
      `left the rising lift at ${i}: feet ${feet} top ${top}`,
    );
    if (top < startTop - 4) rose = true;
  }
  assert.equal(rose, true);

  stand();
  Body.setPosition(s.player.body, {
    x: origin.x,
    y: pad.bounds.min.y - s.player.body.height / 2 - 50,
  });
  Body.setVelocity(s.player.body, { x: 0, y: 0 });
  let landed = false;
  for (let i = 0; i < 120; i++) {
    s.step(dt, emptyInput());
    const feet = s.player.body.bounds.max.y;
    const top = pad.bounds.min.y;
    if (feet > top + 24) break;
    if (Math.abs(feet - top) < 3 && Math.abs(s.player.body.velocity.y) < 1) {
      landed = true;
      break;
    }
  }
  assert.equal(landed, true, `did not land on the rising lift`);
  for (let i = 0; i < 20; i++) {
    s.step(dt, emptyInput());
    assert.ok(
      Math.abs(s.player.body.bounds.max.y - pad.bounds.min.y) < 3,
      `fell after landing: feet ${s.player.body.bounds.max.y} top ${pad.bounds.min.y}`,
    );
  }
  s.physics.clear();
});

test("a 3x NPC uses the same footing and falls through a two-tile gap", () => {
  const s = new Simulation();
  s.reset();
  const npc = s.npcs[0]!;
  give(s, npc, "mushroom3x");
  assert.equal(npc.scale, T.giantScale);
  assert.equal(npc.body.width, 72);
  assert.equal(footingWidth(npc.body.width), T.giantFooting);
  assert.equal(footingWidth(s.player.body.width), s.player.body.width);

  const through = drop(
    npc.body.width,
    npc.body.height,
    TILE * 2,
    false,
    npc.body,
    s.physics,
  );
  assert.equal(through.fell, true, `npc feet ${npc.body.bounds.max.y}`);
  assert.equal(npc.body.width, 72);
  const held = drop(
    npc.body.width,
    npc.body.height,
    TILE,
    false,
    npc.body,
    s.physics,
    1,
  );
  assert.equal(held.held, true, `npc feet ${npc.body.bounds.max.y}`);
  assert.equal(held.fell, false);
  assert.equal(npc.body.width, 72);
  s.physics.clear();
});
