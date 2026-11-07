/**
 * Small shared UI pieces. Styling uses the design tokens in app/globals.css only.
 * Tap targets are at least 44px (min-h-11).
 */
import type { ReactNode } from 'react';

export const buttonClass = {
  primary:
    'block w-full min-h-12 px-4 py-3.75 rounded-lg bg-primary-600 text-white font-bold hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
  secondary:
    'block w-full min-h-12 px-4 py-3.75 rounded-lg bg-primary-50 text-primary-700 font-bold hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
  ghost:
    'block w-full min-h-12 px-4 py-3.75 rounded-lg bg-white border border-border-default text-ink-900 font-bold hover:bg-surface-page disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
  link: 'inline-flex min-h-11 items-center font-medium text-primary-600 underline underline-offset-4 hover:text-primary-700',
};

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-sm bg-surface-card border border-border-subtle p-4 sm:p-3.75 ${className}`} style={{ borderRadius: '14px' }}>{children}</section>;
}

export function WhiteCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-sm bg-white border border-border-subtle p-3.5 ${className}`} style={{ borderRadius: '14px' }}>{children}</section>;
}

/** ACAPS risk level as given by the data ("High", "Medium", "Low"); colour is never the only signal. Red (high) to blue (low) */
export function RiskChip({ level, label }: { level: string | null; label: string }) {
  const tone = (level ?? '').toLowerCase();
  const cls =
    tone === 'high'
      ? 'bg-risk-high-soft text-risk-high'
      : tone === 'medium'
        ? 'bg-risk-medium-soft text-risk-medium'
        : tone === 'low'
          ? 'bg-risk-low-soft text-risk-low'
          : 'bg-grey-chip-50 text-grey-chip-700';
  return <span className={`inline-flex items-center px-2 py-1 text-xs font-bold ${cls}`} style={{ borderRadius: '7px' }}>{label}</span>;
}

export function Chip({ children, variant = 'default' }: { children: ReactNode; variant?: 'default' | 'gold' | 'gray' }) {
  const classes =
    variant === 'gold'
      ? 'bg-gold-50 text-gold-700'
      : variant === 'gray'
        ? 'bg-grey-chip-50 text-grey-chip-700'
        : 'bg-primary-100 text-primary-700';
  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs font-bold ${classes}`} style={{ borderRadius: '7px' }}>
      {children}
    </span>
  );
}

/** Neutral badge for screens served from demo data. */
export function DemoBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center border border-border-default bg-white px-2 py-1 text-xs font-bold text-ink-500" style={{ borderRadius: '7px' }}>
      {children}
    </span>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' }) {
  const cls = tone === 'warning' ? 'border-gold-700 bg-gold-50 text-ink-900' : 'border-primary-600 bg-primary-50 text-ink-900';
  return (
    <div role={tone === 'warning' ? 'alert' : 'status'} className={`rounded-lg border-l-4 px-4 py-3 ${cls}`} style={{ borderRadius: '14px' }}>
      {children}
    </div>
  );
}

export const fieldClass = {
  input: 'block w-full min-h-11 px-3 py-2 text-sm border border-border-default rounded-lg bg-surface-white text-ink-900 placeholder-ink-500 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600',
  textarea: 'block w-full px-3 py-2 text-sm border border-border-default rounded-lg bg-surface-white text-ink-900 placeholder-ink-500 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600',
  select: 'block w-full min-h-11 px-3 py-2 text-sm border border-border-default rounded-lg bg-surface-white text-ink-900 focus:outline-none focus:border-primary-600 focus:ring-1 focus:ring-primary-600',
  label: 'block text-sm font-bold text-ink-900 mb-2',
};

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-card rounded-lg ${className}`} />;
}
