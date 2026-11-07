/**
 * Small moderator-only display pieces. Server-safe (no hooks).
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DemoBadge } from '@/components/ui/primitives';
import { mod } from '@/lib/i18n/mod';
import { en } from '@/lib/i18n/en';
import type { AnonymityLevel, DataSource } from '@/lib/types';

export function PageHeader({
  title,
  intro,
  source,
  demoUntilMl = false,
  back,
}: {
  title: ReactNode;
  intro?: ReactNode;
  source: DataSource;
  demoUntilMl?: boolean;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-8">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-primary-600 underline underline-offset-4 hover:text-primary-700">
          ← {mod.backTo(back.label)}
        </Link>
      )}
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold text-ink-900 sm:text-4xl mb-1">{title}</h1>
        <p className="text-sm font-medium text-ink-500">ACAPS Moderator page</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {source === 'demo' && <DemoBadge>{mod.demoOffline}</DemoBadge>}
        {demoUntilMl && <DemoBadge>{mod.demoUntilMl}</DemoBadge>}
      </div>
      {intro && <p className="mt-4 text-center max-w-2xl text-ink-500 mx-auto">{intro}</p>}
    </div>
  );
}

/** Anonymity level as a quiet tag; the label itself always comes from the API. */
export function LevelTag({ level }: { level: AnonymityLevel }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border-default px-2 py-0.5 text-xs text-ink-500" style={{ borderRadius: '7px' }}>
      {en.anonymity.levels[level].label}
    </span>
  );
}

export function StatusTag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold ${
        tone === 'accent' ? 'bg-primary-50 text-primary-600' : 'bg-surface-card text-ink-500'
      }`}
      style={{ borderRadius: '7px' }}
    >
      {children}
    </span>
  );
}

/** A thin 0–1 bar with its value written next to it (never bar alone). */
export function MiniBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className="grid grid-cols-[5.5rem_1fr_2.25rem] items-center gap-2 text-xs">
      <span className="text-ink-500">{label}</span>
      <span className="h-1.5 rounded-full bg-border-subtle" aria-hidden="true">
        <span className="block h-1.5 rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-right tabular-nums text-ink-900">{value.toFixed(2)}</span>
    </div>
  );
}

/** Brier scores: 4 decimals, as the backend rounds them. */
export const fmtBrier = (b: number) => b.toFixed(4).replace(/0{1,2}$/, '');

export const fmtDate = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
