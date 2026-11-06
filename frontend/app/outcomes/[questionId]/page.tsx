import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PublicOutcomeView } from '@/components/public/PublicOutcomeView';
import { ApiError, getPublicOutcome } from '@/lib/api';
import { QuestionSkeleton } from '@/app/q/[token]/loading';

export const metadata: Metadata = { title: 'Public summary · Ground Truth' };

export default function OutcomePage({ params }: PageProps<'/outcomes/[questionId]'>) {
  return (
    <main className="flex-1">
      <Suspense fallback={<QuestionSkeleton />}>
        <Outcome params={params} />
      </Suspense>
    </main>
  );
}

async function Outcome({ params }: { params: PageProps<'/outcomes/[questionId]'>['params'] }) {
  const { questionId } = await params;
  // Only aggregates come back from getPublicOutcome; the moderator JSON stays on the server.
  const loaded = await getPublicOutcome(questionId).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return <PublicOutcomeView data={loaded.data} source={loaded.source} />;
}
