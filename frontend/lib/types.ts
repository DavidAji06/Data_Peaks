/**
 * Domain types: the shapes every screen and helper in the frontend uses.
 *
 * Source: frontend/CLAUDE.md §3.2. The backend's wire format (contracts/*.json in the repo root:
 * snake_case, probabilities 0–1) is typed in lib/contracts.ts and converted in lib/adapters.ts,
 * so screens never see it.
 *
 * Changes from CLAUDE.md §3.2 (all additive, or optional where the backend contract has no field yet):
 * - Trigger ids use the short form "T0618", as the backend contract does; `riskId` holds "R1043".
 * - Trigger: completion fields are optional; `sources` and `dateEntered` added.
 * - Risk: `lastReviewed` may be null (older records can lack any dated update; in the current export
 *   every selected risk has one, sometimes taken from its triggers' "Last update");
 *   optional `updates` (dated rationale updates) and `outcome` (resolved risks only).
 * - SimilarRisk.acapsProbability is optional.
 * - Question: optional `replay` (practice question built from a resolved risk) and `reviewDate`.
 * - Alert: `strengthScore` (0–1, what the contract sends), `confidence` optional, `synthetic` flag.
 * - Expert: synthetic `profile` and `promptsThisWeek` (for contact limits).
 * - ExpertResponse: optional `theme`, tagged by ACAPS after submission.
 * - GroupView is a union: when fewer than 3 experts answered it carries no numbers and no reasons.
 *   It never carries min/max (exact individual answers); peers get median, IQR and band counts.
 * - New: Invitation, Distribution, and the viewer-specific shapes at the end of this file.
 */

export type ProbabilityBand = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
export type RiskLevel = 'low' | 'medium' | 'high';
export type RiskStatus = 'active' | 'materialised' | 'not_materialised';
export type RiskTrend = 'improved' | 'stable' | 'deteriorated';
export type AnonymityLevel = 'known_to_acaps' | 'pseudonymous' | 'anonymous';
export type Viewer = 'expert' | 'moderator' | 'public';
export type Locale = 'en' | 'fr';
export type ReasonTheme = 'agree' | 'disagree' | 'new_info';

export interface SourceLink {
  label: string; // e.g. "Reuters 27/08/2026"
  url: string;
}

export interface Trigger {
  id: string; // "T0618"
  riskId: string; // "R1043"
  title: string;
  description: string;
  completionRate?: number; // 0–100, ACAPS "Completion rate"
  completionHistory?: { date: string; rate: number }[]; // ISO dates, in export order
  resolutionCriterion?: string; // ACAPS "Quantitative objective to meet 100%"
  sources?: SourceLink[];
  dateEntered?: string; // ISO date
  lastUpdate?: string; // ISO date
}

export interface RationaleUpdate {
  date: string; // ISO date of "UPDATE dd/mm/yyyy"
  text: string;
  sources?: SourceLink[];
}

export interface RiskOutcome {
  what?: 'hazard' | 'impact' | 'hazard_and_impact';
  hazardText?: string; // ACAPS "Hazard materialisation"
  impactText?: string; // ACAPS "Impact materialisation description"
  closingNote?: string; // first sentences of the latest update, for risks with no materialisation text
}

export interface Risk {
  id: string;
  title: string;
  country: string;
  iso: string;
  type: string; // e.g. "Marked deterioration in an existing crisis"
  probability: ProbabilityBand;
  impact: 1 | 2 | 3 | 4 | 5;
  riskLevel: RiskLevel;
  trend?: RiskTrend;
  status: RiskStatus;
  expectedExposure: string;
  priorityNeeds: string[];
  rationaleSummary: string; // first sentence of the ACAPS rationale; the full text stays in the CSV
  lastReviewed: string | null; // ISO date of the latest "UPDATE dd/mm/yyyy" (else newest trigger update), null if none
  triggerIds: string[];
  updates?: RationaleUpdate[]; // newest first
  outcome?: RiskOutcome; // resolved risks only
}

export interface ReportEvidence {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string; // ISO date
  summary: string;
  language: Locale | string;
  synthetic: boolean; // true for demo reports
}

export interface SimilarRisk {
  riskId: string;
  title: string;
  country: string;
  similarity: number; // 0–1
  acapsProbability?: ProbabilityBand; // ACAPS rating at the time
  outcome: 'materialised' | 'not_materialised';
  outcomeSummary: string;
}

