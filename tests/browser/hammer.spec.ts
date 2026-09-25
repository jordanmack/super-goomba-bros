import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { test, expect, skipIntro } from "./skip-intro.ts";

test("a hammer draws as four quarter-turns of one crop, never mirrored", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const stage = campaign.levels.findIndex((level) => level.id === "3-1");
  const drawn = await page.evaluate((stage) => {
    const g = (window as any).__game;
    const s = g.sim;
    g.paused = true;
    s.levelIndex = stage;
    s.reset();
    s.marioReturn = 1e6;
    const bro = s.hammerBros[0];
    s.player.areaId = bro.areaId;
    s.player.body.position.x = bro.body.position.x - 200;
    const look = (facing: number, spin: number) => {
      s.hammers = [
        {
          id: 1,
          broId: bro.id,
          areaId: bro.areaId,
          x: bro.body.position.x,
          y: bro.body.position.y - 40,
          vx: facing * 3,
          vy: 0,
          facing,
          age: 0,
          windup: 0,
          spin,
        },
      ];
      g.renderer.render(s, 0);
      const sprite = g.renderer.play.effects.find(
        (e: any) => e.visible && e.texture.key === "hammer",
      );
      return {
        // Phaser wraps rotation into [-pi, pi), so compare quarter-turns mod 4.
        turn: (Math.round(sprite.rotation / (Math.PI / 2)) + 8) % 4,
        flipX: sprite.flipX,
        size: [sprite.displayWidth, sprite.displayHeight],
      };
    };
    return {
      right: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((spin) => look(1, spin)),
      left: [0, 2, 4, 6].map((spin) => look(-1, spin)),
    };
  }, stage);
  expect(drawn.right.map((d: any) => d.turn)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 0]);
  // Thrown left, it turns the other way.
  expect(drawn.left.map((d: any) => d.turn)).toEqual([0, 3, 2, 1]);
  for (const d of [...drawn.right, ...drawn.left]) {
    expect(d.flipX).toBe(false);
    expect(d.size).toEqual([32, 32]);
  }
});
