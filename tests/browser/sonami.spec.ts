import {
  test,
  expect,
  type Page,
  skipIntro,
  waitForStart,
} from "./skip-intro.ts";

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
  await waitForStart(page);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
}

async function enterSequence(page: Page, keys: readonly string[]) {
  for (const key of keys) await page.keyboard.press(key);
}

async function unlockTitle(page: Page) {
  await enterSequence(page, SEQUENCE);
}

function unlimitedButton(page: Page, on = false) {
  return page.getByRole("button", {
    name: `Unlimited power-ups ${on ? "ON" : "OFF"}`,
  });
}

test("title Konami arrows then B then A unlocks title buttons without a tray or start", async ({
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
  await unlockTitle(page);
  await expect(unlimitedButton(page)).toBeVisible();
  await expect(unlimitedButton(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Choose stage" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "START GAME" })).toBeVisible();
  await expect(page.locator("main.at-title")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.sim.mode))
    .toBe("title");
  await expect
    .poll(() => page.evaluate(() => (window as any).__audioEvents))
    .toContain("coin");
});

test("WASD does not complete the title sequence and extra keys plus a wrong key still unlock", async ({
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
  await expect(unlimitedButton(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Choose stage" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toHaveCount(
    0,
  );
  await enterSequence(page, ["x", "ArrowUp", "ArrowUp", "ArrowLeft"]);
  await expect(unlimitedButton(page)).toHaveCount(0);
  await unlockTitle(page);
  await expect(unlimitedButton(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose stage" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toHaveCount(
    0,
  );
});

test("mute still unlocks the title sequence without a coin tone", async ({
  page,
}) => {
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
  await unlockTitle(page);
  await expect(unlimitedButton(page)).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toHaveCount(
    0,
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.muted))
    .toBe(true);
});

test("unlimited power-ups on shows the tray in play and off hides it", async ({
  page,
}) => {
  await waitGame(page);
  await unlockTitle(page);
  await unlimitedButton(page).click();
  await expect(unlimitedButton(page, true)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toBeVisible();
});

test("tray click while playing hangs a blinking item in the sky", async ({
  page,
}) => {
  await waitGame(page);
  await unlockTitle(page);
  await unlimitedButton(page).click();
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
  await unlockTitle(page);
  await unlimitedButton(page).click();
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

test("unlock and title clicks do not spawn items", async ({ page }) => {
  await waitGame(page);
  await unlockTitle(page);
  await unlimitedButton(page).click();
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() => {
      const s = (window as any).__game.sim;
      return { mode: s.mode, items: s.items.length };
    }),
  ).toEqual({ mode: "title", items: 0 });
});

test("reload clears unlock, toggle, and a half-finished world pick", async ({
  page,
}) => {
  await waitGame(page);
  await unlockTitle(page);
  await unlimitedButton(page).click();
  await page.getByRole("button", { name: "Choose stage" }).click();
  await page.getByRole("button", { name: "World 4" }).click();
  await expect(page.getByText("Choose the stage")).toBeVisible();
  await page.reload();
  await waitForStart(page);
  await expect(unlimitedButton(page)).toHaveCount(0);
  await expect(unlimitedButton(page, true)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Choose stage" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "World 4" })).toHaveCount(0);
  await expect(page.getByText("Choose the stage")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Power-up tray" })).toHaveCount(
    0,
  );
});

test("choose stage starts that WORLD n-n intro without Start Game", async ({
  page,
}) => {
  await waitGame(page);
  await unlockTitle(page);
  await page.getByRole("button", { name: "Choose stage" }).click();
  await expect(page.getByText("Select world")).toBeVisible();
  await expect(page.getByRole("button", { name: "START GAME" })).toHaveCount(0);
  await page.getByRole("button", { name: "World 3" }).click();
  await expect(page.getByText("Choose the stage")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByText("Select world")).toBeVisible();
  await page.getByRole("button", { name: "World 3" }).click();
  await page.getByRole("button", { name: "Stage 1" }).click();
  const intro = page.getByRole("region", { name: "World intro" });
  await expect(intro.getByText("WORLD 3-1")).toBeVisible();
  await expect(page.getByTestId("lives")).toHaveText("× 03");
  await expect(page.locator("main.at-title")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.sim.level.id))
    .toBe("3-1");
});

test("unlocked title buttons and the stage picker fit short landscape", async ({
  page,
}) => {
  for (const viewport of [
    { width: 568, height: 360 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    await waitGame(page);
    await unlockTitle(page);
    await expect(unlimitedButton(page)).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Choose stage" }),
    ).toBeInViewport();
    await page.getByRole("button", { name: "Choose stage" }).click();
    await expect(page.getByRole("button", { name: "World 1" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "World 8" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Back" })).toBeInViewport();
    await page.getByRole("button", { name: "World 8" }).click();
    await expect(page.getByRole("button", { name: "Stage 1" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Stage 4" })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Back" })).toBeInViewport();
  }
});

test("picking a pipe-intro stage still plays the overworld strip", async ({
  page,
}) => {
  await waitGame(page);
  await unlockTitle(page);
  await page.getByRole("button", { name: "Choose stage" }).click();
  await page.getByRole("button", { name: "World 1" }).click();
  await page.getByRole("button", { name: "Stage 2" }).click();
  await expect(
    page.getByRole("region", { name: "World intro" }).getByText("WORLD 1-2"),
  ).toBeVisible();
  await skipIntro(page);
  expect(
    await page.evaluate(() => {
      const s = (window as any).__game.sim;
      return {
        id: s.level.id,
        mode: s.mode,
        pipeIntro: s.pipeIntro,
        area: s.player.areaId,
        lives: s.lives,
      };
    }),
  ).toEqual({
    id: "1-2",
    mode: "playing",
    pipeIntro: true,
    area: "29",
    lives: 3,
  });
});
