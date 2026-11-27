import { shuffle, shuffleAnswer, type Item } from "./activities.ts";

type Question = readonly [prompt: string, context: string, answer: string, ...distractors: [string, string, ...string[]]];
const A1: Question[] = [
  ["Ce spui la ora 8 dimineața?", "", "Bună dimineața!", "Noapte bună!", "La revedere!"],
  ["Alege forma lui «a fi».", "Eu ___ Ana.", "sunt", "ești", "este"],
  ["Ce întreabă Ana?", "Ana: De unde ești?", "Din ce țară vii?", "Cum te cheamă?", "Câți ani ai?"],
  ["Alege numărul potrivit.", "douăzeci și șapte", "27", "72", "17"],
  ["Alege forma lui «a avea».", "Fratele meu ___ două fete.", "are", "am", "ai"],
  ["Unde este biblioteca?", "Biblioteca este lângă gară.", "Aproape de gară.", "În gară.", "Departe de gară."],
  ["Ce răspuns se potrivește?", "Chelner: Ce doriți să beți?", "O apă, vă rog.", "O salată, vă rog.", "La ora trei."],
  ["Cât costă în total?", "O cafea costă 8 lei. O apă costă 5 lei.", "13 lei", "11 lei", "15 lei"],
  ["Alege prepoziția.", "Mă trezesc ___ ora șapte.", "la", "din", "cu"],
  ["Când merge Maria la piață?", "În fiecare sâmbătă, Maria merge la piață.", "Sâmbăta.", "Duminica.", "Vinerea."],
  ["Alege auxiliarul.", "Ieri ___ cumpărat pâine.", "am", "sunt", "voi"],
  ["Ce cere clientul?", "@Aș dori nota de plată, vă rog.", "Vrea să plătească.", "Vrea să comande o cafea.", "Vrea o masă lângă geam."],
  ["Unde locuiește Dan?", "@Dan locuiește în București, dar lucrează în Ploiești.", "În București.", "În Ploiești.", "În Brașov."],
  ["La ce oră pleacă autobuzul?", "@Autobuzul pleacă la ora șase.", "La 6.", "La 7.", "La 8."],
];

const B1: Question[] = [
  ["Ce trebuie să facă participanții?", "Atelierul de sâmbătă se mută în sala 5. Participanții deja înscriși sunt rugați să confirme până joi.", "Să confirme participarea.", "Să se înscrie din nou sâmbătă.", "Să meargă în sala veche."],
  ["Când se poate vizita apartamentul?", "Proprietarul lucrează până la ora 18. Poate prezenta apartamentul de la 18:30 dacă primește un mesaj înainte.", "De la 18:30, dacă trimiți un mesaj în prealabil.", "Dimineața, fără programare.", "Oricând, fără să anunți."],
  ["Care este propunerea?", "Autobuzele întârzie adesea în zona școlii. Locatarii vor să ceară o stație mai aproape de intrare.", "Mutarea stației mai aproape de școală.", "Schimbarea orei de începere a cursurilor.", "Închiderea școlii în zilele aglomerate."],
  ["Alege forma pentru o acțiune terminată înainte de sosirea mea.", "Când am ajuns la gară, trenul ___ deja.", "plecase", "urma să plece", "tocmai pleca"],
  ["Alege pronumele potrivit.", "Îmi trebuie formularul. Te rog să ___ trimiți astăzi.", "mi-l", "ți-l", "mi-o"],
  ["Alege forma potrivită pentru «noi».", "În timp ce noi ___ cina, s-a întrerupt curentul.", "pregăteam", "pregătea", "pregăteai"],
  ["Ce s-a schimbat?", "@Trenul de Brașov pleacă de la peronul șase, în loc de peronul trei. Ora rămâne aceeași.", "Peronul de plecare.", "Ora de plecare.", "Destinația trenului."],
  ["Ce trebuie să aducă pacienta?", "@Programarea de marți rămâne la ora nouă. Vă rugăm să aduceți trimiterea și rezultatele de luna trecută.", "Trimiterea și rezultatele anterioare.", "Doar dovada plății.", "Rezultatele de luna viitoare."],
  ["De ce a fost amânată acțiunea?", "@Din cauza ploii, strângerea deșeurilor va avea loc duminica viitoare.", "Din cauza vremii.", "Din lipsă de voluntari.", "Din cauza lucrărilor din parc."],
  ["Alege formularea politicoasă.", "Vrei să muți o programare la cabinet.", "Ați putea să mă programați pentru joi?", "Trebuie să fi fost joi la cabinet.", "Vă anunț că nu mai există cabinete."],
  ["Alege mesajul care păstrează informația.", "Mara: «Ședința începe la nouă. Adu documentele, te rog.»", "Mara a spus că ședința începe la nouă și m-a rugat să aduc documentele.", "Mara a spus că va aduce documentele la zece.", "Mara m-a întrebat dacă ședința s-a terminat."],
  ["Alege fraza care susține propunerea cu un motiv.", "Propui să meargă autobuzele mai des seara.", "Autobuzele ar trebui să circule mai des, fiindcă uneori așteptăm o jumătate de oră.", "Ieri nu am așteptat deloc la stație.", "Nu știu dacă autobuzul acesta merge la gară."],
  ["Ce replică propune o alternativă în aceeași zi?", "Client: Putem rămâne la joi? La ora două nu pot ajunge.", "Sigur. Ați putea veni joi la patru?", "Vineri avem loc la două.", "Atunci vă așteptăm joi la două."],
  ["Ce răspuns cere o înlocuire?", "Vânzător: Produsul nu funcționează. Preferați să îl înlocuim sau să vă restituim banii?", "Aș prefera să îl înlocuiți, vă rog.", "Aș prefera să îmi restituiți banii.", "Aș dori să mai aștept înainte de a decide."],
  ["Ce replică confirmă că ai înțeles termenul?", "Colega: Te rog să trimiți cererea cel târziu luni.", "Am înțeles. O trimit până luni.", "O să încep să o completez marți.", "Poți să o trimiți tu săptămâna viitoare?"],
];

export function romanianExam(level: "A1" | "B1"): Item[] {
  return shuffle(level === "A1" ? A1 : B1).map(([prompt, text, answer, ...rest]) => {
    const audio = text.startsWith("@");
    return { kind: "choice", prompt, context: audio ? "" : text, big: false,
      listen: audio ? text.slice(1) : "", ...shuffleAnswer([answer, ...rest], 0) };
  });
}
