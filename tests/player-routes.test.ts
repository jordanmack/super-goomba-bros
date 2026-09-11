import { test } from "node:test";
import assert from "node:assert/strict";
import routes from "./fixtures/player-routes.json" with { type: "json" };
import { Simulation, emptyInput } from "../src/game/simulation.ts";
import { CAMPAIGN } from "../src/game/levels.ts";
import { TUNING as T } from "../src/game/config.ts";
import { physics } from "./support/arcade.ts";

// These runs prove movement with ordinary controls. Separate campaign tests
// prove NPC rescues; the quota is satisfied here to isolate player traversal.
for (const [index, level] of CAMPAIGN.entries()) test(`player input replay reaches World ${level.id}'s castle door`, () => {
  const sim = new Simulation(() => 0.5, physics());
  sim.levelIndex = index; sim.reset(); sim.marioReturn = 1e6;
  for (const npc of sim.npcs) sim.physics.remove(npc.body);
  sim.npcs = []; sim.saved = T.required;
  const route = routes[level.id as keyof typeof routes];
  assert.ok(route, "a recorded route exists for this stage");
  for (const [bits, frames] of route) for (let frame = 0; frame < frames; frame++) {
    sim.step(1 / 60, { ...emptyInput(), left: !!(bits & 1), right: !!(bits & 2), jump: !!(bits & 4), down: !!(bits & 8) });
    // Movement must work without a lucky power-up.
    for (const item of sim.items) sim.physics.remove(item.body);
    sim.items = [];
    assert.notEqual(sim.mode, "dead", `${level.id}: the player survives the route`);
  }
  assert.ok(sim.mode === "finishing" || sim.mode === "won", `${level.id}: reached the door`);
  assert.ok(sim.activeRoom.atDoor(sim.player));
  sim.physics.clear();
});
