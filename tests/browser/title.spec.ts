import {
  test,
  expect,
  type Page,
  skipIntro,
  waitForStart,
} from "./skip-intro.ts";

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

type TitleTypeRow = {
  name: string;
  fontFamily: string;
  fontSize: number;
  top: number;
  left: number;
  bottom: number;
  right: number;
};

async function waitForTitleFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await document.fonts.load('16px "Press Start 2P"');
    await document.fonts.load('56px "Press Start 2P"');
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect
    .poll(() =>
      page
        .locator(".title-screen h1")
        .evaluate((el) => getComputedStyle(el).fontFamily),
    )
    .toMatch(/Press Start 2P/);
}

async function readTitleType(page: Page) {
  const headerBottom = await page.locator(".topbar").evaluate((el) => {
    return el.getBoundingClientRect().bottom;
  });
  const viewport = page.viewportSize()!;
  const rows: TitleTypeRow[] = [];
  for (const [name, selector] of surfaces) {
    const loc = page.locator(selector);
    await expect(loc, name).toBeVisible({ timeout: 10000 });
    await expect(loc, name).toBeInViewport({ timeout: 10000 });
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
    rows.push({ name, ...metrics });
  }
  return { headerBottom, viewport, rows };
}

function assertTitleTypeMatrix(
  metrics: Awaited<ReturnType<typeof readTitleType>>,
) {
  for (const row of metrics.rows) {
    expect(row.fontFamily, row.name).toMatch(/Press Start 2P/);
    expect(row.fontSize, row.name).toBeGreaterThanOrEqual(16);
    expect(row.fontSize % 8, row.name).toBe(0);
    expect(row.top, row.name).toBeGreaterThanOrEqual(metrics.headerBottom);
    expect(row.left, row.name).toBeGreaterThanOrEqual(0);
    expect(row.bottom, row.name).toBeLessThanOrEqual(metrics.viewport.height);
    expect(row.right, row.name).toBeLessThanOrEqual(metrics.viewport.width);
  }
}

function assertTitleTypeMatches(
  actual: Awaited<ReturnType<typeof readTitleType>>,
  expected: Awaited<ReturnType<typeof readTitleType>>,
) {
  assertTitleTypeMatrix(actual);
  expect(actual.rows).toHaveLength(expected.rows.length);
  for (let i = 0; i < expected.rows.length; i++) {
    const cold = expected.rows[i]!;
    const back = actual.rows[i]!;
    expect(back.name, cold.name).toBe(cold.name);
    expect(back.fontFamily, back.name).toBe(cold.fontFamily);
    expect(back.fontSize, back.name).toBe(cold.fontSize);
    expect(Math.abs(back.top - cold.top), back.name).toBeLessThan(2);
    expect(Math.abs(back.left - cold.left), back.name).toBeLessThan(2);
    expect(Math.abs(back.bottom - cold.bottom), back.name).toBeLessThan(2);
    expect(Math.abs(back.right - cold.right), back.name).toBeLessThan(2);
  }
}

async function assertTitleCopy(page: Page) {
  const screen = page.getByRole("region", { name: "Title screen" });
  await expect(screen.getByText("A LITTLE COURAGE. A BIG MUSTACHE.")).toBeVisible();
  await expect(screen.getByRole("heading", { name: "Super Goomba Bros" })).toBeVisible();
  await expect(screen.getByRole("button", { name: "START GAME" })).toBeVisible();
  await expect(screen).not.toContainText("WORLD 1");
  await expect(screen).not.toContainText("THE GREAT ESCAPE");
  await expect(screen).not.toContainText("WORLD 1 / THE GREAT ESCAPE");
  await expect(page.getByText("WORLD 1 / THE GREAT ESCAPE")).toHaveCount(0);
}

async function assertTitleType(page: Page) {
  await page.goto("/");
  await waitForTitleFonts(page);
  await waitForStart(page);
  const screen = page.getByRole("region", { name: "Title screen" });
  await expect(screen).toBeVisible();
  await expect(page.locator("main.at-title")).toBeVisible();
  assertTitleTypeMatrix(await readTitleType(page));
  await assertTitleCopy(page);
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

test("GAME OVER returns the title playfield and type to the cold-load metrics", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await waitForTitleFonts(page);
  await waitForStart(page);
  const screen = page.getByRole("region", { name: "Title screen" });
  await expect(screen).toBeVisible();
  await expect(page.locator("main.at-title")).toBeVisible();
  await expect(page.getByRole("button", { name: "START GAME" })).toBeEnabled();
  const cold = await titleBoxes(page);
  expect(filledTitle(cold)).toBe(true);
  expect(Math.abs(cold.canvasTop - cold.playfieldTop)).toBeLessThan(5);
  const coldType = await readTitleType(page);
  assertTitleTypeMatrix(coldType);

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
  await waitForTitleFonts(page);
  assertTitleTypeMatches(await readTitleType(page), coldType);
  await assertTitleCopy(page);
});

test("play keeps the journey label and world intro after the title omits them", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await waitForStart(page);
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
