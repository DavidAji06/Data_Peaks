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
      <div className="group rounded-2xl border border-primary-100/20 bg-gradient-to-br from-surface-card to-surface-white/5 p-5 transition-all duration-300 hover:border-primary-600/50 hover:shadow-2xl hover:shadow-primary-500/20 backdrop-blur-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <Link
            href={`/mod/alerts/${encodeURIComponent(a.id)}`}
            className="flex-1 block"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-ink-500">
              <span className="font-bold text-primary-600">{a.id}</span>
              <span className="text-ink-700">·</span>
              <span className="font-semibold text-ink-400">{a.riskId}</span>
              <span className="text-ink-700">·</span>
              <span className="text-ink-500">{mod.alerts.trigger(a.triggerId)}</span>
              {a.strengthWord && a.strength !== null && (
                <StatusTag tone={a.strengthWord === 'strong' ? 'accent' : 'muted'}>
                  {mod.alerts.strength(mod.strengthWords[a.strengthWord], a.strength)}
                </StatusTag>
              )}
              {a.direction && <StatusTag>{mod.direction[a.direction] ?? a.direction}</StatusTag>}
            </div>
            <p className="mt-3 font-bold text-ink text-lg group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-primary-600 group-hover:to-primary-500 group-hover:bg-clip-text transition-all duration-300">{a.report.title}</p>
            <p className="mt-2 text-xs sm:text-sm text-ink-500">
              {[a.report.source, a.report.publishedAt ? fmtDate(a.report.publishedAt) : mod.alerts.noDate]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {status === 'pending' && (
              <span className="mt-3 inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-primary-600 group-hover:translate-x-1 transition-transform">
                ✦ {mod.alerts.open}
              </span>
            )}
          </Link>

          {status === 'pending' && (
            <div className="flex gap-2 sm:flex-col sm:flex-shrink-0">
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
                className="inline-flex items-center px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl border border-primary-100/30 text-primary-600 hover:border-primary-600 hover:bg-gradient-to-r hover:from-primary-600/10 hover:to-primary-500/5 transition-all duration-200 hover:shadow-lg hover:shadow-primary-500/10"
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