export interface Question {
  id: string;
  riskId: string;
  triggerId?: string;
  text: string; // binary, scoreable question
  resolutionCriteria: string;
  deadline: string; // ISO date (team default: 6 months)
  status: 'open' | 'closed' | 'resolved';
  outcome?: boolean; // set once resolved
  context: { triggerUpdate: string; evidence: ReportEvidence[] };
  similarRisks: SimilarRisk[];
  acapsProbability: ProbabilityBand;
  replay?: boolean; // practice question replayed from a resolved risk (track record)
  reviewDate?: string; // ISO date ACAPS reviews this round (shown on the receipt)
}

export type AlertStrength = 'weak' | 'moderate' | 'strong';

export interface Alert {
  id: string;
  riskId: string;
  triggerId: string;
  evidence: ReportEvidence;
  direction: 'up' | 'down';
  strength: AlertStrength;
  strengthScore: number; // 0–1 pipeline score (the contract's "strength")
  confidence?: number; // 0–1 from the LLM check (not in the contract yet)
  machineRationale: string; // why the pipeline matched it
  status: 'pending' | 'approved' | 'rejected';
  draftQuestion: Pick<Question, 'text' | 'resolutionCriteria' | 'deadline'>;
  createdAt: string;
  decisionNote?: string; // moderator's reason when rejecting
  questionId?: string; // set when approved and sent
  synthetic: boolean;
}

export interface ExpertProfile {
  role: string; // e.g. "Local NGO leader"
  basedIn: string; // e.g. "Abéché, Chad"
  orgType: string; // e.g. "National NGO"
}

export interface Expert {
  id: string; // private id, never shown outside the moderator view
  pseudonymId: string; // e.g. "Amber Falcon"; used in responses
  displayName?: string; // only shown to ACAPS if known_to_acaps
  anonymity: AnonymityLevel;
  countries: string[];
  topics: string[];
  locale: Locale;
  maxPromptsPerWeek: number;
  promptsThisWeek: number;
  profile: ExpertProfile;
  synthetic: true;
}

/** A personal link (/q/[token]) sent to one expert for one question. */
export interface Invitation {
  token: string;
  questionId: string;
  pseudonymId: string;
  sentAt: string;
}

export interface ExpertResponse {
  id: string;
  questionId: string;
  pseudonymId: string;
  probability: number; // 0–100 integer
  reason: string; // one line, ≤ 160 chars; for revisions the optional "what changed your mind"
  kind: 'initial' | 'revision';
  submittedAt: string;
  theme?: ReasonTheme; // tagged by ACAPS after submission, never shown before answering
  anonymity?: AnonymityLevel; // level when submitted; the stricter of this and the current level applies
}

/** Summary statistics over a set of 0–100 forecasts. */
export interface Distribution {
  n: number;
  median: number;
  iqr: [number, number];
  min: number;
  max: number;
  histogram: number[]; // counts per ACAPS probability band (5 bins, very_low → very_high)
}

export interface PeerReason {
  text: string;
  pseudonymId?: string; // only when that expert chose "pseudonymous"
  theme?: ReasonTheme;
}

/** What an expert sees after answering. Unlocked only once their own initial answer exists. */
export type GroupView =
  | {
      questionId: string;
      suppressed: true; // fewer than 3 experts: no numbers, no reasons
      n: number;
      acapsProbability: ProbabilityBand;
    }
  | {
      questionId: string;
      suppressed: false;
      n: number;
      median: number;
      iqr?: [number, number]; // optional: not in the backend contract yet
      // No min/max on purpose: they are exact individual answers, and peers may only see aggregates.
      histogram?: number[]; // optional: not in the backend contract yet
      reasons: PeerReason[];
      acapsProbability: ProbabilityBand;
    };

export interface ScoreBreakdown {
  signalStrength: number; // 0–1
  uncertainty: number; // 0–1
  impact: number; // 0–1
  reviewAge: number; // 0–1
}

export interface RankedRisk {
  riskId: string;
  title: string;
  country: string;
  iso?: string;
  score: number; // 0–1
  breakdown: ScoreBreakdown;
  modelProbability: number; // 0–1 from Vlad's model
  acapsProbability: ProbabilityBand;
  riskLevel: RiskLevel;
  lastReviewed: string | null;
}

