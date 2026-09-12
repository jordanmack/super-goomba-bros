import { test, expect } from "@playwright/test";
import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { TUNING as T } from "../../src/game/config";

test("all campaign stages render their tilemap and palette with Arcade bodies", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  for (const [index, level] of campaign.levels.entries()) {
    const state = await page.evaluate((index) => {
      const g = (window as any).__game,
        s = g.sim;
      g.paused = true;
      s.levelIndex = index;
      s.reset();
      s.player.areaId = s.level.main;
      s.activeRoom.place(s.player, s.activeRoom.offset + 200);
      g.renderer.render(s, 0);
      return {
        level: s.level.id,
        area: s.activeRoom.data.id,
        palette: s.activeRoom.data.palette,
        columns: g.renderer.play.tiles.tilemap.width,
        expected: s.activeRoom.data.width,
        arcade:
          s.physics.world === g.renderer.play.physics.world &&
          s.physics.world.bodies.has(s.player.body.native),
      };
    }, index);
    expect(state.level).toBe(level.id);
    expect(state.area).toBe(level.main);
    expect(state.columns).toBe(state.expected);
    expect(state.arcade).toBe(true);
    if ([0, 1, 3, 5, 8, 16, 20, 22].includes(index)) {
      await page.waitForFunction(
        (id) =>
          (window as any).__game.renderer.play.tiles.tilemap.width > 0 &&
          document.querySelector(".phase")?.textContent?.includes(id),
        level.id,
      );
      await page.screenshot({ path: `test-results/campaign-${level.id}.png` });
    }
  }
  expect(errors).toEqual([]);
  await expect(
    page.getByRole("button", { name: /^(Hide|Warn|Run)$/ }),
  ).toHaveCount(0);
});

test("next stage resets counters and preserves the complete clear cue", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await page.evaluate((required) => {
    const g = (window as any).__game;
    g.sim.npcs.slice(0, required).forEach((npc: any) => g.sim.save(npc));
    g.sim.finish();
    g.sim.finishLeft = 0.15;
  }, T.required);
  await page.getByRole("button", { name: "NEXT LEVEL" }).click();
  await expect(page.getByTestId("saved")).toContainText("00");
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.sim.level.id))
    .toBe("1-2");
  expect(
    await page.evaluate(() =>
      [...(window as any).__game.audio.effects].some(
        (sound: any) => sound.key === "clear" && sound.isPlaying,
      ),
    ),
  ).toBe(true);
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__game.audio.music), {
      timeout: 8000,
    })
    .toBe(true);
});

test("a short touch on Pipe travels to the bonus area and changes its music", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).tap();
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.marioReturn = 1e6;
    Object.assign(s.player.body.position, { x: 1856, y: 288 });
    Object.assign(s.player.body.velocity, { x: 0, y: 0 });
  });
  await page.getByRole("button", { name: "Pipe", exact: true }).tap();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__game.sim.activeRoom.data.id),
    )
    .toBe("42");
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.music?.key))
    .toBe("underground");
  expect(await page.evaluate(() => (window as any).__game.input.down)).toBe(
    false,
  );
  await page.screenshot({ path: "test-results/bonus-pipe-mobile.png" });
  await context.close();
});

test("unavailable audio decoding is reported while the game remains playable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    AudioContext.prototype.decodeAudioData = () =>
      Promise.reject(
        new DOMException("Decoder unavailable for this check", "EncodingError"),
      );
  });
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(
    page.getByRole("button", { name: "Audio unavailable" }),
  ).toBeDisabled();
  const before = await page.evaluate(
    () => (window as any).__game.sim.player.body.position.x,
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(
    (x) => (window as any).__game.sim.player.body.position.x > x + 30,
    before,
  );
  await page.keyboard.up("ArrowRight");
  const audio = await page.evaluate(() => {
    const game = (window as any).__game;
    return {
      available: game.audio.available,
      decoded: game.audio.buffers.size,
      failures: game.renderer.game.registry.get("audioFailures").length,
    };
  });
  expect(audio.available).toBe(false);
  expect(audio.decoded).toBe(0);
  expect(audio.failures).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("death and clear songs play fully in sequence without overlapping", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sim.step = () => {};
    g.audio.event("win");
    g.audio.event("marioDeath");
  });
  const majorSounds = () =>
    page.evaluate(() =>
      [...(window as any).__game.audio.effects]
        .filter(
          (s: any) => s.isPlaying && (s.key === "clear" || s.key === "death"),
        )
        .map((s: any) => s.key),
    );
  await expect.poll(majorSounds).toEqual(["clear"]);
  await expect.poll(majorSounds, { timeout: 8000 }).toEqual(["death"]);
  expect(
    await page.evaluate(() => (window as any).__game.audio.music),
  ).toBeNull();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__game.audio.music), {
      timeout: 5000,
    })
    .toBe(true);
});
