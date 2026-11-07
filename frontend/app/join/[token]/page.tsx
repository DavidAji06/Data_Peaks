import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ExpertHeader } from '@/components/expert/ExpertHeader';
import { ProfileForm } from '@/components/expert/ProfileForm';
import { ApiError, getJoinInfo } from '@/lib/api';
import { strings as s } from '@/lib/strings';
import { QuestionSkeleton } from '@/app/q/[token]/loading';

// Fixed title: never put the invite token in <title>.
export const metadata: Metadata = { title: 'Join the expert panel · Ground Truth', robots: { index: false, follow: false } };

export default function JoinPage({ params }: PageProps<'/join/[token]'>) {
  return (
    <main className="flex-1">
      <Suspense fallback={<QuestionSkeleton />}>
        <Join params={params} />
      </Suspense>
    </main>
  );
}

async function Join({ params }: { params: PageProps<'/join/[token]'>['params'] }) {
  const { token } = await params;
  // null = 409: the invite was already used.
  const loaded = await getJoinInfo(token).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    if (e instanceof ApiError && e.status === 409) return null;
    throw e;
  });

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pt-10">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h1 className="text-lg font-semibold text-ink">{s.join.usedTitle}</h1>
          <p className="mt-2 text-ink-muted">{s.join.usedHelp}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-4">
      <ExpertHeader source={loaded.source} />
      <h1 className="mt-6 text-xl font-semibold text-ink">{s.join.title}</h1>
      <p className="mt-2 text-ink-muted">{s.join.intro}</p>
      <ProfileForm mode="join" token={token} source={loaded.source} country={loaded.data.country} />
    </div>
  );
}
