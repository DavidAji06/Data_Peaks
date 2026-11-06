/**
 * Anonymity rules: who may see which part of an expert's contribution.
 *
 * lib/api.ts runs every response through toViewerShape() before returning it, so UI components
 * only ever receive data already filtered for their viewer. This module holds rules only, never
 * data, so client components may import it (e.g. for the "Who sees this answer" line).
 *
 * Visibility matrix (frontend/CLAUDE.md §3.5):
 * | Field              | Expert (self) | Peers (group view)                       | Moderator (ACAPS)        | Public                  |
 * |--------------------|---------------|------------------------------------------|--------------------------|-------------------------|
 * | Real name          | yes           | never                                    | only if known_to_acaps   | never                   |
 * | Pseudonym          | yes           | only if pseudonymous                     | yes                      | never                   |
 * | Probability        | yes           | aggregates only (median, IQR, band counts) | yes, by pseudonym      | aggregates only         |
 * | Reason text        | yes           | yes; pseudonym only if pseudonymous      | yes                      | paraphrased themes only |
 * | Country/org detail | yes           | never                                    | only if known_to_acaps   | never                   |
 *
 * Small-n rule: no aggregate, theme list or breakdown is shown for fewer than MIN_GROUP_SIZE experts.
 * Peers never get min/max: with a handful of experts those are exact individual answers.
 */
import { GroupLockedError } from './errors';
import { distribution, iqr, median } from './probability';
import type {
  AnonymityLevel,
  AudiencePreview,
  Expert,
  ExpertResponse,
  GroupView,
  ModeratorQuestionView,
  ModeratorResponseRow,
  ModeratorSummary,
  PeerReason,
  PublicOutcome,
  Question,
  ReasonTheme,
  Risk,
  SelfView,
  UpdateDecision,
  Viewer,
} from './types';

export const MIN_GROUP_SIZE = 3;

export const canShowAggregate = (n: number): boolean => n >= MIN_GROUP_SIZE;

/** Everything known about one question. Server-side only: never pass this to a client component. */
export interface QuestionData {
  question: Question;
  risk: Pick<Risk, 'id' | 'title' | 'country'>;
  panel: Expert[]; // experts invited to this question
  responses: ExpertResponse[]; // first answers and revisions to this question
  summary?: ModeratorSummary | null;
  decision?: UpdateDecision | null;
}

const byTime = (a: ExpertResponse, b: ExpertResponse) => a.submittedAt.localeCompare(b.submittedAt);

/** Each expert's first answer. Experts without one don't count towards n. */
export function initialByExpert(responses: readonly ExpertResponse[]): Map<string, ExpertResponse> {
  const out = new Map<string, ExpertResponse>();
  for (const r of [...responses].sort(byTime)) {
    if (r.kind === 'initial' && !out.has(r.pseudonymId)) out.set(r.pseudonymId, r);
  }
  return out;
}

/** Each expert's most recent revision, if any. */
export function revisionByExpert(responses: readonly ExpertResponse[]): Map<string, ExpertResponse> {
  const out = new Map<string, ExpertResponse>();
  for (const r of [...responses].sort(byTime)) if (r.kind === 'revision') out.set(r.pseudonymId, r);
  return out;
}

/** Each answering expert's current position: their latest revision, else their first answer. */
export function latestByExpert(responses: readonly ExpertResponse[]): Map<string, ExpertResponse> {
  const initial = initialByExpert(responses);
  const revised = revisionByExpert(responses);
  return new Map([...initial].map(([id, r]) => [id, revised.get(id) ?? r]));
}

const THEME_ORDER: (ReasonTheme | undefined)[] = ['agree', 'disagree', 'new_info', undefined];

/**
 * Levels change "for future answers", so each answer keeps the level it was given under. For each audience
 * the stricter one wins: a pseudonym reaches peers only if the expert was pseudonymous when answering AND
 * still is; a name reaches ACAPS only if they were known to ACAPS then AND now. Becoming more private
 * therefore also covers old answers; becoming less private never exposes them.
 */
