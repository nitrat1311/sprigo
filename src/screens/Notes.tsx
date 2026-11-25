// Notes and journal (#46): the learner's own words, a note per unit and one dated entry per day.
// Stored in SQLite (src/db.ts, migration v10) and part of the database file, so export and backups carry them.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../icons";
import { useApp } from "../store";
import * as db from "../db";
import { today } from "../progress";
import { JOURNAL_MAX, NOTE_MAX, cleanEntry, snippet } from "../notes";
import { levelsOf, unitRef, type Cefr, type CourseLevel } from "../course";
import { checkWriting } from "../lessons";
import type { Feedback } from "../writing";
import { useLangName } from "./Profiles";

const gap = (g: string) => ({ "--od-gap": g }) as React.CSSProperties;

type Tab = "journal" | "units";
const fullDate = (day: string, locale: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(locale, { dateStyle: "medium" });

export function Notes() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("journal");
  return (
    <>
      <h1 className="section-title">{t("notes.title")}</h1>
      <p className="muted" style={{ marginBottom: "var(--s-5)" }}>{t("notes.subtitle")}</p>
      <div className="tabs" role="tablist" aria-label={t("notes.title")}>
        {(["journal", "units"] as Tab[]).map((k) => (
          <button key={k} role="tab" id={`notes-tab-${k}`} aria-selected={tab === k} aria-controls={`notes-panel-${k}`} onClick={() => setTab(k)}>
            {t(`notes.tabs.${k}`)}
          </button>
        ))}
      </div>
      {/* Both panels stay mounted, only one is shown: a journal draft must survive a look at the unit notes. */}
      <div id="notes-panel-journal" role="tabpanel" aria-labelledby="notes-tab-journal" hidden={tab !== "journal"} className="od-stack" style={gap("var(--s-5)")}>
        <Journal />
      </div>
      <div id="notes-panel-units" role="tabpanel" aria-labelledby="notes-tab-units" hidden={tab !== "units"} className="od-stack" style={gap("var(--s-5)")}>
        <UnitNotes />
      </div>
    </>
  );
}

function Journal() {
  const { t, i18n } = useTranslation();
  const langName = useLangName();
  const { profile, course, enrollment, ai, sheet, toast, openSheet } = useApp();
  const day = today();
  const [entries, setEntries] = useState<db.JournalEntry[]>([]);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const loadedDay = useRef(day); // the day the editor's text belongs to; a change means the app stayed open overnight
  // Reloaded after a sheet closes (it may have edited or deleted another day's entry), never on open:
  // that would drop a draft the learner was still typing. A new day starts from that day's stored entry.
  const load = () => db.listJournal(profile!.id).then((list) => {
    setEntries(list);
    const stored = list.find((e) => e.day === day)?.text ?? "";
    const rolled = loadedDay.current !== day;
    loadedDay.current = day;
    if (rolled || cleanEntry(text) === saved) { setText(stored); setSaved(stored); }
  });
  useEffect(() => { if (!sheet) load().catch((e) => console.error("journal", e)); }, [profile!.id, day, !sheet]);

  const clean = cleanEntry(text);
  const save = async () => {
    setBusy(true);
    try { await db.saveJournalEntry(profile!.id, day, text); setSaved(clean); toast(t("notes.saved")); await load(); }
    catch (e) { toast(t("notes.saveFailed")); console.error("journal", e); }
    finally { setBusy(false); }
  };
  const check = async () => {
    if (!course || !enrollment) return;
    setBusy(true); setErr("");
    try {
      const fb = await checkWriting({ course, level: enrollment.level, native: profile!.native_lang }, t("notes.entryLabel"), clean);
      openSheet(<CheckSheet fb={fb} lang={course.iso} />);
    } catch (e) { console.warn("check", e); setErr(t("notes.checkFailed")); }
    finally { setBusy(false); }
  };
  const past = entries.filter((e) => e.day !== day);
  return (
    <>
      <div className="card od-stack" style={gap("var(--s-4)")}>
        <div>
          <h2 style={{ margin: 0 }}>{t("notes.today")}</h2>
          <span className="muted small">{fullDate(day, i18n.language)} · {t("notes.writeIn", { lang: course ? langName(course.iso) : "—" })}</span>
        </div>
        <textarea id="journal-today" className="input" rows={6} maxLength={JOURNAL_MAX} value={text} disabled={busy}
          aria-label={t("notes.entryLabel")} placeholder={t("write.placeholder")}
          onChange={(e) => { setText(e.target.value); setErr(""); }} />
        {err && <p className="small" role="alert" style={{ color: "var(--red)", margin: 0 }}>{err}</p>}
        <div className="od-row" style={{ ...gap("var(--s-3)"), flexWrap: "wrap" }}>
          <button className="btn btn-primary" disabled={busy || clean === saved} onClick={save}>{t("notes.save")}</button>
          <button className="btn btn-ghost" disabled={busy || !clean || !ai || !enrollment || !course} onClick={check}>
            <Icon name="spark" /> {t(busy ? "notes.checking" : "notes.check")}
          </button>
        </div>
        {!ai && <span className="muted small">{t("notes.checkNoAi")}</span>}
      </div>

      {past.length > 0 && <>
        <h2 className="section-title" style={{ margin: 0 }}>{t("notes.past")}</h2>
        <div className="od-stack" style={gap("var(--s-3)")}>
          {past.map((e) => (
            <button key={e.day} className="card row-item" onClick={() => openSheet(<EntrySheet entry={e} />)}>
              <Icon name="pen" />
              <span className="od-field od-fill"><b>{fullDate(e.day, i18n.language)}</b><span className="muted small">{snippet(e.text)}</span></span>
            </button>
          ))}
        </div>
      </>}
      {!entries.length && <p className="muted small">{t("notes.empty")}</p>}
    </>
  );
}

