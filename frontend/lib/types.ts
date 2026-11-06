/**
 * Types for the Ground Truth frontend.
 *
 * Two layers:
 * - Api* types: exactly what David's FastAPI backend returns (snake_case). Source of truth: backend/app/main.py,
 *   backend/app/routers/moderator.py, backend/app/schemas.py, and /openapi.json when the API runs.
 *   The offline demo mock (lib/server/mock-backend.ts) returns the same shapes.
 * - UI types (camelCase): what screens use. lib/adapters.ts is the only place that maps Api* → UI.
 *
 * Probabilities are 0–1 floats everywhere in data. Convert to 0–100 only for display (lib/probability.ts).
 */

export type AnonymityLevel = 'known_to_acaps' | 'pseudonymous' | 'anonymous';
export type Locale = 'en' | 'fr';
export type AlertStatus = 'pending' | 'approved' | 'rejected';
export type QuestionStatus = 'open' | 'closed' | 'resolved';
export type Outcome = 0 | 1; // 1 = happened, 0 = didn't

// ===========================================================================
// Raw API types (snake_case, exactly as the backend sends them)
// ===========================================================================

export interface ApiReport {
  title: string;
  source: string | null;
  url: string | null;
  published_at: string | null;
}

export interface ApiAlert {
  id: string;
  risk_id: string;
  trigger_id: string | null;
  report: ApiReport;
  direction: string | null; // "escalating" in the seed
  strength: number | null; // 0–1
  evidence: string | null;
  status: AlertStatus;
}

export interface ApiSimilarRisk {
  risk_id: string;
  title: string;
  country: string;
  similarity: number;
  outcome: string; // "Materialised" | "Not materialised"
  what_happened: string;
  acaps_probability?: string; // curated extra (mock/curated.json), not sent by the API
}

/** GET /q/{token} */
export interface ApiExpertQuestion {
  question: { id: string; text: string; resolution_criteria: string; deadline: string; status: QuestionStatus };
  risk: { id: string; title: string; country: string; risk_level: string | null };
  trigger_update: ApiAlert | null;
  similar_risks: ApiSimilarRisk[];
  answered: boolean;
  revised: boolean;
}

/** GET /q/{token}/settings (backend commit 3220fc0). Not on older backends: then 404. */
export interface ApiExpertSettings {
  pseudonym: string;
  anonymity_level: AnonymityLevel;
  country: string;
  topics: string[];
  language: string;
  max_open_questions: number;
}

/** Body of POST /q/{token}/responses and /revision. probability 0–1, reason 1–280 characters. */
export interface ApiAnswerIn {
  probability: number;
  reason: string;
}

export interface ApiThemes {
  agreement: string[];
  disagreement: string[];
  new_information: string[];
}

/** GET /q/{token}/group (403 until the expert has answered). median/min/max are null below 3 answers. */
export interface ApiGroupView {
  question_id: string;
  response_count: number;
  median: number | null;
  min: number | null;
  max: number | null;
  themes: ApiThemes;
}

export interface ApiScore {
  question_id: string;
  question_text: string;
  probability: number;
  outcome: Outcome;
  brier: number;
}

/** GET /q/{token}/track-record */
export interface ApiTrackRecord {
  resolved: number;
  mean_brier: number | null;
  beats_baseline: boolean | null;
  baseline_brier: number;
  history: ApiScore[];
}

/** Body of POST /alerts/{id}/decision. Approving needs all three question fields and a future deadline. */
export interface ApiDecisionIn {
  status: 'approved' | 'rejected';
  question_text?: string;
  resolution_criteria?: string;
  deadline?: string; // YYYY-MM-DD
}

export type ApiDecisionOut =
  | { alert_id: string; status: 'rejected' }
  | { alert_id: string; status: 'approved'; question_id: string; experts_invited: number };

/** One item of GET /moderator/questions */
export interface ApiQuestionListItem {
  id: string;
  risk_id: string;
  text: string;
  status: QuestionStatus;
  outcome: Outcome | null;
  deadline: string;
  invited: number;
  answered: number;
  median: number | null;
}

export interface ApiRoundSummary {
  count: number;
  median: number;
  min: number;
  max: number;
}

