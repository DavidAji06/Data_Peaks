/**
 * The one place raw API data (snake_case, lib/types.ts Api*) becomes UI data (camelCase).
 * Real API responses and the offline demo mock go through the same functions.
 * Pure functions: safe for server and client code.
 */
import { canShowAggregate } from './anonymity';
import { strengthWord } from './probability';
import type {
  Alert,
  AnonymityLevel,
  ApiAlert,
  ApiDecisionOut,
  ApiExpertQuestion,
  ApiExpertSettings,
  ApiGroupView,
  ApiLeaderboard,
  ApiPanelInvites,
  ApiPanelPerson,
  ApiPanels,
  ApiParticipation,
  ApiModeratorResponse,
  ApiPublicQuestion,
  ApiQuestionDetail,
  ApiQuestionListItem,
  ApiRankedRisk,
  ApiResolveOut,
  ApiRisk,
  ApiRoundSummary,
  ApiSimilarRisk,
  ApiThemes,
  ApiTrackRecord,
  DecisionResult,
  ExpertQuestion,
  ExpertSettings,
  GroupView,
  Leaderboard,
  PanelInvites,
  PanelPerson,
  Panels,
  Participation,
  ModeratorResponse,
  ParsedTrigger,
  PublicOutcome,
  QuestionDetail,
  QuestionListItem,
  RankedRisk,
  ResolveResult,
  RiskDetail,
  RoundSummary,
  SimilarRisk,
  Themes,
  TrackRecord,
} from './types';

const asBool = (outcome: 0 | 1 | null): boolean | null => (outcome === null ? null : outcome === 1);

export const toAlert = (a: ApiAlert): Alert => ({
  id: a.id,
  riskId: a.risk_id,
  triggerId: a.trigger_id,
  report: { title: a.report.title, source: a.report.source, url: a.report.url, publishedAt: a.report.published_at },
  direction: a.direction,
  strength: a.strength,
  strengthWord: strengthWord(a.strength),
  evidence: a.evidence,
  country: a.country ?? null,
  impactScore: a.impact_score ?? null,
  intensityScore: a.intensity_score ?? null,
  exposureScore: a.exposure_score ?? null,
  description: a.description ?? null,
  regionMatch: a.region_match === true,
  matchedPlace: a.matched_place ?? null,
  status: a.status,
});

/** Moderator queue order: highest impact first, then newest. */
export const byImpactThenDate = (x: Alert, y: Alert) =>
  (y.impactScore ?? 0) - (x.impactScore ?? 0) || (y.report.publishedAt ?? '').localeCompare(x.report.publishedAt ?? '');

export function toSimilarRisk(s: ApiSimilarRisk): SimilarRisk {
  const outcome = s.outcome.trim().toLowerCase();
  return {
    riskId: s.risk_id,
    title: s.title,
    country: s.country,
    similarity: s.similarity,
    outcome: outcome === 'materialised' ? 'materialised' : outcome === 'not materialised' ? 'not_materialised' : 'unknown',
    whatHappened: s.what_happened,
    acapsProbability: s.acaps_probability ?? null,
  };
}

/** The API returns the contract sample (risk_id "R0000") until the ML similarity model lands. */
export const isPlaceholderSimilar = (items: readonly ApiSimilarRisk[]): boolean =>
  items.length === 0 || items.every((s) => s.risk_id === 'R0000' || /^sample\b/i.test(s.title));

/** The API returns one contract sample until the ML ranking lands. */
export const isPlaceholderRanked = (items: readonly ApiRankedRisk[]): boolean => items.length <= 1;

export function toExpertQuestion(
  q: ApiExpertQuestion,
  similar: { items: ApiSimilarRisk[]; areDemo: boolean },
  anonymityLevel: AnonymityLevel | null = null,
): ExpertQuestion {
  return {
    question: {
      id: q.question.id,
      text: q.question.text,
      resolutionCriteria: q.question.resolution_criteria,
      deadline: q.question.deadline,
      status: q.question.status,
    },
    risk: { id: q.risk.id, title: q.risk.title, country: q.risk.country, riskLevel: q.risk.risk_level },
    triggerUpdate: q.trigger_update ? toAlert(q.trigger_update) : null,
    similarRisks: similar.items.map(toSimilarRisk),
    similarRisksAreDemo: similar.areDemo,
    anonymityLevel,
    answered: q.answered,
    revised: q.revised,
  };
}

export const toThemes = (t: ApiThemes): Themes => ({
  agreement: t.agreement,
  disagreement: t.disagreement,
  newInformation: t.new_information,
});

/** Fewer than 5 answers, or figures withheld by the backend → no numbers at all. */
export function toGroupView(g: ApiGroupView): GroupView {
  const base = { questionId: g.question_id, responseCount: g.response_count, themes: toThemes(g.themes) };
  if (!canShowAggregate(g.response_count) || g.median === null || g.min === null || g.max === null) {
    return { ...base, suppressed: true };
  }
  return { ...base, suppressed: false, median: g.median, min: g.min, max: g.max };
}

