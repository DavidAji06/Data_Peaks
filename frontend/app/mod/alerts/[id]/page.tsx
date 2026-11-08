import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { AlertDecisionForm } from '@/components/mod/AlertDecisionForm';
import { AlertScores, placeLabel } from '@/components/mod/AlertScores';
import { HazardBadge } from '@/components/mod/HazardIcon';
import { PageHeader, StatusTag, fmtDate } from '@/components/mod/parts';
import { RegionMap } from '@/components/mod/RegionMap';
import { splitCountries } from '@/lib/region';
import { TriggerCard } from '@/components/mod/TriggerCard';
import { Card, Notice, RiskChip } from '@/components/ui/primitives';
import { getAlertDetail } from '@/lib/api';
import { mod } from '@/lib/i18n/mod';
import { ModSkeleton } from '../../loading';

export const metadata: Metadata = { title: 'Alert' };

const t = mod.alert;

export default function AlertPage({ params }: PageProps<'/mod/alerts/[id]'>) {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <AlertDetailView params={params} />
    </Suspense>
  );
}

/** YYYY-MM-DD in UTC, n months from `from`. */
function isoPlusMonths(from: Date, n: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + n, from.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

async function AlertDetailView({ params }: { params: PageProps<'/mod/alerts/[id]'>['params'] }) {
  const { id } = await params;
  const { data, source } = await getAlertDetail(id);
  if (!data) notFound();
  const { alert, risk } = data;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const minDeadline = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const trigger = risk?.triggers.find((tr) => tr.id === alert.triggerId) ?? null;

  // A starting draft the moderator edits. Built only from the ACAPS trigger or risk text; nothing invented.
  const defaults = {
    text: trigger
      ? `Will this ACAPS trigger be fully met by the deadline: “${trigger.title}”?`
      : risk
        ? `Will this risk materialise by the deadline: “${risk.title}”?`
        : '',
    criteria: trigger?.objective ?? '',
    deadline: isoPlusMonths(now, 6),
  };

  return (
    <>
      <PageHeader
        title={t.title(alert.id)}
        source={source}
        back={{ href: alert.status === 'pending' ? '/mod' : `/mod?status=${alert.status}`, label: mod.alerts.title.toLowerCase() }}
      />

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="grid gap-4">
          <Card className="soft-block">
            <HazardBadge text={[alert.report.title, alert.description]} />
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag>{mod.alerts.tabs[alert.status]}</StatusTag>
              {alert.strengthWord && alert.strength !== null && (
                <StatusTag tone={alert.strengthWord === 'strong' ? 'accent' : 'muted'}>
                  {mod.alerts.strength(mod.strengthWords[alert.strengthWord], alert.strength)}
                </StatusTag>
              )}
              {alert.direction && <StatusTag>{mod.direction[alert.direction] ?? alert.direction}</StatusTag>}
            </div>
            <h2 className="mt-3 text-sm font-medium text-ink-muted">{t.report}</h2>
            <p className="font-medium text-ink">{alert.report.title}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {[placeLabel(alert, risk?.country), alert.report.source, alert.report.publishedAt && fmtDate(alert.report.publishedAt)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <AlertScores alert={alert} />
            {alert.description && alert.description !== alert.report.title && (
              <p className="mt-2 text-sm text-ink">{alert.description}</p>
            )}
            {alert.report.url && (
              <a
                href={alert.report.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-4"
              >
                {t.openReport} <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            {alert.evidence && (
              <>
                <h2 className="mt-3 text-sm font-medium text-ink-muted">{t.evidence}</h2>
                <p className="text-ink">{alert.evidence}</p>
              </>
            )}
          </Card>

          <Card>
            {risk ? (
              <>
                <Link
                  href={`/mod/risks/${encodeURIComponent(risk.id)}`}
                  className="text-sm font-medium text-accent underline underline-offset-4"
                >
                  {risk.id} · {risk.country}
                </Link>
                <p className="mt-1 font-medium text-ink">{risk.title}</p>
                {risk.riskLevel && (
                  <div className="mt-2">
                    <RiskChip level={risk.riskLevel} label={mod.risk.level(risk.riskLevel)} />
                  </div>
                )}
                <h2 className="mt-4 text-sm font-medium text-ink-muted">{t.matchedTrigger}</h2>
                <div className="mt-1">
                  {trigger ? (
                    <TriggerCard trigger={trigger} />
                  ) : alert.triggerId === null ? (
                    <p className="text-sm text-ink-muted">{t.noTrigger}</p>
                  ) : (
                    <Notice tone="warning">{t.triggerMissing(alert.triggerId ?? '—', risk.id)}</Notice>
                  )}
                </div>
              </>
            ) : (
              <Notice tone="warning">{t.riskUnknown}</Notice>
            )}
          </Card>
        </div>

        <div className="grid gap-4">
          <AlertDecisionForm
            alertId={alert.id}
            status={alert.status}
            source={source}
            country={risk?.country ?? alert.riskId}
            today={today}
            minDeadline={minDeadline}
            defaults={defaults}
          />

          {splitCountries(risk?.country ?? alert.country).length > 0 && (
            <Card>
              <h2 className="mb-3 text-base font-semibold text-ink">{mod.regionMap.title}</h2>
              <RegionMap
                countries={splitCountries(risk?.country ?? alert.country)}
                focusText={risk?.title}
                reportText={[alert.matchedPlace, alert.report.title, alert.description].filter(Boolean).join(' · ')}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