function EntrySheet({ entry }: { entry: db.JournalEntry }) {
  const { t, i18n } = useTranslation();
  const { profile, toast, closeSheet } = useApp();
  const [text, setText] = useState(entry.text);
  const save = async () => { await db.saveJournalEntry(profile!.id, entry.day, text); toast(t("notes.saved")); closeSheet(); };
  const remove = async () => { await db.deleteJournalEntry(profile!.id, entry.day); toast(t("notes.deleted")); closeSheet(); };
  return (
    <form className="od-stack sheet-wide" style={gap("var(--s-4)")} onSubmit={(e) => { e.preventDefault(); save(); }}>
      <h3>{fullDate(entry.day, i18n.language)}</h3>
      <textarea className="input" rows={8} maxLength={JOURNAL_MAX} value={text} autoFocus
        aria-label={t("notes.pastEntryLabel", { date: fullDate(entry.day, i18n.language) })} onChange={(e) => setText(e.target.value)} />
      <div className="od-row" style={gap("var(--s-3)")}>
        <button className="btn btn-primary od-fill" type="submit" disabled={!text.trim()}>{t("notes.save")}</button>
        <button className="btn btn-danger" type="button" onClick={remove}>{t("notes.delete")}</button>
      </div>
      <button className="btn btn-ghost" type="button" onClick={closeSheet}>{t("sheet.close")}</button>
    </form>
  );
}

