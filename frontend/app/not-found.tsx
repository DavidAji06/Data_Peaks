import Link from 'next/link';
import { buttonClass } from '@/components/ui/primitives';
import { strings } from '@/lib/strings';

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-10">
      <div className="rounded-xl border border-line bg-surface p-5">
        <h1 className="text-lg font-semibold text-ink">{strings.errors.notFound}</h1>
        <Link href="/outcomes" className={`${buttonClass.secondary} mt-4`}>
          {strings.errors.toHome}
        </Link>
      </div>
    </main>
  );
}
