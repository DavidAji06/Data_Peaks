import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { LevelTag, PageHeader, StatusTag, fmtBrier, fmtDate } from '@/components/mod/parts';
import { AiThemes } from '@/components/mod/AiThemes';
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
              <StatusTag tone={q.status === 'open' ? 'accent' : 'muted'}>{mod.questions.status[q.status] ?? q.status}</StatusTag>
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

          <Card>
            <h2 className="text-base font-semibold text-ink">{t.participation}</h2>
            <dl className="mt-2 grid grid-cols-3 gap-3">
              {[
                [t.invited, d.participation.invited],
                [t.answered, d.participation.answered],
                [t.revised, d.participation.revised],
              ].map(([label, n]) => (
                <div key={label}>
                  <dt className="text-sm text-ink-muted">{label}</dt>
                  <dd className="text-2xl font-semibold text-ink">{n}</dd>
                </div>
              ))}
            </dl>
          </Card>

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

          {showFigures && <Distribution d={d} />}

          <Responses d={d} />
        </div>

        <div className="grid gap-4">
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
      <h2 className="text-base font-semibold text-ink">{t.responses}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t.responsesHelp}</p>
      {d.responses.length === 0 ? (
        <p className="mt-3 text-ink-muted">{t.noResponses}</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {d.responses.map((r, i) => (
            <li key={`${r.label}-${i}`} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{r.label}</span>
                <LevelTag level={r.anonymityLevel} />
                {r.revised && <StatusTag tone="accent">{t.revisedTag}</StatusTag>}
                {r.brier !== null && <span className="text-sm text-ink-muted">{t.brier(fmtBrier(r.brier))}</span>}
              </div>
              <p className="mt-1 text-sm text-ink">
                {r.revised && r.firstProbability !== null ? (
                  <>
                    {t.first} {toPercent(r.firstProbability)}% → {t.latestShort} <strong>{toPercent(r.latestProbability)}%</strong>
                  </>
                ) : (
                  <strong>{toPercent(r.latestProbability)}%</strong>
                )}
              </p>
              {r.firstReason && (
                <p className="mt-1 text-sm text-ink">
                  <span className="text-ink-muted">{t.reasonFirst}: </span>
                  {r.firstReason}
                </p>
              )}
              {r.revisionReason && (
                <p className="mt-1 text-sm text-ink">
                  <span className="text-ink-muted">{t.reasonRevision}: </span>
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

