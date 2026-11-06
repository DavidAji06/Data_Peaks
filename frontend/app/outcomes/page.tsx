import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PublicHeader } from '@/components/public/PublicOutcomeView';
import { Chip } from '@/components/ui/primitives';
import { getPublicOutcomes } from '@/lib/api';
import { toPercent } from '@/lib/probability';
import { strings as s } from '@/lib/strings';
import { QuestionSkeleton } from '@/app/q/[token]/loading';

export const metadata: Metadata = { title: 'Resolved forecasts · Ground Truth' };

const p = s.public;

export default function OutcomesPage() {
  return (
    <main className="flex-1">
      <Suspense fallback={<QuestionSkeleton />}>
        <Outcomes />
      </Suspense>
    </main>
  );
}

async function Outcomes() {
  const { data, source } = await getPublicOutcomes();
  // Real resolved questions first, practice ones after.
  const items = [...data].sort((a, b) => Number(a.simulated) - Number(b.simulated));
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-4">
      <PublicHeader source={source} />
      <h1 className="mt-6 text-xl font-semibold text-ink">{p.listTitle}</h1>
      <p className="mt-1 text-ink-muted">{p.listIntro}</p>
      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-surface p-5 text-ink-muted">{p.empty}</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {items.map((q) => (
            <li key={q.questionId}>
              <Link
                href={`/outcomes/${encodeURIComponent(q.questionId)}`}
                className="block rounded-xl border border-line bg-surface p-4 hover:border-line-strong"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  <span>{q.country}</span>
                  {q.simulated && <Chip>{p.practiceTag}</Chip>}
                </div>
                <p className="mt-1 text-ink">{q.riskTitle}</p>
                <p className="mt-2 text-sm text-ink-muted">
                  {q.outcome !== null && p.outcome(q.outcome)}
                  {q.group && ` · ${p.median} ${toPercent(q.group.median)}%`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm text-ink-muted">{p.privacy}</p>
    </div>
  );
}
