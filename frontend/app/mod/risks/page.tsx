import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/mod/parts';
import { RiskList } from '@/components/mod/RiskList';
import { Notice } from '@/components/ui/primitives';
import { getRankedRisks } from '@/lib/api';
import { mod } from '@/lib/i18n/mod';
import { ModSkeleton } from '../loading';

export const metadata: Metadata = { title: 'Risks' };

export default function RisksPage() {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <Risks />
    </Suspense>
  );
}

async function Risks() {
  const { data, source } = await getRankedRisks();
  return (
    <>
      <PageHeader title={mod.risks.title} intro={mod.risks.intro} source={source} demoUntilMl={data.areDemo} />
      {data.areDemo && (
        <div className="mb-4">
          <Notice>{mod.risks.placeholderNote}</Notice>
        </div>
      )}
      <RiskList items={data.items} />
    </>
  );
}
