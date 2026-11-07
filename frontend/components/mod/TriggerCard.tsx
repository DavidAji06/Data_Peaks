import { mod } from '@/lib/i18n/mod';
import type { ParsedTrigger } from '@/lib/types';
import { fmtDate } from './parts';

/** One ACAPS trigger as recorded: completion bar (with the number), description, objective, last update. */
export function TriggerCard({ trigger, highlight = false }: { trigger: ParsedTrigger; highlight?: boolean }) {
  const pct = trigger.completionRate;
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-accent bg-accent-soft' : 'border-line'}`}>
      <p className="text-sm text-ink-muted">
        {trigger.id}
        {trigger.lastUpdate && ` · ${mod.risk.lastUpdate(fmtDate(trigger.lastUpdate))}`}
      </p>
      <p className="mt-0.5 font-medium text-ink">{trigger.title}</p>
      {pct !== null && (
        <div className="mt-2">
          <p className="text-sm text-ink">{mod.alert.completion(pct)}</p>
          <div
            className="mt-1 h-2 rounded-full bg-surface-muted"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`${trigger.id} ${mod.alert.completion(pct)}`}
          >
            <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      {trigger.description && <p className="mt-2 text-sm text-ink">{trigger.description}</p>}
      {trigger.objective && (
        <p className="mt-2 text-sm text-ink">
          <span className="font-medium">{mod.alert.objective}: </span>
          {trigger.objective}
        </p>
      )}
    </div>
  );
}
