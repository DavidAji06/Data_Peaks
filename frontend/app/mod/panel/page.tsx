import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { InviteForm } from '@/components/mod/InviteForm';
import { InviteList } from '@/components/mod/InviteList';
import { RemoveMember, RequestDecision } from '@/components/mod/PanelDecision';
import { LevelTag, PageHeader, StatusTag, fmtDate } from '@/components/mod/parts';
import { Card } from '@/components/ui/primitives';
import { getPanelInvites, getPanels } from '@/lib/api';
import { mod } from '@/lib/i18n/mod';
import type { DataSource, Panels } from '@/lib/types';
import { ModSkeleton } from '../loading';

export const metadata: Metadata = { title: 'Expert management' };

const t = mod.panel;
const TABS = ['panels', 'requests', 'invitations'] as const;
type Tab = (typeof TABS)[number];
const asTab = (v: unknown): Tab => (TABS.includes(v as Tab) ? (v as Tab) : 'panels');

export default function PanelPage({ searchParams }: PageProps<'/mod/panel'>) {
  return (
    <Suspense fallback={<ModSkeleton />}>
      <Panel searchParams={searchParams} />
    </Suspense>
  );
}

async function Panel({ searchParams }: { searchParams: PageProps<'/mod/panel'>['searchParams'] }) {
  const tab = asTab((await searchParams).tab);
  // Panels are always loaded: the Requests tab shows its count on every tab.
  const { data: panels, source } = await getPanels();
  const requests = panels.requests.length;

  return (
    <>
      <PageHeader title={t.title} intro={t.pageIntro} source={source} />

      <nav aria-label={t.title} className="mb-5 flex gap-1 border-b border-line">
        {TABS.map((s) => (
          <Link
            key={s}
            href={s === 'panels' ? '/mod/panel' : `/mod/panel?tab=${s}`}
            aria-current={s === tab ? 'page' : undefined}
            className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium ${
              s === tab ? 'border-accent text-accent' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {t.tabs[s]}
            {s === 'requests' && requests > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs leading-none text-white tabular-nums">{requests}</span>
            )}
          </Link>
        ))}
      </nav>

      {tab === 'panels' && <PanelsTab data={panels} source={source} />}
      {tab === 'requests' && <RequestsTab data={panels} source={source} />}
      {tab === 'invitations' && <InvitationsTab />}
    </>
  );
}

function PanelsTab({ data, source }: { data: Panels; source: DataSource }) {
  const { min, max } = data.target;
  // Countries that only have a request so far appear under Requests, not as an empty panel here
  const panels = data.panels.filter((p) => p.members.length > 0);
  if (panels.length === 0) return <p className="text-ink-muted">{t.panelsEmpty}</p>;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-muted">{t.panelsIntro(min, max)}</p>
      {panels.map((p) => {
        const n = p.members.length;
        return (
          <Card key={p.country}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold text-ink">{p.country}</h2>
              <span className="text-sm tabular-nums text-ink-muted">
                {t.members(n)} · {min}–{max}
              </span>
              {n < min && <StatusTag>{t.belowTarget}</StatusTag>}
              {n > max && <StatusTag>{t.aboveTarget}</StatusTag>}
              {p.pending > 0 && (
                <Link href="/mod/panel?tab=requests" className="text-sm font-medium text-accent hover:underline">
                  {t.pendingCount(p.pending)}
                </Link>
              )}
            </div>
            <ul className="mt-3 divide-y divide-line">
              {p.members.map((m) => (
                <li key={m.membershipId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="min-w-40 font-medium text-ink">{m.label}</span>
                  <LevelTag level={m.anonymityLevel} />
                  {m.synthetic && <StatusTag>{mod.leaderboard.demo}</StatusTag>}
                  {m.since && (
                    <span className="text-ink-muted">
                      {t.memberSince} {fmtDate(m.since)}
                    </span>
                  )}
                  <span className="ml-auto">
                    <RemoveMember source={source} membershipId={m.membershipId} />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function RequestsTab({ data, source }: { data: Panels; source: DataSource }) {
  if (data.requests.length === 0) return <p className="text-ink-muted">{t.requestsEmpty}</p>;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-muted">{t.requestsIntro}</p>
      {data.requests.map((r) => (
        <Card key={r.membershipId}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <p className="text-base font-semibold text-ink">{t.wantsToJoin(r.country)}</p>
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                <span className="font-medium">{r.label}</span>
                <LevelTag level={r.anonymityLevel} />
                {r.synthetic && <StatusTag>{mod.leaderboard.demo}</StatusTag>}
              </p>
              <p className="text-sm text-ink-muted">
                {t.alreadyIn(r.memberOf)} · {fmtDate(r.requestedAt)}
              </p>
              {r.note && <p className="text-sm italic text-ink">“{r.note}”</p>}
            </div>
            <RequestDecision source={source} membershipId={r.membershipId} />
          </div>
        </Card>
      ))}
    </div>
  );
}

async function InvitationsTab() {
  const { data, source } = await getPanelInvites();
  return (
    <div className="grid gap-6">
      <p className="text-sm text-ink-muted">{t.invitationsIntro}</p>
      <div className="max-w-xl">
        <InviteForm source={source} />
      </div>
      <InviteList data={data} source={source} />
    </div>
  );
}
