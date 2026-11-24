// Custom tutor management (#167 M4): write, edit, import and delete the tutors that sit beside the built-in cast.
// Opened from Roleplay; every change goes through db + store.reloadTutors so the pickers see it at once.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../icons";
import { useApp } from "../store";
import * as db from "../db";
import { loadKokoro, sayWithKokoro } from "../tts";
import { Face } from "../face/Face";
import {
  KOKORO_VOICES, TUTOR_AVATAR_MAX, TUTOR_NAME_MAX, TUTOR_PERSONA_MAX, TUTOR_SCENE_MAX, TUTOR_TOPIC_GOAL_MAX, TUTOR_TOPICS_MAX,
  parseTutorPackage, toCharacter, tutorFileName, tutorPackageOf, TUTOR_FACE, type TutorPackage,
} from "../tutors";

/** A package file is read into memory before JSON.parse, so keep a learner from picking a huge unrelated file. */
const IMPORT_MAX = 4 * 1024 * 1024;
/** Kokoro speaks English only: the voice preview is a short English line whatever course is open. */
const VOICE_SAMPLE = "Hello! Nice to meet you. How are you today?";
const gap = (g = "14px") => ({ "--od-gap": g }) as React.CSSProperties;

type TopicRow = { id: string | null; goal: string };

/** A stable topic id from its goal: ASCII letters and digits, starting with a letter, unique in the form. */
function topicId(goal: string, used: ReadonlySet<string>, index: number): string {
  const base = goal.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "").replace(/^[^a-z]+/, "").slice(0, 28) || `topic${index + 1}`;
  let id = base, n = 2;
  while (used.has(id) || id === "free") id = `${base.slice(0, 29)}${n++}`;
  return id;
}

/** Rows the form holds: a saved topic keeps its id (talk ids may already be remembered), a new one gets one on save. */
function topicsOf(rows: TopicRow[]): { id: string; goal: string }[] {
  const used = new Set(rows.flatMap((r) => (r.id ? [r.id] : [])));
  return rows.map((r, i) => {
    const id = r.id ?? topicId(r.goal, used, i);
    used.add(id);
    return { id, goal: r.goal.trim() };
  });
}

function Errors({ errors }: { errors: string[] }) {
  const { t } = useTranslation();
  if (!errors.length) return null;
  return (
    <div role="alert" className="small" style={{ color: "var(--red)", textAlign: "left" }}>
      <b>{t("tutorManage.errors")}</b>
      <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
    </div>
  );
}

/** A file input that turns a PNG or WebP into the data URL the package stores. */
function ImageField({ label, max, value, onChange, onProblem }: {
  label: string; max: number; value: string | undefined; onChange: (url: string | undefined) => void; onProblem: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const pick = useRef<HTMLInputElement>(null);
  const file = (f: File) => {
    if (f.size > max) return onProblem(t("tutorManage.fileTooLarge", { size: `${Math.round(max / 1024)} KB` }));
    const r = new FileReader();
    r.onload = () => onChange(String(r.result));
    r.onerror = () => onProblem(t("tutorManage.imageFailed"));
    r.readAsDataURL(f);
  };
  return (
    <div className="od-field" style={gap("6px")}>
      <b>{label}</b>
      <input ref={pick} type="file" accept="image/png,image/webp" aria-label={label} hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) file(f); }} />
      <span className="od-row" style={gap("8px")}>
        <button type="button" className="btn btn-ghost" aria-label={`${label}: ${t(value ? "tutorManage.changeImage" : "tutorManage.chooseImage")}`}
          onClick={() => pick.current?.click()}>
          {t(value ? "tutorManage.changeImage" : "tutorManage.chooseImage")}
        </button>
        {value && <>
          <img src={value} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 10 }} />
          <button type="button" className="btn btn-ghost" aria-label={t("tutorManage.clearImage", { label })} onClick={() => onChange(undefined)}>
            <Icon name="x" />
          </button>
        </>}
      </span>
    </div>
  );
}

