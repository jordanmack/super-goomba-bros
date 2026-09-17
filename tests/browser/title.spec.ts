import { test, expect, type Page } from "@playwright/test";
import { skipIntro } from "./skip-intro.ts";

const surfaces = [
  ["tagline", ".title-screen .level-label"],
  ["title", ".title-screen h1"],
  ["title-super", ".title-screen h1 span:first-child"],
  ["title-bros", ".title-screen h1 span:last-child"],
  ["start", ".title-screen .primary"],
] as const;

const viewports = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "portrait", width: 390, height: 844 },
  { name: "short portrait", width: 320, height: 568 },
  { name: "landscape phone", width: 844, height: 390 },
  { name: "short landscape", width: 640, height: 360 },
  { name: "narrow short landscape", width: 568, height: 360 },
] as const;

async function assertTitleType(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await document.fonts.load('16px "Press Start 2P"');
  });
  const screen = page.getByRole("region", { name: "Title screen" });
  await expect(screen).toBeVisible();
  await expect(page.locator("main.at-title")).toBeVisible();
  const headerBottom = await page.locator(".topbar").evaluate((el) => {
    return el.getBoundingClientRect().bottom;
  });
  const viewport = page.viewportSize()!;
  for (const [name, selector] of surfaces) {
    const loc = page.locator(selector);
    await expect(loc, name).toBeVisible();
    await expect(loc, name).toBeInViewport();
    const metrics = await loc.evaluate((el) => {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return {
        fontFamily: style.fontFamily,
        fontSize: parseFloat(style.fontSize),
        top: box.top,
        left: box.left,
        bottom: box.bottom,
        right: box.right,
      };
    });
    expect(metrics.fontFamily, name).toMatch(/Press Start 2P/);
    expect(metrics.fontSize, name).toBeGreaterThanOrEqual(16);
    expect(metrics.fontSize % 8, name).toBe(0);
    expect(metrics.top, name).toBeGreaterThanOrEqual(headerBottom);
    expect(metrics.left, name).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom, name).toBeLessThanOrEqual(viewport.height);
    expect(metrics.right, name).toBeLessThanOrEqual(viewport.width);
  }
  await expect(screen.getByText("A LITTLE COURAGE. A BIG MUSTACHE.")).toBeVisible();
  await expect(screen.getByRole("heading", { name: "Super Goomba Bros" })).toBeVisible();
  await expect(screen.getByRole("button", { name: "START GAME" })).toBeVisible();
  await expect(screen).not.toContainText("WORLD 1");
  await expect(screen).not.toContainText("THE GREAT ESCAPE");
  await expect(screen).not.toContainText("WORLD 1 / THE GREAT ESCAPE");
  await expect(page.getByText("WORLD 1 / THE GREAT ESCAPE")).toHaveCount(0);
}

