/**
 * Anonymity rules the frontend applies on top of the backend's.
 *
 * The backend decides who sees what (labels per anonymity level, the blind-answer lock, no anonymous
 * experts on the leaderboard). The frontend adds:
 * - Small-n: no figures, themes or breakdowns for fewer than MIN_GROUP_SIZE answers, whatever the API sent.
 * - The public page uses the backend's public endpoint (aggregates only, resolved questions only).
 * - Expert tokens are credentials: never rendered, logged, put in a <title>, or sent to moderator pages.
 * Rules only, no data: safe to import from client components.
 */
import type { AnonymityLevel } from './types';

export const MIN_GROUP_SIZE = 5; // same as the backend (main.py MIN_GROUP_SIZE, public.py MIN_PUBLIC_GROUP)

export const canShowAggregate = (n: unknown): boolean =>
  typeof n === 'number' && Number.isFinite(n) && n >= MIN_GROUP_SIZE;


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
