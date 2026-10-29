// Display labels live here, by id. The server sends ids only, and a self-hoster
// can add some the client has no label for: the interface shows the id then.
const en = {
  app: { title: "Language immersion", language: "Interface language" },
  loading: "Loading…",
  overview: {
    health: "Server",
    healthOk: "Running",
    limits: "Limits",
    maxTextLength: "Longest text",
    maxEdits: "Most corrections per text",
    maxExplanationLength: "Longest explanation",
    languages: "Languages",
    levels: "Levels",
    skills: "Skills",
    errorTypes: "Error types",
  },
  skill: {
    reading: "Reading",
    listening: "Listening",
    writing: "Writing",
    speaking: "Speaking",
  },
  errorType: {
    particles: "Particles",
    conjunctions_affixes: "Conjunctions and affixes",
    verb_conjugation_compounds: "Verb conjugation and compounds",
    giving_receiving: "Giving and receiving",
    keigo_politeness: "Politeness and honorifics",
    conditionals: "Conditionals",
    obligation_permission_prohibition: "Obligation, permission, prohibition",
    desire_intent_plans: "Desire, intent, plans",
    conjecture_judgment_appearance: "Conjecture, judgment, appearance",
    comparison_degree_limitation: "Comparison, degree, limitation",
    time_situation_aspect: "Time, situation, aspect",
    reason_cause_concession: "Reason, cause, concession",
    orthography: "Orthography",
    adjective_conjugation: "Adjective conjugation",
    word_order: "Word order",
    counters: "Counters",
    transitivity: "Transitivity",
    vocabulary_word_choice: "Vocabulary and word choice",
    style_and_discourse: "Style and discourse",
    punctuation: "Punctuation",
    other: "Other",
  },
  error: {
    network_error: "The server could not be reached.",
    invalid_response:
      "The server answered in a way this app does not understand.",
    rate_limited: "Too many requests. Try again in a moment.",
    internal_error: "Something went wrong on the server.",
    unknown: "Something went wrong.",
  },
};

const fr: typeof en = {
  app: { title: "Immersion linguistique", language: "Langue de l’interface" },
  loading: "Chargement…",
  overview: {
    health: "Serveur",
    healthOk: "En marche",
    limits: "Limites",
    maxTextLength: "Texte le plus long",
    maxEdits: "Maximum de corrections par texte",
    maxExplanationLength: "Explication la plus longue",
    languages: "Langues",
    levels: "Niveaux",
    skills: "Compétences",
    errorTypes: "Types d’erreur",
  },
  skill: {
    reading: "Lecture",
    listening: "Écoute",
    writing: "Écriture",
    speaking: "Expression orale",
  },
  errorType: {
    particles: "Particules",
    conjunctions_affixes: "Conjonctions et affixes",
    verb_conjugation_compounds: "Conjugaison des verbes et composés",
    giving_receiving: "Donner et recevoir",
    keigo_politeness: "Politesse et honorifiques",
    conditionals: "Conditionnels",
    obligation_permission_prohibition: "Obligation, permission, interdiction",
    desire_intent_plans: "Désir, intention, projets",
    conjecture_judgment_appearance: "Conjecture, jugement, apparence",
    comparison_degree_limitation: "Comparaison, degré, restriction",
    time_situation_aspect: "Temps, situation, aspect",
    reason_cause_concession: "Raison, cause, concession",
    orthography: "Orthographe",
    adjective_conjugation: "Conjugaison des adjectifs",
    word_order: "Ordre des mots",
    counters: "Compteurs",
    transitivity: "Transitivité",
    vocabulary_word_choice: "Vocabulaire et choix des mots",
    style_and_discourse: "Style et discours",
    punctuation: "Ponctuation",
    other: "Autre",
  },
  error: {
    network_error: "Le serveur est injoignable.",
    invalid_response:
      "Le serveur a répondu d’une façon que l’application ne comprend pas.",
    rate_limited: "Trop de requêtes. Réessayez dans un instant.",
    internal_error: "Une erreur est survenue sur le serveur.",
    unknown: "Une erreur est survenue.",
  },
};

export const resources = { en, fr };
export const UI_LANGUAGES = ["en", "fr"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
export const DEFAULT_UI_LANGUAGE: UiLanguage = "en";
