import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PublicHeader } from '@/components/public/PublicOutcomeView';
import { Chip } from '@/components/ui/primitives';
import { getPublicOutcomes } from '@/lib/api';
import { toPercent } from '@/lib/probability';
import { strings as s } from '@/lib/strings';
import { QuestionSkeleton } from '@/app/q/[token]/loading';
import { PublicOutcomesClient } from '@/components/public/PublicOutcomesClient';

export const metadata: Metadata = { title: 'Resolved forecasts · Ground Truth' };

const p = s.public;

export default function OutcomesPage() {
  return (
    <main className="flex-1">
      <Suspense fallback={<QuestionSkeleton />}>
        <Outcomes />
      </Suspense>
    </main>
  );
}

async function Outcomes() {
  const { data, source } = await getPublicOutcomes();
  // Real resolved questions first, practice ones after.
  const items = [...data].sort((a, b) => Number(a.simulated) - Number(b.simulated));
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-4">
      <PublicHeader source={source} />
      <h1 className="mt-6 text-xl font-semibold text-ink">{p.listTitle}</h1>
      <p className="mt-1 text-ink-muted">
        {p.listIntro}
        <span className="block text-xs text-ink-muted/70 mt-1">Auto-refreshes every 60 seconds to show new resolved questions.</span>
      </p>
      <PublicOutcomesClient initialItems={items} />
      <p className="mt-6 text-sm text-ink-muted">{p.privacy}</p>
    </div>
  );
}