export interface ModeratorSummary {
  questionId: string;
  agreement: string[];
  disagreement: string[];
  newInformation: string[];
  draft: string;
  generatedBy: 'ai';
  approvedByModerator: boolean;
}

export type DecisionKind =
  | 'keep'
  | 'raise_probability'
  | 'lower_probability'
  | 'update_trigger'
  | 'add_trigger';

export interface UpdateDecision {
  riskId: string;
  questionId?: string;
  decision: DecisionKind;
  note: string;
  decidedAt: string;
  triggerId?: string; // for update_trigger
  fromRate?: number; // trigger completion before, 0–100
  toRate?: number; // trigger completion after, 0–100
}

export interface TrackRecord {
  pseudonymId: string;
  resolvedCount: number;
  meanBrier: number | null; // lower is better; 0.25 = always answering 50%
  calibration: { band: ProbabilityBand; meanForecast: number; observedRate: number; n: number }[];
  contributions: {
    questionId: string;
    usedFor: string; // plain-English fallback; the UI renders `decision` in the viewer's language when present
    decision?: Pick<UpdateDecision, 'decision' | 'decidedAt' | 'triggerId' | 'fromRate' | 'toRate'>;
  }[];
}

// ---------------------------------------------------------------------------
// Viewer-specific shapes. lib/api.ts returns these, already filtered by
// lib/anonymity.ts, so UI components never receive fields their viewer may not see.
// ---------------------------------------------------------------------------

/** The answering expert's own settings (they always see their own data). */
export interface SelfView {
  pseudonymId: string;
  anonymity: AnonymityLevel;
  locale: Locale;
}

/** What /q/[token] receives before answering. Contains no other expert's data. */
export interface ExpertQuestionView {
  token: string;
  question: Question;
  risk: Pick<Risk, 'id' | 'title' | 'country' | 'probability' | 'impact' | 'riskLevel' | 'trend'>;
  trigger?: Pick<Trigger, 'id' | 'title' | 'completionRate' | 'completionHistory' | 'lastUpdate'>;
  self: SelfView;
}

/** One expert's answers as ACAPS moderators see them. */
export interface ModeratorResponseRow {
  pseudonymId: string;
  anonymity: AnonymityLevel;
  displayName?: string; // only when known_to_acaps
  profile?: ExpertProfile; // only when known_to_acaps
  initial?: Pick<ExpertResponse, 'probability' | 'reason' | 'submittedAt' | 'theme'>;
  revision?: Pick<ExpertResponse, 'probability' | 'reason' | 'submittedAt'>;
}

export interface ModeratorQuestionView {
  question: Question;
  initial: Distribution | null; // first answers
  revised: Distribution | null; // latest answer per expert
  rows: ModeratorResponseRow[];
}

/** Who an approved alert would reach: counts, never names. */
export interface AudiencePreview {
  total: number;
  groups: { label: string; count: number }[]; // e.g. { label: "Chad", count: 6 }
  topics: string[]; // topics covered by at least 3 of the experts reached
  skippedForContactLimit: number;
}

/** The /me page: the expert's own data (they may see all of it), history and track record. */
export interface MyProfileView {
  self: SelfView & {
    displayName?: string;
    profile: ExpertProfile;
    countries: string[];
    topics: string[];
    maxPromptsPerWeek: number;
  };
  history: {
    questionId: string;
    questionText: string;
    riskId: string;
    replay: boolean;
    status: Question['status'];
    outcome?: boolean;
    initial?: number;
    revision?: number;
    reason?: string;
    submittedAt?: string;
  }[];
  trackRecord: TrackRecord;
}

/** The public outcome page: aggregates and moderator-approved themes only. */
export type PublicOutcome = {
  questionId: string;
  questionText: string;
  riskId: string;
  riskTitle: string;
  country: string;
  deadline: string;
  status: Question['status'];
  decision?: Pick<UpdateDecision, 'decision' | 'decidedAt' | 'triggerId' | 'fromRate' | 'toRate'>; // no free-text note
  themes: { agreement: string[]; disagreement: string[]; newInformation: string[] };
} & (
  | { suppressed: true; n: number }
  | { suppressed: false; n: number; median: number; range: [number, number] } // range = middle half (IQR)
);
