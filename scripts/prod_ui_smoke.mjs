/**
 * Interactive UI smoke against the live promo site using Playwright.
 * Covers album expand, bottom playback bar, search jump, and SW unregister.
 *
 * Requires the browser binary in addition to the npm dependency:
 *   npm install && npx playwright install chromium
 *   node scripts/prod_ui_smoke.mjs
 *
 * Override the target origin with PROMO_SMOKE_BASE.
 */
import { chromium } from "playwright";

const BASE = (process.env.PROMO_SMOKE_BASE || "https://for-promotional-use-only.com").replace(
  /\/$/,
  ""
);
const checks = [];

const record = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} | ${name} | ${detail}`);
};

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/c`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".songlist .album-group, .songlist li", { timeout: 45000 });

  const albumCount = await page.locator(".album-group").count();
  record("album groups render on /c", albumCount > 0, `count=${albumCount}`);

  const idleBar = page.locator(".bottom-playback-bar--idle");
  record(
    "idle bottom playback bar",
    await idleBar.isVisible(),
    `text=${(await idleBar.innerText().catch(() => "")).replace(/\n/g, " ")}`
  );

  const km17 = page.locator(".album-group").filter({ hasText: "Knowledge Magazine 17" }).first();
  await km17.locator(".single-song-wrapper--album").click();
  await page.waitForTimeout(400);
  const km17Expanded = await km17.evaluate((el) => el.classList.contains("album-group--expanded"));
  const km17Children = await km17.locator(".songlist--album-tracks > li").count();
  record(
    "KM17 expands to 11 nested tracks",
    km17Expanded && km17Children === 11,
    `expanded=${km17Expanded} children=${km17Children}`
  );

  const km11 = page.locator(".album-group").filter({ hasText: "Knowledge Magazine 11" }).first();
  await km11.locator(".single-song-wrapper--album").click();
  await page.waitForTimeout(400);
  const km11Children = await km11.locator(".songlist--album-tracks > li").count();
  record("KM11 expands to 1 nested track", km11Children === 1, `children=${km11Children}`);

  // Expand nested track then click play control
  const nestedTrack = km11.locator(".songlist--album-tracks > li").first();
  await nestedTrack.click();
  await page.waitForTimeout(300);
  await nestedTrack.locator(".song-play-control").click();
  const playing = await page
    .waitForFunction(
      () => {
        const audio = document.querySelector("audio");
        return Boolean(audio) && !audio.paused && audio.currentTime > 0;
      },
      { timeout: 20000 }
    )
    .then(() => true)
    .catch(() => false);
  const title = await page.locator(".bottom-playback-bar__title").innerText();
  const audioState = await page.evaluate(() => {
    const audio = document.querySelector("audio");
    if (!audio) {
      return { present: false, paused: true, currentTime: 0 };
    }
    return {
      present: true,
      paused: audio.paused,
      currentTime: audio.currentTime,
      readyState: audio.readyState,
    };
  });
  const barLoaded = !(await page.locator(".bottom-playback-bar--idle").count());
  record(
    "select child track plays in bottom bar",
    barLoaded && playing && title.length > 0 && title !== "No track selected",
    `title=${title} playing=${playing} audio=${JSON.stringify(audioState)}`
  );

  // Prev/next skip buttons exist on loaded bar
  const skipCount = await page.locator(".bottom-playback-bar .skip_button").count();
  record("bottom bar exposes prev/next skip controls", skipCount === 2, `skipButtons=${skipCount}`);

  // Narrow viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const narrow = await page.evaluate(() => {
    const bar = document.querySelector(".bottom-playback-bar");
    if (!bar) {
      return { ok: false };
    }
    const rect = bar.getBoundingClientRect();
    const titleEl = bar.querySelector(".bottom-playback-bar__title");
    const play = bar.querySelector(".play_pause_button");
    const progress = bar.querySelector(".audio_progress_container");
    return {
      ok:
        rect.width >= 300 &&
        rect.bottom <= window.innerHeight + 2 &&
        Boolean(titleEl) &&
        Boolean(play) &&
        Boolean(progress),
      width: rect.width,
      bottom: rect.bottom,
      viewport: window.innerHeight,
    };
  });
  record("narrow viewport keeps bar controls usable", narrow.ok, JSON.stringify(narrow));

  // Bottom padding so last rows aren't covered
  await page.setViewportSize({ width: 1280, height: 900 });
  const paddingOk = await page.evaluate(() => {
    const container = document.querySelector(".has-bottom-playback");
    if (!container) {
      return false;
    }
    const pad = Number.parseFloat(window.getComputedStyle(container).paddingBottom || "0");
    return pad >= 64;
  });
  record("has-bottom-playback padding present", paddingOk, `ok=${paddingOk}`);

  // Search jump from K via the explicit "Go to {letter}" button
  await page.goto(`${BASE}/k`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".song-search", { timeout: 30000 });
  await page.locator(".song-search").click();
  await page.locator(".song-search").fill("Dr S Gachet");
  await page.waitForSelector(".search-results li button", { timeout: 15000 });
  const goButton = page.locator(".search-results li button").first();
  const goLabel = await goButton.innerText();
  await goButton.click();
  await page.waitForTimeout(1500);
  const url = page.url();
  record(
    "search jump navigates to result letter",
    /\/a$/i.test(url) && /go to a/i.test(goLabel),
    `url=${url} button=${goLabel}`
  );

  const swCount = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      return 0;
    }
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.length;
  });
  record("no service worker registered", swCount === 0, `registrations=${swCount}`);

  // Favorites: expand a plain track, star it, reload, confirm state.v2
  await page.goto(`${BASE}/k`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".songlist > li.single-song-wrapper", { timeout: 30000 });
  const plain = page.locator(".songlist > li.single-song-wrapper:not(.single-song-wrapper--album)").first();
  await plain.click();
  await page.waitForTimeout(300);
  await plain.locator(".favorite").click();
  await page.waitForTimeout(400);
  const favBefore = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem("state.v2");
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return { error: String(err) };
    }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".songlist", { timeout: 30000 });
  const favAfter = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem("state.v2");
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return { error: String(err) };
    }
  });
  const favCount = favAfter && favAfter.favorites ? Object.keys(favAfter.favorites).length : 0;
  record(
    "favorites persist in state.v2 after reload",
    favCount > 0,
    `beforeKeys=${favBefore && favBefore.favorites ? Object.keys(favBefore.favorites).length : 0} afterKeys=${favCount}`
  );

  await browser.close();
  const failed = checks.filter((check) => !check.ok);
  console.log(failed.length === 0 ? "ALL_UI_PASS" : "SOME_UI_FAIL");
  process.exit(failed.length === 0 ? 0 : 1);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
