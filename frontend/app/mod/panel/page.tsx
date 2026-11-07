import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InviteForm } from '@/components/mod/InviteForm';
import { PageHeader } from '@/components/mod/parts';
import { getSource } from '@/lib/api';
import { mod } from '@/lib/i18n/mod';
import { ModSkeleton } from '../loading';

export const metadata: Metadata = { title: 'Panel' };

export default function PanelPage() {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <Panel />
    </Suspense>
  );
}

async function Panel() {
  // No data to show, but the invite must go to the same backend the rest of the app is using.
  const { source } = await getSource();
  return (
    <>
      <PageHeader title={mod.panel.title} intro={mod.panel.intro} source={source} />
      <div className="max-w-xl">
        <InviteForm source={source} />
      </div>
    </>
  );
}
