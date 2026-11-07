'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass, Card, Notice } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api-error';
import { createPanelInvite, type InviteResult } from '@/lib/client-api';
import { mod } from '@/lib/i18n/mod';
import type { DataSource } from '@/lib/types';
import { ACAPS_COUNTRIES } from '@/lib/countries';

const t = mod.panel;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/; // same pattern as the backend

/**
 * Invite an expert: email + country → POST /moderator/panel-invites. The backend emails the
 * activation link (expert app, ?join=…). When email is off or fails, the link is shown once here
 * so the moderator can pass it on; it isn't stored or logged by the frontend.
 */
export function InviteForm({ source }: { source: DataSource }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('Chad');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(InviteResult & { email: string }) | null>(null);
  const [copied, setCopied] = useState(false);

  async function send() {
    setError(null);
    if (!EMAIL.test(email.trim())) return setError(t.needEmail);
    if (country.trim().length < 2) return setError(t.needCountry);
    setBusy(true);
    try {
      const r = await createPanelInvite(source, { email: email.trim(), country: country.trim() });
      setResult({ ...r, email: email.trim() });
      router.refresh(); // Updates the invitations list below
    } catch (e) {
      setError(e instanceof ApiError && (e.kind === 'validation' || e.status === 409) ? e.detail : mod.errorHelp);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.joinLink);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked: the link is still selectable on screen
    }
  }

  if (result) {
    const reset = () => {
      setResult(null);
      setCopied(false);
      setEmail('');
    };
    return (
      <Card>
        {result.emailSent ? (
          <>
            <h2 className="text-base font-semibold text-ink">{t.sentTitle(result.email)}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t.sentHelp}</p>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold text-ink">{t.notSentTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{t.notSentHelp(result.emailError ?? 'Email is off')}</p>
            <p className="mt-3 break-all rounded-lg bg-surface-muted p-3 font-mono text-sm text-ink">{result.joinLink}</p>
          </>
        )}
        <div className="mt-3 flex flex-wrap gap-3">
          {!result.emailSent && (
            <>
              <button type="button" className={buttonClass.primary} onClick={() => void copy()}>
                {copied ? t.copied : t.copy}
              </button>
              <a href={result.joinLink} target="_blank" rel="noopener noreferrer" className={buttonClass.secondary}>
                {t.open} <span className="sr-only">(opens in a new tab)</span>
              </a>
            </>
          )}
          <button type="button" className={result.emailSent ? buttonClass.primary : buttonClass.link} onClick={reset}>
            {t.another}
          </button>
        </div>
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
