import { test } from "node:test";
import assert from "node:assert/strict";
import routes from "./fixtures/player-routes.json" with { type: "json" };
import { Simulation, emptyInput } from "../src/game/simulation.ts";
import { CAMPAIGN } from "../src/game/levels.ts";
import { physics } from "./support/arcade.ts";

// These runs prove movement with ordinary controls. Separate campaign tests
// prove NPC rescues; this isolates player traversal.

// A bullet this close shares the player's screen space, so the route had to
// weave around it rather than outrun the cannon.
const NEAR_BILL = 72;

for (const [index, level] of CAMPAIGN.entries())
  test(
    `player input replay reaches World ${level.id}'s castle door`,
    () => {
      const sim = new Simulation(() => 0.5, physics());
      sim.levelIndex = index;
      sim.reset();
      sim.marioReturn = 1e6;
      sim.timeLeft = 9999;
      for (const npc of sim.npcs) sim.physics.remove(npc.body);
      sim.npcs = [];
      sim.timeLeft = 9999;
      for (let frame = 0; frame < 60 * 20 && sim.pipeIntro; frame++)
        sim.step(1 / 60, emptyInput());
      assert.equal(sim.pipeIntro, false);
      assert.equal(sim.player.areaId, sim.level.main);
      sim.timeLeft = 9999;
      const hasCannons = [...sim.rooms.values()].some(
        (room) => room.data.type !== "water" && room.cannons.length > 0,
      );
      const route = routes[level.id as keyof typeof routes];
      assert.ok(route, "a recorded route exists for this stage");
      let billFrames = 0;
      let nearBillFrames = 0;
      for (const [bits, frames] of route)
        for (let frame = 0; frame < frames; frame++) {
          sim.step(1 / 60, {
            ...emptyInput(),
            left: !!(bits & 1),
            right: !!(bits & 2),
            jump: !!(bits & 4),
            down: !!(bits & 8),
            run: !!(bits & 16),
          });
          // Movement must work without a lucky power-up. Bullet Bills stay
          // live so the route is dodged, not cleared.
          for (const item of sim.items) sim.physics.remove(item.body);
          sim.items = [];
          if (sim.bulletBills.length) billFrames++;
          const player = sim.player.body.position;
          if (
            sim.bulletBills.some(
              (bill) =>
                bill.areaId === sim.player.areaId &&
                Math.hypot(bill.x - player.x, bill.y - player.y) < NEAR_BILL,
            )
          )
            nearBillFrames++;
          assert.notEqual(
            sim.mode,
            "dead",
            `${level.id}: the player survives the route`,
          );
        }
      assert.ok(
        sim.mode === "finishing" || sim.mode === "won",
        `${level.id}: reached the door`,
      );
      assert.ok(sim.activeRoom.atDoor(sim.player));
      if (hasCannons) {
        assert.ok(
          billFrames > 0,
          `${level.id}: the route runs past live Bullet Bills`,
        );
        assert.ok(
          nearBillFrames > 0,
          `${level.id}: the route dodges a bullet at close range`,
        );
      }
      sim.physics.clear();
    },
  );
