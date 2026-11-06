'use client';

import { buttonClass } from '@/components/ui/primitives';
import { useLocale } from '@/components/expert/use-locale';

export default function ExpertError({ retry }: { error: unknown; retry: () => void }) {
  const { s } = useLocale();
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-10">
      <div role="alert" className="rounded-xl border border-line bg-surface p-5">
        <h1 className="text-lg font-semibold text-ink">{s.errors.generic}</h1>
        <p className="mt-2 text-ink-muted">{s.errors.network}</p>
        <button type="button" onClick={() => retry()} className={`${buttonClass.primary} mt-4`}>
          {s.errors.tryAgain}
        </button>
      </div>
    </main>
  );
}
