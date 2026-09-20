import { test as base, expect, type Page } from "@playwright/test";

const HOLD_KEYS = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
  "Shift",
  "ShiftLeft",
  "ShiftRight",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "KeyZ",
  "KeyJ",
  "KeyK",
  "KeyB",
  "Escape",
  "Enter",
] as const;

export async function waitForStart(page: Page) {
  // Match the Playwright test budget. A nested 20s cap flakes under load.
  await expect(page.getByRole("button", { name: "START GAME" })).toBeEnabled({
    timeout: 60000,
  });
  await releaseHolds(page);
}

export async function skipIntro(page: Page) {
  // START GAME can resolve while sim.mode is still title; a silent no-op
  // leaves later play assertions waiting on a frozen intro.
  await page.waitForFunction(() => {
    const s = (window as any).__game?.sim;
    return !!s && (s.mode === "intro" || s.mode === "playing");
  });
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    if (s.mode !== "intro") return;
    s.introLeft = 0;
    s.mode = "playing";
  });
  await page.waitForFunction(
    () => (window as any).__game.sim.mode === "playing",
  );
}

export async function startGame(page: Page) {
  await waitForStart(page);
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
}

export async function releaseHolds(page: Page) {
  if (page.isClosed()) return;
  for (const key of HOLD_KEYS) await page.keyboard.up(key).catch(() => {});
  await page
    .evaluate(() => {
      const win = window as any;
      const pad = win.__pad;
      if (pad) {
        for (const button of pad.buttons) {
          button.pressed = false;
          button.value = 0;
        }
        pad.axes = [0, 0, 0, 0];
      }
      win.__game?.clearInput?.();
    })
    .catch(() => {});
}

export const test = base.extend({
  page: async ({ page }, run) => {
    await releaseHolds(page);
    await run(page);
    await releaseHolds(page);
  },
});

export { expect };
export type { Page };
