import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ANSWER, BANK, FORM, PAIRS, mockOllama } from "./mockAi";

test.beforeEach(async ({ page }) => { await mockOllama(page); });

/** First run: create a profile learning Spanish, then save the (mocked) local Ollama model. */
async function onboard(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create your profile" })).toBeVisible();
  await page.getByLabel("Name").fill("Ada");
  await page.getByLabel("First course").selectOption("es");
  await page.getByRole("button", { name: "Create profile" }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Ollama found on this Mac")).toBeVisible();
  await sheet.getByRole("radio", { name: /Ollama/ }).click();
  await expect(sheet.getByLabel(/Model/)).toHaveValue("mock:latest");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet.getByRole("radio", { name: /Ollama/ })).toHaveAttribute("aria-checked", "true");
  await sheet.getByRole("button", { name: "Cancel" }).click();
}

test("onboarding creates a profile and sets up local AI", async ({ page }) => {
  await onboard(page);
  await expect(page.getByText("Ollama · mock:latest")).toBeVisible();
  await page.reload(); // signed in again, AI still set up
  await page.getByRole("button", { name: "Learn" }).click();
  await expect(page.getByText("Greetings & Introductions")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("the model picker shows measured guidance", async ({ page }) => {
  await onboard(page);
  await page.getByRole("tab", { name: "AI & voice" }).click();
  await page.locator("#set-panel .od-row").filter({ has: page.getByText("AI provider", { exact: true }) }).getByRole("button", { name: "Change" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ollama settings" }).click(); // the model field lives here
  const sheet = page.getByRole("dialog");
  const model = sheet.getByLabel(/Model/);
  await model.fill("qwen3:8b");
  await expect(sheet.getByText(/^Measured:/)).toBeVisible();
  await expect(sheet.getByText(/\d+% of exercises pass/)).toBeVisible(); // the share, which does not depend on the machine
  await expect(model).toHaveAttribute("aria-describedby", "ai-model-note"); // the note describes the field, not names it
  await model.fill("gemma4:e2b-mlx");
  await expect(sheet.getByText(/^Measured:/)).toBeVisible();
  await expect(sheet.getByRole("note")).toContainText("Models under 4B"); // measured and under 4B: both notes stay
  await model.fill("qwen3.5:4b"); // the suggested cross-platform tag was not measured
  await expect(sheet.getByText(/^Measured:/)).toBeHidden();
  await expect(sheet.getByRole("note")).toBeHidden(); // and at the suggested size it is not "too small"
  await model.fill("tiny:1b");
  await expect(sheet.getByText(/^Measured:/)).toBeHidden();
  await expect(sheet.getByRole("note")).toContainText("Models under 4B"); // unmeasured: the size warning
});

test("help answers setup questions in the app, also from a setting's ?", async ({ page }) => {
  await onboard(page);
  await page.getByRole("tab", { name: "Profile" }).click(); // Help & FAQ lives in the profile tab's settings group
  await page.locator(".od-row").filter({ has: page.getByText("Help & FAQ", { exact: true }) }).getByRole("button", { name: "Open" }).click();
  const help = page.getByRole("dialog");
  await help.getByText("Where is my data?").click();
  await expect(help.getByText(/Application Support\/com\.ozerozdas\.sprigo/)).toBeVisible();
  await expect(help.getByRole("link", { name: "More on the wiki" }).first()).toHaveAttribute("href", /\/wiki\/FAQ$/);
  await help.getByRole("button", { name: "Close" }).click();

  await page.getByRole("tab", { name: "AI & voice" }).click();
  await page.locator("#set-panel .od-row").filter({ has: page.getByText("AI provider", { exact: true }) }).getByRole("button", { name: "Change" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Help: How do I set up the AI?" }).click();
  await expect(page.locator("details[open] summary")).toHaveText("How do I set up the AI?");
});

/** Answers whatever exercise is on screen with the mock's right answer; false once the lesson is over. */
async function answer(lesson: ReturnType<Page["getByRole"]>) {
  const button = (name: string) => lesson.getByRole("button", { name, exact: true });
  const opt = (text: string) => lesson.locator(".opt", { hasText: new RegExp(`^\\d?${text}$`) });
  await expect(lesson.locator('.result-wrap[role="status"]')).toBeHidden({ timeout: 15_000 }); // still generating is not "over"
  if (await lesson.locator(".result-wrap").isVisible()) return false;
  for (const name of ["Continue", "Finish", "Can't speak now"]) if (await button(name).isVisible()) return button(name).click().then(() => true);
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

async function runLesson(page: Page, step: RegExp) {
  await page.getByRole("button", { name: step }).click();
  const lesson = page.getByRole("dialog", { name: "Lesson" });
  await expect(lesson.getByRole("heading", { name: "New phrase" })).toBeVisible();
  for (let i = 0; await answer(lesson); i++) expect(i).toBeLessThan(30);
  await expect(lesson.getByText("100%")).toBeVisible(); // accuracy: every answer was right
  await lesson.getByRole("button", { name: "Done" }).click();
  await expect(lesson).toBeHidden();
}

/** Onboards, reads a lesson to put "hola" in the word list, then opens the first story. */
async function openStory(page: Page) {
  await onboard(page);
  await page.getByRole("button", { name: "Learn" }).click();
  await runLesson(page, /Basic Greetings/);
  await page.getByRole("button", { name: "Stories", exact: true }).click();
  await page.getByRole("button", { name: /^Greetings & Introductions/ }).click();
  const story = page.getByRole("dialog", { name: "ok" }); // the mock's story title
  await expect(story.locator(".tap-word.known", { hasText: "Hola" }).first()).toBeVisible();
  return story;
}

// The first two steps cover all five renderers: learn, choice, match, speak (skipped), then input and word bank.
test("first lessons run every exercise type", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Learn" }).click();
  await runLesson(page, /Basic Greetings/);
  await runLesson(page, /Introduce Yourself/);
});

test("search finds a lesson or word and opens its unit", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Learn" }).click();
  const search = page.getByLabel("Search lessons and guidebooks");
  // Learn opens on the current lesson, far down the path; the sticky search must still be on screen.
  await expect(search).toBeInViewport();
  await search.fill("How Old");
  const results = page.locator(".search-results");
  // The level reads as the path's header does, not as a bare CEFR code.
  await expect(results.getByRole("button", { name: /How Old Are You\?/ })).toContainText("A1 · Beginner");
  await expect(results.getByRole("button", { name: /How Old Are You\?/ })).toBeVisible();
  await results.getByRole("button", { name: /How Old Are You\?/ }).click();
  await expect(results).toBeHidden();
  await expect(page.getByRole("heading", { name: "Numbers & Colors" })).toBeInViewport();

  await search.fill("adios"); // the query folds accents
  await expect(results.getByRole("button", { name: /^adiós/ })).toBeVisible();
});

test("a double-click checks a selected answer and a click advances after feedback", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Learn" }).click();
  await page.getByRole("button", { name: /Basic Greetings/ }).click();
  const lesson = page.getByRole("dialog", { name: "Lesson" });
  const option = lesson.locator(".opt", { hasText: /^\d?hola$/ });
  for (let i = 0; !(await option.isVisible()); i++) {
    expect(i).toBeLessThan(10);
    await lesson.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await option.click(); // select it first: the double-click gesture only checks a selected answer
  await expect(lesson.getByText("Correct!")).toBeHidden();
  await option.dblclick();
  await expect(lesson.getByText("Correct!")).toBeVisible();
  await expect(option).toHaveClass(/correct/);
  await option.click(); // after feedback a normal click is enough to advance
  await expect(lesson.getByText("Correct!")).toBeHidden();
});

test("a double-click on an unselected answer selects it without grading it", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Learn" }).click();
  await page.getByRole("button", { name: /Basic Greetings/ }).click();
  const lesson = page.getByRole("dialog", { name: "Lesson" });
  const option = lesson.locator(".opt", { hasText: /^\d?hola$/ });
  for (let i = 0; !(await option.isVisible()); i++) {
    expect(i).toBeLessThan(10);
    await lesson.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await option.dblclick();
  await expect(option).toHaveClass(/sel/);
  await expect(lesson.getByText("Correct!")).toBeHidden();
  await expect(lesson.locator(".hearts-box")).toHaveText("5"); // nothing was graded, so no heart went
});

test("a double-click keeps wrong-answer feedback available before a click advances", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Learn" }).click();
  await page.getByRole("button", { name: /Basic Greetings/ }).click();
  const lesson = page.getByRole("dialog", { name: "Lesson" });
  const wrong = lesson.locator(".opt", { hasText: /^\d?adiós$/ });
  for (let i = 0; !(await wrong.isVisible()); i++) {
    expect(i).toBeLessThan(10);
    await lesson.getByRole("button", { name: "Continue", exact: true }).click();
  }
  await expect(lesson.locator(".hearts-box")).toHaveText("5");
  await wrong.click(); // select the wrong answer, then check it with a double-click
  await wrong.dblclick();
  await expect(lesson.locator(".hearts-box")).toHaveText("4");
  await expect(lesson.locator(".fb.bad")).toBeVisible();
  await expect(wrong).toHaveClass(/wrong/);
  await expect(lesson.locator(".opt.correct")).toBeVisible();
  await wrong.click(); // a normal click advances
  await expect(lesson.locator(".fb.bad")).toBeHidden();
  await expect(lesson.locator(".hearts-box")).toHaveText("4");
});

test("a story opens from Stories, marks known words and can be finished", async ({ page }) => {
  const story = await openStory(page);
  const option = story.locator(".opt", { hasText: /^\d?hola$/ });
  await story.getByRole("button", { name: "Continue", exact: true }).click(); // the mock's question follows the first line
  await expect(option).toBeVisible();
  await option.click();
  await story.getByRole("button", { name: "Check" }).click();
  await expect(story.getByText("Correct!")).toBeVisible();
  for (let i = 0; !(await story.getByText("Story complete!").isVisible()); i++) {
    expect(i).toBeLessThan(40);
    await story.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
  }
  await story.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /Greetings & Introductions.*Read again/ })).toBeVisible(); // remembered
});

test("a story answer checks with a selected double-click and advances on a click", async ({ page }) => {
  const story = await openStory(page);
  const option = story.locator(".opt", { hasText: /^\d?hola$/ });
  await story.getByRole("button", { name: "Continue", exact: true }).click(); // the mock's question follows the first line
  await expect(option).toBeVisible();
  await option.click(); // select it first: the double-click gesture only checks a selected answer
  await expect(story.getByText("Correct!")).toBeHidden();
  await option.dblclick();
  await expect(story.getByText("Correct!")).toBeVisible();
  await option.click(); // after feedback a normal click is enough to advance
  await expect(story.getByText("Correct!")).toBeHidden();
  for (let i = 0; !(await story.getByText("Story complete!").isVisible()); i++) {
    expect(i).toBeLessThan(40);
    const opt = story.locator(".opt", { hasText: /^\d?hola$/ });
    if (await opt.isVisible() && await opt.isEnabled()) { await opt.click(); await story.getByRole("button", { name: "Check" }).click(); }
    else await story.getByRole("button", { name: /^(Continue|Finish)$/ }).click();
  }
  await story.getByRole("button", { name: "Done" }).click();
});

test("Stories lists earlier levels once the learner moves up", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Learn" }).click();
  await page.getByRole("button", { name: "Skip A1 — take the level test" }).click();
  const exam = page.getByRole("dialog", { name: "Lesson" });
  for (let i = 0; await answer(exam); i++) expect(i).toBeLessThan(60);
  await expect(exam.getByText("A1 complete!")).toBeVisible();
  await exam.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Stories", exact: true }).click();
  const level = page.getByLabel("Levels");
  await expect(level).toHaveValue("A2");
  await level.selectOption("A1");
  const units = page.locator("main .card.row-item");
  await expect(units.getByText("Read")).toHaveCount(await units.count()); // every A1 story is open
  await units.first().click();
  await expect(page.getByRole("dialog", { name: "ok" }).getByText("Hola").first()).toBeVisible();
});

test("writing practice corrects the text inline and queues the mistake", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Practice" }).click();
  await page.getByRole("button", { name: /^Writing/ }).click();
  await page.locator(".sheet").getByRole("button", { name: /Greetings & Introductions/ }).click();
  const w = page.getByRole("dialog", { name: "Greetings & Introductions" });
  await expect(w.getByRole("heading", { name: "Write two sentences about yourself." })).toBeVisible();
  await w.getByLabel("Your answer").fill("Yo es Ana. Me gusta leer.");
  await w.getByRole("button", { name: "Check" }).click();
  await expect(w.locator(".fix del")).toHaveText("Yo es");
  await expect(w.locator(".fix ins")).toHaveText("Yo soy");
  await expect(w.getByText("With yo, ser is soy.")).toBeVisible();
  await w.getByRole("button", { name: "Finish" }).click();
  await expect(w.getByText("Writing done!")).toBeVisible();
  await w.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /Fix your mistakes.*1 question waiting/ })).toBeVisible();
});

