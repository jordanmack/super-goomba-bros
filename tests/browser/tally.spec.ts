import { TUNING as T } from "../../src/game/config";
import { test, expect, skipIntro } from "./skip-intro.ts";

const viewports = [
  { name: "phone", width: 390, height: 844, flag: true },
  { name: "desktop", width: 1280, height: 720, flag: false },
] as const;
const IDS = [
  "tally-warned",
  "tally-saved",
  "tally-died",
  "tally-flag",
  "tally-mario",
];
const SKY = "92,148,252";

type Counts = {
  warned: number;
  saved: number;
  died: number;
  flag: number;
  mario: number;
};
function expectedLines(c: Counts) {
  const line = (label: string, count: number, points: number) => {
    const total = count * points;
    const sign = total < 0 ? "-" : "+";
    return `${label} × ${String(count).padStart(2, "0")} ${sign}${Math.abs(total)}`;
  };
  return [
    line("WARNED", c.warned, T.warnedScore),
    line("SAVED", c.saved, T.savedScore),
    line("DIED", c.died, T.diedScore),
    line("FLAG", c.flag, T.flagScore),
    line("MARIO", c.mario, T.marioScore),
  ];
}
function lineTotal(c: Counts) {
  return (
    c.warned * T.warnedScore +
    c.saved * T.savedScore +
    c.died * T.diedScore +
    c.flag * T.flagScore +
    c.mario * T.marioScore
  );
}