const levelsFor = (expert: Expert | undefined, answers: readonly ExpertResponse[]): AnonymityLevel[] => [
  ...(expert ? [expert.anonymity] : []),
  ...answers.flatMap((r) => (r.anonymity ? [r.anonymity] : [])),
];

export const pseudonymVisibleToPeers = (expert: Expert | undefined, answers: readonly ExpertResponse[]): boolean => {
  const levels = levelsFor(expert, answers);
  return levels.length > 0 && levels.every((l) => l === 'pseudonymous');
};

export const nameVisibleToAcaps = (expert: Expert | undefined, answers: readonly ExpertResponse[]): boolean => {
  const levels = levelsFor(expert, answers);
  return levels.length > 0 && levels.every((l) => l === 'known_to_acaps');
};

export function toViewerShape(data: QuestionData, viewer: 'expert', self: Expert): GroupView;
export function toViewerShape(data: QuestionData, viewer: 'moderator'): ModeratorQuestionView;
export function toViewerShape(data: QuestionData, viewer: 'public'): PublicOutcome;
export function toViewerShape(
  data: QuestionData,
  viewer: Viewer,
  self?: Expert,
): GroupView | ModeratorQuestionView | PublicOutcome {
  switch (viewer) {
    case 'expert':
      if (!self) throw new Error('The expert view needs the viewing expert');
      return peerGroupView(data, self);
    case 'moderator':
      return moderatorView(data);
    case 'public':
      return publicOutcome(data);
  }
}

/** The group view an expert sees after answering: aggregates plus other experts' reasons. */
function peerGroupView(data: QuestionData, self: Expert): GroupView {
  const initial = initialByExpert(data.responses);
  // Blind-answer lock, enforced here as well as in lib/api.ts.
  if (!initial.has(self.pseudonymId)) throw new GroupLockedError();

  const base = { questionId: data.question.id, n: initial.size, acapsProbability: data.question.acapsProbability };
  if (!canShowAggregate(initial.size)) return { ...base, suppressed: true };

  const latest = latestByExpert(data.responses);
  const dist = distribution([...latest.values()].map((r) => r.probability))!;
  const expertOf = new Map(data.panel.map((e) => [e.pseudonymId, e]));

  const reasons: PeerReason[] = [...initial.values()]
    .filter((r) => r.pseudonymId !== self.pseudonymId && r.reason.trim() !== '')
    .sort((a, b) => THEME_ORDER.indexOf(a.theme) - THEME_ORDER.indexOf(b.theme) || byTime(a, b))
    .map((r) => ({
      text: r.reason,
      ...(pseudonymVisibleToPeers(expertOf.get(r.pseudonymId), [r]) ? { pseudonymId: r.pseudonymId } : {}),
      ...(r.theme ? { theme: r.theme } : {}),
    }));

  return { ...base, suppressed: false, median: dist.median, iqr: dist.iqr, histogram: dist.histogram, reasons };
}

/** ACAPS sees every answer by pseudonym; names and profile details only for experts known to ACAPS. */
function moderatorView(data: QuestionData): ModeratorQuestionView {
  const initial = initialByExpert(data.responses);
  const revised = revisionByExpert(data.responses);
  const latest = latestByExpert(data.responses);

  const rows: ModeratorResponseRow[] = data.panel
    .map((e) => {
      const first = initial.get(e.pseudonymId);
      const rev = revised.get(e.pseudonymId);
      const answers = data.responses.filter((r) => r.pseudonymId === e.pseudonymId);
      return {
        pseudonymId: e.pseudonymId,
        anonymity: e.anonymity,
        ...(nameVisibleToAcaps(e, answers) ? { displayName: e.displayName, profile: e.profile } : {}),
        ...(first
          ? { initial: { probability: first.probability, reason: first.reason, submittedAt: first.submittedAt, theme: first.theme } }
          : {}),
        ...(rev ? { revision: { probability: rev.probability, reason: rev.reason, submittedAt: rev.submittedAt } } : {}),
      };
    })
    .sort((a, b) => Number(!a.initial) - Number(!b.initial) || a.pseudonymId.localeCompare(b.pseudonymId));

  return {
    question: data.question,
    initial: distribution([...initial.values()].map((r) => r.probability)),
    revised: distribution([...latest.values()].map((r) => r.probability)),
    rows,
  };
}

