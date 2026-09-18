import { test, expect } from "@playwright/test";
import { skipIntro } from "./skip-intro.ts";

test("header key bindings button lists keyboard controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "START GAME" })).toBeEnabled({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Key bindings" }).click();
  const dialog = page.getByRole("dialog", { name: "KEY BINDINGS" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Left / Right or A / D");
  await expect(dialog).toContainText("Space, Up, W, or K");
  await expect(dialog).toContainText("Shift, Z, or J");
  await expect(dialog).toContainText("Escape");
  await expect(dialog).toContainText("Stick or D-pad (deadzone 0.35)");
  await expect(dialog).toContainText("A (South)");
  await expect(page.getByRole("button", { name: "CLOSE" })).toBeFocused();
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
  const dialog = page.getByRole("dialog", { name: "KEY BINDINGS" });
  await expect(dialog).toBeVisible();
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
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "PAUSED" })).toHaveCount(0);
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    (x) => (window as any).__game.sim.player.body.position.x > x,
    startX,
  );
  await page.keyboard.up("ArrowRight");
});

test("help hides pause actions and restores focus to the header button", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  await page.getByRole("button", { name: "Key bindings" }).click();
  await expect(page.getByRole("dialog", { name: "KEY BINDINGS" })).toBeVisible();
  await expect(page.getByRole("button", { name: "RESTART LEVEL" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "CLOSE" })).toBeFocused();
  await page.getByRole("button", { name: "CLOSE" }).click();
  await expect(page.getByRole("button", { name: "Key bindings" })).toBeFocused();
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
});

for (const viewport of [
  { name: "390px portrait", width: 390, height: 844 },
  { name: "768px tablet", width: 768, height: 1024 },
] as const) {
  test(`gameplay header tools stay on screen at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "START GAME" }).click();
    await skipIntro(page);
    for (const name of ["Key bindings", "Compact pad", "Mute", "Pause"])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeInViewport();
    await expect(page.getByTestId("score")).toBeInViewport();
    await expect(page.getByTestId("time")).toBeInViewport();
  });
}

test("help list starts on screen at 568x360", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 360 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "START GAME" })).toBeEnabled({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Key bindings" }).click();
  const dialog = page.getByRole("dialog", { name: "KEY BINDINGS" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "KEY BINDINGS" })).toBeInViewport();
  await expect(dialog.getByText("Walk", { exact: true }).first()).toBeInViewport();
});
