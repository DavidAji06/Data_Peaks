/**
 * Date formatting utility - client-side only.
 * This file uses new Date() and is safe for client components.
 * Do NOT import this into server components during prerendering.
 */

/**
 * Format ISO date string (YYYY-MM-DD or ISO timestamp) to display format.
 * Example: "2026-11-07" or "2026-11-07T15:30:00Z" → "7 Nov 2026"
 */
export function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const dateStr = iso.slice(0, 10); // Extract YYYY-MM-DD
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
