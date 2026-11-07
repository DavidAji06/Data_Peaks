import { mod } from '@/lib/i18n/mod';
import { toPercent } from '@/lib/probability';
import type { RoundSummary } from '@/lib/types';

const t = mod.question;

/** First answers and latest answers as two rows on the same 0–100 axis: range shaded, median as a dark line. */
export function ShiftAxis({ first, latest }: { first: RoundSummary | null; latest: RoundSummary | null }) {
  const rows = [
    { name: t.firstRound, s: first },
    { name: t.latest, s: latest },
  ].filter((r): r is { name: string; s: RoundSummary } => r.s !== null);

  return (
    <figure>
      <div className="grid gap-3">
        {rows.map(({ name, s }) => {
          const [m, lo, hi] = [toPercent(s.median), toPercent(s.min), toPercent(s.max)];
          return (
            <div key={name}>
              <p className="text-sm text-ink">
                {name}: <strong>{m}%</strong> <span className="text-ink-muted">({lo}–{hi}%)</span>
              </p>
              <div role="img" aria-label={t.axisLabel(name, m, lo, hi)} className="relative mt-1 h-8">
                <div className="absolute inset-x-0 top-3 h-2 rounded-full bg-surface-muted" />
                <div
                  className="absolute top-2 h-4 rounded bg-band ring-1 ring-accent/40"
                  style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 1)}%` }}
                />
                <div className="absolute top-0.5 h-7 w-1 -translate-x-1/2 rounded bg-ink" style={{ left: `${m}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink-muted" aria-hidden="true">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-1 rounded bg-ink" aria-hidden="true" />
          {t.medianKey}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded bg-band ring-1 ring-accent/40" aria-hidden="true" />
          {t.rangeKey}
        </span>
      </figcaption>
    </figure>
  );
}