/** The public sees aggregates and moderator-approved, paraphrased themes. Nothing individual. */
function publicOutcome(data: QuestionData): PublicOutcome {
  const initial = initialByExpert(data.responses);
  const n = initial.size;
  const safe = canShowAggregate(n);
  const approved = safe && data.summary?.approvedByModerator === true;
  const d = data.decision;

  const base = {
    questionId: data.question.id,
    questionText: data.question.text,
    riskId: data.risk.id,
    riskTitle: data.risk.title,
    country: data.risk.country,
    deadline: data.question.deadline,
    status: data.question.status,
    // The decision type only: the moderator's free-text note may mention individuals.
    ...(d
      ? {
          decision: {
            decision: d.decision,
            decidedAt: d.decidedAt,
            ...(d.triggerId ? { triggerId: d.triggerId } : {}),
            ...(d.fromRate !== undefined ? { fromRate: d.fromRate } : {}),
            ...(d.toRate !== undefined ? { toRate: d.toRate } : {}),
          },
        }
      : {}),
    themes: approved
      ? {
          agreement: [...data.summary!.agreement],
          disagreement: [...data.summary!.disagreement],
          newInformation: [...data.summary!.newInformation],
        }
      : { agreement: [], disagreement: [], newInformation: [] },
  };
  if (!safe) return { ...base, suppressed: true, n };
  const values = [...latestByExpert(data.responses).values()].map((r) => r.probability);
  return { ...base, suppressed: false, n, median: median(values), range: iqr(values) };
}

/** Median per group (e.g. by region), hiding any group with fewer than MIN_GROUP_SIZE experts. */
export function safeBreakdown<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  valueOf: (item: T) => number,
): ({ key: string; n: number; suppressed: true } | { key: string; n: number; suppressed: false; median: number })[] {
  const groups = new Map<string, number[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), valueOf(item)]);
  return [...groups].map(([key, values]) =>
    canShowAggregate(values.length)
      ? { key, n: values.length, suppressed: false as const, median: median(values) }
      : { key, n: values.length, suppressed: true as const },
  );
}

/** What each audience sees of an answer at a given anonymity level (drives "Who sees this answer"). */
export interface Visibility {
  acaps: 'name' | 'pseudonym';
  peers: 'pseudonym' | 'anonymous';
  public: 'never';
}

export function visibilityOf(level: AnonymityLevel): Visibility {
  return {
    acaps: level === 'known_to_acaps' ? 'name' : 'pseudonym',
    peers: level === 'pseudonymous' ? 'pseudonym' : 'anonymous',
    public: 'never',
  };
}

export const toSelfView = (e: Expert): SelfView => ({
  pseudonymId: e.pseudonymId,
  anonymity: e.anonymity,
  locale: e.locale,
});

/** Who an approved alert would reach: counts per country, shared topics, and who is skipped. Never names. */
export function audiencePreview(panel: readonly Expert[], riskCountries: string): AudiencePreview {
  const countries = riskCountries.split(',').map((c) => c.trim());
  const eligible = panel.filter((e) => e.countries.some((c) => countries.includes(c)));
  const atLimit = eligible.filter((e) => e.promptsThisWeek >= e.maxPromptsPerWeek);
  const reached = eligible.filter((e) => !atLimit.includes(e));

  const byCountry = new Map<string, number>();
  for (const e of reached) {
    const c = e.countries.find((x) => countries.includes(x))!;
    byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
  }
  const topicCounts = new Map<string, number>();
  for (const e of reached) for (const t of e.topics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);

  return {
    total: reached.length,
    groups: [...byCountry].map(([label, count]) => ({ label, count })),
    topics: [...topicCounts].filter(([, n]) => canShowAggregate(n)).map(([t]) => t),
    skippedForContactLimit: atLimit.length,
  };
}