/** Create (no `initial`) or edit a tutor. Face is TUTOR_FACE unless the tutor already had one, so there is no editor for it. */
function TutorForm({ initial }: { initial?: db.Tutor }) {
  const { t } = useTranslation();
  const { profile, closeSheet, openSheet, reloadTutors, toast } = useApp();
  const [name, setName] = useState(initial?.name ?? "");
  const [gender, setGender] = useState<"f" | "m">(initial?.gender ?? "f");
  const [color, setColor] = useState(initial?.color ?? "#2f80ed");
  const [voice, setVoice] = useState(initial?.kokoroVoice ?? "af_heart");
  const [persona, setPersona] = useState(initial?.persona ?? "");
  const [rows, setRows] = useState<TopicRow[]>(initial ? initial.topics.map((x) => ({ id: x.id, goal: x.goal })) : [{ id: null, goal: "" }]);
  const [avatar, setAvatar] = useState<string | undefined>(initial?.avatar);
  const [scene, setScene] = useState<string | undefined>(initial?.scene);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<number | null>(null); // the Kokoro model downloading for the voice preview
  const [testing, setTesting] = useState(false);
  const voices = KOKORO_VOICES.filter((v) => v[1] === gender);
  const ownVoice = !voices.includes(voice as (typeof KOKORO_VOICES)[number]) && voice[1] === gender;

  const changeGender = (g: "f" | "m") => {
    setGender(g);
    if (voice[1] !== g) setVoice(g === "f" ? "af_heart" : "am_michael");
  };
  // The preview must play the selected Kokoro voice even when the device speaks with another provider or accent.
  const listen = async () => {
    if (preview !== null || testing) return;
    setPreview(0);
    try {
      await loadKokoro(setPreview); // a first use downloads the model, as picking Kokoro in Settings does
      setPreview(null);
      setTesting(true);
      await sayWithKokoro(VOICE_SAMPLE, voice);
    } catch (e) {
      toast(t("voice.loadFailed", { name: "Kokoro", error: (e as Error).message }));
    } finally {
      setPreview(null);
      setTesting(false);
    }
  };
  const setRow = (i: number, goal: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, goal } : r)));
  const save = async () => {
    if (!profile || busy) return;
    setBusy(true);
    const pkg = {
      name, gender, color, kokoroVoice: voice, persona, topics: topicsOf(rows),
      ...(initial?.face ? { face: initial.face } : {}),
      ...(avatar ? { avatar } : {}), ...(scene ? { scene } : {}),
    };
    const parsed = parseTutorPackage(pkg);
    if (!parsed.ok) { setErrors(parsed.errors); setBusy(false); return; }
    try {
      if (initial) await db.updateTutor(profile.id, initial.id, parsed.tutor);
      else await db.createTutor(profile.id, parsed.tutor, "local");
      await reloadTutors();
      openSheet(<TutorsSheet />);
      toast(t(initial ? "tutorManage.updated" : "tutorManage.created"));
    } catch (e) {
      console.error("save tutor", e);
      setErrors([t("tutorManage.saveFailed")]);
      setBusy(false);
    }
  };

  return (
    <div className="od-stack" style={{ ...gap("14px"), textAlign: "left" }}>
      <h3 style={{ textAlign: "center" }}>{t(initial ? "tutorManage.editTitle" : "tutorManage.newTitle")}</h3>
      <div className="od-row" style={gap("12px")}>
        <Face spec={initial?.face ?? TUTOR_FACE} color={color} size={56} label={name || t("tutorManage.title")} image={avatar} />
        <label className="od-field od-fill" style={gap("6px")}>
          <b>{t("tutorManage.name")}</b>
          <input className="input" value={name} maxLength={TUTOR_NAME_MAX} required autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <div className="od-row" style={gap("12px")}>
        <label className="od-field od-fill" style={gap("6px")}>
          <b>{t("tutorManage.gender")}</b>
          <select className="select" value={gender} onChange={(e) => changeGender(e.target.value as "f" | "m")}>
            <option value="f">{t("tutorManage.genderF")}</option>
            <option value="m">{t("tutorManage.genderM")}</option>
          </select>
        </label>
        <label className="od-field" style={gap("6px")}>
          <b>{t("tutorManage.color")}</b>
          <input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 64, padding: 4 }} />
        </label>
      </div>
      <div className="od-field" style={gap("6px")}>
        <b>{t("tutorManage.voice")}</b>
        <div className="od-row" style={gap("8px")}>
          <select className="select od-fill" aria-label={t("tutorManage.voice")} value={voice} onChange={(e) => setVoice(e.target.value)}>
            {voices.map((v) => <option key={v} value={v}>{v}</option>)}
            {ownVoice && <option value={voice}>{voice}</option>}
          </select>
          {!db.isCompanion && ( // Kokoro runs out of memory in the phone's Safari, so Settings does not offer it there either
            <button type="button" className="btn btn-ghost" disabled={preview !== null || testing} aria-busy={preview !== null || testing} onClick={listen}>
              {t("voice.listen")}
            </button>
          )}
        </div>
        {preview !== null && <span className="muted small" role="status">{t("voice.downloading", { pct: Math.round(preview * 100) })}</span>}
      </div>
      <label className="od-field" style={gap("6px")}>
        <b>{t("tutorManage.persona")}</b>
        <textarea className="input" value={persona} maxLength={TUTOR_PERSONA_MAX} rows={5} style={{ minHeight: 110, resize: "vertical" }}
          placeholder={t("tutorManage.personaPlaceholder")} onChange={(e) => setPersona(e.target.value)} />
        <span className="muted small" style={{ textAlign: "right" }}>{t("tutorManage.personaCount", { chars: persona.length, max: TUTOR_PERSONA_MAX })}</span>
      </label>
      <div className="od-field" style={gap("8px")}>
        <b>{t("tutorManage.topics")}</b>
        {rows.map((r, i) => (
          <div className="od-row" key={i} style={gap("8px")}>
            <label className="od-field od-fill" style={gap("4px")}>
              <span className="muted small">{t("tutorManage.topicLabel", { n: i + 1 })}</span>
              <input className="input" value={r.goal} maxLength={TUTOR_TOPIC_GOAL_MAX} onChange={(e) => setRow(i, e.target.value)} />
            </label>
            {rows.length > 1 && (
              <button type="button" className="btn btn-ghost" aria-label={t("tutorManage.removeTopic", { n: i + 1 })}
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Icon name="x" /></button>
            )}
          </div>
        ))}
        {rows.length < TUTOR_TOPICS_MAX && (
          <button type="button" className="btn btn-ghost" onClick={() => setRows((rs) => [...rs, { id: null, goal: "" }])}>+ {t("tutorManage.addTopic")}</button>
        )}
      </div>
      <ImageField label={t("tutorManage.avatar")} max={TUTOR_AVATAR_MAX} value={avatar} onChange={setAvatar} onProblem={(m) => setErrors((es) => [...es, m])} />
      <ImageField label={t("tutorManage.scene")} max={TUTOR_SCENE_MAX} value={scene} onChange={setScene} onProblem={(m) => setErrors((es) => [...es, m])} />
      <Errors errors={errors} />
      <button className="btn btn-primary btn-block" disabled={busy} onClick={() => save()}>{t(initial ? "tutorManage.save" : "tutorManage.create")}</button>
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
    </div>
  );
}

