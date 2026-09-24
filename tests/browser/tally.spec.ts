import { test, expect, skipIntro } from "./skip-intro.ts";

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 720 },
] as const;

for (const viewport of viewports) {
  test(`stage breakdown lines scale with the playfield at ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/");
    await page.getByRole("button", { name: "START GAME" }).click();
    await skipIntro(page);
    await page.evaluate(() => {
      const s = (window as any).__game.sim;
      s.warned = 2;
      s.saved = 4;
      s.marioKills = 1;
      s.timeLeft = 0;
      s.finish();
      s.tallyPhase = "mario";
      s.tallyHold = 1e9;
    });
    await expect(page.getByTestId("tally-mario")).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const metrics = await page.evaluate(() => {
      const tally = document.querySelector(".tally") as HTMLElement;
      const ids = [
        "tally-warned",
        "tally-saved",
        "tally-died",
        "tally-flag",
        "tally-mario",
      ];
      const lines = ids.map((id) => {
        const el = document.querySelector(
          `[data-testid="${id}"]`,
        ) as HTMLElement;
        const box = el.getBoundingClientRect();
        return {
          id,
          text: el.textContent ?? "",
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
        };
      });
      const style = getComputedStyle(tally);
      const shadow = style.textShadow;
      const offsets = [...shadow.matchAll(/(-?[\d.]+)px/g)].map((match) =>
        Math.abs(parseFloat(match[1] ?? "0")),
      );
      const tallyBox = tally.getBoundingClientRect();
      const playfield = document
        .querySelector(".playfield")!
        .getBoundingClientRect();
      const ending = [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some(
            (rule) =>
              rule.cssText.includes(".ending-overlay h2") &&
              rule.cssText.includes("--play-h) * 16 / 540"),
          );
        } catch {
          return false;
        }
      });
      return {
        font: parseFloat(style.fontSize),
        smoothing: style.getPropertyValue("-webkit-font-smoothing"),
        rendering: style.textRendering,
        edge: Math.max(0, ...offsets),
        overflow: tally.scrollWidth - tally.clientWidth,
        tallyLeft: tallyBox.left,
        tallyRight: tallyBox.right,
        tallyMid: tallyBox.left + tallyBox.width / 2,
        playMid: playfield.left + playfield.width / 2,
        lines,
        endingRule: ending,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        counts: {
          warned: (window as any).__game.sim.warned as number,
          saved: (window as any).__game.sim.saved as number,
          died: (window as any).__game.sim.died() as number,
          flag: (window as any).__game.sim.playerClaimedFlag() ? 1 : 0,
          mario: (window as any).__game.sim.marioKills as number,
        },
      };
    });
    const scale = metrics.innerHeight / 540;
    expect(metrics.font).toBe(Math.round(10 * scale));
    expect(metrics.font).not.toBe(10);
    expect(metrics.edge).toBe(Math.round(2 * scale));
    expect(metrics.edge).toBeGreaterThanOrEqual(1);
    expect(metrics.smoothing).toBe("none");
    expect(metrics.rendering).toMatch(/optimizeSpeed|optimizespeed/);
    expect(metrics.overflow).toBeLessThanOrEqual(0);
    expect(Math.abs(metrics.tallyMid - metrics.playMid)).toBeLessThan(2);
    expect(metrics.tallyLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.tallyRight).toBeLessThanOrEqual(metrics.innerWidth);
    const pad = (n: number) => String(n).padStart(2, "0");
    const expected = [
      `WARNED ${pad(metrics.counts.warned)} × 100`,
      `SAVED ${pad(metrics.counts.saved)} × 1000`,
      `DIED ${pad(metrics.counts.died)} × -2000`,
      `FLAG ${metrics.counts.flag} × 2000`,
      `MARIO ${metrics.counts.mario} × 1000`,
    ];
    expect(metrics.lines.map((line) => line.id)).toEqual([
      "tally-warned",
      "tally-saved",
      "tally-died",
      "tally-flag",
      "tally-mario",
    ]);
    metrics.lines.forEach((line, index) => {
      expect(line.text).toBe(expected[index]);
      expect(line.left).toBeGreaterThanOrEqual(0);
      expect(line.right).toBeLessThanOrEqual(metrics.innerWidth + 0.5);
      expect(line.top).toBeGreaterThanOrEqual(0);
      expect(line.bottom).toBeLessThanOrEqual(metrics.innerHeight + 0.5);
    });
    expect(metrics.endingRule).toBe(true);
    await expect(page.locator(".ending-overlay")).toHaveCount(0);
  });
}