test("the profile charts XP and words after a lesson", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Learn" }).click();
  await runLesson(page, /Basic Greetings/);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
  const xp = page.getByRole("img", { name: /^XP per day\. [1-9]\d* XP in the last 14 days/ });
  await expect(xp.locator("path")).toHaveCount(1); // one bar: today
  await expect(page.getByRole("img", { name: /^Words learned\. [1-9]\d* words, [1-9]\d* new/ })).toBeVisible();
  const acc = page.locator(".acc-rows li");
  await expect(acc.filter({ hasText: "Choice" })).toContainText("100%"); // every answer was right
  await expect(acc.filter({ hasText: "Pairs" })).toContainText("100%");
  await expect(page.getByRole("img", { name: "Speaking pace. Nothing yet" })).toBeVisible(); // no voice session in this run
});

test("weekly and monthly goals show progress, a report and stay after a reload", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Learn" }).click();
  await runLesson(page, /Basic Greetings/);
  await page.getByRole("button", { name: "Profile", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();
  const week = page.locator("section.card", { hasText: "Weekly goal" });
  await expect(week).toBeVisible();
  await expect(page.locator("section.card", { hasText: "Monthly goal" })).toBeVisible();

  // A weekly goal in new words, saved when the field loses focus.
  await week.getByLabel("Measure").selectOption("words");
  await week.getByLabel("Target each week").fill("20");
  await week.getByLabel("Target each week").blur();
  await expect(week.getByText(/^\d+ of 20 words$/)).toBeVisible();
  await expect(week.getByText(/^Last week: \d+ words$/)).toBeVisible();

  // The report compares this week with the week before, for every metric.
  await week.getByRole("button", { name: "Report" }).click();
  const report = page.getByRole("dialog", { name: "Weekly report" });
  await expect(report.locator(".od-field > b")).toHaveText(["XP", "New words", "Speaking minutes"]);
  await expect(report.getByRole("status")).toContainText(/Goal reached|to go/);
  await report.getByRole("button", { name: "Close" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const weekAgain = page.locator("section.card", { hasText: "Weekly goal" });
  await expect(weekAgain.getByLabel("Measure")).toHaveValue("words");
  await expect(weekAgain.getByLabel("Target each week")).toHaveValue("20");
});

test("changing what a goal measures keeps the target already typed", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const week = page.locator("section.card", { hasText: "Weekly goal" });

  await week.getByLabel("Target each week").fill("35"); // typed, not yet blurred
  await week.getByLabel("Measure").selectOption("words"); // commits the typed target with the new measure

  await page.reload();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const again = page.locator("section.card", { hasText: "Weekly goal" });
  await expect(again.getByLabel("Measure")).toHaveValue("words");
  await expect(again.getByLabel("Target each week")).toHaveValue("35");
});

test("a weekly summary opens once after the week turns", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-23T10:00:00") }); // a Monday
  await onboard(page);
  await page.getByRole("button", { name: "Learn" }).click();
  await runLesson(page, /Basic Greetings/);

  await page.clock.setFixedTime(new Date("2026-11-30T10:00:00")); // the next Monday: last week is over
  await page.reload();
  const report = page.getByRole("dialog", { name: "Weekly report" });
  await expect(report).toBeVisible();
  await expect(report.locator(".od-field > b")).toHaveText(["XP", "New words", "Speaking minutes"]);
  // The finished week's XP, not today's (today has none yet).
  await expect(report.locator(".card").first().locator("b").last()).toHaveText(/^[1-9]\d* XP$/);
  await report.getByRole("button", { name: "Close" }).click();

  await page.reload(); // already reported: no second summary
  await expect(page.getByRole("dialog", { name: "Weekly report" })).toBeHidden();
});

test("a conjugation drill asks the cross-checked forms and queues a miss", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Practice" }).click();
  await page.getByRole("button", { name: /^Verb forms.*presente/ }).click();
  const drill = page.getByRole("dialog", { name: "Lesson" });
  await expect(drill.locator(".ctx-cells span")).toHaveCount(3); // the loading panel is also a .result-wrap: wait for the cells first
  for (let i = 0; !(await drill.locator(".result-wrap").isVisible()); i++) {
    expect(i).toBeLessThan(20);
    const next = drill.getByRole("button", { name: /^(Continue|Finish)$/ });
    if (await next.isVisible()) { await next.click(); continue; }
    await expect(drill.locator(".ctx-cells span")).toHaveCount(3); // verb | person | tense
    await expect(drill.locator(".ctx-cells span").last()).toHaveText("presentetense"); // the form, then its caption
    await drill.getByLabel("Your answer").fill(i ? FORM : "hablo"); // the first one wrong
    await drill.getByRole("button", { name: "Check", exact: true }).click();
    await expect(drill.getByText(i ? "Correct!" : FORM).first()).toBeVisible();
  }
  await drill.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: /Fix your mistakes.*1 question waiting/ })).toBeVisible();
});

