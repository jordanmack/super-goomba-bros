import type { Page } from "@playwright/test";

export async function skipIntro(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).__game?.sim;
    if (!s || s.mode !== "intro") return;
    s.introLeft = 0;
    s.mode = "playing";
  });
}
