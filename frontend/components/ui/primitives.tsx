/**
 * Small shared UI pieces. Styling uses the design tokens in app/globals.css only.
 * Tap targets are at least 44px (min-h-11).
 */
import type { ReactNode } from 'react';

export const buttonClass = {
  primary:
    'inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-5 py-2.5 font-medium text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'inline-flex min-h-11 items-center justify-center rounded-lg border border-line-strong bg-surface px-5 py-2.5 font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50',
  link: 'inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4',
};

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}

/** ACAPS risk level as given by the data ("High", "Medium", "Low"); colour is never the only signal. */
export function RiskChip({ level, label }: { level: string | null; label: string }) {
  const tone = (level ?? '').toLowerCase();
  const cls =
    tone === 'high'
      ? 'bg-risk-high-soft text-risk-high'
      : tone === 'medium'
        ? 'bg-risk-medium-soft text-risk-medium'
        : tone === 'low'
          ? 'bg-risk-low-soft text-risk-low'
          : 'bg-surface-muted text-ink-muted';
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${cls}`}>{label}</span>;
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-sm text-ink-muted">{children}</span>
  );
}

/** Neutral badge for screens served from demo data. */
export function DemoBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-medium text-ink-muted">
      {children}
    </span>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  const cls = tone === 'warning' ? 'border-risk-medium bg-risk-medium-soft text-ink' : 'border-accent bg-accent-soft text-ink';
  return (
    <div role={tone === 'warning' ? 'alert' : 'status'} className={`rounded-lg border-l-4 px-4 py-3 ${cls}`}>
      {children}
    </div>
  );
}
