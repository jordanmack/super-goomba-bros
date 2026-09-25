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
