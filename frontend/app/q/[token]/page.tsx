import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ExpertFlow } from '@/components/expert/ExpertFlow';
import { ExpertHeader } from '@/components/expert/ExpertHeader';
import { buttonClass, Card } from '@/components/ui/primitives';
import { ApiError, getExpertQuestion, isKnownLink } from '@/lib/api';
import { strings as s } from '@/lib/strings';
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
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });
  if (loaded) return <ExpertFlow token={token} data={loaded.data} source={loaded.source} />;

  // No open question: a known expert's personal link is "up to date"; anything else is an invalid link
  if (!(await isKnownLink(token))) notFound();
  const base = `/q/${encodeURIComponent(token)}`;
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-4">
      <ExpertHeader source="api" />
      <Card className="mt-6">
        <h1 className="text-xl font-semibold text-ink">{s.upToDate.title}</h1>
        <p className="mt-1 text-ink-muted">{s.upToDate.help}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={`${base}/record`} className={buttonClass.secondary}>{s.upToDate.record}</Link>
          <Link href={`${base}/settings`} className={buttonClass.secondary}>{s.upToDate.settings}</Link>
        </div>
      </Card>
    </div>
  );
}
