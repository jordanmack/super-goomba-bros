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
  await expect(page.locator(".phase")).toContainText("WORLD 1-1");
});
