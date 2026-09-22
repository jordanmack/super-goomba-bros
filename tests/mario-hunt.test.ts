import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HUNT_STAGES,
  runFreeHuntTrace,
  runRung,
  runStage,
  stageFleeRelease,
  stageShoutRetarget,
  type FreeHuntTrace,
  type FreeWindow,
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

function windowOf(run: FreeHuntTrace, name: string): FreeWindow {
  const found = run.windows.find((window) => window.name === name);
  assert.ok(found, `${run.id}: missing window ${name}`);
  return found!;
}

// Issue #150: the forced ladder above reads one look. This session steps the
// shipped simulation from the real stage start, records marioGoal as it
// changes, then keeps stepping with the stimuli overlapping. It does not zero
// marioLook and it does not move the 1-2 question-block arena.
test("a long free run records the hunt order on 1-1 and crowded 1-2", () => {
  const runs = ["1-1", "1-2"].map((id) => {
    const stage = HUNT_STAGES.find((s) => s.id === id);
    assert.ok(stage, id);
    return runFreeHuntTrace(stage!, 1);
  });
  const wide = runs[0]!;
  const crowded = runs[1]!;
  assert.ok(
    crowded.runners > wide.runners,
    `1-2 crowd ${crowded.runners} is not denser than 1-1 crowd ${wide.runners}`,
  );

  for (const run of runs) {
    assert.equal(run.areaId, run.mainId, `${run.id}: did not start on main`);
    assert.ok(run.startX < 200, `${run.id}: start ${run.startX} is not the entrance`);
    assert.ok(
      run.endX > run.startX + 200,
      `${run.id}: the free run never walked (${run.startX} to ${run.endX})`,
    );
    assert.equal(run.naturalFrames, 600, `${run.id}: free prefix was cut short`);
    assert.ok(
      run.natural.length > 1,
      `${run.id}: marioGoal changed ${run.natural.length} time(s) from the start`,
    );
    const first = run.natural[0]!;
    const last = run.natural.at(-1)!;
    assert.ok(
      first.frame > 60,
      `${run.id}: first goal at frame ${first.frame} is a forced look, not the return timer`,
    );
    assert.ok(
      last.frame > first.frame,
      `${run.id}: goal changes share one frame`,
    );
    assert.ok(
      run.trace.length > run.natural.length,
      `${run.id}: the later windows added no goal changes`,
    );

    const coin = windowOf(run, "question-over-coin");
    assert.equal(coin.looked, true, `${run.id}: coin window missed its look`);
    assert.equal(coin.live.question, true, `${run.id}: question block was not live`);
    assert.equal(coin.live.itemKind, null, `${run.id}: coin left a loose item`);
    assert.equal(coin.goal, "question", `${run.id}: a coin ranked as ${coin.goal}`);
    assert.equal(coin.targetId, null, `${run.id}: coin locked an actor`);

    const oneUp = windowOf(run, "question-over-one-up");
    assert.equal(oneUp.looked, true, `${run.id}: one-up window missed its look`);
    assert.equal(oneUp.live.question, true, `${run.id}: question block was not live`);
    assert.equal(oneUp.live.itemKind, "oneUp");
    assert.equal(oneUp.live.itemNear, true);
    assert.equal(
      oneUp.goal,
      "question",
      `${run.id}: a 1-up ranked as ${oneUp.goal}`,
    );
    assert.equal(oneUp.targetId, null, `${run.id}: 1-up locked an actor`);

    for (const name of ["mushroom", "mushroom3x", "mushroom8x", "flower", "item-star"]) {
      const item = windowOf(run, name);
      assert.equal(item.looked, true, `${run.id}: ${name} missed its look`);
      assert.equal(item.live.question, true, `${run.id}: ${name} had no question block`);
      assert.equal(item.live.itemNear, true, `${run.id}: ${name} item left sight`);
      assert.equal(
        item.goal,
        "item",
        `${run.id}: ${name} lost to ${item.goal}`,
      );
      assert.equal(
        item.targetId,
        run.powerId,
        `${run.id}: ${name} locked a different target`,
      );
    }
    const mushroom = windowOf(run, "mushroom");
    assert.equal(mushroom.live.itemKind, "mushroom");
    assert.equal(windowOf(run, "mushroom3x").live.itemKind, "mushroom3x");
    assert.equal(windowOf(run, "mushroom8x").live.itemKind, "mushroom8x");
    assert.equal(windowOf(run, "flower").live.itemKind, "flower");
    assert.equal(windowOf(run, "item-star").live.itemKind, "star");

    const oneUpAgain = windowOf(run, "question-over-one-up-again");
    assert.equal(oneUpAgain.looked, true);
    assert.equal(oneUpAgain.live.itemKind, "oneUp");
    assert.equal(oneUpAgain.live.question, true);
    assert.equal(
      oneUpAgain.goal,
      "question",
      `${run.id}: dropping to a 1-up stayed on ${oneUpAgain.goal}`,
    );

    const crowd = windowOf(run, "crowd");
    assert.equal(crowd.looked, true, `${run.id}: crowd missed its look`);
    assert.equal(crowd.live.itemKind, "mushroom");
    assert.equal(crowd.live.itemNear, true, `${run.id}: crowd was not competing with an item`);
    assert.ok(crowd.live.runners > 0, `${run.id}: no on-screen runners`);
    assert.equal(crowd.live.stompNear, false, `${run.id}: stomp was already live`);
    assert.equal(crowd.goal, "crowd", `${run.id}: crowd lost to ${crowd.goal}`);
    assert.ok(
      crowd.targetId !== null && run.runnerIds.includes(crowd.targetId),
      `${run.id}: crowd target ${crowd.targetId} is not a runner`,
    );

    const stomp = windowOf(run, "stomp");
    assert.equal(stomp.looked, true, `${run.id}: stomp missed its look`);
    assert.ok(stomp.live.runners > 0, `${run.id}: stomp was not competing with the crowd`);
    assert.equal(stomp.live.itemNear, true);
    assert.equal(stomp.live.stompNear, true);
    assert.equal(stomp.live.starNear, false);
    assert.equal(stomp.goal, "stomp", `${run.id}: stomp lost to ${stomp.goal}`);
    assert.equal(stomp.targetId, run.stompId, `${run.id}: stomp locked the wrong actor`);

    const flee = windowOf(run, "flee");
    assert.equal(flee.live.starNear, true, `${run.id}: star holder was not in range`);
    assert.equal(flee.live.stompNear, true, `${run.id}: flee was not competing with a stomp`);
    assert.equal(flee.goal, "flee", `${run.id}: star holder read as ${flee.goal}`);
    assert.equal(flee.targetId, null, `${run.id}: flee kept a hunt target`);

    const resumed = windowOf(run, "stomp-after-star");
    assert.equal(resumed.looked, true, `${run.id}: post-star look never fired`);
    assert.equal(resumed.live.starNear, false, `${run.id}: star was still live`);
    assert.equal(resumed.live.stompNear, true);
    assert.ok(resumed.live.runners > 0);
    assert.equal(
      resumed.goal,
      "stomp",
      `${run.id}: after the star the order resumed as ${resumed.goal}`,
    );
    assert.equal(resumed.targetId, run.stompId);

    const crowdNext = windowOf(run, "crowd-after-stomp");
    assert.equal(crowdNext.looked, true, `${run.id}: crowd-after-stomp missed its look`);
    assert.equal(crowdNext.live.stompNear, false, `${run.id}: stomp was still live`);
    assert.ok(crowdNext.live.runners > 0, `${run.id}: crowd dropped with the stomp`);
    assert.equal(crowdNext.live.itemNear, true);
    assert.equal(
      crowdNext.goal,
      "crowd",
      `${run.id}: after the stomp the order fell to ${crowdNext.goal}`,
    );
    assert.ok(
      crowdNext.targetId !== null && run.runnerIds.includes(crowdNext.targetId),
      `${run.id}: post-stomp crowd target ${crowdNext.targetId} is not a runner`,
    );

    const itemNext = windowOf(run, "item-after-crowd");
    assert.equal(itemNext.looked, true, `${run.id}: item-after-crowd missed its look`);
    assert.equal(itemNext.live.runners, 0, `${run.id}: runners were still live`);
    assert.equal(itemNext.live.stompNear, false);
    assert.equal(itemNext.live.itemKind, "mushroom");
    assert.equal(itemNext.live.itemNear, true);
    assert.equal(
      itemNext.goal,
      "item",
      `${run.id}: after the crowd the order fell to ${itemNext.goal}`,
    );
    assert.equal(itemNext.targetId, run.itemId);

    for (const name of [
      "after-star-mushroom",
      "after-star-mushroom3x",
      "after-star-mushroom8x",
      "after-star-flower",
      "after-star-item-star",
    ]) {
      const item = windowOf(run, name);
      assert.equal(item.looked, true, `${run.id}: ${name} missed its look`);
      assert.equal(item.live.question, true, `${run.id}: ${name} had no question block`);
      assert.equal(item.live.itemNear, true, `${run.id}: ${name} item left sight`);
      assert.equal(item.live.runners, 0);
      assert.equal(item.live.stompNear, false);
      assert.equal(item.goal, "item", `${run.id}: ${name} lost to ${item.goal}`);
      assert.equal(item.targetId, run.itemId, `${run.id}: ${name} locked a different target`);
    }
    assert.equal(windowOf(run, "after-star-mushroom").live.itemKind, "mushroom");
    assert.equal(windowOf(run, "after-star-mushroom3x").live.itemKind, "mushroom3x");
    assert.equal(windowOf(run, "after-star-mushroom8x").live.itemKind, "mushroom8x");
    assert.equal(windowOf(run, "after-star-flower").live.itemKind, "flower");
    assert.equal(windowOf(run, "after-star-item-star").live.itemKind, "star");

    const questionNext = windowOf(run, "question-after-item");
    assert.equal(questionNext.looked, true, `${run.id}: question-after-item missed its look`);
    assert.equal(questionNext.live.itemKind, "oneUp");
    assert.equal(questionNext.live.question, true);
    assert.equal(questionNext.live.runners, 0);
    assert.equal(
      questionNext.goal,
      "question",
      `${run.id}: after the item the order fell to ${questionNext.goal}`,
    );
    assert.equal(questionNext.targetId, null);

    const patrol = windowOf(run, "patrol");
    assert.equal(patrol.looked, true, `${run.id}: patrol missed its look`);
    assert.equal(patrol.live.question, false, `${run.id}: question block was still live`);
    assert.equal(patrol.live.itemKind, null);
    assert.equal(patrol.live.itemNear, false);
    assert.equal(patrol.live.runners, 0);
    assert.equal(patrol.live.stompNear, false);
    assert.equal(patrol.live.starNear, false);
    assert.ok(
      patrol.goal === "chase" || patrol.goal === "notice",
      `${run.id}: with nothing left the goal was ${patrol.goal}`,
    );

    const shout = windowOf(run, "shout");
    assert.equal(shout.goal, "shout", `${run.id}: warning read as ${shout.goal}`);
    assert.equal(
      shout.targetId,
      run.playerId,
      `${run.id}: warning did not retarget the player`,
    );
    assert.ok(
      run.trace.at(-1)!.frame > shout.frame,
      `${run.id}: the session stopped on the warning`,
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
