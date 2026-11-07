/**
 * Why an alert is in the queue: the LLM's impact, intensity and exposure scores for the ACAPS
 * access event, plus where the report is from. Server-safe (no hooks).
 */
import { mod } from '@/lib/i18n/mod';
import type { Alert } from '@/lib/types';

const a = mod.alerts;

/** "Related reporting in {country}" unless the place-name heuristic found a match. Never claims a trigger fired. */
export function placeLabel(alert: Alert, fallbackCountry?: string | null): string {
  if (alert.regionMatch && alert.matchedPlace) return a.regionMatch(alert.matchedPlace);
  return a.related(alert.country ?? fallbackCountry ?? 'this country');
}

export function AlertScores({ alert }: { alert: Alert }) {
  if (alert.impactScore === null) return null;
  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <div className="flex gap-1">
        <dt className="text-ink-muted">{a.impact}</dt>
        <dd className="font-semibold text-ink">{alert.impactScore}/5</dd>
      </div>
      {alert.intensityScore !== null && (
        <div className="flex gap-1">
          <dt className="text-ink-muted">{a.intensity}</dt>
          <dd className="text-ink">{alert.intensityScore}/5</dd>
        </div>
      )}
      {alert.exposureScore !== null && (
        <div className="flex gap-1">
          <dt className="text-ink-muted">{a.exposure}</dt>
          <dd className="text-ink">{alert.exposureScore}/5</dd>
        </div>
      )}
    </dl>
  );
}
