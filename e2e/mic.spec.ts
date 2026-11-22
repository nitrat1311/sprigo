import { expect, test, type Locator, type Page } from "@playwright/test";
import { ANSWER, BANK, PAIRS, mockOllama } from "./mockAi";

// Chromium's fake microphone (a beeping tone), no permission prompt. Speech goes to a mocked Deepgram, the one
// recognizer the browser build can use.
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

type Probe = { __opens: number; __streams: MediaStream[] };
/** Counts mic opens and which of them are still live. */
const mic = (page: Page) => page.evaluate(() => {
  const w = window as unknown as Probe;
  return { opens: w.__opens, live: w.__streams.filter((s) => s.getAudioTracks().some((t) => t.readyState === "live")).length };
});

let posts: number[] = []; // bytes of each WAV sent to Deepgram
test.beforeEach(async ({ page }) => {
  posts = [];
  await mockOllama(page);
  await page.addInitScript(() => {
    localStorage.setItem("sprigo.devkey.deepgram", "test-key");
    const w = window as unknown as Probe;
    w.__opens = 0; w.__streams = [];
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { const s = await orig(c); w.__opens++; w.__streams.push(s); return s; };
  });
  await page.route("https://api.deepgram.com/**", (r) => {
    posts.push(r.request().postDataBuffer()?.length ?? 0);
    return r.fulfill({ json: { results: { channels: [{ alternatives: [{ transcript: "hola" }] }] } } });
  });
  await page.goto("/");
  await page.getByLabel("Name").fill("Ada");
  await page.getByLabel("First course").selectOption("es");
  await page.getByRole("button", { name: "Create profile" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("radio", { name: /Ollama/ }).click();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("tab", { name: "AI & voice" }).click();
  await page.locator(".card", { hasText: "Speech recognition" }).getByRole("button", { name: "Change" }).click();
  await page.getByRole("dialog").getByRole("radio", { name: /Deepgram/ }).click();
  await expect(page.getByText("Voice settings saved")).toBeVisible();
  await page.keyboard.press("Escape");
});

/** Answers the exercise on screen (not a speaking one); false once the lesson is over. */
async function answer(lesson: Locator) {
  const button = (name: string) => lesson.getByRole("button", { name, exact: true });
  const opt = (text: string) => lesson.locator(".opt", { hasText: new RegExp(`^\\d?${text}$`) });
  await expect(lesson.locator('.result-wrap[role="status"]')).toBeHidden({ timeout: 15_000 });
  if (await lesson.locator(".result-wrap").isVisible()) return false;
  for (const name of ["Continue", "Finish"]) if (await button(name).isVisible()) return button(name).click().then(() => true);
  if (await lesson.getByRole("heading", { name: "Match the pairs" }).isVisible()) {
    for (const [a, b] of PAIRS) { await opt(a).click(); await opt(b).click(); }
  } else if (await lesson.getByLabel("Your answer").isVisible()) {
    await lesson.getByLabel("Your answer").fill(ANSWER);
    await button("Check").click();
  } else if (await lesson.locator(".bank").isVisible()) {
    for (const w of BANK) await lesson.locator(".bank .tok", { hasText: w }).click();
    await button("Check").click();
  } else {
    await opt(ANSWER).click();
    await button("Check").click();
  }
  await expect(lesson.getByText("Correct!")).toBeVisible();
  return true;
}
const speaking = (lesson: Locator) => lesson.getByRole("heading", { name: "Speak this sentence" });

/** One take: record for a moment, stop, wait for the transcript. */
async function take(page: Page, lesson: Locator) {
  const n = posts.length;
  await lesson.getByRole("button", { name: "Record", exact: true }).click();
  await expect(lesson.getByRole("button", { name: "Stop recording" })).toBeVisible(); // "Getting ready…" is over
  await page.waitForTimeout(800);
  await lesson.getByRole("button", { name: "Stop recording" }).click();
  await expect.poll(() => posts.length).toBe(n + 1);
}

test("a speaking exercise keeps one mic open and lets go of it in the background", async ({ page }) => {
  await page.getByRole("button", { name: "Learn" }).click();
  await page.getByRole("button", { name: /Basic Greetings/ }).click();
  const lesson = page.getByRole("dialog", { name: "Lesson" });
  for (let i = 0; !(await speaking(lesson).isVisible()); i++) { expect(i).toBeLessThan(15); await answer(lesson); }

  await expect.poll(async () => (await mic(page)).live).toBe(1); // opened when the exercise appeared, not on the tap
  const o = (await mic(page)).opens; // dev mode (StrictMode) mounts the screen twice, so count from here

  await page.evaluate(() => window.dispatchEvent(new Event("blur"))); // window in the background
  await expect.poll(() => mic(page)).toEqual({ opens: o, live: 0 });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => mic(page)).toEqual({ opens: o + 1, live: 1 });

  await lesson.getByRole("button", { name: "Record", exact: true }).click(); // leaving mid-take drops the take
  await expect(lesson.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => mic(page)).toEqual({ opens: o + 1, live: 0 });
  await expect(lesson.getByRole("button", { name: "Record", exact: true })).toBeEnabled(); // back to idle, nothing sent
  expect(posts).toHaveLength(0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => mic(page)).toEqual({ opens: o + 2, live: 1 });

  await page.evaluate(() => window.dispatchEvent(new Event("blur"))); // no focus event follows: the tap alone must do
  await expect.poll(() => mic(page)).toEqual({ opens: o + 2, live: 0 });
  await take(page, lesson);
  expect(posts[0]).toBeGreaterThan(44 + 16000 * 2 * 0.8); // the whole take reached the recognizer (16 kHz 16-bit WAV)
  expect(await mic(page)).toEqual({ opens: o + 3, live: 1 });
});

test("speaking practice keeps the same mic across phrases", async ({ page }) => {
  await page.getByRole("button", { name: "Learn" }).click();
  await page.getByRole("button", { name: /Basic Greetings/ }).click();
  const lesson = page.getByRole("dialog", { name: "Lesson" });
  for (let i = 0; i < 40; i++) {
    if (await speaking(lesson).isVisible()) {
      await lesson.getByRole("button", { name: "Can't speak now" }).click();
      continue;
    }
    if (!(await answer(lesson))) break;
  }
  await lesson.getByRole("button", { name: "Done" }).click();
  await expect(lesson).toBeHidden();
  await expect.poll(async () => (await mic(page)).live).toBe(0); // the lesson let go of its mic

  await page.getByRole("button", { name: "Practice" }).click();
  await page.locator(".card, button", { hasText: "Speaking practice" }).first().click();
  const practice = page.getByRole("dialog", { name: "Lesson" });
  await expect(speaking(practice)).toBeVisible();
  await expect.poll(async () => (await mic(page)).live).toBe(1);
  const o = (await mic(page)).opens;

  const phrase = () => practice.locator(".card p[lang]").first().textContent(); // the phrase
  for (let k = 0; k < 2; k++) {
    const said = await phrase();
    await take(page, practice);
    await practice.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(speaking(practice)).toBeVisible();
    await expect.poll(phrase).not.toBe(said); // a new phrase...
    expect(await mic(page)).toEqual({ opens: o, live: 1 }); // ...on the same mic
  }
});

test("a take starts with the audio from just before the tap", async ({ page }) => {
  const n = await page.evaluate(async () => {
    const { openMic } = await import("/src/stt.ts");
    const m = await openMic();
    await new Promise((r) => setTimeout(r, 400));
    m.start();
    const x = m.take(); // stopped at once: only what was there before the tap
    await m.close();
    return x.length;
  });
  expect(n).toBeGreaterThanOrEqual(4096);
});
