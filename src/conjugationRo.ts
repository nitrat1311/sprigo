// Forms in the order eu, tu, el/ea, noi, voi, ei/ele.
const verbs = [
  ["fi", "fost", "sunt ești este suntem sunteți sunt", "eram erai era eram erați erau", "fiu fii fie fim fiți fie", "fusesem fuseseși fusese fuseserăm fuseserăți fuseseră"],
  ["avea", "avut", "am ai are avem aveți au", "aveam aveai avea aveam aveați aveau", "am ai aibă avem aveți aibă", "avusesem avuseseși avusese avuseserăm avuseserăți avuseseră"],
  ["face", "făcut", "fac faci face facem faceți fac", "făceam făceai făcea făceam făceați făceau", "fac faci facă facem faceți facă", "făcusem făcuseși făcuse făcuserăm făcuserăți făcuseră"],
  ["merge", "mers", "merg mergi merge mergem mergeți merg", "mergeam mergeai mergea mergeam mergeați mergeau", "merg mergi meargă mergem mergeți meargă", "mersesem merseseși mersese merseserăm merseserăți merseseră"],
  ["vorbi", "vorbit", "vorbesc vorbești vorbește vorbim vorbiți vorbesc", "vorbeam vorbeai vorbea vorbeam vorbeați vorbeau", "vorbesc vorbești vorbească vorbim vorbiți vorbească", "vorbisem vorbiseși vorbise vorbiserăm vorbiserăți vorbiseră"],
  ["studia", "studiat", "studiez studiezi studiază studiem studiați studiază", "studiam studiai studia studiam studiați studiau", "studiez studiezi studieze studiem studiați studieze", "studiasem studiaseși studiase studiaserăm studiaserăți studiaseră"],
  ["mânca", "mâncat", "mănânc mănânci mănâncă mâncăm mâncați mănâncă", "mâncam mâncai mânca mâncam mâncați mâncau", "mănânc mănânci mănânce mâncăm mâncați mănânce", "mâncasem mâncaseși mâncase mâncaserăm mâncaserăți mâncaseră"],
  ["pleca", "plecat", "plec pleci pleacă plecăm plecați pleacă", "plecam plecai pleca plecam plecați plecau", "plec pleci plece plecăm plecați plece", "plecasem plecaseși plecase plecaserăm plecaserăți plecaseră"],
];

const simple = (row: string) => row.split(" ").join(", ");
const compound = (aux: string, form: string) => aux.split(" ").map((a) => a + " " + form).join(", ");

export const RO_FORMS: Record<string, Record<string, string>> = Object.fromEntries(
  verbs.map(([verb, participle, present, imperfect, subjunctive, pluperfect]) => [
    verb,
    {
      prezent: simple(present),
      "perfect compus": compound("am ai a am ați au", participle),
      imperfect: simple(imperfect),
      viitor: "voi vei va vom veți vor".split(" ").map((a, i) => a + " " + verb + "/o să " + subjunctive.split(" ")[i]).join(", "),
      "condițional-optativ": compound("aș ai ar am ați ar", verb),
      conjunctiv: subjunctive.split(" ").map((form) => "să " + form).join(", "),
      "mai mult ca perfect": simple(pluperfect),
    },
  ]),
);
