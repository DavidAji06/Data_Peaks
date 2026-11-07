import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertCard } from '@/components/mod/AlertCard';
import { PageHeader } from '@/components/mod/parts';
import { getAlerts } from '@/lib/api';
import { mod } from '@/lib/i18n/mod';
import type { AlertStatus } from '@/lib/types';
import { ModSkeleton } from './loading';

export const metadata: Metadata = { title: 'Alerts' };

const STATUSES: readonly AlertStatus[] = ['pending', 'approved', 'rejected'];
const asStatus = (v: unknown): AlertStatus => (STATUSES.includes(v as AlertStatus) ? (v as AlertStatus) : 'pending');

export default function AlertQueuePage({ searchParams }: PageProps<'/mod'>) {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <AlertQueue searchParams={searchParams} />
    </Suspense>
  );
}

async function AlertQueue({ searchParams }: { searchParams: PageProps<'/mod'>['searchParams'] }) {
  const status = asStatus((await searchParams).status);
  const { data: alerts, source } = await getAlerts(status);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const minDeadline = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title={mod.alerts.title} intro={mod.alerts.intro} source={source} />

      <nav aria-label={mod.alerts.title} className="mb-4 flex gap-1 border-b border-line">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === 'pending' ? '/mod' : `/mod?status=${s}`}
            aria-current={s === status ? 'page' : undefined}
            className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium ${
              s === status ? 'border-accent text-accent' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {mod.alerts.tabs[s]}
          </Link>
        ))}
      </nav>

      {alerts.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-5 text-ink-muted">{mod.alerts.empty[status]}</p>
      ) : (
        <ul className="grid gap-3">
          {alerts.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              status={status}
              source={source}
              today={today}
              minDeadline={minDeadline}
            />
          ))}
        </ul>
      )}
    </>
  );
}
