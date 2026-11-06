/**
 * All UI text, in English and French: `strings.en` and `strings.fr` have exactly the same keys
 * (TypeScript enforces it), so a missing translation fails the build.
 * The dictionaries live in lib/i18n/. They are safe for client components: they contain no data.
 */
import { en, type Strings } from './i18n/en';
import { fr } from './i18n/fr';
import type { Locale } from './types';

export type { Strings };

export const LOCALES: readonly Locale[] = ['en', 'fr'];
export const DEFAULT_LOCALE: Locale = 'en';

export const strings: Record<Locale, Strings> = { en, fr };

export const t = (locale: Locale): Strings => strings[locale] ?? strings[DEFAULT_LOCALE];

export const isLocale = (value: unknown): value is Locale => value === 'en' || value === 'fr';

/** Dates for display, e.g. "6 May 2027" / "6 mai 2027". Input is an ISO date or timestamp. */
export function formatDate(iso: string, locale: Locale): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}
