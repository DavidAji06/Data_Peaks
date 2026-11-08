'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { RiskChip } from '@/components/ui/primitives';
import { mod } from '@/lib/i18n/mod';
import { toPercent } from '@/lib/probability';
import type { RankedRisk } from '@/lib/types';
import { HazardBadge } from './HazardIcon';
import { MiniBar } from './parts';

const t = mod.risks;

/**
 * Ranked risks sorted by priority, with the score breakdown always visible (explainability).
 * Priority uses only ACAPS's own ratings: impact, and how often risks with the same probability rating came true.
 */
export function RiskList({ items }: { items: RankedRisk[] }) {
  const [country, setCountry] = useState('');
  const [level, setLevel] = useState('');
  const countries = useMemo(() => [...new Set(items.map((r) => r.country))].sort(), [items]);
  const levels = useMemo(
    () => [...new Set(items.map((r) => r.riskLevel).filter((l): l is string => !!l))].sort(),
    [items],
  );
  const shown = items
    .filter((r) => (!country || r.country === country) && (!level || r.riskLevel === level))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.breakdown.impact - a.breakdown.impact);

  const select = 'mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-ink sm:w-56';

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm font-medium text-ink">{t.filterCountry}</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className={select}>
            <option value="">{t.all}</option>
            {countries.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">{t.filterLevel}</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={select}>
            <option value="">{t.all}</option>
            {levels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <p className="pb-3 text-sm text-ink-muted" aria-live="polite">
          {t.count(shown.length, items.length)}
        </p>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-5 text-ink-muted">{t.empty}</p>
      ) : (
        <ol className="grid gap-3">
          {shown.map((r) => (
            <li key={r.riskId}>
              <Link
                href={`/mod/risks/${encodeURIComponent(r.riskId)}`}
                className="soft-block grid gap-3 p-4 md:grid-cols-[1fr_17rem]"
              >
                <HazardBadge text={[r.title]} />
                <div>
                  <p className="text-sm text-ink-muted">
                    {r.riskId} · {r.country}
                  </p>
                  <p className="mt-0.5 font-medium text-ink">{r.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    {r.riskLevel && <RiskChip level={r.riskLevel} label={mod.risk.level(r.riskLevel)} />}
                    {r.acapsProbability && <span>{mod.risk.probability(r.acapsProbability)}</span>}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{t.score(r.priorityScore.toFixed(2))}</p>
                  <div className="mt-1 grid gap-1">
                    <MiniBar label={t.breakdown.impact} value={r.breakdown.impact} />
                    <MiniBar label={t.breakdown.uncertainty} value={r.breakdown.uncertainty} />
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {r.history && r.acapsProbability
                      ? t.history(r.acapsProbability, r.history.happened, r.history.resolved)
                      : t.historyRate(toPercent(r.historicalRate))}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
