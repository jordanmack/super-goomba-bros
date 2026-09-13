import { test, expect } from "@playwright/test";
import { skipIntro } from "./skip-intro.ts";

test("header key bindings button lists keyboard controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "START GAME" })).toBeEnabled();
  await page.getByRole("button", { name: "Key bindings" }).click();
  const dialog = page.getByRole("dialog", { name: "KEY BINDINGS" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Left / Right or A / D");
  await expect(dialog).toContainText("Space, Up, or W");
  await expect(dialog).toContainText("Escape");
  await page.getByRole("button", { name: "CLOSE" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Key bindings" }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("key bindings overlay freezes play and ignores walk keys", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.getByRole("button", { name: "Key bindings" }).click();
  const startX = await page.evaluate(
    () => (window as any).__game.sim.player.body.position.x,
  );
  await page.keyboard.down("ArrowRight");
  await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));
  await page.keyboard.up("ArrowRight");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__game.sim.player.body.position.x),
    )
    .toBe(startX);
  await page.keyboard.press("Escape");
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    (x) => (window as any).__game.sim.player.body.position.x > x,
    startX,
  );
  await page.keyboard.up("ArrowRight");
});
