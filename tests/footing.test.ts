import { test } from "node:test";
import assert from "node:assert/strict";
import { Body, overlaps } from "../src/game/physics.ts";
import { physics } from "./support/arcade.ts";
import { TUNING as T } from "../src/game/config.ts";
import {
  Simulation as RulesSimulation,
  actorSpriteBox,
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

// #209: 3x keeps a 72x84 sprite-sized hurt box but collides as a 2x body.
const SOLID_3X = { w: 24 * T.mushroomScale, h: 28 * T.mushroomScale };

test("a 3x body has a 2x solid shape and a 3x hurt box", () => {
  const s = new Simulation();
  s.reset();
  give(s, s.player, "mushroom3x");
  assert.equal(s.player.scale, T.giantScale);
  assert.equal(s.player.body.width, SOLID_3X.w);
  assert.equal(s.player.body.height, SOLID_3X.h);
  const box = s.hurtBox(s.player);
  assert.equal(box.halfW * 2, 24 * T.giantScale);
  assert.equal(box.halfH * 2, 28 * T.giantScale);
  assert.equal(box.x, s.player.body.position.x);
  assert.equal(box.y + box.halfH, s.player.body.bounds.max.y);
  const sprite = actorSpriteBox(s.player, s.player.scale);
  assert.deepEqual(sprite, { w: 32 * T.giantScale, h: 32 * T.giantScale });
  s.physics.clear();
});

test("a 3x body falls through a two-tile hole and a one-tile gap holds it", () => {
  const through = drop(SOLID_3X.w, SOLID_3X.h, TILE * 2);
  assert.equal(through.fell, true, `feet ${through.actor.bounds.max.y}`);
  assert.equal(through.held, false);
  through.sim.clear();

  const held = drop(SOLID_3X.w, SOLID_3X.h, TILE);
  assert.equal(held.fell, false, `feet ${held.actor.bounds.max.y}`);
  assert.equal(held.held, true);
  held.sim.clear();
});

test("a 3x body jumps back up through a two-tile hole and walks under a 2x opening", () => {
  const { w: width, h: height } = SOLID_3X;
  // A two-tile hole in a ceiling slab directly above the body.
  const up = physics();
  const ceilBottom = 200;
  const hole = TILE * 2;
  const cx = 400;
  up.rectangle(cx - hole / 2 - 100, ceilBottom - 16, 200, 32, true);
  up.rectangle(cx + hole / 2 + 100, ceilBottom - 16, 200, 32, true);
  const jumper = up.rectangle(cx, ceilBottom + 40 + height / 2, width, height);
  Body.setVelocity(jumper, { x: 0, y: -14 });
  let through = false;
  for (let i = 0; i < 40; i++) {
    up.step(dt);
    if (jumper.bounds.max.y < ceilBottom - 32) {
      through = true;
      break;
    }
  }
  assert.equal(through, true, `head ${jumper.bounds.min.y}`);
  up.clear();

  // An opening 2 px taller than a 2x body. The old 84px 3x body is blocked.
  const low = physics();
  const floorY = 400;
  low.rectangle(400, floorY + 40, 800, 80, true);
  const opening = height + 2;
  const lintel = low.rectangle(
    500,
    floorY - opening - 40,
    200,
    80,
    true,
  );
  const walker = low.rectangle(300, floorY - height / 2, width, height);
  for (let i = 0; i < 150; i++) {
    Body.setVelocity(walker, { x: T.walkSpeed, y: walker.velocity.y });
    low.step(dt);
  }
  assert.ok(
    walker.bounds.min.x > lintel.bounds.max.x,
    `stopped at ${walker.position.x}`,
  );
  assert.ok(Math.abs(walker.bounds.max.y - floorY) < 1);
  low.clear();
});

test("a hit on the outer 3x hurt box still counts", () => {
  const s = new Simulation();
  s.reset();
  s.marioReturn = 1e6;
  give(s, s.player, "mushroom3x");
  const p = s.player.body;
  // Beside the 2x solid shape, inside the 3x hurt box.
  const x = p.position.x + p.width / 2 + 8;
  assert.ok(x - p.position.x < s.hurtBox(s.player).halfW);
  s.fireballs = [
    { id: 9401, x, y: p.bounds.max.y - 70, vx: 0, vy: 0, age: 0, owner: "mario" },
  ];
  s.step(dt, emptyInput());
  assert.ok(s.player.scale < T.giantScale, "the 3x player took the hit");
  s.physics.clear();
});

test("1x, 2x, and 8x still stand on their full width", () => {
  for (const scale of [1, T.mushroomScale, T.hugeScale]) {
    const width = 24 * scale;
    const height = 28 * scale;
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
  assert.equal(s.player.body.width, SOLID_3X.w);
  const room = s.activeRoom;
  // A type-38 lift rises at 15/16 NES px/frame. Start low so it cannot wrap.
  const origin = { x: room.offset + 180, y: 400 };
  const pad = s.physics.rectangle(origin.x, origin.y, 96, 16, true);
  room.platforms.push({
    body: pad,
    origin: { ...origin },
    kind: 38,
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

test("a 3x NPC uses the same solid shape and hurt box and falls through a two-tile hole", () => {
  const s = new Simulation();
  s.reset();
  const npc = s.npcs[0]!;
  give(s, npc, "mushroom3x");
  assert.equal(npc.scale, T.giantScale);
  assert.equal(npc.body.width, SOLID_3X.w);
  assert.equal(npc.body.height, SOLID_3X.h);
  assert.equal(s.hurtBox(npc).halfW * 2, 24 * T.giantScale);
  assert.equal(s.hurtBox(npc).halfH * 2, 28 * T.giantScale);

  const through = drop(
    npc.body.width,
    npc.body.height,
    TILE * 2,
    false,
    npc.body,
    s.physics,
  );
  assert.equal(through.fell, true, `npc feet ${npc.body.bounds.max.y}`);
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
  s.physics.clear();
});
