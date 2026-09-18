import { test, expect, type Page } from "@playwright/test";
import { skipIntro } from "./skip-intro.ts";

test.use({
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
});

type Point = { id: number; x: number; y: number };
const pageErrors = new WeakMap<Page, string[]>();

async function point(page: Page, name: string, id: number): Promise<Point> {
  const box = (await page
    .getByRole("button", { name, exact: true })
    .boundingBox())!;
  return { id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Synthetic touch lists test recovery paths consistently in Chromium and WebKit.
// Real device gestures still require iPhone testing.
async function touch(
  page: Page,
  type: string,
  active: Point[],
  changed = active,
) {
  await page.evaluate(
    ({ type, active, changed }) => {
      const targets: Map<number, Element> = ((window as any).__touchTargets ??=
        new Map());
      if (type === "touchstart")
        for (const p of changed)
          targets.set(p.id, document.elementFromPoint(p.x, p.y)!);
      const list = (points: typeof active) =>
        points.map((p) => ({
          identifier: p.id,
          clientX: p.x,
          clientY: p.y,
          pageX: p.x,
          pageY: p.y,
          target: targets.get(p.id),
        }));
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: list(active) },
        changedTouches: { value: list(changed) },
      });
      const target =
        type === "touchstart" ? targets.get(changed[0].id)! : document;
      target.dispatchEvent(event);
    },
    { type, active, changed },
  );
}

