import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PageHeader, StatusTag, fmtDate } from '@/components/mod/parts';
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
            <li key={a.id}>
              <Link
                href={`/mod/alerts/${encodeURIComponent(a.id)}`}
                className="block rounded-xl border border-line bg-surface p-4 hover:border-line-strong"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  <span className="font-medium text-ink">{a.id}</span>
                  <span>·</span>
                  <span>{a.riskId}</span>
                  <span>·</span>
                  <span>{mod.alerts.trigger(a.triggerId)}</span>
                  {a.strengthWord && a.strength !== null && (
                    <StatusTag tone={a.strengthWord === 'strong' ? 'accent' : 'muted'}>
                      {mod.alerts.strength(mod.strengthWords[a.strengthWord], a.strength)}
                    </StatusTag>
                  )}
                  {a.direction && <StatusTag>{mod.direction[a.direction] ?? a.direction}</StatusTag>}
                </div>
                <p className="mt-2 font-medium text-ink">{a.report.title}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {[a.report.source, a.report.publishedAt ? fmtDate(a.report.publishedAt) : mod.alerts.noDate]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {status === 'pending' && (
                  <span className="mt-2 inline-block text-sm font-medium text-accent underline underline-offset-4">
                    {mod.alerts.open}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
