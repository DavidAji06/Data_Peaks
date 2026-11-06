/**
 * Converts the backend wire format (lib/contracts.ts) to domain types (lib/types.ts), and back for POST bodies.
 *
 * Fields the backend contract doesn't have yet get explicit empty defaults, never invented values.
 * Each gap is marked "not in the contract yet" and listed for David in HANDOFF.md.
 */
import { MIN_GROUP_SIZE } from './anonymity';
import type {
  WireAlert,
  WireGroupView,
  WireQuestion,
  WireRankedRisk,
  WireResponse,
  WireResponseIn,
  WireRisk,
  WireSimilarRisk,
  WireTrigger,
} from './contracts';
import type {
  Alert,
  AlertStrength,
  ExpertResponse,
  GroupView,
  PeerReason,
  ProbabilityBand,
  Question,
  RankedRisk,
  Risk,
  RiskLevel,
  RiskStatus,
  SimilarRisk,
  Trigger,
} from './types';

const norm = (label: string) => label.trim().toLowerCase().replace(/[_-]+/g, ' ');

const BAND_BY_LABEL: Record<string, ProbabilityBand> = {
  'very low': 'very_low',
  low: 'low',
  medium: 'medium',
  moderate: 'medium',
  high: 'high',
  'very high': 'very_high',
};

export function bandFromLabel(label: string): ProbabilityBand {
  const band = BAND_BY_LABEL[norm(label)];
  if (!band) throw new Error(`Unknown probability label: "${label}"`);
  return band;
}

export function levelFromLabel(label: string): RiskLevel {
  const level = norm(label);
  if (level === 'low' || level === 'medium' || level === 'high') return level;
  throw new Error(`Unknown risk level: "${label}"`);
}

export function statusFromLabel(label: string): RiskStatus {
  const s = norm(label);
  if (s === 'active') return 'active';
  if (s === 'materialised' || s === 'materialized') return 'materialised';
  if (s === 'not materialised' || s === 'not materialized') return 'not_materialised';
  throw new Error(`Unknown risk status: "${label}"`);
}

export function outcomeFromLabel(label: string): SimilarRisk['outcome'] {
  const s = statusFromLabel(label);
  if (s === 'active') throw new Error('An active risk has no outcome yet');
  return s;
}

/** 0–1 → whole percent. */
const pct = (p01: number) => Math.round(Math.min(1, Math.max(0, p01)) * 100);

/** "R1043 - T0618" or "T0618" → "T0618". */
export const shortTriggerId = (id: string): string => id.match(/T\d+/)?.[0] ?? id.trim();

function impactOf(n: number): Risk['impact'] {
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
  throw new Error(`Impact must be 1–5, got ${n}`);
}

export function riskFromWire(w: WireRisk): Risk {
  return {
    id: w.id,
    title: w.title,
    country: w.country,
    iso: w.iso,
    type: w.risk_type,
    probability: bandFromLabel(w.probability),
    impact: impactOf(w.impact),
    riskLevel: levelFromLabel(w.risk_level),
    status: statusFromLabel(w.status),
    expectedExposure: w.expected_exposure,
    priorityNeeds: [], // not in the contract yet
    rationaleSummary: '', // not in the contract yet
    lastReviewed: w.last_reviewed || null,
    triggerIds: [], // not in the contract yet
  };
}

export function triggerFromWire(w: WireTrigger): Trigger {
  // completion rate, history, objective, sources and dates are not in the contract yet
  return { id: shortTriggerId(w.id), riskId: w.risk_id, title: w.title, description: w.description };
}

/** Pipeline score 0–1 → label. Thresholds are ours; confirm with Markos. */
export function strengthLabel(score: number): AlertStrength {
  if (score >= 0.7) return 'strong';
  if (score >= 0.4) return 'moderate';
  return 'weak';
}

function alertStatus(s: string): Alert['status'] {
  const v = norm(s);
  if (v === 'pending' || v === 'approved' || v === 'rejected') return v;
  throw new Error(`Unknown alert status: "${s}"`);
}