async function input(
  page: Page,
  expected: Partial<Record<"left" | "right" | "jump" | "fire" | "run", boolean>>,
) {
  expect(
    await page.evaluate(() => {
      const { left, right, jump, fire, run } = (window as any).__game.input;
      return { left, right, jump, fire, run };
    }),
  ).toEqual({
    left: false,
    right: false,
    jump: false,
    fire: false,
    run: false,
    ...expected,
  });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).tap();
  await skipIntro(page);
  await page.evaluate(() => {
    (window as any).__game.sim.marioReturn = 1e6;
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test("native touch guard blocks gameplay gestures while menu taps still work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.evaluate(() => {
    (window as any).__guard = [];
    document.addEventListener("touchstart", (event) => {
      (window as any).__guard.push({
        control: !!(event.target as Element).closest(".controls"),
        prevented: event.defaultPrevented,
      });
    });
  });
  const right = await point(page, "Right", 1);
  await page.touchscreen.tap(right.x, right.y);
  await page.touchscreen.tap(right.x, right.y);
  await input(page, {});
  await page.getByRole("button", { name: "Pause", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  const events = await page.evaluate(() => (window as any).__guard);
  expect(events.filter((event: any) => event.control)).toEqual([
    { control: true, prevented: true },
    { control: true, prevented: true },
  ]);
  expect(events.at(-1)).toEqual({ control: false, prevented: false });
  await page.getByRole("button", { name: "RESUME", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeHidden();
  expect(errors).toEqual([]);
});

test("a held finger slides between directions and outside while another holds Jump", async ({
  page,
}) => {
  const right = await point(page, "Right", 1);
  const left = await point(page, "Left", 1);
  const jump = await point(page, "A", 2);
  await touch(page, "touchstart", [right, jump]);
  await input(page, { right: true, jump: true });
  await touch(page, "touchmove", [left, jump], [left]);
  await input(page, { left: true, jump: true });
  await expect(page.locator('[data-control="left"]')).toHaveAttribute(
    "data-pressed",
    "",
  );
  await expect(page.locator('[data-control="right"]')).not.toHaveAttribute(
    "data-pressed",
  );
  const outside = { id: 1, x: 400, y: 160 };
  await touch(page, "touchmove", [outside, jump], [outside]);
  await input(page, { jump: true });
  await touch(page, "touchend", [outside], [jump]);
  await input(page, {});
  await touch(page, "touchmove", [left]);
  await input(page, { left: true });
  await touch(page, "touchend", [], [left]);
  await input(page, {});
});

test("two fingers and a keyboard key can hold one action without releasing each other", async ({
  page,
}) => {
  const one = await point(page, "Right", 1);
  const two = { ...one, id: 2, x: one.x + 8 };
  await touch(page, "touchstart", [one]);
  await touch(page, "touchstart", [one, two], [two]);
  await page.keyboard.down("ArrowRight");
  await touch(page, "touchend", [two], [one]);
  await input(page, { right: true });
  await touch(page, "touchend", [], [two]);
  await input(page, { right: true });
  await touch(page, "touchstart", [one]);
  await page.keyboard.up("ArrowRight");
  await input(page, { right: true });
  // A companion PointerEvent must not clear the TouchEvent-owned hold.
  await page.evaluate(() =>
    document.dispatchEvent(
      new PointerEvent("pointercancel", {
        bubbles: true,
        pointerType: "touch",
        pointerId: 1,
      }),
    ),
  );
  await input(page, { right: true });
  await touch(page, "touchend", [], [one]);
  await input(page, {});
});

test("touch cancellation and a later live touch list clear abandoned holds", async ({
  page,
}) => {
  const right = await point(page, "Right", 1);
  const jump = await point(page, "A", 2);
  await touch(page, "touchstart", [right, jump]);
  await touch(page, "touchcancel", [jump], [right]);
  await input(page, { jump: true });
  await touch(page, "touchcancel", [], [jump]);
  await input(page, {});
  await touch(page, "touchstart", [right]);
  // Simulate a missed end: the next event contains only the new finger.
  await touch(page, "touchstart", [jump]);
  await input(page, { jump: true });
  await touch(page, "touchend", [], [jump]);
  await input(page, {});
});

test("interruptions clear holds and do not restore them on finger motion or key repeat", async ({
  page,
}) => {
  for (const kind of [
    "blur",
    "pagehide",
    "orientationchange",
    "visibilitychange",
    "contextmenu",
  ]) {
    const right = await point(page, "Right", 1);
    await touch(page, "touchstart", [right]);
    await page.keyboard.down("ArrowLeft");
    await input(page, { left: true, right: true });
    await page.evaluate((kind) => {
      if (kind === "visibilitychange") {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: true,
        });
        document.dispatchEvent(new Event(kind));
        delete (document as any).hidden;
      } else if (kind === "contextmenu") {
        document
          .querySelector('[data-control="right"]')!
          .dispatchEvent(new Event(kind, { bubbles: true, cancelable: true }));
      } else window.dispatchEvent(new Event(kind));
    }, kind);
    await input(page, {});
    expect(await page.evaluate(() => (window as any).__game.pulses)).toEqual(
      {},
    );
    if (kind !== "contextmenu")
      await page.getByRole("button", { name: "RESUME", exact: true }).tap();
    await touch(page, "touchmove", [right]);
    await page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "ArrowLeft",
          repeat: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await input(page, {});
    await touch(page, "touchend", [], [right]);
    await page.keyboard.up("ArrowLeft");
  }
});

test("pause, restart, and automatic death reset require fresh presses", async ({
  page,
}) => {
  let right = await point(page, "Right", 1);
  await touch(page, "touchstart", [right]);
  await page.getByRole("button", { name: "Pause", exact: true }).tap();
  await input(page, {});
  // Space must still activate a focused menu button.
  await page.getByRole("button", { name: "RESUME", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeHidden();
  await touch(page, "touchmove", [right]);
  await input(page, {});
  await touch(page, "touchend", [], [right]);
  await touch(page, "touchstart", [right]);
  await page.getByRole("button", { name: "Pause", exact: true }).tap();
  await page.getByRole("button", { name: "RESTART LEVEL", exact: true }).tap();
  await skipIntro(page);
  await input(page, {});
  await touch(page, "touchend", [], [right]);
  right = await point(page, "Right", 1);
  await touch(page, "touchstart", [right]);
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.kill(s.player, false);
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = (window as any).__game;
        const { left, right, jump, fire } = g.input;
        return { mode: g.sim.mode, left, right, jump, fire };
      }),
    )
    .toEqual({
      mode: "dead",
      left: false,
      right: false,
      jump: false,
      fire: false,
    });
  await expect(page.getByRole("heading", { name: "STOMPED!" })).toHaveCount(0);
  await touch(page, "touchend", [], [right]);
  await touch(page, "touchstart", [right]);
  await input(page, {});
  await page.waitForFunction(() => {
    const mode = (window as any).__game.sim.mode;
    return mode === "intro" || mode === "playing";
  });
  await skipIntro(page);
  await page.waitForFunction(
    () => (window as any).__game.sim.mode === "playing",
  );
  await expect(page.locator(".play-footer")).toBeVisible();
  right = await point(page, "Right", 1);
  await touch(page, "touchmove", [right]);
  await input(page, {});
  await touch(page, "touchend", [], [right]);
  await touch(page, "touchstart", [right]);
  await input(page, { right: true });
  await touch(page, "touchend", [], [right]);
});

test("mouse dragging switches controls and capture loss clears the action", async ({
  page,
}) => {
  await page.evaluate(() =>
    document.addEventListener("pointerdown", (event) => {
      (window as any).__mouseId = event.pointerId;
    }),
  );
  const right = await point(page, "Right", 1);
  const left = await point(page, "Left", 1);
  await page.mouse.move(right.x, right.y);
  await page.mouse.down();
  await input(page, { right: true });
  await page.mouse.move(left.x, left.y);
  await input(page, { left: true });
  await page.mouse.move(400, 160);
  await input(page, {});
  await page.mouse.move(right.x, right.y);
  await input(page, { right: true });
  await page.evaluate(() =>
    document
      .querySelector(".game")!
      .releasePointerCapture((window as any).__mouseId),
  );
  // A move delivers the pending lostpointercapture event.
  await page.mouse.move(right.x + 1, right.y);
  await input(page, {});
  await page.mouse.up();
  await input(page, {});
});

