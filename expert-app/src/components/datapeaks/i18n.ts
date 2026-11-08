import type { Lang } from "./shared";

const en = {
  welcomeTitle: "Welcome to the ACAPS expert panel",
  welcomeText: "We'll send you short questions about crises you know well. Each takes about 2 minutes, a few times a month.",
  privacy: "Your privacy",
  privacyNote: "The public never sees individual answers. You can change this at any time.",
  pKnown: "Known to ACAPS", pKnownT: "ACAPS knows who you are. Other experts see a nickname.",
  pNick: "Nickname only", pNickT: "Everyone, including ACAPS, sees only a nickname like “Analyst A”.",
  pAnon: "Fully anonymous", pAnonT: "Nobody sees a name. You won't appear on the leaderboard.",
  countries: "Countries you know", topics: "Topics",
  topicList: ["Conflict", "Displacement", "Protection", "Food security", "Humanitarian access"],
  frequency: "How often can we ask?",
  freqList: ["Up to 2 times a month", "Up to once a week", "Only urgent questions"],
  language: "Language",
  noPassword: "No password needed. You'll sign in through the links in our emails.",
  join: "Join the panel",
  tag: "Chad · Risk R1043",
  question: "By 6 May 2027, will cross-border attacks become sustained and recurrent across multiple localities in eastern Chad, causing significant civilian casualties, displacement, or disruption to humanitarian access?",
  dates: "Answer by 30 Nov 2026 · Outcome by 6 May 2027",
  countsYes: "What counts as yes",
  countsYesT: "Trigger T0618 — expansion of cross-border attacks and insecurity: cross-border attacks become sustained and recurrent across multiple localities in eastern Chad, causing significant civilian casualties, displacement, or disruption to humanitarian access.",
  changed: "What's changed",
  news: "Continued arrivals from Sudan and growing pressure on host areas near the border. This indicates rising strain, not a verified increase in attacks. ACAPS currently rates this risk High.",
  newsMeta: "Demo report · eastern Chad border situation",
  similar: "Relevant past cases",
  past: [["Adré border clashes after El Geneina fighting, 2023", true], ["Tiné incursions during dry season, 2024", true], ["Sila spillover fears, early 2025", false]] as [string, boolean][],
  cases: [
    { place: "Lebanon", code: "R1027", status: "Materialised", text: "A conflict escalation was followed by large-scale displacement, cross-border movement, and worsening food access. The export reports more than 1.2 million people displaced." },
    { place: "Syria", code: "R1000", status: "Materialised", text: "Clashes between armed groups were followed by displacement, protection needs, service disruption, and access constraints. The export reports about 187,000 people remained displaced as of 24 November 2025." },
    { place: "Mali", code: "R1014", status: "Materialised", text: "Clashes between armed groups were followed by displacement, protection needs, service disruption, and access constraints. The export reports about 187,000 people remained displaced as of 24 November 2025." },
  ],
  casesNote: "These cases show similar humanitarian impact pathways. They are not direct predictions for this context.",
  happened: "Happened", notHappened: "Didn't happen",
  howLikely: "How likely is this?", veryUnlikely: "Very unlikely", veryLikely: "Very likely",
  why: "Why? (one line)", whyPh: "e.g. New arrivals reported in Adré this week",
  submit: "Submit", needReason: "Please add a short reason.",
  groupTitle: "What other experts think", you: "You", group: "Group (middle)",
  range: "Range of answers", rangeT: (lo: number, hi: number, n: number) => `Lowest ${lo}% · Highest ${hi}% · ${n} experts answered`,
  agree: "Where experts agree", agreeL: ["Refugee arrivals are rising in Ouaddaï", "The end of the rainy season opens crossing routes"],
  disagree: "Where experts disagree", disagreeL: ["Whether army deployments will deter incursions"],
  newInfo: "New information", newInfoL: ["New checkpoints reported near Tiné"],
  change: "Change my answer", keep: "Keep my answer", save: "Save", back: "Back",
  firstWas: (n: number) => `Your first answer: ${n}%`,
  thanks: "Thanks, your answer has been shared with ACAPS.",
  thanksT: "We'll tell you what happened after 6 May 2027.",
  viewProfile: "View my profile",
  profile: "Your profile", changeLink: "Change",
  track: "Track record", answered: "Questions answered",
  pastQ: [
    { q: "Practice: did drought-related displacement in Somalia rise above the threshold?", a: 75, h: true },
    { q: "Practice: did a sustained frontline escalation occur in Yemen?", a: 40, h: false },
    { q: "Practice: did the outbreak spread to an additional province in eastern DRC?", a: 80, h: true },
  ],
  youSaid: "You", itHappened: "It happened", itDidnt: "It didn't happen",
  used: "How your input was used", usedT: "ACAPS updated its analysis of eastern Chad after the August 2026 round.",
  status: "Status messages",
  e1: "This link isn't working", e1T: "It may have expired. We can email you a new one.", e1C: "Send me a new link",
  e2: "This question has closed", e2T: "Answers are no longer being collected. We'll share what happened after 6 May 2027.",
  e3: "You've already answered", e3T: "Your answer is saved. You can see what other experts think.", e3C: "See the group's view",
  sent: "A new link is on its way.",
};

