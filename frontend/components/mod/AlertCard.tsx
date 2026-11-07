'use client';

import Link from 'next/link';
import { CreateQuestionDialog } from './CreateQuestionDialog';
import { StatusTag, fmtDate } from './parts';
import { mod } from '@/lib/i18n/mod';
import type { Alert, AlertStatus, DataSource } from '@/lib/types';

interface Props {
  alert: Alert;
  status: AlertStatus;
  source: DataSource;
  today: string;
  minDeadline: string;
  triggerTitle?: string;
  riskTitle?: string;
}

/**
 * Single alert card with optional "Create question" dialog button.
 * For pending alerts, shows a dialog button to quickly create a question.
 */
export function AlertCard({ alert: a, status, source, today, minDeadline, triggerTitle, riskTitle }: Props) {
  const defaults = {
    text: triggerTitle ? `Will this ACAPS trigger be fully met by the deadline: "${triggerTitle}"?` : `Will this risk materialise by the deadline: "${riskTitle || ''}"?`,
    criteria: '', // Will be filled from trigger objective if available
    deadline: minDeadline,
  };

  return (
    <li key={a.id}>
      <div className="rounded-xl border border-line bg-surface p-4 hover:border-line-strong">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <Link
            href={`/mod/alerts/${encodeURIComponent(a.id)}`}
            className="flex-1 block"
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

          {status === 'pending' && (
            <div className="flex gap-2 sm:flex-col">
              <CreateQuestionDialog
                alertId={a.id}
                status={a.status}
                source={source}
                country={a.riskId}
                today={today}
                minDeadline={minDeadline}
                defaults={defaults}
              />
              <Link
                href={`/mod/alerts/${encodeURIComponent(a.id)}`}
                className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border border-line-strong text-ink hover:bg-surface-muted"
              >
                Review
              </Link>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
