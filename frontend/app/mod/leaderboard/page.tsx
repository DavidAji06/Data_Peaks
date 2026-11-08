import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { LevelTag, PageHeader, StatusTag, fmtBrier } from '@/components/mod/parts';
import { Card } from '@/components/ui/primitives';
import { getLeaderboard } from '@/lib/api';
import { mod } from '@/lib/i18n/mod';
import type { Participation } from '@/lib/types';
import { ModSkeleton } from '../loading';

export const metadata: Metadata = { title: 'Expert overview' };

const t = mod.leaderboard;

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <Board />
    </Suspense>
  );
}

const th = 'py-2 pr-3 font-medium';
const thNum = `${th} text-right`;
const td = 'py-2.5 pr-3 text-ink';
const tdNum = `${td} text-right tabular-nums`;

function Table({ head, children, min = '48rem' }: { head: ReactNode; children: ReactNode; min?: string }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth: min }}>
        <thead className="border-b border-line text-ink-muted">
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Name({ label, synthetic }: { label: string; synthetic: boolean }) {
  return (
    <th scope="row" className="py-2.5 pr-3 font-medium text-ink">
      {label}
      {synthetic && (
        <span className="ml-2 align-middle">
          <StatusTag>{t.demo}</StatusTag>
        </span>
      )}
    </th>
  );
}

const ParticipationHead = () => (
  <>
    <th scope="col" className={th}>{t.country}</th>
    <th scope="col" className={thNum}>{t.invited}</th>
    <th scope="col" className={thNum}>{t.answered}</th>
    <th scope="col" className={thNum} title={t.waitingHelp}>{t.waiting}</th>
  </>
);

const ParticipationCells = ({ p }: { p: Participation }) => (
  <>
    <td className={td}>{p.country ?? '—'}</td>
    <td className={tdNum}>{p.invited}</td>
    <td className={tdNum}>{p.answered}</td>
    <td className={tdNum}>{p.openUnanswered}</td>
  </>
);

async function Board() {
  const { data, source } = await getLeaderboard();
  return (
    <>
      <PageHeader title={t.title} intro={t.intro(data.minResolved)} source={source} />
      <div className="grid gap-6">
        <Card>
          <h2 className="text-base font-semibold text-ink">{t.rankedTitle}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {t.baseline(fmtBrier(data.baselineBrier))} {t.practiceNote}
          </p>
          {data.experts.length === 0 ? (
            <p className="mt-3 text-ink-muted">{t.empty}</p>
          ) : (
            <Table
              head={
                <>
                  <th scope="col" className={th}>{t.rank}</th>
                  <th scope="col" className={th}>{t.expert}</th>
                  <th scope="col" className={th}>{t.level}</th>
                  <ParticipationHead />
                  <th scope="col" className={thNum}>{t.resolved}</th>
                  <th scope="col" className={thNum}>{t.meanBrier}</th>
                  <th scope="col" className="py-2 font-medium">{t.vsBaseline}</th>
                </>
              }
            >
              {data.experts.map((e) => (
                <tr key={e.label} className="border-b border-line last:border-0">
                  <td className={`${td} tabular-nums`}>{e.rank}</td>
                  <Name label={e.label} synthetic={e.synthetic} />
                  <td className="py-2.5 pr-3"><LevelTag level={e.anonymityLevel} /></td>
                  <ParticipationCells p={e} />
                  <td className={tdNum}>{e.resolved}</td>
                  <td className={tdNum}>{fmtBrier(e.meanBrier)}</td>
                  <td className="py-2.5 text-ink">{e.beatsBaseline ? t.yes : t.no}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-ink">{t.unrankedTitle}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t.unrankedIntro(data.minResolved)}</p>
          {data.unranked.length === 0 ? (
            <p className="mt-3 text-ink-muted">{t.unrankedEmpty}</p>
          ) : (
            <Table
              head={
                <>
                  <th scope="col" className={th}>{t.expert}</th>
                  <th scope="col" className={th}>{t.level}</th>
                  <ParticipationHead />
                  <th scope="col" className="py-2 font-medium">{t.resolved}</th>
                </>
              }
            >
              {data.unranked.map((e) => (
                <tr key={e.label} className="border-b border-line last:border-0">
                  <Name label={e.label} synthetic={e.synthetic} />
                  <td className="py-2.5 pr-3"><LevelTag level={e.anonymityLevel} /></td>
                  <ParticipationCells p={e} />
                  <td className="py-2.5 text-ink">{t.progress(e.resolved, data.minResolved)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-ink">{t.anonymousTitle}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t.anonymousIntro}</p>
          {data.anonymous.length === 0 ? (
            <p className="mt-3 text-ink-muted">{t.anonymousEmpty}</p>
          ) : (
            <Table
              head={
                <>
                  <th scope="col" className={th}>{t.expert}</th>
                  <ParticipationHead />
                  <th scope="col" className={thNum}>{t.resolved}</th>
                  <th scope="col" className="py-2 font-medium">{t.vsBaseline}</th>
                </>
              }
            >
              {data.anonymous.map((e) => (
                <tr key={e.label} className="border-b border-line last:border-0">
                  <Name label={e.label} synthetic={e.synthetic} />
                  <ParticipationCells p={e} />
                  <td className={tdNum}>{e.resolved}</td>
                  <td className="py-2.5 text-ink">
                    {e.beatsBaseline === null ? t.tooFew : e.beatsBaseline ? t.yes : t.no}
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-4 text-sm text-ink-muted">{t.useNote}</p>
        </Card>
      </div>
    </>
  );
}
