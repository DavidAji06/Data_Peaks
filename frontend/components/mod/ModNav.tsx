'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { mod } from '@/lib/i18n/mod';

const ITEMS = [
  { href: '/mod', label: mod.nav.alerts, match: (p: string) => p === '/mod' || p.startsWith('/mod/alerts') },
  { href: '/mod/questions', label: mod.nav.questions, match: (p: string) => p.startsWith('/mod/questions') },
  { href: '/mod/risks', label: mod.nav.risks, match: (p: string) => p.startsWith('/mod/risks') },
  { href: '/mod/leaderboard', label: mod.nav.leaderboard, match: (p: string) => p.startsWith('/mod/leaderboard') },
  { href: '/mod/panel', label: mod.nav.panel, match: (p: string) => p.startsWith('/mod/panel') },
];

/** Highlights the current section. Must sit inside <Suspense> (the path is request data). */
export function ModNav() {
  return <NavLinks path={usePathname() ?? ''} />;
}

/** Same links with no highlight: the Suspense fallback while the path streams in. */
export function NavLinks({ path }: { path: string }) {
  return (
    <nav aria-label={mod.nav.label} className="-mx-1 flex gap-1 overflow-x-auto">
      {ITEMS.map((item) => {
        const active = item.match(path);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded px-3 font-condensed text-sm font-bold uppercase tracking-wide ${
              active ? 'bg-accent text-on-accent' : 'text-ink-muted hover:bg-accent-soft hover:text-accent'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
