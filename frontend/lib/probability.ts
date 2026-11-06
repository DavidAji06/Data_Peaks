/**
 * Probability helpers. Data is always 0–1; convert to whole percent only for display.
 *
 * Bands follow the backend exactly (backend/app/routers/moderator.py `bands`): five equal 20% bands,
 * band = min(floor(p × 5), 4), so 0.2 is in "20–40%" and 1.0 is in "80–100%". All edges live in BANDS.
 * ACAPS's own rating is shown as the label the data gives ("High", "Very High"), never recomputed.
 * Wording rule from ACAPS: never call a low probability "unlikely"; show the number and the band.
 */
import type { StrengthWord } from './types';

export const BANDS = [
  { index: 0, min: 0, max: 0.2, label: '0–20%' },
  { index: 1, min: 0.2, max: 0.4, label: '20–40%' },
  { index: 2, min: 0.4, max: 0.6, label: '40–60%' },
  { index: 3, min: 0.6, max: 0.8, label: '60–80%' },
  { index: 4, min: 0.8, max: 1, label: '80–100%' },
] as const;

/** Same rule as the backend: min(floor(p × 5), 4). */
export function bandIndex(p: number): number {
  return Math.min(Math.floor(Math.max(0, p) * 5), 4);
}

export const bandLabel = (p: number): string => BANDS[bandIndex(p)].label;

/** 0–1 → whole percent for display. */
export const toPercent = (p: number): number => Math.round(p * 100);

/** Slider value (0–100) → the 0–1 probability the API expects. */
export const fromPercent = (percent: number): number => Math.round(percent) / 100;

/** Always answering 50% scores 0.25. */
export const BASELINE_BRIER = 0.25;

/**
 * Python's round(x, digits): rounds the exact binary value of x, and exact ties go to the even digit.
 * (Math.round(x * 100) / 100 would turn the double 0.735 — really 0.73499999… — into 0.74; Python gives 0.73.)
 */
export function roundLikePython(x: number, digits: number): number {
  const exact = Math.abs(x).toFixed(Math.min(digits + 30, 100)); // exact decimal expansion of the double
  const [whole, frac = ''] = exact.split('.');
  const kept = BigInt(whole + frac.slice(0, digits));
  const rest = frac.slice(digits);
  const up = /^5(0*)$/.test(rest) ? kept % BigInt(2) === BigInt(1) : rest > '5'.padEnd(rest.length, '0');
  const rounded = Number(up ? kept + BigInt(1) : kept) / 10 ** digits;
  return x < 0 ? -rounded : rounded;
}

/** (p − o)², rounded to 4 decimals like the backend. Lower is better. */
export function brier(p: number, outcome: 0 | 1 | boolean): number {
  return roundLikePython((p - Number(outcome)) ** 2, 4);
}

/** Like Python's statistics.median: mean of the two middle values for an even count. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('median of an empty list');
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Alert strength in plain words: weak < 0.4, moderate 0.4–0.7, strong > 0.7. */
export function strengthWord(strength: number | null): StrengthWord | null {
  if (strength === null || !Number.isFinite(strength)) return null;
  if (strength > 0.7) return 'strong';
  if (strength >= 0.4) return 'moderate';
  return 'weak';
}
