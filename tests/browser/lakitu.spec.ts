import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { test, expect, skipIntro } from "./skip-intro.ts";

test("a Spiny egg draws the two unflipped egg frames, then hatches to the walk frames", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const stage = campaign.levels.findIndex((level) => level.id === "4-1");
  expect(stage).toBeGreaterThanOrEqual(0);
  const drawn = await page.evaluate((stage) => {
    const g = (window as any).__game;
    const s = g.sim;
    g.paused = true;
    s.levelIndex = stage;
    s.reset();
    const before = new Set(s.npcs);
    const p = s.player.body.position;
    s.throwSpike({
      id: 9001,
      areaId: s.level.main,
      x: p.x + 64,
      y: p.y - 160,
      facing: -1,
      alive: true,
      throwWait: 0,
    });
    const egg = s.npcs.find((n: unknown) => !before.has(n));
    const sample = (elapsed: number) => {
      s.elapsed = elapsed;
      g.renderer.render(s, 0);
      const sprite = g.renderer.play.actors.get(egg.id);
      return {
        texture: sprite?.texture?.key ?? null,
        anim: sprite?.anims?.isPlaying ? sprite.anims.currentAnim.key : null,
        flipX: !!sprite?.flipX,
      };
    };
    const first = sample(0.5 / 60);
    const second = sample(8.5 / 60);
    const third = sample(16.5 / 60);
    egg.egg = false;
    egg.grounded = true;
    egg.body.velocity.x = -1;
    egg.body.velocity.y = 0;
    const hatched = sample(20.5 / 60);
    return { kind: egg.kind, first, second, third, hatched };
  }, stage);
  expect(drawn.kind).toBe("spike");
  expect(drawn.first).toEqual({ texture: "spikeEgg", anim: null, flipX: false });
  expect(drawn.second).toEqual({
    texture: "spikeEggTurn",
    anim: null,
    flipX: false,
  });
  expect(drawn.third).toEqual({ texture: "spikeEgg", anim: null, flipX: false });
  expect(drawn.hatched.anim).toBe("spike-walk");
  expect(drawn.hatched.flipX).toBe(true);
});
