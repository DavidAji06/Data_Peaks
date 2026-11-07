import Link from 'next/link';
import { buttonClass } from '@/components/ui/primitives';
import { strings } from '@/lib/strings';

export default function OutcomeNotFound() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-10">
      <div className="rounded-xl border border-line bg-surface p-5">
        <h1 className="text-lg font-semibold text-ink">{strings.public.notFound}</h1>
        <p className="mt-2 text-ink-muted">{strings.public.notFoundHelp}</p>
        <Link href="/outcomes" className={`${buttonClass.secondary} mt-4`}>
          {strings.public.toList}
        </Link>
      </div>
    </main>
  );
}
