import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { ExpertHeader } from '@/components/expert/ExpertHeader';
import { ProfileForm } from '@/components/expert/ProfileForm';
import { buttonClass, Notice } from '@/components/ui/primitives';
import { ApiError, getSettingsPage } from '@/lib/api';
import { strings as s } from '@/lib/strings';
import { QuestionSkeleton } from '../loading';

// Fixed title: never put the token in <title>.
export const metadata: Metadata = { title: 'Privacy settings · Ground Truth', robots: { index: false, follow: false } };

export default function SettingsPage({ params }: PageProps<'/q/[token]/settings'>) {
  return (
    <main className="flex-1">
      <Suspense fallback={<QuestionSkeleton />}>
        <Settings params={params} />
      </Suspense>
    </main>
  );
}

async function Settings({ params }: { params: PageProps<'/q/[token]/settings'>['params'] }) {
  const { token } = await params;
  const { data, source } = await getSettingsPage(token).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-4">
      <ExpertHeader source={source} />
      <h1 className="mt-6 text-xl font-semibold text-ink">{s.settings.title}</h1>
      {data.settings ? (
        <>
          <p className="mt-1 text-ink-muted">{s.settings.pseudonym(data.settings.pseudonym)}</p>
          <ProfileForm mode="settings" token={token} source={source} settings={data.settings} />
        </>
      ) : (
        <div className="mt-4 grid gap-3">
          <Notice tone="warning">{s.settings.unavailable}</Notice>
          <Link href={`/q/${encodeURIComponent(token)}`} className={buttonClass.secondary}>
            {s.settings.back}
          </Link>
        </div>
      )}
    </div>
  );
}