type Dict = typeof en;

const fr: Dict = {
  welcomeTitle: "Bienvenue dans le panel d'experts d'ACAPS",
  welcomeText: "Nous vous enverrons de courtes questions sur des crises que vous connaissez bien. Chacune prend environ 2 minutes, quelques fois par mois.",
  privacy: "Votre confidentialité",
  privacyNote: "Le public ne voit jamais les réponses individuelles. Vous pouvez modifier ce choix à tout moment.",
  pKnown: "Connu d'ACAPS", pKnownT: "ACAPS sait qui vous êtes. Les autres experts voient un pseudonyme.",
  pNick: "Pseudonyme uniquement", pNickT: "Tout le monde, y compris ACAPS, ne voit qu'un pseudonyme comme « Analyste A ».",
  pAnon: "Entièrement anonyme", pAnonT: "Personne ne voit de nom. Vous n'apparaîtrez pas dans le classement.",
  countries: "Pays que vous connaissez", topics: "Thèmes",
  topicList: ["Conflit", "Déplacements", "Protection", "Sécurité alimentaire", "Accès humanitaire"],
  frequency: "À quelle fréquence pouvons-nous vous solliciter ?",
  freqList: ["Jusqu'à 2 fois par mois", "Jusqu'à une fois par semaine", "Questions urgentes uniquement"],
  language: "Langue",
  noPassword: "Aucun mot de passe nécessaire. Vous vous connectez grâce aux liens de nos e-mails.",
  join: "Rejoindre le panel",
  tag: "Tchad · Risque R1043",
  question: "D'ici le 6 mai 2027, les attaques transfrontalières deviendront-elles soutenues et récurrentes dans plusieurs localités de l'est du Tchad, causant d'importantes pertes civiles, des déplacements ou des perturbations de l'accès humanitaire ?",
  dates: "Répondre avant le 30 nov. 2026 · Résultat le 6 mai 2027",
  countsYes: "Ce qui compte comme « oui »",
  countsYesT: "Déclencheur T0618 — expansion des attaques transfrontalières et de l'insécurité : les attaques transfrontalières deviennent soutenues et récurrentes dans plusieurs localités de l'est du Tchad, causant d'importantes pertes civiles, des déplacements ou des perturbations de l'accès humanitaire.",
  changed: "Ce qui a changé",
  news: "Arrivées continues depuis le Soudan et pression croissante sur les zones d'accueil près de la frontière. Cela indique une tension croissante, pas une augmentation vérifiée des attaques. ACAPS classe actuellement ce risque comme élevé.",
  newsMeta: "Rapport de démonstration · situation à la frontière est du Tchad",
  similar: "Cas passés pertinents",
  past: [["Affrontements frontaliers à Adré après les combats d'El Geneina, 2023", true], ["Incursions à Tiné pendant la saison sèche, 2024", true], ["Craintes de débordement au Sila, début 2025", false]],
  cases: [
    { place: "Liban", code: "R1027", status: "Matérialisé", text: "Une escalade du conflit a été suivie de déplacements massifs, de mouvements transfrontaliers et d'une dégradation de l'accès à la nourriture. L'export fait état de plus de 1,2 million de personnes déplacées." },
    { place: "Syrie", code: "R1000", status: "Matérialisé", text: "Des affrontements entre groupes armés ont été suivis de déplacements, de besoins de protection, de perturbations des services et de contraintes d'accès. L'export indique qu'environ 187 000 personnes restaient déplacées au 24 novembre 2025." },
    { place: "Mali", code: "R1014", status: "Matérialisé", text: "Des affrontements entre groupes armés ont été suivis de déplacements, de besoins de protection, de perturbations des services et de contraintes d'accès. L'export indique qu'environ 187 000 personnes restaient déplacées au 24 novembre 2025." },
  ],
  casesNote: "Ces cas montrent des trajectoires d'impact humanitaire similaires. Ce ne sont pas des prédictions directes pour ce contexte.",
  happened: "S'est produit", notHappened: "Ne s'est pas produit",
  howLikely: "Quelle est la probabilité ?", veryUnlikely: "Très improbable", veryLikely: "Très probable",
  why: "Pourquoi ? (une ligne)", whyPh: "ex. : nouvelles arrivées signalées à Adré cette semaine",
  submit: "Envoyer", needReason: "Veuillez ajouter une courte raison.",
  groupTitle: "L'avis des autres experts", you: "Vous", group: "Groupe (médiane)",
  range: "Éventail des réponses", rangeT: (lo, hi, n) => `Minimum ${lo} % · Maximum ${hi} % · ${n} experts ont répondu`,
  agree: "Points d'accord", agreeL: ["Les arrivées de réfugiés augmentent dans le Ouaddaï", "La fin de la saison des pluies ouvre des voies de passage"],
  disagree: "Points de désaccord", disagreeL: ["Le déploiement de l'armée dissuadera-t-il les incursions ?"],
  newInfo: "Nouvelles informations", newInfoL: ["Nouveaux postes de contrôle signalés près de Tiné"],
  change: "Modifier ma réponse", keep: "Conserver ma réponse", save: "Enregistrer", back: "Retour",
  firstWas: (n) => `Votre première réponse : ${n} %`,
  thanks: "Merci, votre réponse a été transmise à ACAPS.",
  thanksT: "Nous vous dirons ce qui s'est passé après le 6 mai 2027.",
  viewProfile: "Voir mon profil",
  profile: "Votre profil", changeLink: "Modifier",
  track: "Historique", answered: "Questions répondues",
  pastQ: [
    { q: "Exercice : les déplacements liés à la sécheresse en Somalie ont-ils dépassé le seuil ?", a: 75, h: true },
    { q: "Exercice : une escalade soutenue du front a-t-elle eu lieu au Yémen ?", a: 40, h: false },
    { q: "Exercice : l'épidémie s'est-elle étendue à une province supplémentaire dans l'est de la RDC ?", a: 80, h: true },
  ],
  youSaid: "Vous", itHappened: "S'est produit", itDidnt: "Ne s'est pas produit",
  used: "Comment votre contribution a été utilisée", usedT: "ACAPS a mis à jour son analyse de l'est du Tchad après le cycle d'août 2026.",
  status: "Messages d'état",
  e1: "Ce lien ne fonctionne pas", e1T: "Il a peut-être expiré. Nous pouvons vous envoyer un nouveau lien par e-mail.", e1C: "M'envoyer un nouveau lien",
  e2: "Cette question est close", e2T: "Les réponses ne sont plus collectées. Nous partagerons le résultat après le 6 mai 2027.",
  e3: "Vous avez déjà répondu", e3T: "Votre réponse est enregistrée. Vous pouvez voir l'avis des autres experts.", e3C: "Voir l'avis du groupe",
  sent: "Un nouveau lien est en route.",
};