export const toTrackRecord = (t: ApiTrackRecord): TrackRecord => ({
  answered: t.answered,
  resolved: t.resolved,
  history: t.history.map((h) => ({
    questionId: h.question_id,
    questionText: h.question_text,
    outcome: h.outcome === 1,
  })),
});

export const toDecisionResult = (d: ApiDecisionOut): DecisionResult =>
  d.status === 'approved'
    ? {
        alertId: d.alert_id,
        status: 'approved',
        questionId: d.question_id,
        expertsInvited: d.experts_invited,
        expertsNotified: d.experts_notified ?? null,
      }
    : { alertId: d.alert_id, status: 'rejected' };

export const toQuestionListItem = (q: ApiQuestionListItem): QuestionListItem => ({
  id: q.id,
  riskId: q.risk_id,
  text: q.text,
  status: q.status,
  outcome: asBool(q.outcome),
  deadline: q.deadline,
  invited: q.invited,
  answered: q.answered,
  median: q.median,
  weightedMean: q.weighted_mean ?? null,
});

const toRound = (r: ApiRoundSummary | null): RoundSummary | null =>
  r ? { count: r.count, median: r.median, min: r.min, max: r.max } : null;

const toModeratorResponse = (r: ApiModeratorResponse): ModeratorResponse => ({
  label: r.label,
  anonymityLevel: r.anonymity_level,
  identityKnown: r.identity_known,
  firstProbability: r.first_probability,
  firstReason: r.first_reason,
  latestProbability: r.latest_probability,
  revisionReason: r.revision_reason,
  revised: r.revised,
  brier: r.brier,
  weight: r.weight ?? null,
});

export const toQuestionDetail = (d: ApiQuestionDetail): QuestionDetail => ({
  question: {
    id: d.question.id,
    text: d.question.text,
    resolutionCriteria: d.question.resolution_criteria,
    deadline: d.question.deadline,
    status: d.question.status,
    outcome: asBool(d.question.outcome),
  },
  risk: {
    id: d.risk.id,
    title: d.risk.title,
    country: d.risk.country,
    riskLevel: d.risk.risk_level,
    acapsProbability: d.risk.acaps_probability,
  },
  participation: { ...d.participation },
  firstRound: toRound(d.first_round),
  latest: toRound(d.latest),
  medianShift: d.median_shift,
  weighted: d.weighted
    ? {
        mean: d.weighted.mean,
        median: d.weighted.median,
        count: d.weighted.count,
        label: d.weighted.label,
        expertsWithHistory: d.weighted.experts_with_history,
      }
    : null,
  groupMedianBrier: d.group_median_brier,
  baselineBrier: d.baseline_brier,
  distribution: d.distribution.map((b) => ({ range: b.range, count: b.count })),
  responses: d.responses.map(toModeratorResponse),
  themes: toThemes(d.themes),
});

export const toResolveResult = (r: ApiResolveOut): ResolveResult => ({
  questionId: r.question_id,
  outcome: r.outcome === 1,
  scored: r.scored,
  meanExpertBrier: r.mean_expert_brier ?? null,
  groupMedianBrier: r.group_median_brier ?? null,
  baselineBrier: r.baseline_brier ?? null,
});

const toParticipation = (p: ApiParticipation): Participation => ({
  country: p.country ?? null,
  synthetic: p.synthetic ?? false,
  invited: p.invited ?? 0,
  answered: p.answered ?? 0,
  revised: p.revised ?? 0,
  openUnanswered: p.open_unanswered ?? 0,
});

export const toLeaderboard = (l: ApiLeaderboard): Leaderboard => ({
  baselineBrier: l.baseline_brier,
  minResolved: l.min_resolved,
  experts: l.experts.map((e) => ({
    rank: e.rank,
    label: e.label,
    anonymityLevel: e.anonymity_level,
    resolved: e.resolved,
    meanBrier: e.mean_brier,
    beatsBaseline: e.beats_baseline,
    ...toParticipation(e),
  })),
  unranked: (l.unranked ?? []).map((e) => ({
    label: e.label,
    anonymityLevel: e.anonymity_level,
    resolved: e.resolved,
    meanBrier: e.mean_brier,
    needed: e.needed,
    ...toParticipation(e),
  })),
  anonymous: (l.anonymous ?? []).map((e) => ({
    label: e.label,
    resolved: e.resolved,
    beatsBaseline: e.beats_baseline,
    ...toParticipation(e),
  })),
  note: l.note,
});

export const toPanelInvites = (p: ApiPanelInvites): PanelInvites => ({
  emailConfigured: p.email_configured,
  invites: p.invites.map((i) => ({
    token: i.token,
    email: i.email,
    country: i.country,
    status: i.status,
    emailSent: i.email_sent,
    invitedAt: i.invited_at,
    joinedAt: i.joined_at,
    expert: i.expert,
    anonymous: i.anonymous,
  })),
});