test("the grammar reference searches every pattern and drills one", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Grammar" }).click();
  await expect(page.getByRole("heading", { name: /^A1 · / })).toBeVisible();
  await page.getByLabel("Search grammar").fill("LLAMAS");
  await expect(page.getByRole("button", { name: "¿Cómo te llamas?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "¡Buenos días!" })).toBeHidden();
  await page.getByRole("button", { name: "¿Cómo te llamas?" }).click();
  const sheet = page.getByRole("dialog", { name: "¿Cómo te llamas?" });
  await sheet.getByRole("button", { name: "Explain this" }).click();
  await expect(sheet.getByRole("alert")).toContainText("left this pattern out"); // the mock's guide has no grammar entries
  await sheet.getByRole("button", { name: "Practise this" }).click();
  const lesson = page.getByRole("dialog", { name: "Lesson" });
  await expect(lesson.getByRole("heading", { name: "Which word means “hello”?" })).toBeVisible(); // a drill has no teaching cards
  for (let i = 0; await answer(lesson); i++) expect(i).toBeLessThan(20);
  await expect(lesson.getByText("100%")).toBeVisible();
  await lesson.getByRole("button", { name: "Done" }).click();
  await expect(lesson).toBeHidden();
});

test("a custom tutor is created through the UI, listed and can hold a chat", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Roleplay", exact: true }).click();
  await page.getByRole("button", { name: /Add a tutor/ }).click();
  const list = page.getByRole("dialog", { name: "My tutors" });
  await expect(list.getByText("No tutors of your own yet.")).toBeVisible();
  await list.getByRole("button", { name: "Create tutor" }).click();

  const form = page.getByRole("dialog", { name: "New tutor" });
  await form.getByLabel("Name").fill("Ada");
  await form.getByLabel("Kokoro voice").selectOption("af_heart");
  await form.getByLabel("Persona").fill("A patient neighbour who chats over tea.");
  await form.getByLabel(/Topic 1/).fill("introduce yourself");
  await form.getByRole("button", { name: "Create tutor" }).click();
  await expect(list.getByText("Ada", { exact: true })).toBeVisible();
  await list.getByRole("button", { name: "Close" }).click();

  await page.reload(); // the tutor comes back from the database, not from this session
  await page.getByRole("button", { name: "Live lesson" }).click();
  const picker = page.getByRole("dialog");
  await expect(picker.getByRole("heading", { name: "Who should teach you today?" })).toBeVisible();
  await expect(picker.getByRole("button", { name: /Ada/ })).toBeVisible();
  await picker.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Roleplay", exact: true }).click();
  const card = page.locator(".rp-card", { hasText: "Ada" });
  await expect(card).toBeVisible();
  await expect(card.getByText("introduce yourself")).toBeVisible(); // a custom topic has no i18n key
  await card.getByRole("button", { name: "Chat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "introduce yourself" }).click();
  const chat = page.getByRole("dialog", { name: "Ada" });
  await expect(chat.getByText("introduce yourself")).toBeVisible();
  await expect(chat.locator(".bubble", { hasText: "ok" })).toBeVisible(); // the mock's structured turn
  await chat.locator(".bubble", { hasText: "ok" }).click();
  await expect(chat.locator(".bubble small", { hasText: "hello" })).toBeVisible(); // translated after the reply, not before it
});

test("a tutor package is imported, edited and deleted from the tutor list", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Roleplay", exact: true }).click();
  await page.getByRole("button", { name: /Add a tutor/ }).click();
  await page.getByRole("dialog", { name: "My tutors" }).getByRole("button", { name: "Import a tutor" }).click();
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles("e2e/fixtures/boris-tutor.json");

  const imported = page.getByRole("dialog", { name: "Import a tutor" });
  await expect(imported.getByText("introduce yourself")).toBeVisible();
  const confirm = imported.getByLabel("I am responsible for this content");
  const action = imported.getByRole("button", { name: "Import tutor" });
  await expect(action).toBeDisabled();
  await confirm.check();
  await action.click();

  const list = page.getByRole("dialog", { name: "My tutors" });
  await expect(list.getByText("Boris", { exact: true })).toBeVisible();
  await expect(list.getByText("Imported")).toBeVisible();

  await list.getByRole("button", { name: "Options for Boris" }).click();
  await list.getByRole("menuitem", { name: "Edit" }).click();
  const form = page.getByRole("dialog", { name: "Edit tutor" });
  await form.getByLabel("Name").fill("Boris Petrov");
  await form.getByRole("button", { name: "Save tutor" }).click();
  await expect(list.getByText("Boris Petrov", { exact: true })).toBeVisible();

  await list.getByRole("button", { name: "Options for Boris Petrov" }).click();
  await list.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Delete Boris Petrov?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(list.getByText("No tutors of your own yet.")).toBeVisible();
});

test("a tutor exports as a package the import flow takes again", async ({ page }) => {
  await onboard(page);
  await page.getByRole("button", { name: "Roleplay", exact: true }).click();
  await page.getByRole("button", { name: /Add a tutor/ }).click();
  const list = page.getByRole("dialog", { name: "My tutors" });
  await list.getByRole("button", { name: "Import a tutor" }).click();
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles("e2e/fixtures/boris-tutor.json");
  const imported = page.getByRole("dialog", { name: "Import a tutor" });
  await imported.getByLabel("I am responsible for this content").check();
  await imported.getByRole("button", { name: "Import tutor" }).click();
  await expect(list.getByText("Boris", { exact: true })).toBeVisible();

  const more = list.getByRole("button", { name: "Options for Boris" });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const download = page.waitForEvent("download");
  await list.getByRole("menuitem", { name: "Export" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("boris.sprigo-tutor.json");
  const pkg = JSON.parse(readFileSync((await file.path())!, "utf8"));
  expect(pkg).toMatchObject({ name: "Boris", gender: "m", kokoroVoice: "am_michael" });
  for (const rowOnly of ["id", "profile_id", "source", "created_at"]) expect(pkg).not.toHaveProperty(rowOnly);
  await expect(page.getByText("Boris exported.")).toBeVisible();

  await list.getByRole("button", { name: "Import a tutor" }).click();
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({
    name: "boris.sprigo-tutor.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(pkg)),
  });
  const again = page.getByRole("dialog", { name: "Import a tutor" });
  await again.getByLabel("I am responsible for this content").check();
  await again.getByRole("button", { name: "Import tutor" }).click();
  await expect(list.getByText("Boris", { exact: true })).toHaveCount(2);
});

test("readable font and text size apply at once and stay after a reload", async ({ page }) => {
  await onboard(page);
  await page.getByRole("tab", { name: "Preferences" }).click();
  await page.locator("#set-panel .od-row").filter({ has: page.getByText("Readable font", { exact: true }) }).getByRole("button", { name: "Off" }).click();
  await page.getByRole("radiogroup", { name: "Text size" }).getByRole("radio", { name: "130%" }).click();
  const look = () => page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, zoom: document.documentElement.style.zoom }));
  expect(await look()).toEqual({ font: expect.stringContaining("Atkinson Hyperlegible Next"), zoom: "1.3" });
  await page.reload();
  await expect(page.getByRole("button", { name: "Learn" })).toBeVisible();
  expect(await look()).toEqual({ font: expect.stringContaining("Atkinson Hyperlegible Next"), zoom: "1.3" });
});