test("Space still jumps after clicking or focusing a gameplay control", async ({
  page,
}) => {
  const right = await point(page, "Right", 1);
  await page.mouse.click(right.x, right.y);
  await page.keyboard.down("Space");
  await input(page, { jump: true });
  await page.keyboard.up("Space");
  await page.getByRole("button", { name: "A", exact: true }).focus();
  await page.keyboard.down("Space");
  await input(page, { jump: true });
  await page.keyboard.up("Space");
  await input(page, {});
});

test("header pad button cycles compact, NES, and hidden without covering the world", async ({
  page,
}) => {
  const world = page.locator(".world");
  const footer = page.locator(".play-footer");
  const belowWorld = async () => {
    const worldBox = await world.boundingBox();
    const footerBox = await footer.boundingBox();
    if (!worldBox || !footerBox) return false;
    return footerBox.y >= worldBox.y + worldBox.height - 1;
  };
  await expect.poll(belowWorld).toBe(true);
  const compactHeight = (await world.boundingBox())!.height;
  await page.getByRole("button", { name: "Pause", exact: true }).tap();
  await expect(page.getByRole("button", { name: /CONTROLS:/ })).toHaveCount(0);
  await page.getByRole("button", { name: "RESUME", exact: true }).tap();
  await page.getByRole("button", { name: "Compact pad" }).tap();
  await expect(page.locator(".nes-pad-art")).toBeVisible();
  await expect.poll(belowWorld).toBe(true);
  await page.getByRole("button", { name: "NES pad" }).tap();
  await expect(footer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "A", exact: true })).toHaveCount(
    0,
  );
  const hiddenWorld = (await world.boundingBox())!;
  expect(hiddenWorld.height).toBeGreaterThan(compactHeight);
  await page.getByRole("button", { name: "Pad hidden" }).tap();
  await expect(page.getByRole("button", { name: "Compact pad" })).toBeVisible();
  await expect(footer).toBeVisible();
});

test("compact D-pad shows only arrow icons and keeps aria-labels", async ({
  page,
}) => {
  await expect(page.locator(".nes-pad-art")).toHaveCount(0);
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const name of ["Up", "Down", "Left", "Right"]) {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      await expect(button).toHaveAttribute("aria-label", name);
      await expect(button.locator("svg")).toBeVisible();
      expect((await button.innerText()).trim()).toBe("");
    }
    await expect(page.getByRole("button", { name: "A", exact: true })).toHaveText(
      "A",
    );
    await expect(page.getByRole("button", { name: "B", exact: true })).toHaveText(
      "B",
    );
  }
});

test("compact pad is the default and maps Up to jump and B to run", async ({
  page,
}) => {
  for (const name of ["Up", "Down", "Left", "Right", "B", "A"])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(page.locator(".nes-pad-art")).toHaveCount(0);
  const up = await point(page, "Up", 1);
  await touch(page, "touchstart", [up]);
  await input(page, { jump: true });
  await touch(page, "touchend", [], [up]);
  const b = await point(page, "B", 1);
  await touch(page, "touchstart", [b]);
  await input(page, { run: true });
  await touch(page, "touchend", [], [b]);
  await page.keyboard.down("ShiftLeft");
  await input(page, { run: true });
  await page.keyboard.up("ShiftLeft");
  await page.keyboard.down("KeyZ");
  await input(page, { run: true });
  await page.keyboard.up("KeyZ");
  await page.keyboard.down("KeyJ");
  await input(page, { run: true });
  await page.keyboard.up("KeyJ");
  await page.keyboard.down("KeyK");
  await input(page, { jump: true });
  await page.keyboard.up("KeyK");
  await input(page, {});
});

test("header pad button switches to the NES pad where Start pauses and Up does not jump", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Compact pad" }).tap();
  await expect(page.locator(".nes-pad-art")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: "Select", exact: true })).toBeAttached();
  const startBox = await page.getByRole("button", { name: "Start", exact: true }).boundingBox();
  expect(startBox).toBeTruthy();
  expect(startBox!.width).toBeGreaterThan(8);
  expect(startBox!.height).toBeGreaterThan(8);
  const up = await point(page, "Up", 1);
  await touch(page, "touchstart", [up]);
  await input(page, {});
  await touch(page, "touchend", [], [up]);
  const a = await point(page, "A", 1);
  await touch(page, "touchstart", [a]);
  await input(page, { jump: true });
  await touch(page, "touchend", [], [a]);
  const select = await point(page, "Select", 1);
  await touch(page, "touchstart", [select]);
  await input(page, {});
  await touch(page, "touchend", [], [select]);
  const start = await point(page, "Start", 1);
  await touch(page, "touchstart", [start]);
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  await input(page, {});
});

test("NES Start with other holds still clears input and pulses", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Compact pad" }).tap();
  const right = await point(page, "Right", 1);
  const b = await point(page, "B", 2);
  const start = await point(page, "Start", 3);
  await touch(page, "touchstart", [right, b]);
  await input(page, { right: true, run: true });
  await touch(page, "touchstart", [right, b, start], [start]);
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  await input(page, {});
  expect(await page.evaluate(() => (window as any).__game.pulses)).toEqual({});
});