for (const viewport of viewports) {
  test(`stage breakdown lines show signed totals on whole pixels at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "START GAME" }).click();
    await skipIntro(page);
    await page.evaluate((flag) => {
      const s = (window as any).__game.sim;
      s.marioReturn = 1e6;
      s.warned = 2;
      for (const n of s.npcs.slice(0, 4)) s.save(n);
      for (const n of s.npcs.slice(4, 6)) s.kill(n);
      if (flag) s.activeRoom.flagpole.claim = "goomba";
      s.marioKills = 3;
      // Fireworks add SCORE too. Keep them out of the line totals.
      s.fireworksArmed = true;
      s.score = 0;
      s.timeLeft = 0;
      s.finish();
      s.tallyPhase = "mario";
      s.tallyHold = 1e9;
    }, viewport.flag);
    await expect(page.getByTestId("tally-mario")).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const read = () =>
      page.evaluate((ids) => {
        const s = (window as any).__game.sim;
        return {
          texts: ids.map(
            (id) =>
              document.querySelector(`[data-testid="${id}"]`)?.textContent ??
              "",
          ),
          score: s.score as number,
          counts: {
            warned: s.warned as number,
            saved: s.saved as number,
            died: s.died() as number,
            flag: s.playerClaimedFlag() ? 1 : 0,
            mario: s.marioKills as number,
          },
        };
      }, IDS);
    // NPCs keep playing, so compare each read against the counts it saw.
    await expect
      .poll(async () => {
        const now = await read();
        return (
          JSON.stringify(now.texts) === JSON.stringify(expectedLines(now.counts)) &&
          now.score === lineTotal(now.counts)
        );
      })
      .toBe(true);
    const first = await read();
    expect(first.counts.flag).toBe(viewport.flag ? 1 : 0);
    for (const text of first.texts) {
      expect(text).toMatch(/^[A-Z]+ × \d{2} [+-]\d+$/);
    }
    if (!viewport.flag) expect(first.texts[3]).toBe("FLAG × 00 +0");

    const metrics = await page.evaluate((ids) => {
      const tally = document.querySelector(".tally") as HTMLElement;
      const lines = ids.map((id) => {
        const box = document
          .querySelector(`[data-testid="${id}"]`)!
          .getBoundingClientRect();
        return {
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
        };
      });
      const style = getComputedStyle(tally);
      const shadows = [
        ...style.textShadow.matchAll(
          /rgb\(0, 0, 0\) (-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/g,
        ),
      ].map((match) => match.slice(1, 4).map(Number));
      const tallyBox = tally.getBoundingClientRect();
      const playfield = document
        .querySelector(".playfield")!
        .getBoundingClientRect();
      const ending = [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some(
            (rule) =>
              rule.cssText.includes(".ending-overlay h2") &&
              rule.cssText.includes("--play-h) * 14 / 540"),
          );
        } catch {
          return false;
        }
      });
      return {
        font: parseFloat(style.fontSize),
        smoothing: style.getPropertyValue("-webkit-font-smoothing"),
        rendering: style.textRendering,
        shadows,
        overflow: tally.scrollWidth - tally.clientWidth,
        tally: {
          left: tallyBox.left,
          right: tallyBox.right,
          top: tallyBox.top,
          bottom: tallyBox.bottom,
          width: tallyBox.width,
        },
        playfield: {
          left: playfield.left,
          right: playfield.right,
          top: playfield.top,
          bottom: playfield.bottom,
        },
        lines,
        endingRule: ending,
        innerHeight: window.innerHeight,
      };
    }, IDS);
    // Press Start 2P is an 8px face. Whole multiples keep glyph pixels whole.
    const scale = metrics.innerHeight / 540;
    expect(metrics.font).toBe(Math.max(8, Math.round((10 * scale) / 8) * 8));
    expect(metrics.font % 8).toBe(0);
    expect(metrics.font).toBeGreaterThan(8);
    // A hard outline: one glyph pixel in all eight directions, no blur.
    const edge = metrics.font / 8;
    expect(Number.isInteger(edge)).toBe(true);
    expect(metrics.shadows).toHaveLength(8);
    const directions = new Set<string>();
    for (const [x, y, blur] of metrics.shadows) {
      expect(blur).toBe(0);
      expect([-edge, 0, edge]).toContain(x);
      expect([-edge, 0, edge]).toContain(y);
      directions.add(`${x},${y}`);
    }
    expect(directions.size).toBe(8);
    expect(metrics.smoothing).toBe("none");
    expect(metrics.rendering).toMatch(/optimizeSpeed|optimizespeed/);
    // Whole-pixel block, centered on the playfield, outline inside it.
    expect(metrics.overflow).toBeLessThanOrEqual(0);
    expect(Number.isInteger(metrics.tally.left)).toBe(true);
    expect(Number.isInteger(metrics.tally.top)).toBe(true);
    expect(metrics.tally.width % 8).toBe(0);
    const tallyMid = (metrics.tally.left + metrics.tally.right) / 2;
    const playMid = (metrics.playfield.left + metrics.playfield.right) / 2;
    expect(Math.abs(tallyMid - playMid)).toBeLessThanOrEqual(0.5);
    expect(metrics.tally.left - edge).toBeGreaterThanOrEqual(
      metrics.playfield.left,
    );
    expect(metrics.tally.right + edge).toBeLessThanOrEqual(
      metrics.playfield.right,
    );
    expect(metrics.tally.top - edge).toBeGreaterThanOrEqual(
      metrics.playfield.top,
    );
    expect(metrics.tally.bottom + edge).toBeLessThanOrEqual(
      metrics.playfield.bottom,
    );
    for (const line of metrics.lines) {
      expect(Number.isInteger(line.left)).toBe(true);
      expect(Number.isInteger(line.top)).toBe(true);
      expect(line.right).toBeLessThanOrEqual(metrics.tally.right);
      expect(line.bottom).toBeLessThanOrEqual(metrics.tally.bottom);
    }
    expect(metrics.endingRule).toBe(true);
    await expect(page.locator(".ending-overlay")).toHaveCount(0);

    // Over a flat sky, the block is only white glyphs, black outline, and sky.
    // A filtered glyph or a soft halo would add blended colors.
    await page.evaluate((sky) => {
      const hide = document.createElement("style");
      hide.textContent = ".world, .speech-stack { visibility: hidden; }";
      document.head.append(hide);
      (document.querySelector(".playfield") as HTMLElement).style.background =
        `rgb(${sky})`;
    }, SKY);
    const shot = await page.screenshot({
      clip: {
        x: metrics.tally.left - edge * 2,
        y: metrics.tally.top - edge * 2,
        width: metrics.tally.width + edge * 4,
        height: metrics.tally.bottom - metrics.tally.top + edge * 4,
      },
    });
    const colors = await page.evaluate(async (png) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, image.width, image.height).data;
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return [...seen].sort();
    }, shot.toString("base64"));
    expect(colors).toEqual(["0,0,0", "255,255,255", SKY].sort());

    // A count that arrives mid-tally updates its line and SCORE together.
    await page.evaluate(() => {
      (window as any).__game.sim.marioKills += 1;
    });
    await expect
      .poll(async () => {
        const now = await read();
        return (
          now.counts.mario === first.counts.mario + 1 &&
          JSON.stringify(now.texts) === JSON.stringify(expectedLines(now.counts)) &&
          now.score === lineTotal(now.counts)
        );
      })
      .toBe(true);
  });
}