function DeleteTutorSheet({ tutor }: { tutor: db.Tutor }) {
  const { t } = useTranslation();
  const { profile, closeSheet, openSheet, reloadTutors, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!profile || busy) return;
    setBusy(true);
    try {
      await db.deleteTutor(profile.id, tutor.id);
      await reloadTutors();
      openSheet(<TutorsSheet />);
      toast(t("tutorManage.deleted", { name: tutor.name }));
    } catch (e) {
      console.error("delete tutor", e);
      toast(t("tutorManage.deleteFailed"));
      setBusy(false);
    }
  };
  return (
    <div className="od-stack" style={{ ...gap("12px"), textAlign: "left" }}>
      <h3 style={{ textAlign: "center" }}>{t("tutorManage.deleteTitle", { name: tutor.name })}</h3>
      <p>{t("tutorManage.deleteWarn")}</p>
      <button className="btn btn-danger btn-block" disabled={busy} onClick={remove}>{t("tutorManage.delete")}</button>
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
    </div>
  );
}

/** A parsed package is safe to store; the learner still confirms they chose to bring this content in. */
function ImportTutorSheet({ pkg, file }: { pkg: TutorPackage; file: string }) {
  const { t } = useTranslation();
  const { profile, closeSheet, openSheet, reloadTutors, toast } = useApp();
  const [responsible, setResponsible] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!profile || !responsible || busy) return;
    setBusy(true);
    try {
      await db.createTutor(profile.id, pkg, "imported");
      await reloadTutors();
      openSheet(<TutorsSheet />);
      toast(t("tutorManage.importedToast", { name: pkg.name }));
    } catch (e) {
      console.error("import tutor", e);
      setErrors([t("tutorManage.importFailed")]);
      setBusy(false);
    }
  };
  const ch = toCharacter({ ...pkg, id: "custom:preview" });
  return (
    <div className="od-stack" style={{ ...gap("12px"), textAlign: "left" }}>
      <h3 style={{ textAlign: "center" }}>{t("tutorManage.importTitle")}</h3>
      <div className="card od-row" style={gap("10px")}>
        <Face spec={ch.face} color={ch.color} size={48} label={pkg.name} image={pkg.avatar} sceneImage={pkg.scene} />
        <span className="od-field od-fill"><b>{pkg.name}</b><span className="muted small">{file}</span></span>
      </div>
      <p className="small" style={{ margin: 0 }}>{pkg.persona}</p>
      <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{pkg.topics.map((x) => <li key={x.id}>{x.goal}</li>)}</ul>
      <label className="od-row" style={{ ...gap("8px"), alignItems: "flex-start", fontWeight: 700 }}>
        <input type="checkbox" checked={responsible} onChange={(e) => setResponsible(e.target.checked)} style={{ marginTop: 4 }} />
        <span>{t("tutorManage.importConfirm")}</span>
      </label>
      <Errors errors={errors} />
      <button className="btn btn-primary btn-block" disabled={!responsible || busy} onClick={run}>{t("tutorManage.importAction")}</button>
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.cancel")}</button>
    </div>
  );
}

