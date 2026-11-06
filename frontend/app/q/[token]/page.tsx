import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ExpertFlow } from '@/components/expert/ExpertFlow';
import { ApiError, getExpertQuestion } from '@/lib/api';
import { QuestionSkeleton } from './loading';

// A fixed title: the token is a credential and must never appear in <title> or any visible text.
export const metadata: Metadata = { title: 'Your question · Ground Truth', robots: { index: false, follow: false } };

export default function ExpertQuestionPage({ params }: PageProps<'/q/[token]'>) {
  return (
    <main className="flex-1">
      {/* Reading params and fetching per-expert data are request-time work: keep them inside Suspense. */}
      <Suspense fallback={<QuestionSkeleton />}>
        <ExpertQuestion params={params} />
      </Suspense>
    </main>
  );
}

async function ExpertQuestion({ params }: { params: PageProps<'/q/[token]'>['params'] }) {
  const { token } = await params;
  const loaded = await getExpertQuestion(token).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return <ExpertFlow token={token} data={loaded.data} source={loaded.source} />;
}
