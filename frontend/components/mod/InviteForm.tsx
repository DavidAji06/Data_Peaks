'use client';

import { useState } from 'react';
import { buttonClass, Card, Notice } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api-error';
import { createPanelInvite } from '@/lib/client-api';
import { mod } from '@/lib/i18n/mod';
import type { DataSource } from '@/lib/types';
import { ACAPS_COUNTRIES } from '@/lib/countries';

const t = mod.panel;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/; // same pattern as the backend

/**
 * Invite an expert: email + country → a one-time sign-up link (POST /moderator/panel-invites,
 * key added server-side by /api/mod). The link is the invitee's credential: it is shown once,
 * here, so the moderator can send it; it isn't stored or logged by the frontend.
 */
export function InviteForm({ source }: { source: DataSource }) {
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('Chad');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function send() {
    setError(null);
    if (!EMAIL.test(email.trim())) return setError(t.needEmail);
    if (country.trim().length < 2) return setError(t.needCountry);
    setBusy(true);
    try {
      const r = await createPanelInvite(source, { email: email.trim(), country: country.trim() });
      setLink(r.joinLink);
    } catch (e) {
      setError(e instanceof ApiError && e.kind === 'validation' ? e.detail : mod.errorHelp);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked: the link is still selectable on screen
    }
  }

  // The backend builds the link for http://localhost:3000; open it on whatever host serves this page.
  const localPath = link ? new URL(link).pathname : null;

  if (link) {
    return (
      <Card>
        <h2 className="text-base font-semibold text-ink">{t.createdTitle}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t.createdHelp}</p>
        <p className="mt-3 break-all rounded-lg bg-surface-muted p-3 font-mono text-sm text-ink">{link}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className={buttonClass.primary} onClick={() => void copy()}>
            {copied ? t.copied : t.copy}
          </button>
          {localPath && (
            <a href={localPath} target="_blank" rel="noopener noreferrer" className={buttonClass.secondary}>
              {t.open} <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
          <button
            type="button"
            className={buttonClass.link}
            onClick={() => {
              setLink(null);
              setCopied(false);
              setEmail('');
            }}
          >
            {t.another}
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-muted">{t.notifyNote}</p>
      </Card>
    );
  }

  const field = 'mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-ink';
  return (
    <Card>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="block">
          <span className="font-medium text-ink">{t.email}</span>
          <span className="block text-sm text-ink-muted">{t.emailHelp}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            maxLength={254}
            autoComplete="off"
            className={field}
          />
        </label>
        <label className="block">
          <span className="font-medium text-ink">{t.country}</span>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder={t.countryPlaceholder}
            maxLength={80}
            list="acaps-countries"
            className={`${field} sm:w-64`}
          />
          <datalist id="acaps-countries">
            {ACAPS_COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <p className="text-sm text-ink-muted">{t.demoNote}</p>
        {error && <Notice tone="warning">{error}</Notice>}
        <div>
          <button type="submit" className={buttonClass.primary} disabled={busy}>
            {busy ? t.sending : t.send}
          </button>
        </div>
      </form>
    </Card>
  );
}