for (const viewport of viewports) {
  test(`title screen type reads as 8-bit at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await assertTitleType(page);
  });
}

async function titleBoxes(page: Page) {
  return page.evaluate(() => {
    const playfield = document
      .querySelector(".playfield")!
      .getBoundingClientRect();
    const canvasEl = document.querySelector(
      ".world canvas",
    ) as HTMLCanvasElement;
    const canvas = canvasEl.getBoundingClientRect();
    const scale = (window as any).__game?.renderer.game.scale;
    return {
      playfieldHeight: playfield.height,
      playfieldWidth: playfield.width,
      canvasHeight: canvas.height,
      canvasWidth: canvas.width,
      canvasTop: canvas.top,
      playfieldTop: playfield.top,
      innerHeight: window.innerHeight,
      pad: !!document.querySelector(".play-footer"),
      styleHeight: parseFloat(canvasEl.style.height) || 0,
      styleWidth: parseFloat(canvasEl.style.width) || 0,
      displayHeight: scale?.displaySize.height ?? 0,
      displayWidth: scale?.displaySize.width ?? 0,
      parentHeight: scale?.parentSize.height ?? 0,
      parentWidth: scale?.parentSize.width ?? 0,
    };
  });
}

function filledTitle(box: Awaited<ReturnType<typeof titleBoxes>>) {
  return (
    !box.pad &&
    box.styleHeight > 0 &&
    Math.abs(box.playfieldHeight - box.innerHeight) < 5 &&
    Math.abs(box.canvasHeight - box.playfieldHeight) < 5 &&
    Math.abs(box.styleHeight - box.playfieldHeight) < 5 &&
    Math.abs(box.styleWidth - box.playfieldWidth) < 5 &&
    Math.abs(box.displayHeight - box.parentHeight) < 5 &&
    Math.abs(box.parentHeight - box.playfieldHeight) < 5
  );
}

test("GAME OVER returns the title playfield to the cold-load size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const screen = page.getByRole("region", { name: "Title screen" });
  await expect(screen).toBeVisible();
  await expect(page.locator("main.at-title")).toBeVisible();
  await expect(page.getByRole("button", { name: "START GAME" })).toBeEnabled();
  const cold = await titleBoxes(page);
  expect(filledTitle(cold)).toBe(true);
  expect(Math.abs(cold.canvasTop - cold.playfieldTop)).toBeLessThan(5);

  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await expect(page.locator(".play-footer")).toBeVisible();
  const inGame = await titleBoxes(page);
  expect(inGame.pad).toBe(true);
  expect(inGame.playfieldHeight).toBeLessThan(cold.playfieldHeight - 40);
  expect(inGame.parentHeight).toBeLessThan(cold.parentHeight - 40);
  expect(inGame.styleHeight).toBeLessThan(cold.styleHeight - 40);

  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.lives = 1;
    s.kill(s.player, false);
  });
  await expect(page.getByRole("region", { name: "Game over" })).toBeVisible({
    timeout: 8000,
  });
  await expect(screen).toBeVisible({ timeout: 8000 });
  await expect(page.locator("main.at-title")).toBeVisible();
  await expect(page.locator(".play-footer")).toHaveCount(0);
  await expect
    .poll(async () => {
      const next = await titleBoxes(page);
      return (
        filledTitle(next) &&
        Math.abs(next.playfieldHeight - cold.playfieldHeight) < 5 &&
        Math.abs(next.parentHeight - cold.parentHeight) < 5 &&
        Math.abs(next.styleHeight - cold.styleHeight) < 5 &&
        Math.abs(next.displayHeight - cold.displayHeight) < 5
      );
    })
    .toBe(true);
  const back = await titleBoxes(page);
  expect(filledTitle(back)).toBe(true);
  expect(Math.abs(back.playfieldHeight - cold.playfieldHeight)).toBeLessThan(5);
  expect(Math.abs(back.canvasHeight - cold.canvasHeight)).toBeLessThan(5);
  expect(Math.abs(back.styleHeight - cold.styleHeight)).toBeLessThan(5);
  expect(Math.abs(back.displayHeight - cold.displayHeight)).toBeLessThan(5);
  expect(Math.abs(back.parentHeight - cold.parentHeight)).toBeLessThan(5);
  expect(back.playfieldHeight).toBeGreaterThan(inGame.playfieldHeight + 40);
  expect(back.parentHeight).toBeGreaterThan(inGame.parentHeight + 40);
  expect(back.styleHeight).toBeGreaterThan(inGame.styleHeight + 40);
  await expect(screen.getByText("A LITTLE COURAGE. A BIG MUSTACHE.")).toBeVisible();
  await expect(
    screen.getByRole("heading", { name: "Super Goomba Bros" }),
  ).toBeVisible();
  await expect(screen.getByRole("button", { name: "START GAME" })).toBeVisible();
});

test("play keeps the journey label and world intro after the title omits them", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  const screen = page.getByRole("region", { name: "Title screen" });
  await expect(screen).toBeVisible();
  await expect(screen).not.toContainText("THE GREAT ESCAPE");
  await expect(screen).not.toContainText("WORLD 1");
  await page.getByRole("button", { name: "START GAME" }).click();
  const intro = page.getByRole("region", { name: "World intro" });
  await expect(intro.getByText("WORLD 1-1")).toBeVisible();
  await skipIntro(page);
  await expect(page.locator(".journey")).toContainText("THE GREAT ESCAPE");
  await expect(page.locator(".smb-hud")).toContainText("WORLD");
  await expect(page.getByTestId("world")).toHaveText("1-1");
});
