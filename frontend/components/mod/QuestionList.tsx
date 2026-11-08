'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { canShowAggregate } from '@/lib/anonymity';
import { mod } from '@/lib/i18n/mod';
import { toPercent } from '@/lib/probability';
import type { QuestionListItem } from '@/lib/types';
import { StatusTag, fmtDate } from './parts';

const t = mod.questions;
const f = mod.questionFilters;

export type QuestionRow = QuestionListItem & { countries: string[] };

type Stage = keyof typeof f.stages;
type Sort = keyof typeof f.sorts;

/** Where the question is in its life: Delphi round, or closed / resolved. Same rule as the phase tag. */
const stageOf = (q: QuestionListItem): Stage =>
  q.status === 'resolved'
    ? 'resolved'
    : q.status === 'closed'
      ? 'closed'
      : q.delphiRound === 2 || q.phase?.includes('Phase 2')
        ? 'round2'
        : 'round1';

const isPractice = (id: string) => id.startsWith('H');

/** Questions with filters (search, stage, country) and a sort, all in one aligned bar. */
export function QuestionList({ items }: { items: QuestionRow[] }) {
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<Stage | ''>('');
  const [country, setCountry] = useState('');
  const [sort, setSort] = useState<Sort>('deadline');

  const countries = useMemo(() => [...new Set(items.flatMap((q) => q.countries))].sort(), [items]);
  const stageCounts = useMemo(() => {
    const c: Record<Stage, number> = { round1: 0, round2: 0, closed: 0, resolved: 0 };
    for (const q of items) c[stageOf(q)] += 1;
    return c;
  }, [items]);

  const q = query.trim().toLowerCase();
  const shown = items
    .filter(
      (x) =>
        (!stage || stageOf(x) === stage) &&
        (!country || x.countries.includes(country)) &&
        (!q || x.text.toLowerCase().includes(q) || x.id.toLowerCase().includes(q) || x.riskId.toLowerCase().includes(q)),
    )
    .sort((a, b) =>
      sort === 'deadline'
        ? a.deadline.localeCompare(b.deadline)
        : sort === 'participation'
          ? a.answered / Math.max(a.invited, 1) - b.answered / Math.max(b.invited, 1)
          : a.id.localeCompare(b.id, undefined, { numeric: true }),
    );
  const live = shown.filter((x) => !isPractice(x.id));
  const practice = shown.filter((x) => isPractice(x.id));
  const filtered = Boolean(q || stage || country);

  const field =
    'mt-1 block min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none';
  const label = 'block font-condensed text-xs font-bold uppercase tracking-wider text-ink-muted';

  return (
    <>
      <section aria-label={f.label} className="mb-4 rounded-xl border border-line bg-surface p-4">
        {/* Stage as quick chips: the most common way to slice the list */}
        <div className="flex flex-wrap gap-2" role="group" aria-label={f.stage}>
          {(['', ...(Object.keys(f.stages) as Stage[])] as const).map((s) => {
            const on = stage === s;
            const n = s ? stageCounts[s] : items.length;
            return (
              <button
                key={s || 'all'}
                type="button"
                aria-pressed={on}
                onClick={() => setStage(s)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 font-condensed text-sm font-bold ${
                  on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong text-ink-muted hover:border-accent hover:text-accent'
                }`}
              >
                {s ? f.stages[s] : f.all}
                <span className={`tabular-nums ${on ? 'opacity-80' : 'text-ink-400'}`}>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <label className="block">
            <span className={label}>{f.search}</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={f.searchPlaceholder} className={field} />
          </label>
          <label className="block">
            <span className={label}>{f.country}</span>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={field}>
              <option value="">{f.all}</option>
              {countries.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>{f.sort}</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={field}>
              {(Object.keys(f.sorts) as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {f.sorts[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
          <p className="text-ink-muted" aria-live="polite">
            {f.count(shown.length, items.length)}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setStage('');
                setCountry('');
              }}
              className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4"
            >
              {f.clear}
            </button>
          )}
        </div>
      </section>

      {items.filter((x) => !isPractice(x.id)).length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-5 text-ink-muted">{t.empty}</p>
      ) : live.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-5 text-ink-muted">{f.empty}</p>
      ) : (
        <Rows items={live} />
      )}
      {practice.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-base font-semibold text-ink">{t.practice}</h2>
          <Rows items={practice} />
        </>
      )}
    </>
  );
}

function Rows({ items }: { items: QuestionRow[] }) {
  return (
    <ul className="grid gap-3">
      {items.map((q) => (
        <li key={q.id}>
          <Link
            href={`/mod/questions/${encodeURIComponent(q.id)}`}
            className="block rounded-xl border border-line bg-surface p-4 hover:border-line-strong"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <span className="font-medium text-ink">{q.id}</span>
              <span>·</span>
              <span>{q.riskId}</span>
              {q.countries.length > 0 && (
                <>
                  <span>·</span>
                  <span>{q.countries.join(', ')}</span>
                </>
              )}
              <StatusTag tone={q.status === 'open' ? 'accent' : 'muted'}>{t.status[q.status] ?? q.status}</StatusTag>
              <StatusTag tone={q.phase?.includes('Phase 2') || q.phase?.includes('Completed') ? 'accent' : 'muted'}>
                {q.phase ?? (q.status === 'resolved' ? 'Resolved' : q.delphiRound === 2 ? 'Phase 2: Delphi Consensus' : 'Phase 1: Initial Elicitation')}
              </StatusTag>
              {q.outcome !== null && <StatusTag>{t.outcome(q.outcome)}</StatusTag>}
            </div>
            <p className="mt-2 text-ink">{q.text}</p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span>{t.answered(q.answered, q.invited)}</span>
              {q.revised !== undefined && q.revised > 0 && <span>· {q.revised} finalised</span>}
              <span>
                {q.median !== null && canShowAggregate(q.answered) ? t.median(`${toPercent(q.median)}%`) : t.noMedian}
              </span>
              {q.weightedMean !== null && canShowAggregate(q.answered) && (
                <span>{t.weighted(`${toPercent(q.weightedMean)}%`)}</span>
              )}
              <span>{t.deadline(fmtDate(q.deadline))}</span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