function ImportErrors({ errors }: { errors: string[] }) {
  const { t } = useTranslation();
  const { closeSheet } = useApp();
  return (
    <div className="od-stack" style={{ ...gap("12px"), textAlign: "left" }}>
      <h3 style={{ textAlign: "center" }}>{t("tutorManage.importInvalid")}</h3>
      <Errors errors={errors} />
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.close")}</button>
    </div>
  );
}

/** The row's ⋯ menu: export, edit or delete. Same menu markup and styles as the profile gate. */
function TutorMenu({ tutor }: { tutor: db.Tutor }) {
  const { t } = useTranslation();
  const { openSheet, toast } = useApp();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open]);
  const exportTutor = async () => {
    setOpen(false);
    const json = JSON.stringify(tutorPackageOf(tutor), null, 2), file = tutorFileName(tutor.name);
    try {
      if (db.isTauri) {
        const to = await (await import("@tauri-apps/plugin-dialog")).save({ defaultPath: file, filters: [{ name: "JSON", extensions: ["json"] }] });
        if (!to) return;
        await (await import("@tauri-apps/api/core")).invoke("write_text", { path: to, text: json });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        a.download = file;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      toast(t("tutorManage.exported", { name: tutor.name }));
    } catch (e) {
      console.error("export tutor", e);
      toast(t("tutorManage.exportFailed"));
    }
  };
  return (
    <div className="menu-wrap" ref={wrap} onBlur={(e) => wrap.current?.contains(e.relatedTarget) || setOpen(false)}>
      <button className="btn btn-ghost" aria-label={t("tutorManage.more", { name: tutor.name })} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}><Icon name="dots" /></button>
      {open && (
        <div className="menu" role="menu" onMouseDown={(e) => e.preventDefault()}
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
          <button role="menuitem" className="menu-item" autoFocus onClick={exportTutor}>{t("tutorManage.export")}</button>
          <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); openSheet(<TutorForm initial={tutor} />); }}>{t("tutorManage.edit")}</button>
          <button role="menuitem" className="menu-item danger" onClick={() => { setOpen(false); openSheet(<DeleteTutorSheet tutor={tutor} />); }}>{t("tutorManage.delete")}</button>
        </div>
      )}
    </div>
  );
}

