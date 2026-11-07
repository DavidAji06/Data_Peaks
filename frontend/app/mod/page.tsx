import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AlertScores, placeLabel } from '@/components/mod/AlertScores';
import { PageHeader, StatusTag, fmtDate } from '@/components/mod/parts';
import { byImpactThenDate } from '@/lib/adapters';
import { getAlerts } from '@/lib/api';
import { mod } from '@/lib/i18n/mod';
import type { AlertStatus } from '@/lib/types';
import { ModSkeleton } from './loading';

export const metadata: Metadata = { title: 'Alerts' };

const STATUSES: readonly AlertStatus[] = ['pending', 'approved', 'rejected'];
const asStatus = (v: unknown): AlertStatus => (STATUSES.includes(v as AlertStatus) ? (v as AlertStatus) : 'pending');
const IMPACT_OPTIONS = [0, 3, 4, 5] as const;
const DEFAULT_MIN_IMPACT = 4; // Same threshold as the export pipeline
const asMinImpact = (v: unknown): number => {
  const n = Number(v);
  return IMPACT_OPTIONS.includes(n as (typeof IMPACT_OPTIONS)[number]) ? n : DEFAULT_MIN_IMPACT;
};
const queueHref = (status: AlertStatus, min: number) => {
  const params = new URLSearchParams();
  if (status !== 'pending') params.set('status', status);
  if (min !== DEFAULT_MIN_IMPACT) params.set('min', String(min));
  const q = params.toString();
  return q ? `/mod?${q}` : '/mod';
};

export default function AlertQueuePage({ searchParams }: PageProps<'/mod'>) {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <AlertQueue searchParams={searchParams} />
    </Suspense>
  );
}

async function AlertQueue({ searchParams }: { searchParams: PageProps<'/mod'>['searchParams'] }) {
  const params = await searchParams;
  const status = asStatus(params.status);
  const minImpact = asMinImpact(params.min);
  const { data: all, source } = await getAlerts(status);
  // Alerts without scores (older imports) stay visible: the filter only hides scored, lower-impact ones
  const alerts = all.filter((a) => a.impactScore === null || a.impactScore >= minImpact).sort(byImpactThenDate);
  const hidden = all.length - alerts.length;

  return (
    <>
      <PageHeader title={mod.alerts.title} intro={mod.alerts.intro} source={source} />

      <nav aria-label={mod.alerts.title} className="mb-4 flex gap-1 border-b border-line">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={queueHref(s, minImpact)}
            aria-current={s === status ? 'page' : undefined}
            className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium ${
              s === status ? 'border-accent text-accent' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {mod.alerts.tabs[s]}
          </Link>
        ))}
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-muted">{mod.alerts.minImpact}:</span>
        {IMPACT_OPTIONS.map((n) => (
          <Link
            key={n}
            href={queueHref(status, n)}
            aria-current={n === minImpact ? 'true' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full border px-3 ${
              n === minImpact ? 'border-accent text-accent' : 'border-line text-ink-muted hover:text-ink'
            }`}
          >
            {n === 0 ? mod.alerts.anyImpact : `${n}+`}
          </Link>
        ))}
        <span className="text-ink-muted">{mod.alerts.sortNote}</span>
        {hidden > 0 && <span className="text-ink-muted">{mod.alerts.hidden(hidden)}</span>}
      </div>

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
                  {[placeLabel(a), a.report.source, a.report.publishedAt ? fmtDate(a.report.publishedAt) : mod.alerts.noDate]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <AlertScores alert={a} />
                {a.evidence && (
                  <p className="mt-1 text-sm text-ink-muted">
                    <span className="font-medium">{mod.alerts.reasoning}:</span> {a.evidence}
                  </p>
                )}
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
