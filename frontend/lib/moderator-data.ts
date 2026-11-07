/**
 * Moderator dashboard data helpers: write questions, expert Brier scores, and impact scores.
 * Pure helpers used across moderator screens (M1–M6).
 */

import type { ApiDecisionIn } from './types';

// ===========================================================================
// 1. Write questions (M1 alert approval)
// ===========================================================================

/**
 * Get today's date in YYYY-MM-DD format safely for prerendering.
 * This helper is used during validation to check deadline > today.
 */
function getTodayIso(): string {
  if (typeof window === 'undefined') {
    // Server-side: only called at runtime, not during prerendering
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
  // Client-side
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Build the API payload for approving an alert and sending it as a question.
 * Validates the three required fields.
 */
export function buildQuestionDecision(
  questionText: string,
  resolutionCriteria: string,
  deadline: string, // YYYY-MM-DD, must be future
): ApiDecisionIn {
  const today = getTodayIso();
  if (!questionText?.trim()) throw new Error('Question text is required');
  if (!resolutionCriteria?.trim()) throw new Error('Resolution criteria are required');
  if (!deadline?.trim()) throw new Error('Deadline is required');
  if (deadline <= today) throw new Error('Deadline must be in the future');
  return {
    status: 'approved',
    question_text: questionText.trim(),
    resolution_criteria: resolutionCriteria.trim(),
    deadline,
  };
}

/**
 * Build the API payload for rejecting an alert (no question created).
 * Optional reason field is not sent to the API per the current contract.
 */
export function buildRejectDecision(): ApiDecisionIn {
  return { status: 'rejected' };
}

// ===========================================================================
// 2. Expert Brier scores (M4 question detail, M5 leaderboard)
// ===========================================================================

/**
 * Format Brier score for display with plain-language interpretation.
 * Lower is better. Baseline is 0.25 (always guessing 50%).
 * Returns { score, rounded, beatsBaseline, label }
 */
export function formatBrier(brier: number | null, baseline: number = 0.25) {
  if (brier === null) return null;
  const rounded = Math.round(brier * 100) / 100;
  const beatsBaseline = brier < baseline;
  let label: string;
  if (brier < 0.1) {
    label = 'Excellent calibration';
  } else if (brier < baseline) {
    label = 'Better than baseline';
  } else if (brier === baseline) {
    label = 'At baseline';
  } else if (brier < 0.4) {
    label = 'Worse than baseline';
  } else {
    label = 'Poor calibration';
  }
  return { score: brier, rounded, beatsBaseline, label };
}

/**
 * Derive an expert's overall accuracy tier from mean Brier over resolved questions.
 * Only meaningful when resolved >= 3 (backend MIN_RESOLVED_FOR_RANKING).
 */
export function accuracyTier(meanBrier: number | null, resolved: number, baseline: number = 0.25): string {
  if (resolved < 3 || meanBrier === null) return 'Not yet ranked';
  if (meanBrier < baseline * 0.8) return 'Highly calibrated';
  if (meanBrier < baseline) return 'Well calibrated';
  if (meanBrier === baseline) return 'Baseline';
  return 'Below baseline';
}

// ===========================================================================
// 3. Impact scores (M2 risks, M2 risks/[id])
// ===========================================================================

export type ImpactLabel = 'Very Low' | 'Low' | 'Moderate' | 'Significant' | 'Major';

/**
 * ACAPS V5 impact scale: 1–5 numeric to label.
 * Matches the official ACAPS methodology (as of 2026).
 */
export const IMPACT_SCALE: Record<number, ImpactLabel> = {
  1: 'Very Low',
  2: 'Low',
  3: 'Moderate',
  4: 'Significant',
  5: 'Major',
};

/**
 * Derive an impact label from the raw 1–5 number in ApiRisk.impact.
 * Returns { level, label } or null if the number is invalid or missing.
 * Clearly labelled as derived: "Impact (ACAPS scale): Significant (4)".
 */
export function deriveImpactLabel(impact: number | null): { level: number; label: ImpactLabel } | null {
  if (impact === null || impact < 1 || impact > 5 || !Number.isInteger(impact)) {
    return null;
  }
  const label = IMPACT_SCALE[impact];
  return { level: impact, label };
}

/**
 * Get impact color for visual display (tailwind compatible).
 * Maps to risk level styling: Low/Very Low → green, Moderate → amber, Significant/Major → red.
 */
export function impactColor(level: number): string {
  if (level <= 2) return 'text-green-700';
  if (level === 3) return 'text-amber-700';
  return 'text-red-700';
}

/**
 * Get impact background color for badges/chips.
 */
export function impactBgColor(level: number): string {
  if (level <= 2) return 'bg-green-50';
  if (level === 3) return 'bg-amber-50';
  return 'bg-red-50';
}

// ===========================================================================
// Display helpers
// ===========================================================================

/**
 * Format Brier as a percentage (0.25 → "25%") for UI.
 */
export function brierPercent(brier: number | null): string {
  if (brier === null) return '—';
  return `${Math.round(brier * 100)}%`;
}

/**
 * Check if an expert's scores should be visible to the moderator.
 * (Currently always true in the moderator view; rules may differ in public.)
 */
export function canShowExpertBrier(anonymityLevel: string): boolean {
  // Moderator can see all experts' Brier scores, including anonymous ones.
  // The leaderboard itself excludes anonymous experts per the backend.
  return true;
}
