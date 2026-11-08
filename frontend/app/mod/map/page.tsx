import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/mod/parts';
import { RiskMap } from '@/components/mod/RiskMap';
import { Card } from '@/components/ui/primitives';
import { getMapContexts } from '@/lib/api';
import { mod } from '@/lib/i18n/mod';
import { ModSkeleton } from '../loading';

export const metadata: Metadata = { title: 'Risk map' };

const t = mod.map;

export default function MapPage() {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <MapView />
    </Suspense>
  );
}

async function MapView() {
  const { data, source } = await getMapContexts();
  const intro = data.rankedAt ? `${t.intro} ${t.rankedAt(data.rankedAt)}.` : t.intro;
  return (
    <>
      <PageHeader title={t.title} intro={intro} source={source} />
      {data.contexts.length > 0 ? (
        <RiskMap contexts={data.contexts} />
      ) : (
        <Card>
          <p className="text-ink-muted">{t.empty}</p>
        </Card>
      )}
    </>
  );
}
