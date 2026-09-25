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

test("U changes the highlighted tray item and I drops it, once per press", async ({
  page,
}) => {
  await waitGame(page);
  await page.getByRole("button", { name: "Key bindings" }).click();
  const dialog = page.getByRole("dialog", { name: "KEY BINDINGS" });
  await expect(dialog.getByText("Change power-up")).toHaveCount(0);
  await expect(dialog.getByText("Drop power-up")).toHaveCount(0);
  await page.getByRole("button", { name: "CLOSE" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await unlockTitle(page);
  await page.getByRole("button", { name: "Key bindings" }).click();
  await expect(dialog.getByText("Change power-up")).toHaveCount(0);
  await page.getByRole("button", { name: "CLOSE" }).click();
  await unlimitedButton(page).click();
  await page.getByRole("button", { name: "Key bindings" }).click();
  const keyRow = (name: string) =>
    dialog.locator(".bindings > div", {
      has: page.locator("dt", { hasText: name }),
    });
  await expect(keyRow("Change power-up").locator("dd")).toHaveText("U");
  await expect(keyRow("Drop power-up").locator("dd")).toHaveText("I");
  await expect(
    dialog.getByRole("button", { name: /Change power-up/ }),
  ).toContainText("X (West)");
  await expect(
    dialog.getByRole("button", { name: /Drop power-up/ }),
  ).toContainText("Y (North)");
  await page.getByRole("button", { name: "CLOSE" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sim.marioReturn = 1e6;
    (window as any).__audioEvents = [];
    const original = g.audio.event.bind(g.audio);
    g.audio.event = (event: string) => {
      (window as any).__audioEvents.push(event);
      original(event);
    };
  });
  const tray = page.getByRole("toolbar", { name: "Power-up tray" });
  const current = tray.locator('[aria-current="true"]');
  const order = await tray
    .getByRole("button")
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
  expect(order).toEqual(["2x", "3x", "8x", "Flower", "Star", "1-up"]);
  await expect(tray).toBeVisible();
  await expect(current).toHaveCount(0);

  const items = () =>
    page.evaluate(() =>
      (window as any).__game.sim.items.map((item: any) => ({
        kind: item.kind,
        drop: item.drop,
        hold: item.hold > 0,
      })),
    );
  const count = async () => (await items()).length;
  // With no highlight, Drop does nothing.
  const opened = await count();
  await page.keyboard.press("KeyI");
  await page.keyboard.press("KeyI");
  expect(await count()).toBe(opened);
  await expect(current).toHaveCount(0);

  await page.keyboard.press("KeyU");
  await expect(current).toHaveAttribute("aria-label", "2x");
  // A held key repeats keydown; only the first press counts.
  await page.keyboard.down("KeyU");
  await page.keyboard.down("KeyU");
  await page.keyboard.down("KeyU");
  await page.keyboard.up("KeyU");
  await expect(current).toHaveAttribute("aria-label", "3x");
  for (const label of ["8x", "Flower", "Star", "1-up", "2x"]) {
    await page.keyboard.press("KeyU");
    await expect(current).toHaveAttribute("aria-label", label);
  }
  await expect(current).toHaveCSS("border-top-color", "rgb(230, 85, 75)");
  await expect(current).toHaveCSS(
    "box-shadow",
    "rgb(230, 85, 75) 0px 0px 0px 3px",
  );

  const before = (await items()).length;
  await page.keyboard.down("KeyI");
  await page.keyboard.down("KeyI");
  await page.keyboard.up("KeyI");
  const dropped = (await items()).slice(before);
  expect(dropped).toEqual([{ kind: "mushroom", drop: true, hold: true }]);
  await expect
    .poll(() => page.evaluate(() => (window as any).__audioEvents))
    .toContain("appear");
  await expect(current).toHaveAttribute("aria-label", "2x");

  // A click still drops its own item and leaves the highlight alone.
  await page.getByRole("button", { name: "Flower", exact: true }).click();
  const clicked = (await items()).slice(before + 1);
  expect(clicked.map((item: { kind: string }) => item.kind)).toEqual([
    "flower",
  ]);
  await expect(current).toHaveAttribute("aria-label", "2x");
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

  const settled = await count();
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.paused))
    .toBe(true);
  await page.keyboard.press("KeyU");
  await page.keyboard.press("KeyI");
  await expect(current).toHaveAttribute("aria-label", "2x");
  expect(await count()).toBe(settled);
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.paused))
    .toBe(false);

  await page.getByRole("button", { name: "Key bindings" }).click();
  await page.keyboard.press("KeyU");
  await page.keyboard.press("KeyI");
  await page.getByRole("button", { name: "CLOSE" }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await expect(current).toHaveAttribute("aria-label", "2x");
  expect(await count()).toBe(settled);

  await page.evaluate(() => {
    (window as any).__game.sim.playerInPipe = () => true;
  });
  await page.keyboard.press("KeyU");
  await page.keyboard.press("KeyI");
  await expect(current).toHaveAttribute("aria-label", "2x");
  expect(await count()).toBe(settled);
  await page.evaluate(() => {
    delete (window as any).__game.sim.playerInPipe;
  });

  // Back to the title and in again: the tray opens with no highlight.
  await page.evaluate(() => (window as any).__game.sim.reset("title"));
  await expect(tray).toHaveCount(0);
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await expect(tray).toBeVisible();
  await expect(current).toHaveCount(0);
  const restarted = await count();
  await page.keyboard.press("KeyI");
  expect(await count()).toBe(restarted);
  // A click drops its item and does not start a highlight.
  await page.getByRole("button", { name: "Star", exact: true }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  expect(
    (await items()).slice(restarted).map((item: { kind: string }) => item.kind),
  ).toEqual(["star"]);
  await expect(current).toHaveCount(0);
  await page.keyboard.press("KeyU");
  await expect(current).toHaveAttribute("aria-label", "2x");
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

test("unlocked title buttons drop 48px under Start Game where they fit", async ({
  page,
}) => {
  for (const { width, height, gap, pair } of [
    { width: 1280, height: 720, gap: 48, pair: 10 },
    { width: 1600, height: 900, gap: 48, pair: 10 },
    { width: 1280, height: 560, gap: 16, pair: 10 },
    { width: 1600, height: 640, gap: 16, pair: 10 },
    { width: 320, height: 568, gap: 8, pair: 6 },
  ]) {
    const size = `${width}x${height}`;
    await page.setViewportSize({ width, height });
    await waitGame(page);
    const start = page.getByRole("button", { name: "START GAME" });
    const choose = page.getByRole("button", { name: "Choose stage" });
    const before = (await start.boundingBox())!;
    await unlockTitle(page);
    await expect(unlimitedButton(page), size).toBeInViewport({ ratio: 1 });
    await expect(choose, size).toBeInViewport({ ratio: 1 });
    const after = (await start.boundingBox())!;
    const unlimitedBox = (await unlimitedButton(page).boundingBox())!;
    const chooseBox = (await choose.boundingBox())!;
    expect(after.y, size).toBeCloseTo(before.y, 0);
    expect(unlimitedBox.y - (after.y + after.height), size).toBeCloseTo(gap, 0);
    expect(chooseBox.y - (unlimitedBox.y + unlimitedBox.height), size).toBeCloseTo(
      pair,
      0,
    );
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
