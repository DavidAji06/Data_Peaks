import { toPercent } from '@/lib/probability';
import type { Strings } from '@/lib/strings';

/** One 0–100 axis: the group's range (shaded), the median (dark line) and the expert's own mark (accent dot). */
export function GroupAxis({
  median,
  min,
  max,
  mine,
  s,
}: {
  median: number;
  min: number;
  max: number;
  mine: number | null; // 0–1, null if unknown on this device
  s: Strings;
}) {
  const [m, lo, hi] = [toPercent(median), toPercent(min), toPercent(max)];
  const me = mine === null ? null : toPercent(mine);
  const label = s.group.axisLabel(m, lo, hi, me === null ? '' : s.group.yourAnswerIs(me));
  return (
    <figure className="mt-2">
      <div role="img" aria-label={label} className="relative h-14">
        <div className="absolute inset-x-0 top-6 h-2 rounded-full bg-surface-muted" />
        <div
          className="absolute top-5 h-4 rounded bg-band ring-1 ring-accent/40"
          style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 1)}%` }}
        />
        <div className="absolute top-2.5 h-9 w-1 -translate-x-1/2 rounded bg-ink" style={{ left: `${m}%` }} />
        {me !== null && (
          <div
            className="absolute top-4 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-surface bg-accent shadow"
            style={{ left: `${me}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-ink-muted" aria-hidden="true">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100%</span>
      </div>
      <figcaption className="mt-3 grid gap-1 text-sm text-ink">
        <span className="flex items-center gap-2">
          <span className="inline-block h-4 w-1 rounded bg-ink" aria-hidden="true" />
          {s.group.median}: <strong>{m}%</strong>
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded bg-band ring-1 ring-accent/40" aria-hidden="true" />
          {s.group.range}: <strong>{lo}–{hi}%</strong>
        </span>
        {me !== null && (
          <span className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-accent" aria-hidden="true" />
            {s.group.yourAnswer}: <strong>{me}%</strong>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
