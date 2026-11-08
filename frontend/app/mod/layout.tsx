import type { Metadata } from 'next';
import { Bebas_Neue, Roboto, Roboto_Condensed } from 'next/font/google';
import Link from 'next/link';
import { Suspense } from 'react';
import { ModNav, NavLinks } from '@/components/mod/ModNav';
import { mod } from '@/lib/i18n/mod';
import './mod-theme.css';

// Same three families as the expert app; loaded for /mod only
const display = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-acaps-display', display: 'swap' });
const sans = Roboto({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-acaps-sans', display: 'swap' });
const condensed = Roboto_Condensed({ subsets: ['latin'], variable: '--font-acaps-condensed', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Moderator · Ground Truth', template: '%s · Moderator · Ground Truth' },
  robots: { index: false, follow: false },
};

/** ACAPS pin motif from the expert app's wordmark. */
function Pin() {
  return (
    <svg viewBox="0 0 24 30" className="h-7 w-6 shrink-0" aria-hidden="true">
      <path d="M12 1a11 11 0 0 1 11 11c0 7.5-11 17-11 17S1 19.5 1 12A11 11 0 0 1 12 1z" fill="#0096ba" />
      <circle cx="12" cy="12" r="7" fill="#ffffff" />
      <circle cx="12" cy="12" r="4" fill="#0f172a" />
    </svg>
  );
}

export default function ModLayout({ children }: LayoutProps<'/mod'>) {
  return (
    <div className={`acaps-mod ${display.variable} ${sans.variable} ${condensed.variable} flex flex-1 flex-col`}>
      <header>
        <div className="relative bg-ink text-white">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
            <Link href="/mod" className="flex min-h-11 items-center gap-3">
              <Pin />
              <span className="font-display text-2xl leading-none sm:text-3xl">
                Ground Truth <span className="opacity-70">· {mod.title}</span>
              </span>
            </Link>
            <p className="font-condensed text-xs font-bold uppercase tracking-widest opacity-80">{mod.noAuth}</p>
          </div>
        </div>
        <div className="h-1.5 bg-primary-500" />
        <div className="border-b border-line bg-surface">
          <div className="mx-auto w-full max-w-5xl px-4">
            <span className="block h-1.5 w-10 bg-ink" aria-hidden="true" />
            <div className="pb-2 pt-1.5">
              <Suspense fallback={<NavLinks path="" />}>
                <ModNav />
              </Suspense>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}
