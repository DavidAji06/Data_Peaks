'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { RiskChip } from '@/components/ui/primitives';
import { mod } from '@/lib/i18n/mod';
import { toPercent } from '@/lib/probability';
import type { RankedRisk } from '@/lib/types';
import { MiniBar } from './parts';
import { fmtDate } from '@/lib/format-date';

const t = mod.risks;

/** Ranked risks sorted by priority, with the score breakdown always visible (explainability).
 * Risks are shown as model-recommended but pending moderator validation. */
export function RiskList({ items }: { items: RankedRisk[] }) {
  const [country, setCountry] = useState('');
  const [level, setLevel] = useState('');
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const countries = useMemo(() => [...new Set(items.map((r) => r.country))].sort(), [items]);
  const levels = useMemo(
    () => [...new Set(items.map((r) => r.riskLevel).filter((l): l is string => !!l))].sort(),
    [items],
  );
  const shown = items
    .filter((r) => (!country || r.country === country) && (!level || r.riskLevel === level))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const select = 'mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-ink sm:w-56';

  const handleApprove = (riskId: string) => {
    setApproved((prev) => new Set([...prev, riskId]));
    setRejected((prev) => {
      const newSet = new Set(prev);
      newSet.delete(riskId);
      return newSet;
    });
  };

  const handleReject = (riskId: string) => {
    setRejected((prev) => new Set([...prev, riskId]));
    setApproved((prev) => {
      const newSet = new Set(prev);
      newSet.delete(riskId);
      return newSet;
    });
  };

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
          {shown.map((r) => {
            const isApproved = approved.has(r.riskId);
            const isRejected = rejected.has(r.riskId);
            const status = isApproved ? 'approved' : isRejected ? 'rejected' : 'pending';

            return (
              <li key={r.riskId}>
                <div
                  className={`grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_17rem] transition-all duration-200 ${
                    isApproved
                      ? 'border-risk-low-solid bg-risk-low-soft/20'
                      : isRejected
                        ? 'border-risk-high-solid bg-risk-high-soft/20'
                        : 'border-primary-100/30 bg-gradient-to-br from-surface-card to-surface-white/5'
                  }`}
                >
                  <Link
                    href={`/mod/risks/${encodeURIComponent(r.riskId)}`}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-ink-muted">
                        {r.riskId} · {r.country}
                      </p>
                      <span
                        className={`inline-flex items-center px-2 py-1 text-xs font-bold rounded ${
                          isApproved
                            ? 'bg-risk-low text-white'
                            : isRejected
                              ? 'bg-risk-high text-white'
                              : 'bg-primary-600 text-white'
                        }`}
                        style={{ borderRadius: '7px' }}
                      >
                        {isApproved ? '✓ Approved' : isRejected ? '✗ Rejected' : '⏳ Pending'}
                      </span>
                    </div>
                    <p className="mt-0.5 font-medium text-ink">{r.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                      {r.riskLevel && <RiskChip level={r.riskLevel} label={mod.risk.level(r.riskLevel)} />}
                      {r.acapsProbability && <span>{mod.risk.probability(r.acapsProbability)}</span>}
                      <span>{r.lastReviewed ? t.reviewed(fmtDate(r.lastReviewed)) : t.notReviewed}</span>
                    </div>
                  </Link>

                  <div className="md:col-span-2 lg:col-span-1 flex flex-col gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink">{t.score(r.priorityScore.toFixed(2))}</p>
                      <div className="mt-1 grid gap-1">
                        <MiniBar label={t.breakdown.signalStrength} value={r.breakdown.signalStrength} />
                        <MiniBar label={t.breakdown.uncertainty} value={r.breakdown.uncertainty} />
                        <MiniBar label={t.breakdown.impact} value={r.breakdown.impact} />
                        <MiniBar label={t.breakdown.reviewAge} value={r.breakdown.reviewAge} />
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">{t.model(toPercent(r.modelProbability))}</p>
                    </div>

                    {status === 'pending' && (
                      <div className="flex gap-2 pt-2 border-t border-line">
                        <button
                          onClick={() => handleApprove(r.riskId)}
                          className="flex-1 min-h-10 px-3 py-2 rounded-lg bg-risk-low text-white font-semibold text-sm hover:bg-risk-low-solid transition-colors"
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleReject(r.riskId)}
                          className="flex-1 min-h-10 px-3 py-2 rounded-lg bg-risk-high text-white font-semibold text-sm hover:bg-risk-high-solid transition-colors"
                        >
                          ✗ Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
