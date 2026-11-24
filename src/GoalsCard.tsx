// Profile → Goals (#43): a weekly and a monthly target, their progress this period, and a report of
// this period against the one before. Data is derived from Stats.xpDays, db.profileWordDays and db.speechMsDays.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "./store";
import {
  clampTarget, metricTotals, periodEnd, periodStart, type Goal, type GoalData, type GoalMetric, type GoalPeriod, type Goals,
} from "./goals";

/** Local short date for a YYYY-MM-DD day, e.g. "Nov 23". */
const dayLabel = (day: string, lang: string) => new Date(day + "T12:00").toLocaleDateString(lang, { month: "short", day: "numeric" });

function GoalCard({ period, goal, goals, day, data, onChange }:
  { period: GoalPeriod; goal: Goal; goals: Goals; day: string; data: GoalData; onChange: (p: GoalPeriod, g: Goal) => void }) {
  const { t, i18n } = useTranslation();
  const { openSheet } = useApp();
  // The input is local while typing and commits on blur, so a half-typed number is never saved.
  const [target, setTarget] = useState(String(goal.target));
  useEffect(() => setTarget(String(goal.target)), [goal.target]);
  const start = periodStart(period, day), total = metricTotals(goal.metric, period, day, data);
  const unit = t(`goals.units.${goal.metric}`);
  const pct = Math.min(100, Math.round((total.cur / goal.target) * 100));
  return (
    <section className="card od-stack" style={{ "--od-gap": "10px" } as React.CSSProperties} aria-labelledby={`goal-${period}`}>
      <div className="od-row" style={{ "--od-gap": "10px" } as React.CSSProperties}>
        <span className="od-field od-fill"><b id={`goal-${period}`}>{t(`goals.${period}`)}</b>
          <span className="muted small">{dayLabel(start, i18n.language)} – {dayLabel(periodEnd(period, start), i18n.language)}</span></span>
        <button className="btn btn-ghost" onClick={() => openSheet(<ReportSheet period={period} start={start} goals={goals} data={data} />)}>{t("goals.report")}</button>
      </div>
      <div className="progress-track"><i className={`progress-fill${pct >= 100 ? " green" : ""}`} style={{ display: "block", width: `${pct}%` }} /></div>
      <div className="od-row" style={{ "--od-gap": "10px" } as React.CSSProperties}>
        <span className="small">{t("goals.progress", { n: total.cur, goal: goal.target, unit })}</span>
        <span className="muted small" style={{ marginLeft: "auto" }}>{t("goals.previous", { n: total.prev, unit })}</span>
      </div>
      <div className="od-row" style={{ "--od-gap": "10px" } as React.CSSProperties}>
        <label className="od-row od-fill" style={{ "--od-gap": "8px" } as React.CSSProperties}>
          <span className="muted small">{t("goals.measure")}</span>
          <select className="select" aria-label={t("goals.measureAria", { period: t(`goals.${period}Short`) })} value={goal.metric}
            onChange={(e) => onChange(period, { ...goal, metric: e.target.value as GoalMetric })}>
            {(["xp", "words", "speak"] as GoalMetric[]).map((m) => <option key={m} value={m}>{t(`goals.metrics.${m}`)}</option>)}
          </select>
        </label>
        <label className="od-row od-fill" style={{ "--od-gap": "8px" } as React.CSSProperties}>
          <span className="muted small">{t("goals.target")}</span>
          <input className="input" type="number" min={1} max={10_000} step={10} value={target}
            aria-label={t("goals.targetAria", { period: t(`goals.${period}Short`) })}
            onChange={(e) => setTarget(e.target.value)}
            onBlur={() => {
              const n = clampTarget(Number(target));
              setTarget(String(n));
              if (n !== goal.target) onChange(period, { ...goal, target: n });
            }} />
        </label>
      </div>
    </section>
  );
}

/** The report sheet: this period against the one before, for every metric, plus the period's goal. */
export function ReportSheet({ period, start, goals, data }: { period: GoalPeriod; start: string; goals: Goals; data: GoalData }) {
  const { t, i18n } = useTranslation();
  const { closeSheet } = useApp();
  const goal = goals[period];
  const rows = (["xp", "words", "speak"] as GoalMetric[]).map((m) => ({ m, ...metricTotals(m, period, start, data) }));
  const mine = rows.find((r) => r.m === goal.metric)!;
  const left = Math.max(0, goal.target - mine.cur);
  return (
    <div className="od-stack" style={{ "--od-gap": "12px" } as React.CSSProperties}>
      <h3 style={{ textAlign: "center" }}>{t(`goals.${period}Report`)}</h3>
      <p className="muted small" style={{ textAlign: "center" }}>
        {t("goals.range", { from: dayLabel(start, i18n.language), to: dayLabel(periodEnd(period, start), i18n.language) })}
      </p>
      {rows.map((r) => (
        <div className="card od-row" key={r.m} style={{ "--od-gap": "10px" } as React.CSSProperties}>
          <span className="od-field od-fill"><b>{t(`goals.metrics.${r.m}`)}</b>
            <span className="muted small">{t("goals.previous", { n: r.prev, unit: t(`goals.units.${r.m}`) })}</span></span>
          <b style={{ fontSize: 18 }}>{r.cur} <span className="muted small">{t(`goals.units.${r.m}`)}</span></b>
        </div>
      ))}
      <p role="status" className="small" style={{ fontWeight: 800, color: left ? "var(--text-muted)" : "var(--green-dark)" }}>
        {left ? t("goals.goalLeft", { n: left, unit: t(`goals.units.${goal.metric}`) }) : t("goals.goalDone")}
      </p>
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.close")}</button>
    </div>
  );
}

/** The two goal cards; `day` is today's local date and the maps are per-day totals (see src/goals.ts). */
export function GoalsCard({ goals, day, xpDays, wordDays, speechMs, onChange }:
  { goals: Goals; day: string; xpDays: Record<string, number>; wordDays: Record<string, number>; speechMs: Record<string, number>;
    onChange: (p: GoalPeriod, g: Goal) => void }) {
  const data = { xp: xpDays, words: wordDays, speakMs: speechMs };
  return (
    <div className="od-grid profile-cards" style={{ "--od-cols": 2, "--od-gap": "12px" } as React.CSSProperties}>
      {(["week", "month"] as GoalPeriod[]).map((p) => (
        <GoalCard key={p} period={p} goal={goals[p]} goals={goals} day={day} data={data} onChange={onChange} />
      ))}
    </div>
  );
}
