import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { test, expect, skipIntro } from "./skip-intro.ts";

// ionice can miss Playwright's 30s waitForFunction and test defaults.
const SCREENSHOT_WAIT_MS = 90_000;

test("all campaign stages render their tilemap and palette with Arcade bodies", async ({
  page,
}) => {
  test.setTimeout(SCREENSHOT_WAIT_MS);
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
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
          document.querySelector('[data-testid="world"]')?.textContent === id,
        level.id,
        { timeout: SCREENSHOT_WAIT_MS },
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
  await skipIntro(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sim.timeLeft = 0;
    g.sim.finish();
  });
  await expect(page.locator(".finish-banner")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "NEXT LEVEL" })).toHaveCount(0);
  await page.waitForFunction(() => {
    const s = (window as any).__game.sim;
    if (s.mode === "finishing") s.tallyHold = 0;
    return s.level.id === "1-2" || s.mode === "intro";
  });
  // 1-2 spawn-stomp races the remaining clear cue at full sim speed.
  await page.evaluate(() => {
    (window as any).__game.sim.marioReturn = 1e6;
  });
  await expect(page.getByTestId("world")).toHaveText("1-2");
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

test("Pause and Mute still work during the 1-2 scripted pipe strip", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sim.marioReturn = 1e6;
    g.sim.nextLevel();
  });
  await skipIntro(page);
  await page.waitForFunction(() => {
    const s = (window as any).__game?.sim;
    return s?.level?.id === "1-2" && s.mode === "playing" && s.pipeIntro;
  });
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mute", exact: true }),
  ).toBeVisible();
  const before = await page.evaluate(() => {
    const s = (window as any).__game.sim;
    return {
      area: s.player.areaId,
      x: s.player.body.position.x,
      elapsed: s.elapsed,
    };
  });
  expect(before.area).toBe("29");
  expect(before.elapsed).toBe(0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.paused))
    .toBe(true);
  const pausedX = await page.evaluate(
    () => (window as any).__game.sim.player.body.position.x,
  );
  await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));
  expect(
    await page.evaluate(() => (window as any).__game.sim.player.body.position.x),
  ).toBe(pausedX);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.muted))
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Unmute", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Unmute", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.muted))
    .toBe(false);
  const during = await page.evaluate(() => {
    const g = (window as any).__game;
    const s = g.sim;
    return {
      paused: g.paused,
      pipeIntro: s.pipeIntro,
      elapsed: s.elapsed,
      area: s.player.areaId,
      x: s.player.body.position.x,
    };
  });
  expect(during.paused).toBe(true);
  expect(during.pipeIntro).toBe(true);
  expect(during.elapsed).toBe(0);
  expect(during.area).toBe("29");
  expect(during.x).toBe(pausedX);
  await page.getByRole("button", { name: "RESUME", exact: true }).click();
  await expect(page.getByRole("heading", { name: "PAUSED" })).toBeHidden();
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
  await skipIntro(page);
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.marioReturn = 1e6;
    Object.assign(s.player.body.position, { x: 1856, y: 288 });
    Object.assign(s.player.body.velocity, { x: 0, y: 0 });
  });
  await page.getByRole("button", { name: "Down", exact: true }).tap();
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
  await skipIntro(page);
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
  await skipIntro(page);
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

test("start shows a silent world intro, and 0 lives shows game over then title", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  const intro = page.getByRole("region", { name: "World intro" });
  await expect(intro).toBeVisible();
  await expect(intro).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(intro.getByText("WORLD 1-1")).toBeVisible();
  await expect(intro.locator(".intro-lives")).toContainText("× 03");
  await expect(page.getByTestId("lives")).toContainText("03");
  expect(
    await page.evaluate(() => (window as any).__game.audio.music),
  ).toBeNull();
  await page.waitForFunction(
    () => (window as any).__game.sim.mode === "playing",
  );
  await expect(intro).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__game.audio.music))
    .toBe(true);
  await page.evaluate(() => {
    const s = (window as any).__game.sim;
    s.lives = 1;
    s.kill(s.player, false);
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.sim.mode))
    .toBe("dead");
  await expect(page.getByRole("heading", { name: "STOMPED!" })).toHaveCount(0);
  const gameOver = page.getByRole("region", { name: "Game over" });
  await expect(gameOver).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("heading", { name: "GAME OVER" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...(window as any).__game.audio.effects].some(
          (sound: any) => sound.key === "gameover" && sound.isPlaying,
        ),
      ),
    )
    .toBe(true);
  await expect(page.getByRole("region", { name: "Title screen" })).toBeVisible({
    timeout: 8000,
  });
});

const introViewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 720 },
] as const;

function playfieldScale(height: number) {
  return height / 540;
}

