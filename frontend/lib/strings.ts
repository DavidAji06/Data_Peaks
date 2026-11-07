/**
 * All UI text is English. Expert and public text lives in lib/i18n/en.ts, moderator text in lib/i18n/mod.ts.
 * Safe for client components: these files contain no data.
 */
import { en, type Strings } from './i18n/en';

export type { Strings };

export const strings: Strings = en;

/** Dates for display, e.g. "6 May 2027". Input is an ISO date or timestamp. */
export function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}