/** One row per unit of the current course, in course order; a note is keyed by level and unit (src/course.ts unitRef). */
function UnitNotes() {
  const { t, i18n } = useTranslation();
  const langName = useLangName();
  const { course, enrollment, sheet, openSheet } = useApp();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = () => enrollment ? db.listUnitNotes(enrollment.id).then((list) => setNotes(Object.fromEntries(list.map((n) => [n.unit_ref, n.text])))) : Promise.resolve();
  // Same as the journal: a sheet may have changed a note, so read again once it closes.
  useEffect(() => { if (!sheet) load().catch((e) => console.error("notes", e)); }, [enrollment?.id, !sheet]);

  if (!course || !enrollment) return <p className="muted small">{t("notes.noCourse")}</p>;
  const rows = levelsOf(course).flatMap((level) => (course.levels[level] as CourseLevel).units.map((unit) => ({ level, unit })));
  return (
    <>
      <span className="muted small">{t("notes.unitsHint", { lang: langName(course.iso) })}</span>
      <div className="od-stack" style={gap("var(--s-3)")}>
        {rows.map(({ level, unit }) => {
          const ref = unitRef(level, unit.id), note = notes[ref];
          return (
            <button key={ref} className="card row-item" onClick={() => openSheet(<UnitNoteSheet level={level} unitId={unit.id} title={unit.title} />)}>
              <Icon name="pen" />
              <span className="od-field od-fill"><b>{unit.title}</b>
                <span className="muted small" lang={note ? course.iso : i18n.language}>{note ? snippet(note) : `${level} · ${t("notes.noNote")}`}</span></span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function UnitNoteSheet({ level, unitId, title }: { level: Cefr; unitId: string; title: string }) {
  const { t } = useTranslation();
  const { course, enrollment, toast, closeSheet } = useApp();
  const ref = unitRef(level, unitId);
  const [text, setText] = useState("");
  const [had, setHad] = useState(false); // a saved note exists: only then is there something to delete
  useEffect(() => { if (enrollment) db.listUnitNotes(enrollment.id).then((list) => {
    const note = list.find((n) => n.unit_ref === ref);
    setText(note?.text ?? ""); setHad(!!note);
  }); }, [enrollment?.id, ref]);
  const save = async () => { await db.saveUnitNote(enrollment!.id, ref, text); toast(t("notes.saved")); closeSheet(); };
  const remove = async () => { await db.saveUnitNote(enrollment!.id, ref, ""); toast(t("notes.deleted")); closeSheet(); };
  return (
    <form className="od-stack sheet-wide" style={gap("var(--s-4)")} onSubmit={(e) => { e.preventDefault(); save(); }}>
      <h3>{title}</h3>
      <span className="muted small">{t("notes.unitLabel", { level })}</span>
      <textarea className="input" rows={6} maxLength={NOTE_MAX} value={text} autoFocus lang={course?.iso}
        aria-label={t("notes.noteLabel", { unit: title })} placeholder={t("notes.notePlaceholder")}
        onChange={(e) => setText(e.target.value)} />
      <div className="od-row" style={gap("var(--s-3)")}>
        <button className="btn btn-primary od-fill" type="submit" disabled={!text.trim()}>{t("notes.save")}</button>
        {had && <button className="btn btn-danger" type="button" onClick={remove}>{t("notes.delete")}</button>}
      </div>
      <button className="btn btn-ghost" type="button" onClick={closeSheet}>{t("sheet.close")}</button>
    </form>
  );
}

/** The writing practice feedback (src/writing.ts) on the learner's own entry; nothing is stored but the entry itself. */
function CheckSheet({ fb, lang }: { fb: Feedback; lang: string }) {
  const { t } = useTranslation();
  const { closeSheet } = useApp();
  return (
    <div className="od-stack sheet-wide" style={gap("var(--s-4)")}>
      <h3>{t("notes.checkTitle")}</h3>
      {fb.comment && <p className="small" style={{ margin: 0 }}>{fb.comment}</p>}
      {fb.corrections.length
        ? <ul className="mem-list">{fb.corrections.map((c, i) => (
            <li key={i}><span className="mem-item"><span><s>{c.original}</s> → <b lang={lang}>{c.corrected}</b>
              <span className="muted small" style={{ display: "block" }}>{c.why}</span></span></span></li>
          ))}</ul>
        : <p className="small" style={{ margin: 0 }}>{t("write.noCorrections")}</p>}
      <div><b className="small">{t("write.rewritten")}</b>
        <p lang={lang} style={{ margin: "var(--s-2) 0 0", whiteSpace: "pre-wrap" }}>{fb.rewritten}</p></div>
      <button className="btn btn-ghost" onClick={closeSheet}>{t("sheet.close")}</button>
    </div>
  );
}
