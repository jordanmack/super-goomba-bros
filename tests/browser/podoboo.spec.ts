import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { MAP_TOP } from "../../src/game/config";
import { test, expect, skipIntro } from "./skip-intro.ts";

test("a Podoboo draws in front of the lava, upside down while it falls", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  const castle = campaign.levels.findIndex((level) => level.id === "1-4");
  const drawn = await page.evaluate(({ castle, mapTop }) => {
    const g = (window as any).__game;
    const s = g.sim;
    g.paused = true;
    s.levelIndex = castle;
    s.reset();
    s.marioReturn = 1e6;
    const room = s.activeRoom;
    const podoboo = room.podoboos[0];
    s.player.body.position.x = podoboo.x - 200;
    const sprites = () =>
      g.renderer.play.effects
        .filter((e: any) => e.visible && e.texture.key === "podoboo")
        .map((e: any) => ({
          depth: e.depth,
          size: [e.displayWidth, e.displayHeight],
          x: e.x,
          y: e.y,
          flipY: e.flipY,
        }));
    podoboo.motion = { y: 120, speed: -3, force: 0, dummy: 0, timer: 5 };
    g.renderer.render(s, 0);
    const rising = sprites();
    podoboo.motion = { y: 120, speed: 2, force: 0, dummy: 0, timer: 5 };
    g.renderer.render(s, 0);
    const falling = sprites();
    podoboo.motion = { y: 0x102, speed: 0, force: 0, dummy: 0, timer: 5 };
    g.renderer.render(s, 0);
    const below = sprites();
    return {
      rising,
      falling,
      below,
      x: podoboo.x,
      y: mapTop + (120 + 16) * 2,
      tiles: g.renderer.play.tiles.depth,
    };
  }, { castle, mapTop: MAP_TOP });
  expect(drawn.rising).toHaveLength(1);
  const [up] = drawn.rising;
  expect(up.size).toEqual([32, 32]);
  expect([up.x, up.y]).toEqual([drawn.x, drawn.y]);
  expect(up.flipY).toBe(false);
  expect(up.depth).toBeGreaterThan(drawn.tiles);
  expect(drawn.falling[0].flipY).toBe(true);
  expect(drawn.below).toEqual([]);
});
