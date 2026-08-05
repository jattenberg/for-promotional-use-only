/**
 * Playwright check: next at end of a letter page advances via catalog order
 * into the following letter route. Uses PROMO_SMOKE_BASE (default local preview).
 */
import { chromium } from "playwright";

const BASE = (process.env.PROMO_SMOKE_BASE || "http://127.0.0.1:4173").replace(/\/$/, "");

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE}/num`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".songlist > li.single-song-wrapper", { timeout: 45000 });

  const rows = page.locator(".songlist > li.single-song-wrapper");
  const count = await rows.count();
  const lastRow = rows.nth(count - 1);
  await lastRow.click();
  await page.waitForTimeout(200);
  await lastRow.locator(".song-play-control").click();

  await page.waitForFunction(
    () => {
      const audio = document.querySelector("audio");
      return Boolean(audio) && audio.readyState >= 2;
    },
    { timeout: 20000 }
  );

  const startUrl = page.url();
  const nextButton = page.locator(".bottom-playback-bar .skip_button:not(.back)");
  await nextButton.click();
  await page.waitForTimeout(1500);

  const url = page.url();
  const title = await page.locator(".bottom-playback-bar__title").innerText();
  const idle = await page.locator(".bottom-playback-bar--idle").count();
  const startLetter = (startUrl.match(/\/([a-z]+)$/i) || [])[1]?.toLowerCase();
  const nextLetter = (url.match(/\/([a-z]+)$/i) || [])[1]?.toLowerCase();

  await browser.close();

  if (idle > 0) {
    console.log(`FAIL | cross-letter next | playback cleared url=${url}`);
    process.exit(1);
  }

  if (!startLetter || !nextLetter || nextLetter === startLetter) {
    console.log(
      `FAIL | cross-letter next | expected letter change from ${startLetter} got ${nextLetter} url=${url} title=${title}`
    );
    process.exit(1);
  }

  console.log(
    `PASS | cross-letter next | from=${startUrl} to=${url} title=${title}`
  );
  console.log("CROSS_LETTER_PASS");
  process.exit(0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
