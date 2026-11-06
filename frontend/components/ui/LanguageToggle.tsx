'use client';

import type { Locale } from '@/lib/types';

/** EN/FR switch: two 44px buttons, each marked with its own language. */
export function LanguageToggle({ locale, onChange, label }: { locale: Locale; onChange: (l: Locale) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-line-strong">
      {(['en', 'fr'] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          onClick={() => onChange(l)}
          className={`min-h-11 min-w-11 px-3 text-sm font-medium ${locale === l ? 'bg-accent text-on-accent' : 'text-ink'} first:rounded-l-lg last:rounded-r-lg`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
