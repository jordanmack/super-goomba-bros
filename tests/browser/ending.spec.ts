import campaign from "../../src/assets/levels/campaign.json" with { type: "json" };
import { test, expect, skipIntro } from "./skip-intro.ts";

const LAST = campaign.levels.findIndex((level) => level.id === "8-4");

for (const view of [
  { name: "desktop", width: 1280, height: 720 },
  { name: "phone", width: 390, height: 844 },
  { name: "landscape phone", width: 844, height: 390 },
])
  test(`the 8-4 card shows the epilogue and campaign totals at ${view.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: view.width, height: view.height });
    await page.goto("/");
    await page.getByRole("button", { name: "START GAME" }).click();
    await skipIntro(page);
    await page.evaluate((last) => {
      const s = (window as any).__game.sim;
      s.levelIndex = last;
      s.reset();
      s.marioReturn = 1e6;
      s.campaignTotals = { warned: 212, saved: 180, died: 7, flag: 20, mario: 3 };
      s.score = 123450;
      s.mode = "finishing";
      s.tallyPhase = "ending";
    }, LAST);
    const card = page.getByLabel("Ending");
    await expect(card).toBeVisible();
    await expect(card.locator("h2")).toHaveText([
      "ONE SMALL GOOMBA STOOD BRAVE.",
      "HE HELD BACK THE EVIL MARIO BROTHERS.",
      "THE KINGDOM IS SAFE.",
      "A NEW QUEST STILL WAITS.",
    ]);
    await expect(page.getByTestId("ending-totals").locator("p")).toHaveText([
      "WARNED 212",
      "SAVED 180",
      "DIED 07",
      "FLAG 20",
      "MARIO 03",
    ]);
    await expect(page.getByTestId("ending-score")).toContainText("123450");
    // Every line fits inside the viewport with no horizontal scroll.
    const fit = await card.evaluate((section) => ({
      overflow: section.scrollWidth - section.clientWidth,
      page: document.documentElement.scrollWidth - window.innerWidth,
      lines: [...section.querySelectorAll("h2, p, button")].map((el) => {
        const box = el.getBoundingClientRect();
        return { left: box.left, right: box.right, bottom: box.bottom };
      }),
    }));
    expect(fit.overflow).toBeLessThanOrEqual(0);
    expect(fit.page).toBeLessThanOrEqual(0);
    for (const line of fit.lines) {
      expect(line.left).toBeGreaterThanOrEqual(0);
      expect(line.right).toBeLessThanOrEqual(view.width);
      expect(line.bottom).toBeLessThanOrEqual(view.height);
    }
    await card.getByRole("button", { name: "TITLE" }).click();
    await expect(page.getByRole("button", { name: "START GAME" })).toBeVisible();
    const totals = await page.evaluate(
      () => (window as any).__game.sim.campaignTotals,
    );
    expect(totals).toEqual({ warned: 0, saved: 0, died: 0, flag: 0, mario: 0 });
  });

test("the 8-4 card plays world clear once, then loops one statement of the ending theme", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await skipIntro(page);
  await page.waitForFunction(
    () => (window as any).__game.audio.buffers.size === 25,
  );
  await page.evaluate((last) => {
    const s = (window as any).__game.sim;
    s.levelIndex = last;
    s.reset();
    s.marioReturn = 1e6;
    s.mode = "finishing";
    s.tallyPhase = "ending";
    s.victoryLoop = "ending";
  }, LAST);
  const state = () =>
    page.evaluate(() => {
      const a = (window as any).__game.audio;
      const theme = a.victoryTheme;
      return {
        cue: a.cue?.key ?? null,
        cueLoop: a.cue?.loop ?? null,
        worldClear: [...a.effects].filter(
          (source: any) => source.audioBuffer === a.buffers.get("worldClear"),
        ).length,
        music: a.music?.key ?? null,
        theme: theme
          ? {
              key: theme.key,
              playing: theme.isPlaying,
              marker: theme.currentMarker?.name ?? null,
              loop: theme.loop,
              volume: theme.volume,
              managed: a.manager.sounds.includes(theme),
              intro: theme.markers.intro,
              looped: theme.markers.loop,
            }
          : null,
      };
    });
  await expect.poll(async () => (await state()).cue).toBe("worldClear");
  const fanfare = await state();
  // One play of the fanfare, not a loop, and no theme or area music over it.
  expect(fanfare.cueLoop).toBe(false);
  expect(fanfare.worldClear).toBe(1);
  expect(fanfare.theme).toBeNull();
  expect(fanfare.music).toBeNull();
  await page.waitForTimeout(500);
  expect((await state()).theme).toBeNull();
  // Skip to the last 0.1 s so the cue ends on its own.
  await page.evaluate(() => {
    const cue = (window as any).__game.audio.cue;
    cue.seek = cue.duration - 0.1;
  });
  await expect.poll(async () => (await state()).theme?.marker).toBe("intro");
  const intro = await state();
  expect(intro.cue).toBeNull();
  expect(intro.worldClear).toBe(0);
  expect(intro.music).toBeNull();
  expect(intro.theme!.key).toBe("ending");
  expect(intro.theme!.playing).toBe(true);
  expect(intro.theme!.loop).toBe(false);
  expect(intro.theme!.volume).toBeCloseTo(0.55);
  // Played through the sound manager, so mute and pause still apply.
  expect(intro.theme!.managed).toBe(true);
  expect(intro.theme!.intro.start).toBeCloseTo(0.52);
  expect(intro.theme!.intro.duration).toBeCloseTo(6.4);
  expect(intro.theme!.looped.start).toBeCloseTo(6.92);
  expect(intro.theme!.looped.duration).toBeCloseTo(6.4);
  expect(intro.theme!.looped.config.loop).toBe(true);
  await page.evaluate(() => {
    const theme = (window as any).__game.audio.victoryTheme;
    theme.seek = theme.duration - 0.1;
  });
  await expect.poll(async () => (await state()).theme?.marker).toBe("loop");
  const looping = await state();
  expect(looping.theme!.playing).toBe(true);
  expect(looping.theme!.loop).toBe(true);
  expect(looping.cue).toBeNull();
  expect(looping.music).toBeNull();
  await page.getByLabel("Ending").getByRole("button", { name: "TITLE" }).click();
  await expect(page.getByRole("button", { name: "START GAME" })).toBeVisible();
  const after = await page.evaluate(() => {
    const a = (window as any).__game.audio;
    return {
      theme: a.victoryTheme,
      endingSounds: a.manager.sounds.filter((s: any) => s.key === "ending").length,
      cue: a.cue?.key ?? null,
    };
  });
  expect(after).toEqual({ theme: null, endingSounds: 0, cue: null });
});
