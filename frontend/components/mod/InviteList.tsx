'use client';

import { useState } from 'react';
import { StatusTag, fmtDate } from '@/components/mod/parts';
import { buttonClass, Card } from '@/components/ui/primitives';
import { resendPanelInvite } from '@/lib/client-api';
import { mod } from '@/lib/i18n/mod';
import type { DataSource, PanelInvites } from '@/lib/types';

const t = mod.panel;

/** Who was invited and whether they joined. An anonymous expert is never linked to their email. */
export function InviteList({ data, source }: { data: PanelInvites; source: DataSource }) {
  const [resend, setResend] = useState<Record<string, 'busy' | 'ok' | 'fail'>>({});

  async function again(token: string) {
    setResend((r) => ({ ...r, [token]: 'busy' }));
    try {
      const out = await resendPanelInvite(source, token);
      setResend((r) => ({ ...r, [token]: out.emailSent ? 'ok' : 'fail' }));
    } catch {
      setResend((r) => ({ ...r, [token]: 'fail' }));
    }
  }

  return (
    <Card>
      <h2 className="text-base font-semibold text-ink">{t.listTitle}</h2>
      {!data.emailConfigured && <p className="mt-1 text-sm text-ink-muted">{t.emailOff}</p>}
      {data.invites.length === 0 ? (
        <p className="mt-3 text-ink-muted">{t.listEmpty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line text-ink-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">{t.colEmail}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t.colCountry}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t.colStatus}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t.colExpert}</th>
                <th scope="col" className="py-2 pr-3 font-medium">{t.colInvited}</th>
                <th scope="col" className="py-2 font-medium"><span className="sr-only">{t.resend}</span></th>
              </tr>
            </thead>
            <tbody>
              {data.invites.map((i, n) => {
                const state = i.token ? resend[i.token] : undefined;
                return (
                  <tr key={`${i.email}-${n}`} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2.5 pr-3 font-medium text-ink">{i.email}</th>
                    <td className="py-2.5 pr-3 text-ink">{i.country}</td>
                    <td className="py-2.5 pr-3">
                      <StatusTag tone={i.status === 'joined' ? 'accent' : 'muted'}>
                        {i.status === 'joined' ? t.joined : t.pending}
                      </StatusTag>
                      {i.status === 'pending' && i.emailSent === false && (
                        <span className="ml-2 text-xs text-ink-muted">{t.emailFailed}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-ink">
                      {i.status === 'joined' ? (i.anonymous ? <span className="text-ink-muted">{t.anonymousExpert}</span> : i.expert ?? '—') : '—'}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-ink-muted">{fmtDate(i.invitedAt)}</td>
                    <td className="py-2.5 text-right">
                      {i.token && (
                        <button
                          type="button"
                          className={buttonClass.link}
                          disabled={state === 'busy'}
                          onClick={() => void again(i.token!)}
                        >
                          {state === 'busy' ? t.resending : state === 'ok' ? t.resent : state === 'fail' ? t.resendFailed : t.resend}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
