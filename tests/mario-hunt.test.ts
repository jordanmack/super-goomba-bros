import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HUNT_STAGES,
  runRung,
  runStage,
  stageFleeRelease,
  stageShoutRetarget,
  type RungResult,
} from "./support/mario-hunt-playtest.ts";

function assertLockedIdentity(r: RungResult, label: string) {
  switch (r.rung.expect) {
    case "question":
      assert.equal(r.brickId, r.placedIds.question, `${label}: wrong block`);
      assert.equal(r.targetId, null, `${label}: locked an actor`);
      assert.equal(r.huntItem, false, `${label}: hunting an item`);
      break;
    case "item":
      assert.equal(r.targetId, r.placedIds.item, `${label}: wrong item`);
      assert.equal(r.huntItem, true, `${label}: not hunting the item`);
      break;
    case "stomp":
      assert.equal(r.targetId, r.placedIds.stomp, `${label}: wrong actor`);
      assert.equal(r.huntItem, false, `${label}: hunting an item`);
      break;
    case "crowd":
      assert.ok(
        r.targetId !== null && r.crowdIds.includes(r.targetId),
        `${label}: target ${r.targetId} is not a staged crowd actor`,
      );
      assert.equal(r.huntItem, false, `${label}: hunting an item`);
      break;
    case "flee":
      assert.equal(r.targetId, null, `${label}: kept a hunt target`);
      assert.equal(r.brickId, null, `${label}: kept a block lock`);
      break;
    default:
      assert.fail(`${label}: unexpected goal ${r.rung.expect}`);
  }
}

// Issue #138: the #120 hunt order is verified as a playtest on real stages,
// not only as isolated unit setups. Each rung adds one higher-priority
// stimulus while every lower one stays live, so a regression that reorders
// the ladder fails here instead of only showing up in play.
const SEEDS = [1, 2, 3];

for (const stage of HUNT_STAGES)
  test(`Mario hunt order holds on ${stage.id} across repeated runs`, () => {
    for (const seed of SEEDS) {
      const result = runStage(stage, seed);
      const expected = stage.scenes.reduce((n, sc) => n + sc.rungs.length, 0);
      assert.equal(result.rungs.length, expected, `${stage.id}: missing rungs`);
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
        assertLockedIdentity(
          r,
          `${stage.id} seed ${seed} scene ${r.scene} ${r.rung.expect}`,
        );
      }
    }
  });

test("Mario hunt coverage includes 1-3 and its question block", () => {
  assert.ok(
    HUNT_STAGES.some((s) => s.id === "1-3"),
    "1-3 is not in the hunt harness",
  );
  const stage = HUNT_STAGES.find((s) => s.id === "1-3")!;
  const blocks = stage.scenes.find((sc) => sc.name === "blocks")!;
  assert.ok(blocks.questionX, "1-3 has no question-block arena");
  const r = runRung(stage, blocks, blocks.rungs[0]!, 1);
  assert.equal(r.goal, "question");
  assertLockedIdentity(r, "1-3 question");
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
        assertLockedIdentity(r, label);
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
