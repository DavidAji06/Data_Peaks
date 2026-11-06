import Link from 'next/link';
import { buttonClass } from '@/components/ui/primitives';
import { mod } from '@/lib/i18n/mod';

export default function ModNotFound() {
  return (
    <div className="max-w-xl rounded-xl border border-line bg-surface p-5">
      <h1 className="text-lg font-semibold text-ink">{mod.notFound}</h1>
      <Link href="/mod" className={`${buttonClass.secondary} mt-4`}>
        {mod.alert.toQueue}
      </Link>
    </div>
  );
}
