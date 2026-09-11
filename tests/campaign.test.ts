import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation, emptyInput } from "../src/game/simulation.ts";
import { Body, overlaps } from "../src/game/physics.ts";
import { CAMPAIGN } from "../src/game/levels.ts";
import { physics } from "./support/arcade.ts";
import { TUNING as T } from "../src/game/config.ts";
import { MAP_TOP } from "../src/game/config.ts";

for (const [index, level] of CAMPAIGN.entries()) {
  test(`World ${level.id} loads and its NPC can reach a rescue door`, () => {
    const sim = new Simulation(() => 0.5, physics());
    sim.levelIndex = index;
    sim.reset();
    sim.marioReturn = 1e6;
    assert.equal(sim.npcs.length, 30);
    for (const actor of [sim.player, ...sim.npcs])
      assert.equal(
        overlaps(actor.body, sim.solids, 0.1).length,
        0,
        "safe starting position",
      );
    const runner = sim.npcs[0];
    for (const npc of sim.npcs.slice(1)) sim.physics.remove(npc.body);
    sim.npcs = [runner];
    sim.player.saved = true;
    Body.setFrozen(sim.player.body, true);
    runner.warned = true;
    runner.state = "run";
    runner.wait = 0;
    let lastX = runner.body.position.x,
      stalled = 0;
    for (
      let frame = 0;
      frame < 60 * 240 && runner.alive && !runner.saved && stalled < 60 * 15;
      frame++
    ) {
      sim.step(1 / 60, emptyInput());
      if (Math.abs(runner.body.position.x - lastX) > 8) {
        lastX = runner.body.position.x;
        stalled = 0;
      } else stalled++;
    }
    assert.ok(
      runner.saved,
      JSON.stringify({
        level: level.id,
        area: runner.areaId,
        position: runner.body.position,
        alive: runner.alive,
        elapsed: sim.elapsed,
        detour: runner.navDetourBelow,
        backoff: runner.navBackoff,
        velocity: runner.body.velocity,
      }),
    );
    sim.physics.clear();
  });
}

test("every campaign stage can meet its rescue quota from the full starting population", () => {
  const failures: object[] = [];
  for (let index = 0; index < CAMPAIGN.length; index++) {
    const sim = new Simulation(() => 0.37, physics());
    sim.levelIndex = index;
    sim.reset();
    sim.marioReturn = 1e6;
    sim.player.saved = true;
    Body.setFrozen(sim.player.body, true);
    for (const npc of sim.npcs) {
      npc.warned = true;
      npc.state = "run";
      npc.wait = npc.reaction;
    }
    for (
      let frame = 0;
      frame < 60 * 180 &&
      sim.saved < T.required &&
      sim.saved + sim.living() >= T.required;
      frame++
    )
      sim.step(1 / 60, emptyInput());
    if (sim.saved < T.required)
      failures.push({
        level: sim.level.id,
        saved: sim.saved,
        living: sim.living(),
      });
    sim.physics.clear();
  }
  assert.deepEqual(failures, []);
});

test("bonus pipe travel preserves rescues, powers, and NPC progress without finishing early", () => {
  const sim = new Simulation(() => 0.5, physics()); sim.reset(); sim.marioReturn = 1e6;
  const runner = sim.npcs[0]; runner.warned = true; runner.state = "run"; runner.wait = 0;
  sim.warned = 13; sim.saved = T.required;
  sim.player.flower = true;
  const entry = sim.activeRoom.data.pipes.find(pipe => pipe.direction === "down")!;
  Body.setPosition(sim.player.body, { x: (entry.column + entry.width / 2) * 32, y: MAP_TOP + entry.row * 32 - 14 });
  sim.step(1 / 60, { ...emptyInput(), down: true });
  assert.equal(sim.activeRoom.data.id, "42");
  assert.ok(sim.player.body.position.x >= sim.activeRoom.offset);
  assert.equal(sim.mode, "playing");
  assert.equal(sim.saved, T.required); assert.equal(sim.warned, 13); assert.ok(sim.player.flower);
  const before = runner.body.position.x;
  for (let i = 0; i < 90; i++) sim.step(1 / 60, emptyInput());
  assert.ok(runner.body.position.x > before + 40, "NPCs keep moving in the old area");
  const exit = sim.activeRoom.data.pipes[0];
  Body.setPosition(sim.player.body, { x: sim.activeRoom.offset + exit.column * 32 - 12, y: MAP_TOP + exit.row * 32 + 32 });
  sim.step(1 / 60, { ...emptyInput(), right: true });
  assert.equal(sim.activeRoom.data.id, "25");
  assert.equal(sim.mode, "playing"); assert.equal(sim.saved, T.required);
  assert.ok(sim.player.flower); assert.equal(sim.rooms.size, 2);
});

test("hidden blocks allow a fall through, then reveal and support the player after a head hit", () => {
  const sim = new Simulation(() => 0.5, physics()); sim.reset(); sim.marioReturn = 1e6;
  const block = sim.covers.find(c => c.hidden)!;
  Body.setPosition(sim.player.body, { x: block.x, y: block.y - 65 });
  for (let i = 0; i < 60; i++) sim.step(1 / 60, emptyInput());
  assert.ok(sim.player.body.bounds.min.y > block.body!.bounds.max.y);
  Body.setPosition(sim.player.body, { x: block.x, y: block.y + 32 });
  Body.setVelocity(sim.player.body, { x: 0, y: -5 });
  sim.step(1 / 60, emptyInput());
  assert.ok(block.used); assert.equal(block.body!.headOnly, false);
  for (const item of sim.items) sim.physics.remove(item.body); sim.items = [];
  Body.setPosition(sim.player.body, { x: block.x, y: block.y - 65 });
  Body.setVelocity(sim.player.body, { x: 0, y: 0 });
  for (let i = 0; i < 60; i++) sim.step(1 / 60, emptyInput());
  assert.ok(Math.abs(sim.player.body.bounds.max.y - block.body!.bounds.min.y) < 0.1);
});

test("the player can cross World 4-3's eight-tile gap at the normal jump height", () => {
  const sim = new Simulation(() => 0.5, physics());
  sim.levelIndex = CAMPAIGN.findIndex(level => level.id === "4-3"); sim.reset(); sim.marioReturn = 1e6;
  Body.setPosition(sim.player.body, { x: 768, y: MAP_TOP + 5 * 32 - 14 });
  sim.step(1 / 60, { ...emptyInput(), right: true, jump: true });
  let highest = sim.player.body.position.y;
  for (let frame = 0; frame < 54; frame++) {
    sim.step(1 / 60, { ...emptyInput(), right: true }); highest = Math.min(highest, sim.player.body.position.y);
  }
  assert.ok(sim.player.alive && sim.player.body.position.x >= 1024);
  assert.ok(Math.abs(sim.player.body.bounds.max.y - (MAP_TOP + 4 * 32)) < 0.1);
  assert.ok(MAP_TOP + 5 * 32 - 14 - highest < 150);
});
