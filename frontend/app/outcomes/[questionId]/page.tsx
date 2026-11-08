import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { PublicOutcomeView } from '@/components/public/PublicOutcomeView';
import { getPublicOutcome } from '@/lib/api';
import { QuestionSkeleton } from '@/components/ui/QuestionSkeleton';

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
  const { data, source } = await getPublicOutcome(questionId);
  if (!data) notFound(); // unknown, or not resolved yet: the public endpoint lists resolved questions only
  return <PublicOutcomeView data={data} source={source} />;
}