/** The tutor list: create, import, edit and delete; the same sheet returns after each change. */
export function TutorsSheet() {
  const { t } = useTranslation();
  const { tutors, closeSheet, openSheet, toast } = useApp();
  const pick = useRef<HTMLInputElement>(null);
  const read = async (f: File) => {
    if (f.size > IMPORT_MAX) return toast(t("tutorManage.fileTooLarge", { size: `${IMPORT_MAX / 1024 / 1024} MB` }));
    let json: unknown;
    try { json = JSON.parse(await f.text()); } catch { return toast(t("tutorManage.invalidJson")); }
    const parsed = parseTutorPackage(json);
    openSheet(parsed.ok ? <ImportTutorSheet pkg={parsed.tutor} file={f.name} /> : <ImportErrors errors={parsed.errors} />);
  };
  return (
    <div className="od-stack" style={{ ...gap("12px"), textAlign: "left" }}>
      <h3 style={{ textAlign: "center" }}>{t("tutorManage.title")}</h3>
      <p className="small" style={{ margin: 0 }}>{t("tutorManage.desc")}</p>
      {!tutors.length && <p className="muted small" style={{ margin: 0 }}>{t("tutorManage.empty")}</p>}
      {tutors.map((tutor) => (
        <div key={tutor.id} className="card od-row" style={{ ...gap("10px"), padding: "8px 12px" }}>
          <Face spec={tutor.face ?? TUTOR_FACE} color={tutor.color} size={36} label={tutor.name} image={tutor.avatar} />
          <span className="od-fill" title={`${tutor.name}${tutor.topics[0] ? ` · ${tutor.topics[0].goal}` : ""}`}
            style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            <b>{tutor.name}</b>
            {tutor.topics[0] && <span className="muted small"> · {tutor.topics[0].goal}</span>}
          </span>
          {tutor.source === "imported" && <span className="soon-tag" style={{ flexShrink: 0 }}>{t("tutorManage.imported")}</span>}
          <TutorMenu tutor={tutor} />
        </div>
      ))}
      <button className="btn btn-primary btn-block" onClick={() => openSheet(<TutorForm />)}>+ {t("tutorManage.create")}</button>
      <button className="btn btn-ghost btn-block" onClick={() => pick.current?.click()}>{t("tutorManage.import")}</button>
      <input ref={pick} type="file" accept=".json,application/json" aria-label={t("tutorManage.importFile")} hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f).catch((err) => { console.error("import tutor", err); toast(t("tutorManage.importFailed")); }); }} />
      <button className="btn btn-ghost btn-block" onClick={closeSheet}>{t("sheet.close")}</button>
    </div>
  );
}
