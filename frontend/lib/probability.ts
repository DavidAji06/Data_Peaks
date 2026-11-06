/**
 * Probability helpers: ACAPS probability bands, summary statistics and Brier scores.
 *
 * Units: forecasts in the UI and in domain types are integers 0–100. Brier scores use 0–1.
 * Wording rule from ACAPS: never label a low probability "unlikely". Show the number and the band name.
 */
import type { Distribution, ProbabilityBand, RiskLevel } from './types';

export const BANDS: readonly ProbabilityBand[] = ['very_low', 'low', 'medium', 'high', 'very_high'];

export interface BandRange {
  band: ProbabilityBand;
  min: number; // inclusive, whole percent
  max: number; // inclusive, whole percent
}

/**
 * ALL band edges live here, so switching schemes is a one-line change (BAND_SCHEME below).
 * - acaps2019: ACAPS methodology 2019 (Medow & Lucey unequal ranges):
 *   Very low <10% · Low 10–33% · Medium 34–66% · High 67–90% · Very high >90%.
 *   (The methodology text says "Moderate"; the Risk Radar export says "Medium", so we use "Medium".)
 * - equal20: ACAPS's 2026 infographic shows equal 20% bands. The exact edge rounding is assumed.
 * Open question for ACAPS (Alexander Harper is on site): which scheme applies today?
 */
export const BAND_SCHEMES = {
  acaps2019: [
    { band: 'very_low', min: 0, max: 9 },
    { band: 'low', min: 10, max: 33 },
    { band: 'medium', min: 34, max: 66 },
    { band: 'high', min: 67, max: 90 },
    { band: 'very_high', min: 91, max: 100 },
  ],
  equal20: [
    { band: 'very_low', min: 0, max: 20 },
    { band: 'low', min: 21, max: 40 },
    { band: 'medium', min: 41, max: 60 },
    { band: 'high', min: 61, max: 80 },
    { band: 'very_high', min: 81, max: 100 },
  ],
} as const satisfies Record<string, readonly BandRange[]>;

export type BandScheme = keyof typeof BAND_SCHEMES;
export const BAND_SCHEME: BandScheme = 'acaps2019';
export const PROBABILITY_BANDS: readonly BandRange[] = BAND_SCHEMES[BAND_SCHEME];

/** Clamp to 0–100 and round to a whole percent (what the UI displays). */
export function toWholePercent(p: number): number {
  if (!Number.isFinite(p)) throw new RangeError(`Not a probability: ${p}`);
  return Math.min(100, Math.max(0, Math.round(p)));
}

/** The band of a 0–100 forecast. Uses the rounded value, so the band always matches the number shown. */
export function bandOf(p: number, bands: readonly BandRange[] = PROBABILITY_BANDS): ProbabilityBand {
  const whole = toWholePercent(p);
  const hit = bands.find((b) => whole >= b.min && whole <= b.max);
  if (!hit) throw new RangeError(`No band covers ${whole}%`);
  return hit.band;
}

export function bandRange(band: ProbabilityBand, bands: readonly BandRange[] = PROBABILITY_BANDS): BandRange {
  const hit = bands.find((b) => b.band === band);
  if (!hit) throw new RangeError(`Unknown band: ${band}`);
  return hit;
}

/** 0–1 → whole percent, and back. */
export const toPercent = (p01: number): number => toWholePercent(p01 * 100);
export const toUnit = (p100: number): number => toWholePercent(p100) / 100;

function sorted(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Linear-interpolation quantile (the common "type 7" definition), q in 0–1. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) throw new RangeError('quantile of an empty list');
  const s = sorted(values);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (values: readonly number[]): number => quantile(values, 0.5);

/** Interquartile range: the middle half of the answers. */
export const iqr = (values: readonly number[]): [number, number] => [quantile(values, 0.25), quantile(values, 0.75)];

/** Counts per ACAPS band (5 bins, very_low → very_high). */
export function histogram(values: readonly number[], bands: readonly BandRange[] = PROBABILITY_BANDS): number[] {
  const counts = bands.map(() => 0);
  for (const v of values) counts[bands.findIndex((b) => b.band === bandOf(v, bands))]++;
  return counts;
}

/** Summary of 0–100 forecasts, or null when there are none. */
export function distribution(values: readonly number[]): Distribution | null {
  if (values.length === 0) return null;
  const s = sorted(values);
  return {
    n: s.length,
    median: median(s),
    iqr: iqr(s),
    min: s[0],
    max: s[s.length - 1],
    histogram: histogram(s),
  };
}

/** Brier score of one forecast: (p − o)², p in 0–1, o = 1 if it happened. Lower is better; 0.25 = always saying 50%. */
export function brier(p01: number, outcome: boolean): number {
  if (!(p01 >= 0 && p01 <= 1)) throw new RangeError(`Brier needs a probability in 0–1, got ${p01}`);
  const o = outcome ? 1 : 0;
  return (p01 - o) ** 2;
}

export interface ResolvedForecast {
  probability: number; // 0–100
  outcome: boolean;
}

export function meanBrier(forecasts: readonly ResolvedForecast[]): number | null {
  if (forecasts.length === 0) return null;
  const total = forecasts.reduce((sum, f) => sum + brier(toUnit(f.probability), f.outcome), 0);
  return total / forecasts.length;
}

/** Calibration per band: average forecast vs how often those events happened. Empty bands are left out. */
export function calibration(
  forecasts: readonly ResolvedForecast[],
): { band: ProbabilityBand; meanForecast: number; observedRate: number; n: number }[] {
  return BANDS.flatMap((band) => {
    const inBand = forecasts.filter((f) => bandOf(f.probability) === band);
    if (inBand.length === 0) return [];
    const meanForecast = inBand.reduce((s, f) => s + f.probability, 0) / inBand.length;
    const observedRate = (100 * inBand.filter((f) => f.outcome).length) / inBand.length;
    return [{ band, meanForecast, observedRate, n: inBand.length }];
  });
}

/**
 * ACAPS risk level from probability × impact (docs/risk-methodology.md).
 * Display the level ACAPS recorded when there is one: the export has a few ratings that differ from this table.
 */
const RISK_MATRIX: Record<ProbabilityBand, readonly [RiskLevel, RiskLevel, RiskLevel, RiskLevel, RiskLevel]> = {
  very_high: ['medium', 'medium', 'high', 'high', 'high'],
  high: ['low', 'medium', 'medium', 'high', 'high'],
  medium: ['low', 'medium', 'medium', 'medium', 'high'],
  low: ['low', 'low', 'medium', 'medium', 'medium'],
  very_low: ['low', 'low', 'low', 'low', 'medium'],
};

export function riskLevelOf(probability: ProbabilityBand, impact: 1 | 2 | 3 | 4 | 5): RiskLevel {
  return RISK_MATRIX[probability][impact - 1];
}
