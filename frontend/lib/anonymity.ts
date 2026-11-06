/**
 * Anonymity rules the frontend applies on top of the backend's.
 *
 * The backend decides who sees what (labels per anonymity level, the blind-answer lock, no anonymous
 * experts on the leaderboard). The frontend adds:
 * - Small-n: no figures, themes or breakdowns for fewer than MIN_GROUP_SIZE answers, whatever the API sent.
 * - The public outcome page gets aggregates only, built on the server from the moderator view:
 *   no labels, no individual probabilities, no reasons.
 * - Expert tokens are credentials: never rendered, logged, put in a <title>, or sent to moderator pages.
 * Rules only, no data: safe to import from client components.
 */
import { BANDS, bandIndex } from './probability';
import type { AnonymityLevel, PublicOutcome, QuestionDetail } from './types';

export const MIN_GROUP_SIZE = 3;

export const canShowAggregate = (n: unknown): boolean =>
  typeof n === 'number' && Number.isFinite(n) && n >= MIN_GROUP_SIZE;

/** Public view of a question: answered count, latest median, range in 20% bands, outcome, themes. Nothing individual. */
export function toPublicOutcome(d: QuestionDetail): PublicOutcome {
  const base = {
    questionId: d.question.id,
    questionText: d.question.text,
    riskTitle: d.risk.title,
    country: d.risk.country,
    status: d.question.status,
    outcome: d.question.outcome,
  };
  const answered = d.participation.answered;
  if (!canShowAggregate(answered) || !d.latest) return { ...base, suppressed: true, answered };
  return {
    ...base,
    suppressed: false,
    answered,
    median: d.latest.median,
    rangeLow: BANDS[bandIndex(d.latest.min)].min,
    rangeHigh: BANDS[bandIndex(d.latest.max)].max,
    themes: d.themes,
  };
}

/**
 * What each audience sees of an answer at a given level (backend services/anonymity.py + leaderboard rule).
 * GET /q/{token} doesn't return the expert's level yet (requested from David), so the expert screen
 * shows a generic line until it does.
 */
export function visibilityOf(level: AnonymityLevel): { acaps: 'name' | 'pseudonym' | 'anonymous_label'; ranked: boolean } {
  if (level === 'known_to_acaps') return { acaps: 'name', ranked: true };
  if (level === 'pseudonymous') return { acaps: 'pseudonym', ranked: true };
  return { acaps: 'anonymous_label', ranked: false };
}
