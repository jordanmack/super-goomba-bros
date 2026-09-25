import type { Page } from "@playwright/test";
import { test, expect, skipIntro } from "./skip-intro.ts";

async function frame(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).__game;
    const s = g.sim;
    const drawn = g.renderer.play.cameras.main.scrollX;
    return {
      share: (s.player.body.position.x - drawn) / g.renderer.width,
      eased: s.cameraShare(),
      easing: s.cameraEase < 0.3,
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

async function settle(page: Page) {
  await page.waitForFunction(
    () => (window as any).__game.sim.cameraEase >= 0.3,
    undefined,
    { polling: "raf" },
  );
  await frames(page, 2);
}

test("the drawn camera eases between 36% walking right and 64% walking left", async ({
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
    () => {
      const s = (window as any).__game.sim;
      return s.cameraLead === -1 && s.cameraEase > 0 && s.cameraEase < 0.2;
    },
    undefined,
    { polling: "raf" },
  );
  const mid = await frame(page);
  expect(mid.easing, "the turn eases").toBe(true);
  expect(mid.cameraX, "mid-ease").toBe(mid.drawn);
  expect(mid.share, "drawn at the eased share").toBeCloseTo(mid.eased, 2);
  expect(mid.share).toBeGreaterThan(0.36 + 0.005);
  expect(mid.share).toBeLessThan(0.64 - 0.005);
  await settle(page);
  await expectShare(0.64, "walking left");
  await page.keyboard.up("ArrowLeft");
  await frames(page, 10);
  await expectShare(0.64, "release keeps the last anchor");

  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    () => (window as any).__game.sim.player.body.velocity.x > 0,
  );
  await settle(page);
  await expectShare(0.36, "walking right again");
  await page.keyboard.up("ArrowRight");
});
