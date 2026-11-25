import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampTarget, finishedWeek, goalsOf, MAX_TARGET, metricTotals, periodDays, periodEnd, periodStart, previousStart, reportDue, type GoalData,
} from "./goals.ts";
import { DEFAULT_GOALS } from "./progress.ts";

// Today is Tue 2026-11-24 in these fixtures; its Monday is 2026-11-23.
test("periodStart: weeks start on Monday, months on the 1st", () => {
  assert.equal(periodStart("week", "2026-11-24"), "2026-11-23");
  assert.equal(periodStart("week", "2026-11-23"), "2026-11-23", "Monday is its own week start");
  assert.equal(periodStart("week", "2026-11-29"), "2026-11-23", "Sunday closes the week it began");
  assert.equal(periodStart("month", "2026-11-24"), "2026-11-01");
  assert.equal(periodStart("month", "2026-11-01"), "2026-11-01");
});

test("periodEnd: Sunday, month lengths and leap February", () => {
  assert.equal(periodEnd("week", "2026-11-23"), "2026-11-29");
  assert.equal(periodEnd("week", "2026-12-28"), "2027-01-03", "the week crosses into the next year");
  assert.equal(periodEnd("month", "2026-11-01"), "2026-11-30");
  assert.equal(periodEnd("month", "2026-12-01"), "2026-12-31");
  assert.equal(periodEnd("month", "2027-02-01"), "2027-02-28");
  assert.equal(periodEnd("month", "2028-02-01"), "2028-02-29", "leap year");
});

test("periodDays: every local day once, across DST weeks and months", () => {
  // 2026-03-08 (US) and 2026-03-29 (EU) are DST starts; 2026-10-25 and 2026-11-01 are DST ends.
  for (const start of ["2026-03-02", "2026-03-23", "2026-10-19", "2026-10-26"]) {
    const days = periodDays("week", start);
    assert.equal(days.length, 7, start);
    assert.equal(new Set(days).size, 7, `${start}: no repeated day`);
    assert.equal(days[0], start);
    assert.equal(days[6], periodEnd("week", start));
  }
  assert.deepEqual(periodDays("week", "2026-03-23"),
    ["2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29"]);
  const march = periodDays("month", "2026-03-01");
  assert.equal(march.length, 31);
  assert.deepEqual(march.slice(-2), ["2026-03-30", "2026-03-31"]);
});

test("previousStart: the period before, across year boundaries", () => {
  assert.equal(previousStart("week", "2026-11-23"), "2026-11-16");
  assert.equal(previousStart("week", "2026-01-05"), "2025-12-29");
  assert.equal(previousStart("month", "2026-01-01"), "2025-12-01");
  assert.equal(previousStart("month", "2026-03-01"), "2026-02-01");
});

const data: GoalData = {
  xp: { "2026-11-16": 5, "2026-11-22": 15, "2026-11-23": 20, "2026-11-24": 0, "2026-11-29": 3, "2026-11-30": 100 },
  words: { "2026-11-22": 4, "2026-11-23": 2 },
  speakMs: { "2026-11-17": 600_000, "2026-11-24": 90_000, "2026-11-25": 30_000 },
};

test("metricTotals: this week against last week, boundaries included", () => {
  assert.deepEqual(metricTotals("xp", "week", "2026-11-24", data), {
    start: "2026-11-23", end: "2026-11-29", cur: 23, prev: 20,
  });
  assert.equal(metricTotals("words", "week", "2026-11-24", data).cur, 2);
  assert.equal(metricTotals("words", "week", "2026-11-24", data).prev, 4);
});

test("metricTotals: speaking time sums milliseconds, then rounds to whole minutes", () => {
  const speak = metricTotals("speak", "week", "2026-11-24", data);
  assert.deepEqual({ cur: speak.cur, prev: speak.prev }, { cur: 2, prev: 10 });
});

test("metricTotals: months, including December into January", () => {
  const yearEnd: GoalData = { xp: { "2026-12-31": 30, "2027-01-01": 7, "2026-11-30": 50 }, words: {}, speakMs: {} };
  assert.deepEqual(metricTotals("xp", "month", "2027-01-15", yearEnd), {
    start: "2027-01-01", end: "2027-01-31", cur: 7, prev: 30,
  });
});

test("reportDue: one summary per finished week", () => {
  assert.equal(finishedWeek("2026-11-24"), "2026-11-16");
  assert.equal(finishedWeek("2026-11-29"), "2026-11-16", "Sunday still reports the week before");
  assert.equal(reportDue("", "2026-11-24"), "2026-11-16");
  assert.equal(reportDue("2026-11-09", "2026-11-24"), "2026-11-16", "a missed week is reported once, not replayed");
  assert.equal(reportDue("2026-11-16", "2026-11-24"), null);
  assert.equal(reportDue("2026-11-23", "2026-11-24"), null, "a clock that moved back does not repeat a report");
  assert.equal(reportDue("2026-11-16", "2026-11-30"), "2026-11-23", "a new week brings a new summary");
});

test("clampTarget: whole numbers inside the allowed range", () => {
  assert.equal(clampTarget(0), 1);
  assert.equal(clampTarget(-5), 1);
  assert.equal(clampTarget(12.6), 13);
  assert.equal(clampTarget(MAX_TARGET + 500), MAX_TARGET);
  for (const bad of [NaN, Infinity, -Infinity]) assert.equal(clampTarget(bad), 1);
});

test("goalsOf: defaults for older profiles, repairs a malformed goal", () => {
  assert.deepEqual(goalsOf({}), DEFAULT_GOALS);
  const odd = { week: { metric: "nope", target: 5 }, month: { metric: "words", target: 0 } } as unknown as typeof DEFAULT_GOALS;
  assert.deepEqual(goalsOf({ goals: odd }), { week: DEFAULT_GOALS.week, month: { metric: "words", target: 1 } });
});
