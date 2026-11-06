// machine-translated, needs review (Hana or a native French speaker). Keys must stay identical to en.ts.
// Typography:   = narrow no-break space (before ; ? ! %),   = no-break space (before : and inside « »).
import type { Strings } from './en';

/** Band labels come in as "60–80%"; French puts a narrow no-break space before %. */
const frBand = (band: string) => band.replace('%', ' %');

export const fr: Strings = {
  meta: {
    title: 'Ground Truth · boucle d’experts ACAPS',
    description:
      'Un moyen simple et anonyme, pour les experts humanitaires, de vérifier les analyses de risques d’ACAPS et de prévoir leur évolution.',
  },
  common: {
    appName: 'Ground Truth',
    demoOffline: 'Données de démonstration (hors ligne)',
    demoUntilMl: 'Données de démonstration jusqu’à la mise en service du pipeline ML',
    loading: 'Chargement…',
    back: 'Retour',
    continue: 'Continuer',
    opensInNewTab: '(s’ouvre dans un nouvel onglet)',
    tryAgain: 'Réessayer',
  },
  language: {
    label: 'Langue',
    en: 'English',
    fr: 'Français',
  },
  strength: {
    weak: 'Signal faible',
    moderate: 'Signal modéré',
    strong: 'Signal fort',
  },
  direction: {
    escalating: 'En aggravation',
    easing: 'En amélioration',
  },
  outcomes: {
    materialised: 'S’est matérialisé',
    not_materialised: 'Ne s’est pas matérialisé',
    unknown: 'Issue non enregistrée',
  },
  steps: {
    context: 'Contexte',
    estimate: 'Votre estimation',
    group: 'Vue du groupe',
    done: 'Terminé',
    stepOf: (i: number, n: number) => `Étape ${i} sur ${n}`,
  },
  context: {
    acapsRiskLevel: (level: string) => `Niveau de risque ACAPS : ${level}`,
    whatChanged: 'Ce qui a changé',
    reportMeta: (source: string, date: string) => `${source} · ${date}`,
    matchedTrigger: (id: string) => `Associé au déclencheur ${id}`,
    whyFlagged: 'Pourquoi cela a été signalé',
    noUpdate: 'Aucun nouveau rapport n’est joint à cette question.',
    similarTitle: 'Évolution de risques passés similaires',
    ratedThen: (label: string) => `Niveau ACAPS à l’époque : ${label}`,
    resolvesBy: (date: string) => `Résolution au plus tard le ${date}`,
    howResolves: 'Comment cette question sera tranchée',
    start: 'Donner mon estimation',
  },
  estimate: {
    questionLabel: 'La question',
    independentNote:
      'Répondez d’abord de votre côté. La vue du groupe s’affichera après l’envoi de votre réponse.',
    sliderLabel: 'Votre probabilité',
    sliderNotSet: 'Pas encore définie : touchez ou faites glisser le curseur',
    sliderValue: (p: number, band: string) => `${p} % · tranche ${frBand(band)}`,
    reasonLabel: 'Votre justification',
    reasonHint: 'Une ou deux lignes suffisent.',
    reasonPlaceholder: 'Qu’observez-vous que d’autres pourraient ne pas voir ?',
    reasonCount: (n: number, max: number) => `${n} / ${max}`,
    needProbability: 'Indiquez d’abord une probabilité.',
    needReason: 'Ajoutez une courte justification.',
    submit: 'Envoyer mon estimation',
    submitting: 'Envoi en cours…',
    closed: 'Cette question est close ; elle n’accepte plus de réponses.',
  },
  whoSees: {
    title: 'Qui voit cette réponse',
    acaps: 'Modérateurs d’ACAPS : votre réponse, sous l’étiquette correspondant à votre niveau d’anonymat',
    peers: 'Autres experts : chiffres du groupe uniquement',
    public: 'Public : jamais à titre individuel',
  },
  group: {
    title: 'La vue du groupe',
    loading: 'Chargement de la vue du groupe…',
    answered: (n: number) => (n <= 1 ? `${n} expert a répondu` : `${n} experts ont répondu`),
    median: 'Médiane du groupe',
    range: 'Fourchette des réponses',
    yourAnswer: 'Votre réponse',
    axisLabel: (median: number, min: number, max: number, mine: string) =>
      `Médiane du groupe ${median} %, réponses de ${min} % à ${max} %. ${mine}`,
    yourAnswerIs: (p: number) => `Votre réponse : ${p} %.`,
    suppressed: 'Pas encore assez de réponses pour afficher les résultats en toute sécurité.',
    noThemes: 'Les justifications du groupe apparaîtront une fois ce tour examiné par ACAPS.',
    themes: {
      agreement: 'Points d’accord',
      disagreement: 'Points de désaccord',
      newInformation: 'Nouvelles informations',
    },
    keep: 'Conserver ma réponse',
    revise: 'Réviser',
  },
  revise: {
    title: 'Réviser votre estimation',
    changedMind: 'Qu’est-ce qui a changé votre avis ? (ou « aucun changement »)',
    firstAnswerKept: 'Votre première réponse est conservée séparément.',
    save: 'Enregistrer ma révision',
    saving: 'Enregistrement…',
    cancel: 'Garder ma première réponse',
  },
  receipt: {
    title: 'Merci',
    yourAnswer: (p: number, band: string) => `Votre réponse : ${p} % (tranche ${frBand(band)})`,
    reviewNote: 'ACAPS examine chaque tour et décide s’il y a lieu de mettre à jour le risque.',
    seeHowUsed: 'Vous verrez comment votre contribution a été utilisée.',
    toRecord: 'Voir mon historique de prévisions',
  },
  record: {
    title: 'Votre historique de prévisions',
    link: 'Mon historique de prévisions',
    back: 'Retour à la question',
    resolved: (n: number) => (n <= 1 ? `${n} question résolue` : `${n} questions résolues`),
    meanBrier: 'Score de Brier moyen',
    brierExplain: 'Plus il est bas, mieux c’est. Répondre toujours 50 % donne 0,25.',
    beats: 'Meilleur que de répondre toujours 50 %.',
    notBeats: 'Pas encore meilleur que de répondre toujours 50 %.',
    none: 'Aucune question résolue pour l’instant. Les scores apparaissent une fois vos questions résolues.',
    yourQuestions: 'Vos questions résolues',
    practiceTitle: 'Questions d’entraînement (risques ACAPS passés)',
    practiceNote: 'Elles reposent sur des issues ACAPS réelles. Les réponses enregistrées sont simulées pour cette démonstration.',
    forecast: 'Votre prévision',
    outcome: 'Matérialisé ?',
    brier: 'Brier',
    yes: 'Oui',
    no: 'Non',
  },
  errors: {
    generic:'Une erreur s’est produite.',
    tryAgain: 'Réessayer',
    invalidLink: 'Ce lien n’est pas valide.',
    invalidLinkHelp: 'Demandez un nouveau lien à ACAPS.',
    closed: 'Cette question est close.',
    alreadySubmitted: 'Réponse déjà envoyée. Reprise à l’endroit où vous en étiez.',
    network: 'Connexion au serveur impossible. Votre réponse est conservée.',
    notFound: 'Page introuvable.',
    toHome: 'Aller à la page d’accueil',
  },
  anonymity: {
    levels: {
      known_to_acaps: {
        label: 'Connu d’ACAPS',
        description: 'ACAPS sait qui vous êtes. Les autres experts ne voient jamais votre nom.',
      },
      pseudonymous: {
        label: 'Pseudonyme',
        description: 'ACAPS voit votre pseudonyme, pas votre nom.',
      },
      anonymous: {
        label: 'Totalement anonyme',
        description:
          'ACAPS voit uniquement « Expert anonyme », et vous ne figurez jamais dans un classement.',
      },
    },
  },
  decisions: {
    keep: 'Conserver l’évaluation actuelle',
    raise_probability: 'Augmenter la probabilité',
    lower_probability: 'Abaisser la probabilité',
    update_trigger: 'Mettre à jour un déclencheur',
    add_trigger: 'Ajouter un déclencheur',
  },
};
