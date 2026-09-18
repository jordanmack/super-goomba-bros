import { test, expect, type Page } from "@playwright/test";
import { skipIntro } from "./skip-intro.ts";

test.setTimeout(60000);

const SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const;

async function waitGame(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "START GAME" })).toBeEnabled({
    timeout: 15000,
  });
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
}

async function enterSequence(page: Page, keys: readonly string[]) {
  for (const key of keys) await page.keyboard.press(key);
}

test("title Sonami arrows then B then A unlocks a session tray without starting", async ({
  page,
}) => {
  await waitGame(page);
  await page.evaluate(() => {
    const audio = (window as any).__game.audio;
    (window as any).__audioEvents = [];
    const original = audio.event.bind(audio);
    audio.event = (event: string) => {
      (window as any).__audioEvents.push(event);
      original(event);
    };
  });
  await enterSequence(page, SEQUENCE);
  const tray = page.getByRole("toolbar", { name: "Power-up tray" });
  await expect(tray).toBeVisible();
  for (const name of ["Star", "2x", "3x", "8x", "Flower", "1-up"])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "START GAME" })).toBeVisible();
  await expect(page.locator("main.at-title")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__audioEvents))
    .toContain("coin");
});

test("WASD does not complete Sonami and extra keys plus a wrong key still unlock", async ({
  page,
}) => {
  await waitGame(page);
  await enterSequence(page, [
    "w",
    "w",
    "s",
    "s",
    "a",
    "d",
    "a",
    "d",
    "b",
    "a",
  ]);
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toHaveCount(
    0,
  );
  await enterSequence(page, ["x", "ArrowUp", "ArrowUp", "ArrowLeft"]);
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toHaveCount(
    0,
  );
  await enterSequence(page, SEQUENCE);
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toBeVisible();
});

test("mute still unlocks Sonami without a coin tone", async ({ page }) => {
  await waitGame(page);
  await page.getByRole("button", { name: "Mute" }).click();
  await page.evaluate(() => {
    const audio = (window as any).__game.audio;
    (window as any).__audioEvents = [];
    const original = audio.event.bind(audio);
    audio.event = (event: string) => {
      (window as any).__audioEvents.push(event);
      original(event);
    };
  });
  await enterSequence(page, SEQUENCE);
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.muted))
    .toBe(true);
});

test("tray click while playing hangs a blinking item in the sky", async ({
  page,
}) => {
  await waitGame(page);
  await enterSequence(page, SEQUENCE);
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sim.marioReturn = 1e6;
    g.sim.step = () => {};
  });
  const before = await page.evaluate(
    () => (window as any).__game.sim.items.length,
  );
  await page.getByRole("button", { name: "Star", exact: true }).click();
  const item = await page.evaluate(() => {
    const s = (window as any).__game.sim;
    const last = s.items.at(-1);
    return {
      kind: last?.kind,
      emerge: last?.emerge,
      frozen: last?.body.frozen,
      hold: last?.hold,
      drop: last?.drop,
      y: last?.body.position.y,
      count: s.items.length,
    };
  });
  expect(item.kind).toBe("star");
  expect(item.emerge).toBe(0);
  expect(item.frozen).toBe(true);
  expect(item.hold).toBeGreaterThan(0);
  expect(item.drop).toBe(true);
  expect(item.y).toBeLessThan(50);
  expect(item.count).toBeGreaterThan(before);
});

test("tray click while paused does not spawn", async ({ page }) => {
  await waitGame(page);
  await enterSequence(page, SEQUENCE);
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.evaluate(() => {
    (window as any).__game.paused = true;
  });
  const before = await page.evaluate(
    () => (window as any).__game.sim.items.length,
  );
  await page.getByRole("button", { name: "Star", exact: true }).click();
  expect(
    await page.evaluate(() => (window as any).__game.sim.items.length),
  ).toBe(before);
});

test("tray click on the title does not spawn", async ({ page }) => {
  await waitGame(page);
  await enterSequence(page, SEQUENCE);
  await page.getByRole("button", { name: "Star", exact: true }).click();
  expect(
    await page.evaluate(() => {
      const s = (window as any).__game.sim;
      return { mode: s.mode, items: s.items.length };
    }),
  ).toEqual({ mode: "title", items: 0 });
});

test("reload clears the Sonami tray", async ({ page }) => {
  await waitGame(page);
  await enterSequence(page, SEQUENCE);
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "START GAME" })).toBeEnabled();
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toHaveCount(
    0,
  );
});
