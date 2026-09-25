import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { test, expect, skipIntro } from "./skip-intro.ts";

// Below Fire in water, Mario stalks the swimming player in the real camera's
// view without hurting anyone, then leaves at the Fire mark and returns as
// Fire.
test("a water Mario below Fire stalks in view, then leaves and returns as Fire", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const water = campaign.levels.findIndex((level) => level.id === "2-2");
  const run = await page.evaluate((water) => {
    const g = (window as any).__game;
    const s = g.sim;
    g.paused = true;
    const input = (right: boolean, jump: boolean) => ({
      left: false,
      right,
      up: false,
      jump,
      fire: false,
      down: false,
      run: false,
    });
    // The renderer places the camera for the canvas, as each drawn frame does.
    const step = (right: boolean, jump: boolean) => {
      g.renderer.render(s, 0);
      s.step(1 / 60, input(right, jump));
    };
    s.levelIndex = water;
    s.reset();
    s.marioReturn = 1e6;
    for (let f = 0; f < 60 * 20 && (s.mode === "intro" || s.pipeIntro); f++)
      step(false, false);
    for (const n of s.npcs) n.alive = false;
    s.player.body.position.x = 400;
    s.player.body.position.y = 300;
    s.marioActive = true;
    s.mario.alive = true;
    s.mario.body.frozen = false;
    s.marioStun = 0;
    s.mario.areaId = s.player.areaId;
    s.setMarioStage(1);
    s.mario.body.position.x = 150;
    s.mario.body.position.y = 380;
    s.elapsed = 50;
    s.marioReturn = 0;
    const goals = new Set<string>();
    let outOfView = 0;
    let gap = 0;
    let left = -1;
    let back = -1;
    for (let f = 1; f <= 60 * 20 && back < 0; f++) {
      const was = s.marioActive;
      step(true, f % 30 === 0);
      if (!s.player.alive) break;
      if (s.marioActive) goals.add(s.marioGoal);
      const b = s.mario.body.bounds;
      if (s.elapsed < 60 && f > 60 * 4) {
        if (b.max.x < s.cameraX || b.min.x > s.cameraX + g.renderer.width)
          outOfView++;
        gap = s.player.body.position.x - s.mario.body.position.x;
      }
      if (was && !s.marioActive) left = s.elapsed;
      if (!was && s.marioActive) back = s.elapsed;
    }
    return {
      alive: s.player.alive,
      goals: [...goals],
      outOfView,
      gap,
      left,
      back,
      stage: s.marioStage,
    };
  }, water);
  expect(run.alive).toBe(true);
  expect(run.outOfView).toBe(0);
  expect(Math.abs(run.gap - 192)).toBeLessThan(8);
  expect(run.goals).toEqual(["stalk", "leave"]);
  expect(run.left).toBeGreaterThan(60);
  expect(run.back).toBeGreaterThan(run.left);
  expect(run.stage).toBe(2);
});
