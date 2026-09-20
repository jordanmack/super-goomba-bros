import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HUNT_STAGES,
  runRung,
  runStage,
  stageFleeRelease,
  stageShoutRetarget,
} from "./support/mario-hunt-playtest.ts";

// Issue #138: the #120 hunt order is verified as a playtest on real stages,
// not only as isolated unit setups. Each rung adds one higher-priority
// stimulus while every lower one stays live, so a regression that reorders
// the ladder fails here instead of only showing up in play.
const SEEDS = [1, 2, 3];

for (const stage of HUNT_STAGES)
  test(`Mario hunt order holds on ${stage.id} across repeated runs`, () => {
    for (const seed of SEEDS) {
      const result = runStage(stage, seed);
      assert.ok(result.rungs.length >= 6, `${stage.id}: too few rungs`);
      for (const r of result.rungs) {
        assert.equal(
          r.goal,
          r.rung.expect,
          `${stage.id} seed ${seed} scene ${r.scene} live [${r.rung.live.join(
            ",",
          )}] chose ${r.goal}`,
        );
        assert.ok(
          r.pursuitToward !== 0,
          `${stage.id} seed ${seed} ${r.rung.expect}: Mario never moved`,
        );
      }
    }
  });

test("the 1-2 playtest really is the crowded stage", () => {
  const crowdOf = (id: string) => {
    const stage = HUNT_STAGES.find((s) => s.id === id)!;
    const rung = runStage(stage, 1).rungs.find((r) =>
      r.rung.live.includes("crowd"),
    )!;
    return rung.crowd;
  };
  const wide = crowdOf("1-1");
  const crowded = crowdOf("1-2");
  assert.ok(wide > 0, "1-1 staged no crowd");
  assert.ok(
    crowded > wide,
    `1-2 crowd ${crowded} is not denser than 1-1 crowd ${wide}`,
  );
});

test("the hunt ladder pursues each chosen goal, and flees the star holder", () => {
  for (const stage of HUNT_STAGES)
    for (const scene of stage.scenes)
      for (const rung of scene.rungs) {
        const r = runRung(stage, scene, rung, 1);
        const label = `${stage.id} ${scene.name} ${rung.expect}`;
        if (rung.expect === "flee") {
          // Fleeing means away from the star holder, which is right of Mario.
          assert.equal(r.pursuitToward, -1, `${label}: did not run away`);
          assert.equal(r.targetX, null, `${label}: kept a hunt target`);
          continue;
        }
        assert.notEqual(r.targetX, null, `${label}: no target to read back`);
        assert.equal(
          r.pursuitToward,
          Math.sign(r.targetX! - r.marioX),
          `${label}: moved away from its target at ${r.targetX}`,
        );
      }
});

test("the same stage and seed replay to the same hunt decisions", () => {
  for (const stage of HUNT_STAGES) {
    const first = runStage(stage, 7);
    const again = runStage(stage, 7);
    assert.deepEqual(
      again.rungs.map((r) => [r.scene, r.goal, r.targetX]),
      first.rungs.map((r) => [r.scene, r.goal, r.targetX]),
      `${stage.id}: replay diverged`,
    );
  }
});

test("the flee goal ends with the star, so it cannot mask a later choice", () => {
  for (const stage of HUNT_STAGES) {
    const release = stageFleeRelease(stage, 1);
    assert.equal(release.whileStarred, "flee", `${stage.id}: never fled`);
    assert.equal(release.starLeft, 0, `${stage.id}: star did not expire`);
    assert.notEqual(
      release.betweenLooks,
      "flee",
      `${stage.id}: still reads as fleeing a star that expired`,
    );
    assert.equal(
      release.afterStar,
      "stomp",
      `${stage.id}: did not resume the hunt order after the star`,
    );
  }
});

test("a heard warning retargets Mario, and the readback follows it", () => {
  for (const stage of HUNT_STAGES) {
    const shout = stageShoutRetarget(stage, 1);
    assert.equal(shout.beforeShout, "stomp", `${stage.id}: no stomp to leave`);
    assert.notEqual(
      shout.targetAfter,
      shout.targetBefore,
      `${stage.id}: the shout did not retarget him`,
    );
    assert.equal(
      shout.targetAfter,
      shout.playerId,
      `${stage.id}: the shout did not send him at the player`,
    );
    assert.equal(
      shout.afterShout,
      "shout",
      `${stage.id}: readback still names the goal he abandoned`,
    );
  }
});
