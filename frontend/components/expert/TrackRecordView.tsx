'use client';

import Link from 'next/link';
import { toPercent } from '@/lib/probability';
import type { DataSource, TrackRecord } from '@/lib/types';
import { buttonClass, Card, DemoBadge } from '@/components/ui/primitives';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { useLocale } from './use-locale';

/** The backend prefixes practice questions with this; the section heading says it instead. */
const PRACTICE_PREFIX = /^Simulated past question: will this risk materialise\?\s*/i;
const isPractice = (id: string) => id.startsWith('H');

/** Calm calibration feedback: no points, badges or streaks. */
export function TrackRecordView({ token, data, source }: { token: string; data: TrackRecord; source: DataSource }) {
  const { locale, setLocale, s } = useLocale();
  const practice = data.history.filter((h) => isPractice(h.questionId));
  const own = data.history.filter((h) => !isPractice(h.questionId));
  const num = (x: number) =>
    x.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const pct = (p: number) => `${toPercent(p)}${locale === 'fr' ? ' ' : ''}%`;

  const table = (rows: TrackRecord['history']) => (
    <ul className="mt-3 grid gap-3">
      {rows.map((h) => (
        <li key={h.questionId} className="rounded-lg border border-line p-3">
          <p className="text-sm text-ink-muted">{h.questionId}</p>
          <p className="mt-1 text-ink">{h.questionText.replace(PRACTICE_PREFIX, '')}</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-ink-muted">{s.record.forecast}</dt>
              <dd className="font-medium text-ink">{pct(h.probability)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{s.record.outcome}</dt>
              <dd className="font-medium text-ink">{h.outcome ? s.record.yes : s.record.no}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{s.record.brier}</dt>
              <dd className="font-medium text-ink">{num(h.brier)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );

  return (
    <div lang={locale} className="mx-auto w-full max-w-xl px-4 pb-16 pt-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-ink">{s.common.appName}</span>
        <div className="flex items-center gap-2">
          {source === 'demo' && <DemoBadge>{s.common.demoOffline}</DemoBadge>}
          <LanguageToggle locale={locale} onChange={setLocale} label={s.language.label} />
        </div>
      </header>

      <Card className="mt-4">
        <h1 className="text-xl font-semibold text-ink">{s.record.title}</h1>
        {data.resolved === 0 || data.meanBrier === null ? (
          <p className="mt-2 text-ink-muted">{s.record.none}</p>
        ) : (
          <>
            <p className="mt-2 text-ink">{s.record.resolved(data.resolved)}</p>
            <p className="mt-3 text-sm text-ink-muted">{s.record.meanBrier}</p>
            <p className="text-3xl font-semibold text-ink">{num(data.meanBrier)}</p>
            <p className="mt-1 text-sm text-ink-muted">{s.record.brierExplain}</p>
            {data.beatsBaseline !== null && (
              <p className="mt-2 text-ink">{data.beatsBaseline ? s.record.beats : s.record.notBeats}</p>
            )}
          </>
        )}
      </Card>

      {own.length > 0 && (
        <Card className="mt-4">
          <h2 className="text-base font-semibold text-ink">{s.record.yourQuestions}</h2>
          {table(own)}
        </Card>
      )}

      {practice.length > 0 && (
        <Card className="mt-4">
          <h2 className="text-base font-semibold text-ink">{s.record.practiceTitle}</h2>
          <p className="mt-1 text-sm text-ink-muted">{s.record.practiceNote}</p>
          {table(practice)}
        </Card>
      )}

      <Link href={`/q/${encodeURIComponent(token)}`} className={`${buttonClass.link} mt-4`}>
        {s.record.back}
      </Link>
    </div>
  );
}