export function alertFromWire(w: WireAlert, draft?: Alert['draftQuestion']): Alert {
  return {
    id: w.id,
    riskId: w.risk_id,
    triggerId: shortTriggerId(w.trigger_id),
    evidence: {
      id: `${w.id}-report`,
      title: w.report.title,
      source: w.report.source,
      url: w.report.url,
      publishedAt: w.report.published_at,
      summary: '', // not in the contract yet
      language: 'en', // not in the contract yet
      synthetic: false,
    },
    // Only "escalating" appears in the samples; anything that reads as easing maps to "down".
    direction: /de-?escalat|improv|eas|decreas|down/i.test(w.direction) ? 'down' : 'up',
    strength: strengthLabel(w.strength),
    strengthScore: w.strength,
    machineRationale: w.evidence,
    status: alertStatus(w.status),
    draftQuestion: draft ?? { text: '', resolutionCriteria: '', deadline: '' }, // drafts come from POST /questions
    createdAt: w.report.published_at, // no created_at in the contract yet
    synthetic: false,
  };
}

function questionStatus(s: string): Question['status'] {
  const v = norm(s);
  if (v === 'open' || v === 'closed' || v === 'resolved') return v;
  throw new Error(`Unknown question status: "${s}"`);
}

/** The question endpoint carries no context; lib/api.ts composes it from the risk, alert and similar risks. */
export function questionFromWire(
  w: WireQuestion,
  extra: Pick<Question, 'context' | 'similarRisks' | 'acapsProbability'> & { triggerId?: string },
): Question {
  return {
    id: w.id,
    riskId: w.risk_id,
    ...(extra.triggerId ? { triggerId: extra.triggerId } : {}),
    text: w.text,
    resolutionCriteria: w.resolution_criteria,
    deadline: w.deadline,
    status: questionStatus(w.status),
    context: extra.context,
    similarRisks: extra.similarRisks,
    acapsProbability: extra.acapsProbability,
  };
}

export function responseFromWire(w: WireResponse): ExpertResponse {
  return {
    id: w.id,
    questionId: w.question_id,
    pseudonymId: w.pseudonym_id,
    probability: pct(w.probability),
    reason: w.reason,
    kind: w.round > 1 ? 'revision' : 'initial',
    submittedAt: '', // not in the contract yet
  };
}

export function responseToWire(
  r: Pick<ExpertResponse, 'questionId' | 'pseudonymId' | 'probability' | 'reason' | 'kind'>,
): WireResponseIn {
  return {
    question_id: r.questionId,
    pseudonym_id: r.pseudonymId,
    probability: r.probability / 100,
    reason: r.reason,
    round: r.kind === 'revision' ? 2 : 1,
  };
}

/**
 * The backend's group view. Its min/max are dropped on purpose (peers see aggregates only), and its
 * themes become reasons without names. Fewer than MIN_GROUP_SIZE answers → suppressed, whatever it sent.
 */
export function groupViewFromWire(w: WireGroupView, acapsProbability: ProbabilityBand): GroupView {
  const base = { questionId: w.question_id, n: w.response_count, acapsProbability };
  if (w.response_count < MIN_GROUP_SIZE) return { ...base, suppressed: true };
  const reasons: PeerReason[] = [
    ...w.themes.agreement.map((text) => ({ text, theme: 'agree' as const })),
    ...w.themes.disagreement.map((text) => ({ text, theme: 'disagree' as const })),
    ...w.themes.new_information.map((text) => ({ text, theme: 'new_info' as const })),
  ];
  return { ...base, suppressed: false, median: pct(w.median), reasons };
}

export function rankedRiskFromWire(
  w: WireRankedRisk,
  risk: Pick<Risk, 'iso' | 'probability' | 'riskLevel' | 'lastReviewed'>,
): RankedRisk {
  return {
    riskId: w.risk_id,
    title: w.title,
    country: w.country,
    iso: risk.iso,
    score: w.priority_score,
    breakdown: {
      signalStrength: w.score_breakdown.signal_strength,
      uncertainty: w.score_breakdown.uncertainty,
      impact: w.score_breakdown.impact,
      reviewAge: w.score_breakdown.review_age,
    },
    modelProbability: w.p_materialise,
    acapsProbability: risk.probability,
    riskLevel: risk.riskLevel,
    lastReviewed: risk.lastReviewed,
  };
}

export function similarRiskFromWire(w: WireSimilarRisk, acapsProbability?: ProbabilityBand): SimilarRisk {
  return {
    riskId: w.risk_id,
    title: w.title,
    country: w.country,
    similarity: w.similarity,
    ...(acapsProbability ? { acapsProbability } : {}), // not in the contract yet
    outcome: outcomeFromLabel(w.outcome),
    outcomeSummary: w.what_happened,
  };
}
