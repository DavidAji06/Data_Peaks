import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PageHeader, StatusTag, fmtDate } from '@/components/mod/parts';
import { getModeratorQuestions } from '@/lib/api';
import { canShowAggregate } from '@/lib/anonymity';
import { mod } from '@/lib/i18n/mod';
import { toPercent } from '@/lib/probability';
import type { QuestionListItem } from '@/lib/types';
import { ModSkeleton } from '../loading';

export const metadata: Metadata = { title: 'Questions' };

const t = mod.questions;
const isPractice = (id: string) => id.startsWith('H');

export default function QuestionsPage() {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <Questions />
    </Suspense>
  );
}

async function Questions() {
  const { data, source } = await getModeratorQuestions();
  const live = data.filter((q) => !isPractice(q.id));
  const practice = data.filter((q) => isPractice(q.id));

  return (
    <>
      <PageHeader title={t.title} intro={t.intro} source={source} />
      {live.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-5 text-ink-muted">{t.empty}</p>
      ) : (
        <List items={live} />
      )}
      {practice.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-base font-semibold text-ink">{t.practice}</h2>
          <List items={practice} />
        </>
      )}
    </>
  );
}

function List({ items }: { items: QuestionListItem[] }) {
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
              <StatusTag tone={q.status === 'open' ? 'accent' : 'muted'}>{t.status[q.status] ?? q.status}</StatusTag>
              {q.outcome !== null && <StatusTag>{t.outcome(q.outcome)}</StatusTag>}
            </div>
            <p className="mt-2 text-ink">{q.text}</p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span>{t.answered(q.answered, q.invited)}</span>
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