export const dict: Record<Lang, Dict> = { en, fr };
export const pct = (lang: Lang, n: number) => (lang === "fr" ? `${n} %` : `${n}%`);

/* The backend sends a few fixed English values (risk levels, case outcomes, country names).
   These translate them for display; anything unknown is shown as it came. */

const TERMS_FR: Record<string, string> = {
  // Risk levels
  "very high": "Très élevé", high: "Élevé", medium: "Moyen", low: "Faible", "very low": "Très faible",
  // Past-case outcomes and how they evolved
  materialised: "Matérialisé", "not materialised": "Non matérialisé", "partially materialised": "Partiellement matérialisé",
  "hazard and impact": "Aléa et impact", hazard: "Aléa", impact: "Impact",
  deteriorated: "Détérioré", stable: "Stable", improved: "Amélioré",
};

/** A risk level, outcome or trend from the data, in the chosen language. */
export const term = (lang: Lang, value: string | null | undefined): string => {
  if (!value) return "";
  return lang === "fr" ? (TERMS_FR[value.trim().toLowerCase()] ?? value) : value;
};

const COUNTRIES_FR: Record<string, string> = {
  Afghanistan: "Afghanistan", Algeria: "Algérie", Bangladesh: "Bangladesh", Benin: "Bénin", Burundi: "Burundi",
  Cameroon: "Cameroun", "Central African Republic": "République centrafricaine", Chad: "Tchad", Colombia: "Colombie",
  Congo: "Congo", Cuba: "Cuba", "Democratic Republic of the Congo": "République démocratique du Congo", Egypt: "Égypte",
  "El Salvador": "Salvador", Ethiopia: "Éthiopie", Ghana: "Ghana", Guatemala: "Guatemala", Haiti: "Haïti",
  Honduras: "Honduras", Indonesia: "Indonésie", Iran: "Iran", Iraq: "Irak", "Ivory Coast": "Côte d'Ivoire",
  Kenya: "Kenya", Lebanon: "Liban", Libya: "Libye", Madagascar: "Madagascar", Mali: "Mali", Mauritania: "Mauritanie",
  Mexico: "Mexique", Mongolia: "Mongolie", Morocco: "Maroc", Mozambique: "Mozambique", Myanmar: "Myanmar",
  Nepal: "Népal", Niger: "Niger", Nigeria: "Nigeria", Palestine: "Palestine", Panama: "Panama",
  "Papua New Guinea": "Papouasie-Nouvelle-Guinée", Peru: "Pérou", Philippines: "Philippines", Rwanda: "Rwanda",
  Somalia: "Somalie", "South Sudan": "Soudan du Sud", "Sri Lanka": "Sri Lanka", Sudan: "Soudan", Syria: "Syrie",
  Tanzania: "Tanzanie", "Timor Leste": "Timor oriental", Togo: "Togo", Tunisia: "Tunisie", Turkey: "Turquie",
  Uganda: "Ouganda", Ukraine: "Ukraine", Venezuela: "Venezuela", Yemen: "Yémen", Zimbabwe: "Zimbabwe",
};

/** A country name (or a comma-separated list of them) from the data, in the chosen language. */
export const countryName = (lang: Lang, value: string | null | undefined): string => {
  if (!value) return "";
  if (lang !== "fr") return value;
  return value.split(",").map((c) => COUNTRIES_FR[c.trim()] ?? c.trim()).join(", ");
};

/** French puts a space before a colon. */
export const colon = (lang: Lang) => (lang === "fr" ? " : " : ": ");