export interface ApiModeratorResponse {
  label: string; // pseudonym, or "Anonymous expert N"
  anonymity_level: AnonymityLevel;
  identity_known: boolean;
  first_probability: number | null;
  first_reason: string | null;
  latest_probability: number;
  revision_reason: string | null;
  revised: boolean;
  brier: number | null; // once resolved
}

/** GET /moderator/questions/{id} */
export interface ApiQuestionDetail {
  question: {
    id: string;
    text: string;
    resolution_criteria: string;
    deadline: string;
    status: QuestionStatus;
    outcome: Outcome | null;
  };
  risk: { id: string; title: string; country: string; risk_level: string | null; acaps_probability: string | null };
  participation: { invited: number; answered: number; revised: number };
  first_round: ApiRoundSummary | null;
  latest: ApiRoundSummary | null;
  median_shift: number | null;
  group_median_brier: number | null;
  baseline_brier: number;
  distribution: { range: string; count: number }[]; // 5 bands of 20%
  responses: ApiModeratorResponse[];
  themes: ApiThemes;
}

/** Body of POST /moderator/questions/{id}/resolve */
export interface ApiResolveIn {
  outcome: Outcome;
}

/** Without answers the backend returns only question_id, outcome and scored: 0. */
export interface ApiResolveOut {
  question_id: string;
  outcome: Outcome;
  scored: number;
  mean_expert_brier?: number;
  group_median_brier?: number;
  baseline_brier?: number;
}

/** GET /moderator/leaderboard. Anonymous experts are never ranked. */
export interface ApiLeaderboard {
  baseline_brier: number;
  min_resolved: number;
  experts: {
    label: string;
    anonymity_level: AnonymityLevel;
    resolved: number;
    mean_brier: number;
    beats_baseline: boolean;
    rank: number;
  }[];
  note: string;
}

/** GET /risks/{id}: the raw database row. */
export interface ApiRisk {
  id: string;
  title: string;
  country: string;
  iso: string;
  risk_type: string | null;
  probability: string | null; // ACAPS label, e.g. "High"
  impact: number | null;
  risk_level: string | null;
  status: string | null;
  expected_exposure: string | null;
  rationale: string | null;
  triggers: string | null; // ACAPS structured text: "Trigger ID: … / Title: … / Description: …"
}

/** GET /risks/ranked (one contract sample until the ML ranking lands) */
export interface ApiRankedRisk {
  risk_id: string;
  title: string;
  country: string;
  p_materialise: number;
  priority_score: number;
  score_breakdown: { signal_strength: number; uncertainty: number; impact: number; review_age: number };
  risk_level?: string; // curated extras (mock/curated.json), not sent by the API
  acaps_probability?: string;
  last_reviewed?: string | null;
}

// ===========================================================================
// UI types (camelCase)
// ===========================================================================

/** Where a screen's data came from. 'demo' = the frontend's offline mock (shown with a badge). */
export type DataSource = 'api' | 'demo';

export interface Loaded<T> {
  data: T;
  source: DataSource;
}

export type StrengthWord = 'weak' | 'moderate' | 'strong';

export interface Report {
  title: string;
  source: string | null;
  url: string | null;
  publishedAt: string | null;
}

export interface Alert {
  id: string;
  riskId: string;
  triggerId: string | null;
  report: Report;
  direction: string | null;
  strength: number | null; // 0–1
  strengthWord: StrengthWord | null;
  evidence: string | null;
  status: AlertStatus;
}

export interface SimilarRisk {
  riskId: string;
  title: string;
  country: string;
  similarity: number;
  outcome: 'materialised' | 'not_materialised' | 'unknown';
  whatHappened: string;
  acapsProbability: string | null;
}

export interface ExpertQuestion {
  question: { id: string; text: string; resolutionCriteria: string; deadline: string; status: QuestionStatus };
  risk: { id: string; title: string; country: string; riskLevel: string | null };
  triggerUpdate: Alert | null;
  similarRisks: SimilarRisk[];
  similarRisksAreDemo: boolean; // curated real-data examples until the ML pipeline lands
  anonymityLevel: AnonymityLevel | null; // from /q/{token}/settings; null when the backend doesn't have it yet
  answered: boolean;
  revised: boolean;
}

export interface Themes {
  agreement: string[];
  disagreement: string[];
  newInformation: string[];
}

