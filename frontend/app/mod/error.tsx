'use client';

import { buttonClass } from '@/components/ui/primitives';
import { mod } from '@/lib/i18n/mod';

export default function ModError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" className="max-w-xl rounded-xl border border-line bg-surface p-5">
      <h1 className="text-lg font-semibold text-ink">{mod.errorTitle}</h1>
      <p className="mt-2 text-ink-muted">{mod.errorHelp}</p>
      <button type="button" onClick={() => retry()} className={`${buttonClass.primary} mt-4`}>
        {mod.tryAgain}
      </button>
    </div>
  );
}
