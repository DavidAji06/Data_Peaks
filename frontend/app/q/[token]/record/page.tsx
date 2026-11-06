import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { TrackRecordView } from '@/components/expert/TrackRecordView';
import { ApiError, getTrackRecord } from '@/lib/api';
import { QuestionSkeleton } from '../loading';

// Fixed title: never put the token in <title>.
export const metadata: Metadata = { title: 'Track record · Ground Truth', robots: { index: false, follow: false } };

export default function TrackRecordPage({ params }: PageProps<'/q/[token]/record'>) {
  return (
    <main className="flex-1">
      <Suspense fallback={<QuestionSkeleton />}>
        <TrackRecord params={params} />
      </Suspense>
    </main>
  );
}

async function TrackRecord({ params }: { params: PageProps<'/q/[token]/record'>['params'] }) {
  const { token } = await params;
  const loaded = await getTrackRecord(token).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return <TrackRecordView token={token} data={loaded.data} source={loaded.source} />;
}