/** suppressed = fewer than 3 answers: no figures are shown. */
export type GroupView =
  | { questionId: string; responseCount: number; suppressed: true; themes: Themes }
  | { questionId: string; responseCount: number; suppressed: false; median: number; min: number; max: number; themes: Themes };

export interface TrackRecord {
  resolved: number;
  meanBrier: number | null;
  beatsBaseline: boolean | null;
  baselineBrier: number;
  history: { questionId: string; questionText: string; probability: number; outcome: boolean; brier: number }[];
}

export type DecisionResult =
  | { alertId: string; status: 'rejected' }
  | { alertId: string; status: 'approved'; questionId: string; expertsInvited: number };

export interface QuestionListItem {
  id: string;
  riskId: string;
  text: string;
  status: QuestionStatus;
  outcome: boolean | null;
  deadline: string;
  invited: number;
  answered: number;
  median: number | null;
}

export interface RoundSummary {
  count: number;
  median: number;
  min: number;
  max: number;
}

export interface ModeratorResponse {
  label: string;
  anonymityLevel: AnonymityLevel;
  identityKnown: boolean;
  firstProbability: number | null;
  firstReason: string | null;
  latestProbability: number;
  revisionReason: string | null;
  revised: boolean;
  brier: number | null;
}

export interface QuestionDetail {
  question: {
    id: string;
    text: string;
    resolutionCriteria: string;
    deadline: string;
    status: QuestionStatus;
    outcome: boolean | null;
  };
  risk: { id: string; title: string; country: string; riskLevel: string | null; acapsProbability: string | null };
  participation: { invited: number; answered: number; revised: number };
  firstRound: RoundSummary | null;
  latest: RoundSummary | null;
  medianShift: number | null;
  groupMedianBrier: number | null;
  baselineBrier: number;
  distribution: { range: string; count: number }[];
  responses: ModeratorResponse[];
  themes: Themes;
}

export interface ResolveResult {
  questionId: string;
  outcome: boolean;
  scored: number;
  meanExpertBrier: number | null;
  groupMedianBrier: number | null;
  baselineBrier: number | null;
}

export interface Leaderboard {
  baselineBrier: number;
  minResolved: number;
  experts: {
    rank: number;
    label: string;
    anonymityLevel: AnonymityLevel;
    resolved: number;
    meanBrier: number;
    beatsBaseline: boolean;
  }[];
  note: string;
}

export interface ParsedTrigger {
  id: string; // "T0618"
  title: string;
  description: string;
  completionRate: number | null; // 0–100, as ACAPS records it
  objective: string | null; // "Quantitative objective to meet 100%"
  lastUpdate: string | null; // ISO date
}

export interface RiskDetail {
  id: string;
  title: string;
  country: string;
  iso: string;
  riskType: string | null;
  acapsProbability: string | null;
  impact: number | null;
  riskLevel: string | null;
  status: string | null;
  expectedExposure: string | null;
  rationale: string | null;
  triggers: ParsedTrigger[];
}

export interface RankedRisk {
  riskId: string;
  title: string;
  country: string;
  priorityScore: number;
  breakdown: { signalStrength: number; uncertainty: number; impact: number; reviewAge: number };
  modelProbability: number;
  riskLevel: string | null;
  acapsProbability: string | null;
  lastReviewed: string | null;
}

export interface RankedRisks {
  items: RankedRisk[];
  areDemo: boolean; // curated 28 active risks with placeholder scores, until the ML ranking lands
}

/** The public outcome page: aggregates only, built on the server from the moderator view. */
export type PublicOutcome = {
  questionId: string;
  questionText: string;
  riskTitle: string;
  country: string;
  status: QuestionStatus;
  outcome: boolean | null;
} & (
  | { suppressed: true; answered: number }
  // range = the 20% bands the answers fall in (low edge of the lowest, high edge of the highest), never the
  // exact min/max: with few answers those ARE individual answers.
  | { suppressed: false; answered: number; median: number; rangeLow: number; rangeHigh: number; themes: Themes }
);

/** Moderator's risk decision. No backend endpoint yet: kept in client state only. */
export type DecisionKind = 'keep' | 'raise_probability' | 'lower_probability' | 'update_trigger' | 'add_trigger';
