import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LevelTag, PageHeader, fmtBrier } from '@/components/mod/parts';
import { Card } from '@/components/ui/primitives';
import { getLeaderboard } from '@/lib/api';
import { mod } from '@/lib/i18n/mod';
import { ModSkeleton } from '../loading';

export const metadata: Metadata = { title: 'Calibration' };

const t = mod.leaderboard;

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <Board />
    </Suspense>
  );
}

async function Board() {
  const { data, source } = await getLeaderboard();
  return (
    <>
      <PageHeader title={t.title} intro={t.intro(data.minResolved)} source={source} />
      <Card>
        <p className="text-sm text-ink-muted">
          {t.baseline(fmtBrier(data.baselineBrier))} {t.practiceNote}
        </p>
        {data.experts.length === 0 ? (
          <p className="mt-3 text-ink-muted">{t.empty}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="border-b border-line text-ink-muted">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">{t.rank}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t.expert}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t.level}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t.resolved}</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">{t.meanBrier}</th>
                  <th scope="col" className="py-2 font-medium">{t.vsBaseline}</th>
                </tr>
              </thead>
              <tbody>
                {data.experts.map((e) => (
                  <tr key={e.label} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 tabular-nums text-ink">{e.rank}</td>
                    <th scope="row" className="py-2.5 pr-3 font-medium text-ink">{e.label}</th>
                    <td className="py-2.5 pr-3"><LevelTag level={e.anonymityLevel} /></td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{e.resolved}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{fmtBrier(e.meanBrier)}</td>
                    <td className="py-2.5 text-ink">{e.beatsBaseline ? t.yes : t.notYet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-sm text-ink">{data.note}</p>
        <p className="mt-1 text-sm text-ink-muted">{t.useNote}</p>
      </Card>
    </>
  );
}
