import type { Page } from "@playwright/test";
import { test, expect, skipIntro } from "./skip-intro.ts";

async function frame(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).__game;
    const s = g.sim;
    const drawn = g.renderer.play.cameras.main.scrollX;
    return {
      share: (s.player.body.position.x - drawn) / g.renderer.width,
      drawn,
      cameraX: s.cameraX,
      viewWidth: s.viewWidth,
      width: g.renderer.width,
    };
  });
}

async function frames(page: Page, count: number) {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i++)
      await new Promise(requestAnimationFrame);
  }, count);
}

test("the drawn camera holds 36% walking right and 64% walking left", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.marioReturn = 1e6;
    s.player.body.position.x = s.activeRoom.offset + 2000;
  });
  const expectShare = async (share: number, why: string) => {
    const now = await frame(page);
    expect(now.cameraX, why).toBe(now.drawn);
    expect(now.viewWidth, why).toBe(now.width);
    expect(now.share, why).toBeCloseTo(share, 2);
  };

  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => (window as any).__game.sim.player.body.velocity.x > 0,
  );
  await frames(page, 2);
  await expectShare(0.36, "walking right");
  await page.keyboard.up("ArrowRight");

  await page.keyboard.down("ArrowLeft");
  await page.waitForFunction(
    () => (window as any).__game.sim.player.body.velocity.x < 0,
  );
  await frames(page, 2);
  await expectShare(0.64, "walking left");
  await page.keyboard.up("ArrowLeft");
  await frames(page, 10);
  await expectShare(0.64, "release keeps the last anchor");

  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => (window as any).__game.sim.player.body.velocity.x > 0,
  );
  await frames(page, 2);
  await expectShare(0.36, "walking right again");
  await page.keyboard.up("ArrowRight");
});
