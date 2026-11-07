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
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="mb-1 inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-4">
          ← {mod.backTo(back.label)}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
        {source === 'demo' && <DemoBadge>{mod.demoOffline}</DemoBadge>}
        {demoUntilMl && <DemoBadge>{mod.demoUntilMl}</DemoBadge>}
      </div>
      {intro && <p className="mt-1 max-w-2xl text-ink-muted">{intro}</p>}
    </div>
  );
}

/** Anonymity level as a quiet tag; the label itself always comes from the API. */
export function LevelTag({ level }: { level: AnonymityLevel }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted">
      {en.anonymity.levels[level].label}
    </span>
  );
}

export function StatusTag({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-surface-muted text-ink-muted'
      }`}
    >
      {children}
    </span>
  );
}

/** A thin 0–1 bar with its value written next to it (never bar alone). null = not computed yet. */
export function MiniBar({ label, value }: { label: string; value: number | null }) {
  const pct = value === null ? 0 : Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className="grid grid-cols-[5.5rem_1fr_2.25rem] items-center gap-2 text-xs">
      <span className="text-ink-muted">{label}</span>
      <span className="h-1.5 rounded-full bg-surface-muted" aria-hidden="true">
        <span className="block h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-right tabular-nums text-ink">{value === null ? '—' : value.toFixed(2)}</span>
    </div>
  );
}

/** Brier scores: 4 decimals, as the backend rounds them. */
export const fmtBrier = (b: number) => b.toFixed(4).replace(/0{1,2}$/, '');

export const fmtDate = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
