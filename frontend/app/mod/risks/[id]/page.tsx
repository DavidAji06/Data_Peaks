import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader, StatusTag } from '@/components/mod/parts';
import { RiskDecisionPanel } from '@/components/mod/RiskDecisionPanel';
import { TriggerCard } from '@/components/mod/TriggerCard';
import { Card, Chip, RiskChip } from '@/components/ui/primitives';
import { ApiError, getRiskOverview } from '@/lib/api';
import { canShowAggregate } from '@/lib/anonymity';
import { mod } from '@/lib/i18n/mod';
import { toPercent } from '@/lib/probability';
import { ModSkeleton } from '../../loading';

export const metadata: Metadata = { title: 'Risk' };

const t = mod.risk;

export default function RiskPage({ params }: PageProps<'/mod/risks/[id]'>) {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <RiskView params={params} />
    </Suspense>
  );
}

async function RiskView({ params }: { params: PageProps<'/mod/risks/[id]'>['params'] }) {
  const { id } = await params;
  const { data, source } = await getRiskOverview(id).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const { risk, questions } = data;

  return (
    <>
      <PageHeader
        title={risk.title}
        source={source}
        back={{ href: '/mod/risks', label: 'ranked risks' }}
        intro={`${risk.id} · ${risk.country}${risk.riskType ? ` · ${risk.riskType}` : ''}`}
      />

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              {risk.riskLevel && <RiskChip level={risk.riskLevel} label={t.level(risk.riskLevel)} />}
              {risk.acapsProbability && <Chip>{t.probability(risk.acapsProbability)}</Chip>}
              {risk.impact !== null && <Chip>{t.impact(risk.impact)}</Chip>}
              {risk.expectedExposure && <Chip>{t.exposure(risk.expectedExposure)}</Chip>}
              {risk.status && <StatusTag>{risk.status}</StatusTag>}
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-ink">{t.questions}</h2>
            {questions.length === 0 ? (
              <p className="mt-2 text-ink-muted">{t.noQuestions}</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {questions.map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/mod/questions/${encodeURIComponent(q.id)}`}
                      className="block rounded-lg border border-line p-3 hover:border-line-strong"
                    >
                      <p className="text-sm text-ink-muted">
                        {q.id} · {mod.questions.status[q.status] ?? q.status} · {mod.questions.answered(q.answered, q.invited)}
                        {q.median !== null && canShowAggregate(q.answered) && ` · ${mod.questions.median(`${toPercent(q.median)}%`)}`}
                      </p>
                      <p className="mt-0.5 text-ink">{q.text}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-ink">{t.triggers}</h2>
            {risk.triggers.length === 0 ? (
              <p className="mt-2 text-ink-muted">{t.noTriggers}</p>
            ) : (
              <div className="mt-2 grid gap-3">
                {risk.triggers.map((tr) => (
                  <TriggerCard key={tr.id} trigger={tr} />
                ))}
              </div>
            )}
          </Card>

          {risk.rationale && (
            <Card>
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">{t.rationale}</summary>
                <p className="mt-2 whitespace-pre-line text-sm text-ink">{risk.rationale}</p>
              </details>
            </Card>
          )}
        </div>

        <RiskDecisionPanel triggers={risk.triggers} />
      </div>
    </>
  );
}
