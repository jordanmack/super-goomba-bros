import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLANT_RISE,
  PLANT_WAIT,
  initPlant,
  plantResting,
  plantShown,
  stepPlant,
} from "../src/game/piranha.ts";

test("a Piranha Plant rises 24px at 1px every other frame and waits $40 at each end", () => {
  const m = initPlant();
  assert.equal(plantResting(m), true);
  const rises: number[] = [];
  for (let frame = 1; frame <= 600; frame++) {
    stepPlant(m, frame, false);
    rises.push(m.rise);
  }
  // Up over 48 frames, $40 at the top, down over 48, $40 at the bottom.
  const top = rises.indexOf(PLANT_RISE);
  assert.ok(top >= 46 && top <= 48, `top at ${top}`);
  const leaves = rises.findIndex((r, i) => i > top && r < PLANT_RISE);
  // The wait ends, then the move waits for the next odd frame.
  assert.ok(leaves - top >= PLANT_WAIT && leaves - top <= PLANT_WAIT + 1);
  const bottom = rises.findIndex((r, i) => i > leaves && r === 0);
  assert.ok(bottom - leaves >= 46 && bottom - leaves <= 48);
  const again = rises.findIndex((r, i) => i > bottom && r > 0);
  assert.ok(again - bottom >= PLANT_WAIT && again - bottom <= PLANT_WAIT + 1);
  for (let i = 1; i < rises.length; i++)
    assert.ok(Math.abs(rises[i]! - rises[i - 1]!) <= 1);
});

test("someone near holds a plant down only at the bottom", () => {
  const m = initPlant();
  for (let frame = 1; frame <= 300; frame++) stepPlant(m, frame, true);
  assert.equal(m.rise, 0, "never comes out");
  assert.equal(plantResting(m), true);
  // Out of the pipe, it still goes back down with someone near.
  const out = initPlant();
  let frame = 1;
  while (out.rise < PLANT_RISE) stepPlant(out, frame++, false);
  for (let i = 0; i < 200; i++) stepPlant(out, frame++, true);
  assert.equal(out.rise, 0);
  assert.equal(plantResting(out), true);
});

test("a plant is not drawn while it waits at the bottom", () => {
  const m = initPlant();
  let frame = 1;
  while (m.rise < PLANT_RISE) stepPlant(m, frame++, false);
  assert.equal(plantShown(m), true, "waiting at the top");
  while (m.rise > 0) stepPlant(m, frame++, false);
  assert.equal(plantShown(m), false, "waiting at the bottom");
  while (m.timer > 0) stepPlant(m, frame++, false);
  assert.equal(plantShown(m), true, "rising again");
});
