// Weekly and monthly goals with reports (#43). Pure, tested by src/goals.test.ts.
// Metrics are what the app already records per local day: XP (Stats.xpDays), new words (words.created_at)
// and speaking time (speech_sessions). Lessons are left out: step_progress has no timestamp to count them by.
import { weekOf } from "./league.ts"; // the league's week is Monday-based too
import { addDays, today, DEFAULT_GOALS } from "./progress.ts"; // .ts: node --test runs this file directly

export type GoalPeriod = "week" | "month";
export type GoalMetric = "xp" | "words" | "speak";
export type Goal = { metric: GoalMetric; target: number };
export type Goals = Record<GoalPeriod, Goal>;
export type GoalData = { xp: Record<string, number>; words: Record<string, number>; speakMs: Record<string, number> };

export const PERIODS: GoalPeriod[] = ["week", "month"];
export const METRICS: GoalMetric[] = ["xp", "words", "speak"];
/** A target outside this range is almost certainly a typo; the input clamps to it too. */
export const MAX_TARGET = 10_000;

export const clampTarget = (n: number) => (Number.isFinite(n) ? Math.min(MAX_TARGET, Math.max(1, Math.round(n))) : 1);

const goalOf = (g: Goal | undefined, fallback: Goal): Goal =>
  g && METRICS.includes(g.metric) && Number.isFinite(g.target) ? { metric: g.metric, target: clampTarget(g.target) } : { ...fallback };

/** The goals stored on a profile: a missing or malformed one falls back to the default (older profiles have none). */
export const goalsOf = (s: { goals?: Goals }): Goals => ({
  week: goalOf(s.goals?.week, DEFAULT_GOALS.week),
  month: goalOf(s.goals?.month, DEFAULT_GOALS.month),
});

/** First day of the period that contains `day`; weeks start on Monday. */
export const periodStart = (period: GoalPeriod, day: string) => (period === "week" ? weekOf(day) : `${day.slice(0, 7)}-01`);

/** Last day of the period that starts at `start`. Local Date arithmetic, so a DST week is still 7 calendar days. */
export function periodEnd(period: GoalPeriod, start: string) {
  if (period === "week") return addDays(start, 6);
  const [y, m] = start.split("-").map(Number);
  return today(new Date(y, m, 0));
}

/** Every local day of the period, oldest first. */
export function periodDays(period: GoalPeriod, start: string) {
  const end = periodEnd(period, start), days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** The period before the one starting at `start`, across a year boundary too. */
export function previousStart(period: GoalPeriod, start: string) {
  if (period === "week") return addDays(start, -7);
  const [y, m] = start.split("-").map(Number);
  return today(new Date(y, m - 2, 1));
}

/** Total of a per-day record over `days`; days outside the list are ignored. */
export const periodTotal = (perDay: Record<string, number>, days: string[]) =>
  days.reduce((sum, d) => sum + (perDay[d] ?? 0), 0);

/** This period and the one before it for `metric`, in its unit (speaking ms become whole minutes). */
export function metricTotals(metric: GoalMetric, period: GoalPeriod, day: string, data: GoalData) {
  const start = periodStart(period, day), before = previousStart(period, start);
  const map = metric === "xp" ? data.xp : metric === "words" ? data.words : data.speakMs;
  const scale = metric === "speak" ? (n: number) => Math.round(n / 60_000) : (n: number) => n;
  return {
    start, end: periodEnd(period, start),
    cur: scale(periodTotal(map, periodDays(period, start))),
    prev: scale(periodTotal(map, periodDays(period, before))),
  };
}

/** Monday of the week before `day`'s own: the week a summary reports once a new one starts. */
export const finishedWeek = (day: string) => addDays(weekOf(day), -7);

/** The finished week still to be reported, or null when `reported` already covers it (ISO dates compare as strings). */
export const reportDue = (reported: string, day: string) => (reported >= finishedWeek(day) ? null : finishedWeek(day));