for (const viewport of introViewports) {
  test(`WORLD intro and GAME OVER scale with the playfield at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "START GAME" }).click();
    const intro = page.getByRole("region", { name: "World intro" });
    await expect(intro).toBeVisible();
    await page.evaluate(() => {
      const s = (window as any).__game.sim;
      s.introLeft = 1e6;
    });
    await expect(page.getByTestId("lives")).toContainText("03");
    await expect(page.getByTestId("lives")).toHaveText(/×\s*03/);
    await page.evaluate(async () => {
      await document.fonts.ready;
      const img = document.querySelector(".intro-lives img");
      if (img instanceof HTMLImageElement && !img.complete)
        await img.decode().catch(() => {});
    });
    const introMetrics = await page.evaluate(() => {
      const playfield = document.querySelector(".playfield")!;
      const canvas = document.querySelector(".world canvas")!;
      const world = document.querySelector(".intro-world")!;
      const lives = document.querySelector(".intro-lives")!;
      const img = lives.querySelector("img")!;
      const play = playfield.getBoundingClientRect();
      const canvasBox = canvas.getBoundingClientRect();
      const worldBox = world.getBoundingClientRect();
      const livesBox = lives.getBoundingClientRect();
      const imgBox = img.getBoundingClientRect();
      return {
        playHeight: play.height,
        canvasHeight: canvasBox.height,
        worldFont: parseFloat(getComputedStyle(world).fontSize),
        livesFont: parseFloat(getComputedStyle(lives).fontSize),
        imgWidth: imgBox.width,
        imgHeight: imgBox.height,
        imgRendering: getComputedStyle(img).imageRendering,
        worldLeft: worldBox.left,
        worldRight: worldBox.right,
        livesLeft: livesBox.left,
        livesRight: livesBox.right,
        worldOverflow: world.scrollWidth - world.clientWidth,
        livesOverflow: lives.scrollWidth - lives.clientWidth,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });
    expect(introMetrics.playHeight).toBeCloseTo(
      introMetrics.viewportHeight,
      0,
    );
    const scale = playfieldScale(introMetrics.viewportHeight);
    expect(introMetrics.worldFont).toBe(Math.round(16 * scale));
    expect(introMetrics.livesFont).toBe(Math.round(16 * scale));
    expect(introMetrics.imgWidth).toBe(Math.round(32 * scale));
    expect(introMetrics.imgHeight).toBe(Math.round(32 * scale));
    expect(
      Math.abs(
        introMetrics.imgWidth - (32 * introMetrics.canvasHeight) / 540,
      ),
    ).toBeLessThan(1);
    expect(introMetrics.imgRendering).toMatch(/pixelated|crisp-edges/);
    expect(introMetrics.worldLeft).toBeGreaterThanOrEqual(0);
    expect(introMetrics.worldRight).toBeLessThanOrEqual(
      introMetrics.viewportWidth,
    );
    expect(introMetrics.livesLeft).toBeGreaterThanOrEqual(0);
    expect(introMetrics.livesRight).toBeLessThanOrEqual(
      introMetrics.viewportWidth,
    );
    expect(introMetrics.worldOverflow).toBeLessThanOrEqual(0);
    expect(introMetrics.livesOverflow).toBeLessThanOrEqual(0);
    expect(introMetrics.worldFont).not.toBe(16);
    expect(introMetrics.worldFont).not.toBe(10);

    await page.evaluate(() => {
      const s = (window as any).__game.sim;
      s.mode = "gameover";
      s.gameoverLeft = 1e6;
    });
    const gameOver = page.getByRole("region", { name: "Game over" });
    await expect(gameOver).toBeVisible();
    const overMetrics = await page.evaluate(() => {
      const playfield = document.querySelector(".playfield")!;
      const heading = document.querySelector(
        ".overlay.interstitial-overlay h2",
      )!;
      const play = playfield.getBoundingClientRect();
      const box = heading.getBoundingClientRect();
      return {
        playHeight: play.height,
        font: parseFloat(getComputedStyle(heading).fontSize),
        left: box.left,
        right: box.right,
        overflow: heading.scrollWidth - heading.clientWidth,
        viewportWidth: window.innerWidth,
      };
    });
    const overScale = playfieldScale(overMetrics.playHeight);
    const widthCap = (overMetrics.viewportWidth * 9) / 100;
    expect(overMetrics.font).toBe(
      Math.round(Math.min(24 * overScale, widthCap)),
    );
    expect(overMetrics.left).toBeGreaterThanOrEqual(0);
    expect(overMetrics.right).toBeLessThanOrEqual(overMetrics.viewportWidth);
    expect(overMetrics.overflow).toBeLessThanOrEqual(0);
    expect(overMetrics.font).not.toBe(24);
  });
}
