import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { LevelTag, PageHeader, StatusTag, fmtBrier, fmtDate } from '@/components/mod/parts';
import { AiThemes } from '@/components/mod/AiThemes';
import { DelphiStageControl } from '@/components/mod/DelphiStageControl';
import { ResolvePanel } from '@/components/mod/ResolvePanel';
import { ShiftAxis } from '@/components/mod/ShiftAxis';
import { Card } from '@/components/ui/primitives';
import { ApiError, getQuestionDetail } from '@/lib/api';
import { canShowAggregate } from '@/lib/anonymity';
import { mod } from '@/lib/i18n/mod';
import { toPercent } from '@/lib/probability';
import type { QuestionDetail } from '@/lib/types';
import { ModSkeleton } from '../../loading';

export const metadata: Metadata = { title: 'Question' };

const t = mod.question;

export default function QuestionPage({ params }: PageProps<'/mod/questions/[id]'>) {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <QuestionView params={params} />
    </Suspense>
  );
}

async function QuestionView({ params }: { params: PageProps<'/mod/questions/[id]'>['params'] }) {
  const { id } = await params;
  const { data: d, source } = await getQuestionDetail(id).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const q = d.question;
  const showFigures = canShowAggregate(d.participation.answered);
  const shiftPoints = d.medianShift === null ? null : Math.round(d.medianShift * 100);

  return (
    <>
      <PageHeader title={t.title(q.id)} source={source} back={{ href: '/mod/questions', label: 'questions' }} />

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr] lg:items-start">
        <div className="grid gap-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag tone={q.status === 'open' ? 'accent' : q.status === 'closed' ? 'accent' : 'muted'}>
                {q.status === 'closed' ? 'Closed' : mod.questions.status[q.status] ?? q.status}
              </StatusTag>
              <StatusTag tone={d.phase?.includes('Phase 2') || d.phase?.includes('Completed') ? 'accent' : 'muted'}>
                {d.phase ?? (q.status === 'resolved' ? 'Resolved' : 'Phase 1: Initial Elicitation')}
              </StatusTag>
              <span className="text-sm text-ink-muted">{mod.questions.deadline(fmtDate(q.deadline))}</span>
            </div>
            <p className="mt-2 text-lg font-medium text-ink">{q.text}</p>
            <h2 className="mt-3 text-sm font-medium text-ink-muted">{t.criteria}</h2>
            <p className="text-ink">{q.resolutionCriteria}</p>
            <h2 className="mt-3 text-sm font-medium text-ink-muted">{t.risk}</h2>
            <Link href={`/mod/risks/${encodeURIComponent(d.risk.id)}`} className="text-accent underline underline-offset-4">
              {d.risk.id} · {d.risk.country}
            </Link>
            <p className="text-ink">{d.risk.title}</p>
            {d.risk.acapsProbability && <p className="mt-1 text-sm text-ink-muted">{t.acapsProbability(d.risk.acapsProbability)}</p>}
            {q.outcome !== null && <p className="mt-3 font-medium text-ink">{t.outcomeIs(q.outcome)}</p>}
            {q.status === 'resolved' && (
            <Link
              href={`/outcomes/${encodeURIComponent(q.id)}`}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-4"
            >
              {t.publicLink}
            </Link>
            )}
          </Card>

          {showFigures && d.consensusMetrics && (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">Delphi Consensus & Convergence</h2>
                <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                  {d.consensusMetrics.consensusStatus.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-line bg-surface-muted/30 p-2.5">
                  <span className="text-xs text-ink-muted">Round 1 Median (Tentative)</span>
                  <p className="mt-1 text-lg font-bold text-ink">
                    {d.consensusMetrics.round1 ? `${toPercent(d.consensusMetrics.round1.median)}%` : '—'}
                  </p>
                  <span className="text-xs text-ink-muted">
                    Spread: {d.consensusMetrics.round1 ? `${toPercent(d.consensusMetrics.round1.spread)}%` : '—'}
                  </span>
                </div>
                <div className="rounded-md border border-line bg-surface-muted/30 p-2.5">
                  <span className="text-xs text-ink-muted">Round 2 Median (Finalised)</span>
                  <p className="mt-1 text-lg font-bold text-ink">
                    {d.consensusMetrics.round2 ? `${toPercent(d.consensusMetrics.round2.median)}%` : '—'}
                  </p>
                  <span className="text-xs text-ink-muted">
                    Spread: {d.consensusMetrics.round2 ? `${toPercent(d.consensusMetrics.round2.spread)}%` : '—'}
                  </span>
                </div>
                <div className="rounded-md border border-line bg-surface-muted/30 p-2.5">
                  <span className="text-xs text-ink-muted">Median Shift</span>
                  <p className="mt-1 text-lg font-bold text-ink">
                    {d.consensusMetrics.medianShift !== null
                      ? `${d.consensusMetrics.medianShift > 0 ? '+' : ''}${Math.round(d.consensusMetrics.medianShift * 100)}%`
                      : '—'}
                  </p>
                  <span className="text-xs text-ink-muted">
                    {d.consensusMetrics.retainedCount} kept · {d.consensusMetrics.adjustedCount} adjusted
                  </span>
                </div>
                <div className="rounded-md border border-line bg-surface-muted/30 p-2.5">
                  <span className="text-xs text-ink-muted">Spread Reduction</span>
                  <p className="mt-1 text-lg font-bold text-accent">
                    {d.consensusMetrics.spreadReduction !== null
                      ? `${d.consensusMetrics.spreadReduction >= 0 ? '−' : '+'}${Math.abs(Math.round(d.consensusMetrics.spreadReduction * 100))}%`
                      : '—'}
                  </p>
                  <span className="text-xs text-ink-muted">
                    {d.consensusMetrics.convergenceRate !== null && d.consensusMetrics.convergenceRate > 0
                      ? `${Math.round(d.consensusMetrics.convergenceRate * 100)}% narrowed`
                      : 'initial spread'}
                  </span>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <h2 className="text-base font-semibold text-ink">{t.shiftTitle}</h2>
            {showFigures && d.latest ? (
              <div className="mt-3">
                <ShiftAxis first={d.firstRound} latest={d.latest} />
                {shiftPoints !== null && <p className="mt-3 text-ink">{t.shift(shiftPoints)}</p>}
              </div>
            ) : (
              <p className="mt-2 text-ink-muted">{t.suppressed}</p>
            )}
          </Card>

          {showFigures && d.latest && d.weighted && (
            <Card>
              <h2 className="text-base font-semibold text-ink">{d.weighted.label}</h2>
              <dl className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-sm text-ink-muted">{t.plainMedian}</dt>
                  <dd className="text-2xl font-semibold text-ink">{toPercent(d.latest.median)}%</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-muted">{t.weightedMean}</dt>
                  <dd className="text-2xl font-semibold text-ink">{toPercent(d.weighted.mean)}%</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-muted">{t.weightedMedian}</dt>
                  <dd className="text-2xl font-semibold text-ink">{toPercent(d.weighted.median)}%</dd>
                </div>
              </dl>
              <p className="mt-2 text-sm text-ink-muted">{t.weightedHelp(d.weighted.expertsWithHistory, d.weighted.count)}</p>
            </Card>
          )}

          {showFigures && <Distribution d={d} />}

          <Responses d={d} />
        </div>

        <div className="grid gap-4">
          <Card>
            <h2 className="text-base font-semibold text-ink">{t.participation}</h2>
            <dl className="mt-2 grid grid-cols-3 gap-3">
              {(
                [
                  [t.invited, d.participation.invited, null],
                  [t.answered, d.participation.answered, 'Tentative'],
                  [t.revised, d.participation.revised, 'Finalised'],
                ] as const
              ).map(([label, n, note]) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-sm leading-snug text-ink-muted">{label}</dt>
                  <dd className="mt-auto pt-1 text-2xl font-semibold leading-none text-ink">{n}</dd>
                  {note && <dd className="mt-1 text-xs text-ink-muted">{note}</dd>}
                </div>
              ))}
            </dl>
          </Card>

          <DelphiStageControl
            questionId={q.id}
            status={q.status}
            phase={d.phase}
            delphiRound={d.delphiRound ?? (d.phase?.includes('Phase 2') ? 2 : 1)}
            answeredCount={d.participation.answered}
            invitedCount={d.participation.invited}
            source={source}
          />
          <ResolvePanel questionId={q.id} status={q.status} source={source} />
          {q.outcome !== null && d.groupMedianBrier !== null && (
            <Card>
              <h2 className="text-base font-semibold text-ink">{t.scoresTitle}</h2>
              <p className="mt-2 text-sm text-ink-muted">{t.groupBrier}</p>
              <p className="text-2xl font-semibold text-ink">{fmtBrier(d.groupMedianBrier)}</p>
              <p className="mt-1 text-sm text-ink-muted">{t.baseline(fmtBrier(d.baselineBrier))}</p>
            </Card>
          )}
          <AiThemes questionId={q.id} themes={d.themes} canShow={showFigures} source={source} />
        </div>
      </div>
    </>
  );
}

function Distribution({ d }: { d: QuestionDetail }) {
  const max = Math.max(1, ...d.distribution.map((b) => b.count));
  return (
    <Card>
      <h2 className="text-base font-semibold text-ink">{t.distribution}</h2>
      <ul className="mt-3 grid gap-2">
        {d.distribution.map((b) => (
          <li key={b.range} className="grid grid-cols-[4.5rem_1fr_5rem] items-center gap-2 text-sm">
            <span className="tabular-nums text-ink-muted">{b.range.replace('-', '–')}</span>
            <span className="h-3 rounded bg-surface-muted" aria-hidden="true">
              <span className="block h-3 rounded bg-accent" style={{ width: `${(b.count / max) * 100}%` }} />
            </span>
            <span className="text-ink">{t.bandCount(b.count)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Responses({ d }: { d: QuestionDetail }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{t.responses}</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 font-medium text-accent">
            Finalised: {d.participation.revised}
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-surface-muted px-2 py-0.5 font-medium text-ink-muted">
            Tentative: {d.participation.answered - d.participation.revised}
          </span>
        </div>
      </div>
      {d.responses.length === 0 ? (
        <p className="mt-3 text-ink-muted">{t.noResponses}</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {d.responses.map((r, i) => (
            <li key={`${r.label}-${i}`} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{r.label}</span>
                <LevelTag level={r.anonymityLevel} />
                {r.isFinalised || r.revised ? (
                  <StatusTag tone="accent">Round 2: Finalised</StatusTag>
                ) : (
                  <StatusTag tone="muted">Round 1: Tentative</StatusTag>
                )}
                {r.decision === 'kept' && (
                  <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                    Maintained Stance
                  </span>
                )}
                {r.decision === 'adjusted' && r.shift !== null && r.shift !== undefined && (
                  <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    Adjusted ({r.shift > 0 ? '+' : ''}{Math.round(r.shift * 100)}%)
                  </span>
                )}
                {r.brier !== null && <span className="text-sm text-ink-muted">{t.brier(fmtBrier(r.brier))}</span>}
                {r.weight !== null && <span className="text-sm text-ink-muted">{t.weight(r.weight)}</span>}
              </div>
              <p className="mt-1 text-sm text-ink">
                {r.revised && r.firstProbability !== null ? (
                  <>
                    <span className="text-ink-muted">Tentative:</span> {toPercent(r.firstProbability)}% →{' '}
                    <span className="text-accent font-semibold">Finalised: {toPercent(r.latestProbability)}%</span>
                  </>
                ) : (
                  <>
                    <span className="text-ink-muted">{r.isFinalised ? 'Finalised:' : 'Tentative:'}</span>{' '}
                    <strong>{toPercent(r.latestProbability)}%</strong>
                  </>
                )}
              </p>
              {r.firstReason && (
                <p className="mt-1.5 text-sm text-ink">
                  <span className="font-medium text-ink-muted">Round 1 Reason (Tentative): </span>
                  {r.firstReason}
                </p>
              )}
              {r.revisionReason && (
                <p className="mt-1 text-sm text-ink">
                  <span className="font-medium text-accent">Round 2 Delphi Rationale (Finalised): </span>
                  {r.revisionReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

