'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass } from '@/components/ui/primitives';
import { decidePanelMembership } from '@/lib/client-api';
import { mod } from '@/lib/i18n/mod';
import type { DataSource } from '@/lib/types';

const t = mod.panel;
// Compact row actions (the shared buttons are full-width form buttons)
const compact = 'inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const approveClass = `${compact} bg-primary-600 text-white hover:bg-primary-700`;
const declineClass = `${compact} bg-primary-50 text-primary-700 hover:bg-primary-100`;

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; text: string } | { kind: 'error' };

/** Approve / decline a request. After a decision the row says what happened, then the page refreshes. */
export function RequestDecision({ source, membershipId }: { source: DataSource; membershipId: number }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function decide(action: 'approve' | 'decline') {
    setState({ kind: 'busy' });
    try {
      const r = await decidePanelMembership(source, membershipId, action);
      setState({ kind: 'done', text: action === 'approve' ? t.approved(r.invitedToOpenQuestions) : t.declined });
      router.refresh();
    } catch {
      setState({ kind: 'error' });
    }
  }

  if (state.kind === 'done') return <p className="text-sm font-medium text-ink">{state.text}</p>;
  const busy = state.kind === 'busy';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={approveClass} disabled={busy} onClick={() => void decide('approve')}>
        {busy ? t.working : t.approve}
      </button>
      <button type="button" className={declineClass} disabled={busy} onClick={() => void decide('decline')}>
        {t.decline}
      </button>
      {state.kind === 'error' && <span className="text-sm text-ink-muted">{t.decisionFailed}</span>}
    </div>
  );
}

/** Remove a member: one click arms it, a second confirms, so nobody is removed by a stray click. */
export function RemoveMember({ source, membershipId }: { source: DataSource; membershipId: number }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'armed' | 'busy' | 'error'>('idle');

  async function remove() {
    setState('busy');
    try {
      await decidePanelMembership(source, membershipId, 'remove');
      router.refresh();
    } catch {
      setState('error');
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {state === 'error' && <span className="text-xs text-ink-muted">{t.decisionFailed}</span>}
      <button
        type="button"
        className={buttonClass.link}
        disabled={state === 'busy'}
        title={t.removeHelp}
        onClick={() => (state === 'armed' ? void remove() : setState('armed'))}
        onBlur={() => state === 'armed' && setState('idle')}
      >
        {state === 'busy' ? t.removing : state === 'armed' ? t.confirmRemove : t.remove}
      </button>
    </span>
  );
}