export const toRankedRisk = (r: ApiRankedRisk): RankedRisk => ({
  riskId: r.risk_id,
  title: r.title,
  country: r.country,
  priorityScore: r.priority_score,
  breakdown: {
    signalStrength: r.score_breakdown.signal_strength,
    uncertainty: r.score_breakdown.uncertainty,
    impact: r.score_breakdown.impact,
    reviewAge: r.score_breakdown.review_age,
  },
  modelProbability: r.p_materialise,
  riskLevel: r.risk_level ?? null,
  acapsProbability: r.acaps_probability ?? null,
  lastReviewed: r.last_reviewed ?? null,
});

export const toRiskDetail = (r: ApiRisk): RiskDetail => ({
  id: r.id,
  title: r.title,
  country: r.country,
  iso: r.iso,
  riskType: r.risk_type,
  acapsProbability: r.probability,
  impact: r.impact,
  riskLevel: r.risk_level,
  status: r.status,
  expectedExposure: r.expected_exposure,
  rationale: r.rationale,
  triggers: parseTriggers(r.triggers),
});

// ---------------------------------------------------------------------------
// ACAPS triggers text → list. Blocks start with "Trigger ID: R1043 - T0618"; a label's value may start
// on the same line or the next ones. Longer labels first, so "Completion rate history" wins.
// ---------------------------------------------------------------------------

const TRIGGER_LABELS = [
  'Completion rate history',
  'Completion rate',
  'Quantitative objective to meet 100%',
  'Trend history',
  'Trend',
  'Date entered',
  'Last update',
  'Description',
  'Sources',
  'Title',
];
const LABEL_RE = new RegExp(`^(${TRIGGER_LABELS.map((l) => l.replace(/[.*+?^${}()|[\]\\%]/g, '\\$&')).join('|')}):\\s*(.*)$`);
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

function isoDate(s: string): string | null {
  const m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

export function parseTriggers(text: string | null): ParsedTrigger[] {
  if (!text) return [];
  return text
    .split(/^(?=Trigger ID:)/m)
    .filter((block) => block.startsWith('Trigger ID:'))
    .map((block) => {
      const [first, ...lines] = block.split(/\r?\n/);
      const fields: Record<string, string[]> = {};
      let current: string | null = null;
      for (const line of lines) {
        const m = line.match(LABEL_RE);
        if (m) {
          current = m[1];
          fields[current] = [m[2]];
        } else if (current) {
          fields[current].push(line);
        }
      }
      const value = (label: string) => collapse((fields[label] ?? []).join(' ')).replace(/^:\s*/, '');
      const rate = value('Completion rate').match(/(\d+(?:\.\d+)?)\s*%/);
      const objective = value('Quantitative objective to meet 100%').replace(/^yes\s*[.,:\-–—]\s*/i, '');
      return {
        id: first.match(/T\d+/)?.[0] ?? collapse(first.replace('Trigger ID:', '')),
        title: value('Title'),
        description: value('Description'),
        completionRate: rate ? Math.round(Number(rate[1])) : null,
        objective: objective && !/^no\b/i.test(objective) ? objective : null,
        lastUpdate: isoDate(value('Last update')),
      };
    });
}

/** Public page. The backend withholds figures below 5 answers; the frontend checks the count again. */
export const toPublicOutcome = (q: ApiPublicQuestion): PublicOutcome => ({
  questionId: q.id,
  questionText: q.text,
  riskTitle: q.risk_title,
  country: q.country,
  deadline: q.deadline,
  outcome: asBool(q.outcome),
  simulated: q.simulated,
  group:
    q.group_median !== null && canShowAggregate(q.expert_count)
      ? { expertCount: q.expert_count as number, median: q.group_median }
      : null,
});

export const toExpertSettings = (x: ApiExpertSettings): ExpertSettings => ({
  pseudonym: x.pseudonym,
  anonymityLevel: x.anonymity_level,
  country: x.country,
  topics: x.topics,
  maxOpenQuestions: x.max_open_questions,
});

const toPanelPerson = (p: ApiPanelPerson): PanelPerson => ({
  label: p.label,
  anonymityLevel: p.anonymity_level,
  synthetic: p.synthetic,
});

export const toPanels = (p: ApiPanels): Panels => ({
  target: p.target,
  panels: p.panels.map((c) => ({
    country: c.country,
    pending: c.pending,
    members: c.members.map((m) => ({ ...toPanelPerson(m), membershipId: m.membership_id, since: m.since })),
  })),
  requests: p.requests.map((r) => ({
    ...toPanelPerson(r),
    membershipId: r.membership_id,
    country: r.country,
    note: r.note,
    requestedAt: r.requested_at,
    memberOf: r.member_of,
  })),
});
