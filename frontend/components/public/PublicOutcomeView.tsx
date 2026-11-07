import Link from 'next/link';
import { Card, Chip, DemoBadge, Notice } from '@/components/ui/primitives';
import { toPercent } from '@/lib/probability';
import { formatDate, strings as s } from '@/lib/strings';
import type { DataSource, PublicOutcome } from '@/lib/types';

const p = s.public;

export function PublicHeader({ source }: { source: DataSource }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <Link href="/outcomes" className="font-semibold text-ink">
        {s.common.appName}
      </Link>
      {source === 'demo' && <DemoBadge>{s.common.demoOffline}</DemoBadge>}
    </header>
  );
}

/** Figures for one question, or the "not enough answers" line. Aggregates only. */
export function GroupFigures({ q }: { q: PublicOutcome }) {
  if (!q.group) return <p className="text-ink-muted">{p.suppressed}</p>;
  return (
    <>
      <p className="text-ink">{p.answered(q.group.expertCount)}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-ink-muted">{p.median}</dt>
          <dd className="text-3xl font-semibold text-ink">{toPercent(q.group.median)}%</dd>
        </div>
      </dl>
    </>
  );
}

/** Public, anonymised summary of one resolved question. */
export function PublicOutcomeView({ data, source }: { data: PublicOutcome; source: DataSource }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-4">
      <PublicHeader source={source} />

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-ink-muted">{p.eyebrow}</p>
          {data.simulated && <Chip>{p.practiceTag}</Chip>}
        </div>
        <h1 className="mt-1 text-xl font-semibold text-ink">{data.questionText}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {data.riskTitle} · {data.country}
        </p>
        <p className="mt-1 text-sm text-ink-muted">{p.deadline(formatDate(data.deadline))}</p>
        {data.outcome !== null && <p className="mt-3 font-medium text-ink">{p.outcome(data.outcome)}</p>}
      </Card>

      <Card className="mt-4">
        <GroupFigures q={data} />
      </Card>

      <div className="mt-4 grid gap-3">
        {data.simulated && <Notice>{p.practice}</Notice>}
        <p className="text-sm text-ink-muted">{p.privacy}</p>
        <Link href="/outcomes" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
          {p.toList}
        </Link>
      </div>
    </div>
  );
}
