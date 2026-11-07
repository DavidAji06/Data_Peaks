import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ModNav, NavLinks } from '@/components/mod/ModNav';
import { mod } from '@/lib/i18n/mod';

export const metadata: Metadata = {
  title: { default: 'Moderator · Ground Truth', template: '%s · Moderator · Ground Truth' },
  robots: { index: false, follow: false },
};

export default function ModLayout({ children }: LayoutProps<'/mod'>) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-5xl px-4 pt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <Link href="/" className="font-semibold text-ink">
              Ground Truth <span className="font-normal text-ink-muted">· {mod.title}</span>
            </Link>
            <p className="text-xs text-ink-muted">{mod.noAuth}</p>
          </div>
          <div className="mt-2 pb-1">
            <Suspense fallback={<NavLinks path="" />}>
              <ModNav />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-5">{children}</main>
    </div>
  );
}
