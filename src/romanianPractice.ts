import { shuffleAnswer, type Item } from "./activities.ts";
import type { Fix } from "./writing.ts";

const MICRO = [
  ["Ieri, când am ajuns la cabinet, medicul ___ deja. Acum trebuie să fac altă programare.", "plecase", "pleacă", "va pleca"],
  ["Când eram elev, ___ cu autobuzul în fiecare dimineață.", "mergeam", "am mers o singură dată", "voi merge"],
  ["Vă rog ___ confirmarea până joi.", "să trimiteți", "trimiteți", "ați trimis"],
] as const;

function choice(prompt: string, context: string, answer: string, alternatives: readonly string[], listen = ""): Item {
  return { kind: "choice", prompt, context, listen, big: false, ...shuffleAnswer([answer, ...alternatives], 0) };
}

export function romanianContrast(index: number): Item {
  const [context, answer, ...options] = MICRO[index];
  return choice("Completează propoziția.", context, answer, options);
}

export const contrastFor = (text: string) => [
  /\b(?:plecase|uitasem|uitase|ajunsesem)\b/iu,
  /\b(?:locuiam|mergeam|așteptam|eram|pregăteam)\b/iu,
  /\bsă\s+(?:trimiteți|trimiți|ajungem|confirmi|confirmați)\b/iu,
].findIndex((pattern) => pattern.test(text));

export function romanianMission(id: "a1" | "b1", native: string): Item[] {
  const ru = native === "ru";
  const b1 = id === "b1";
  const audio = b1 ? "Bună ziua! Întâlnirea de marți se mută joi la ora trei, în sala doi. Vă rugăm să confirmați astăzi." :
    "Bună ziua! O cafea cu lapte costă opt lei. O apă costă cinci lei.";
  const phrase = b1 ? "Confirm întâlnirea de joi la ora trei." : "O cafea cu lapte, vă rog.";
  const meaning = b1 ? (ru ? "Подтверждаю встречу в четверг в три часа." : "I confirm the meeting on Thursday at three.") :
    (ru ? "Кофе с молоком, пожалуйста." : "A coffee with milk, please.");
  return [
    choice(b1 ? (ru ? "На какой день перенесли встречу?" : "What day is the meeting now?") :
      (ru ? "Сколько стоит кофе с молоком?" : "How much is the coffee with milk?"), "", b1 ? "Joi." : "Opt lei.", b1 ? ["Marți.", "Vineri."] : ["Cinci lei.", "Zece lei."], audio),
    choice(b1 ? (ru ? "Что нужно сделать сегодня?" : "What should you do today?") :
      (ru ? "Как заказать кофе с молоком?" : "How do you order a coffee with milk?"), "",
      b1 ? "Să confirm întâlnirea." : phrase, b1 ? ["Să merg în sala doi.", "Să anulez întâlnirea."] : ["O apă, vă rog.", "Nota de plată, vă rog."], b1 ? audio : ""),
    { kind: "input", prompt: ru ? "Напиши реплику, которую скажешь." : "Write the line you would say.", context: meaning, listen: "", answer: phrase, accepted: b1
      ? ["Confirm că vin joi la ora trei.", "Confirm întâlnirea de joi la trei."] : ["Aș dori o cafea cu lapte, vă rog.", "Vreau o cafea cu lapte, vă rog."], literal: true },
    { kind: "speak", phrase, translation: meaning },
  ];
}

/** Repair specific, unambiguous model errors reproduced in the Romanian audit. */
export function repairRomanian(text: string) {
  return text.replace(/\bplecasa\b/gu, "plecase").replace(/\blocuimeam\b/gu, "locuiam").replace(/\bîn gării\b/gu, "în gară")
    .replace(/\bScuza-mă\b/gu, "Scuză-mă").replace(/\bdoriți să beați\b/gu, "doriți să beți")
    .replace(/\bCe fel de cafea doriți să bea\?/gu, "Ce fel de cafea doriți să beți?").replace(/\bdin pătrind\b/gu, "din păcate")
    .replace(/\bsă soase o vânt\b/gu, "să bată un vânt").replace(/\bajuns întârziar\b/gu, "ajuns târziu")
    .replace(/\bcursă noastră\b/gu, "cursul nostru");
}

export function repairRomanianExplanation(text: string, native: string) {
  if (/\bvreau\b/iu.test(text) && /[-−]o\b/u.test(text)) {
    return text.split(/\s*\(/u)[0].trim() + (native === "ru"
      ? " (В первом лице единственного числа от «a vrea» употребляется форма «vreau».)"
      : native === "en" ? " (The first-person singular of a vrea is vreau.)" : "");
  }
  return repairRomanian(text);
}

export function romanianWritingFixes(text: string, native: string): Fix[] {
  if (native !== "ru" && native !== "en") return [];
  const ru = native === "ru";
  return [
    { match: /\bdespre documentele(?=[.!?;]|$)/u, corrected: "despre documente",
      why: ru ? "Здесь после «despre» употребляется неопределённая форма «documente»." : "Use the indefinite form documente here after despre." },
    { match: /\bvorbesc român puțin\b/u, corrected: "vorbesc puțin română",
      why: ru ? "Название языка — «română». Порядок слов «vorbesc puțin română» звучит естественно." : "Use română for the language, with puțin before it here." },
  ].flatMap(({ match, corrected, why }) => {
    const original = text.match(match)?.[0];
    return original ? [{ original, corrected, why }] : [];
  });
}

export function romanianMistakeContrast(item: Item): number {
  if (item.kind === "choice") return contrastFor(item.context.replace("___", item.options[item.answer] ?? "") || item.options[item.answer] || "");
  if (item.kind === "input") return contrastFor(item.answer);
  if (item.kind === "bank") return contrastFor(item.answer.join(" "));
  return item.kind === "speak" ? contrastFor(item.phrase) : -1;
}
