'use client';

import { Card, DemoBadge, Notice } from '@/components/ui/primitives';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { useLocale } from '@/components/expert/use-locale';
import { toPercent } from '@/lib/probability';
import type { DataSource, PublicOutcome } from '@/lib/types';

/** Public, anonymised summary. Receives aggregates only (lib/anonymity.ts toPublicOutcome). */
export function PublicOutcomeView({ data, source }: { data: PublicOutcome; source: DataSource }) {
  const { locale, setLocale, s } = useLocale();
  const p = s.public;
  const pct = (x: number) => `${toPercent(x)}${locale === 'fr' ? ' ' : ''}%`;
  const themes = data.suppressed
    ? []
    : ([
        [s.group.themes.agreement, data.themes.agreement],
        [s.group.themes.disagreement, data.themes.disagreement],
        [s.group.themes.newInformation, data.themes.newInformation],
      ] as const).filter(([, items]) => items.length > 0);

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
        <p className="text-sm text-ink-muted">{p.eyebrow}</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">{data.questionText}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {data.riskTitle} · {data.country}
        </p>
        <p className="mt-3 font-medium text-ink">
          {data.outcome !== null ? p.outcome(data.outcome) : (p.status[data.status] ?? data.status)}
        </p>
      </Card>

      <Card className="mt-4">
        <p className="text-ink">{p.answered(data.answered)}</p>
        {data.suppressed ? (
          <p className="mt-2 text-ink-muted">{p.suppressed}</p>
        ) : (
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-ink-muted">{p.median}</dt>
              <dd className="text-3xl font-semibold text-ink">{pct(data.median)}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-muted">{p.range}</dt>
              <dd className="text-lg font-semibold text-ink">
                {p.rangeValue(toPercent(data.rangeLow), toPercent(data.rangeHigh))}
              </dd>
              <dd className="mt-1 text-xs text-ink-muted">{p.rangeNote}</dd>
            </div>
          </dl>
        )}
      </Card>

      {!data.suppressed && (
        <Card className="mt-4">
          <h2 className="text-base font-semibold text-ink">{p.themesTitle}</h2>
          {themes.length === 0 ? (
            <p className="mt-2 text-ink-muted">{p.noThemes}</p>
          ) : (
            themes.map(([label, items]) => (
              <div key={label} className="mt-3">
                <h3 className="text-sm font-medium text-ink-muted">{label}</h3>
                <ul className="mt-1 list-disc pl-5 text-ink">
                  {items.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </Card>
      )}

      <div className="mt-4 grid gap-3">
        {data.questionId.startsWith('H') && <Notice>{p.practice}</Notice>}
        <p className="text-sm text-ink-muted">{p.privacy}</p>
      </div>
    </div>
  );
}
