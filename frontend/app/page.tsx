import Link from 'next/link';

/**
 * Demo hub for the pitch: one click into each view. The two expert links are the backend seed's
 * synthetic demo invites (not real people). `python -m app.seed` in backend/ resets the demo.
 */
const ENTRIES = [
  {
    href: '/q/demo-expert-a',
    title: 'Expert: answer a question',
    body: 'A synthetic Chad panel expert who hasn’t answered yet. Context, blind estimate, group view, revise. Try it at phone width.',
  },
  {
    href: '/q/demo-expert-b',
    title: 'Expert: already answered',
    body: 'Same question for an expert who already answered: opens on the group view.',
  },
  {
    href: '/mod',
    title: 'ACAPS moderator',
    body: 'Approve or reject pipeline alerts, follow participation, resolve questions, record decisions on risks.',
  },
  {
    href: '/mod/leaderboard',
    title: 'Calibration',
    body: 'Whose forecasts hold up, by Brier score. Anonymous experts are never ranked.',
  },
  {
    href: '/outcomes/Q001',
    title: 'Public summary',
    body: 'What the public sees: group figures only, never individual answers or names.',
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-10">
      <p className="text-sm font-medium text-accent">Hackathon for Good #8 · ACAPS challenge</p>
      <h1 className="mt-1 text-3xl font-semibold text-ink">Ground Truth</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-muted">
        A trusted expert loop for humanitarian risk analysis. New reports are matched to ACAPS triggers, a moderator
        turns the strong ones into short questions, experts answer blind under the anonymity level they choose, then see
        the group and can revise. ACAPS decides, the public sees aggregates, and Brier scores build each expert’s track
        record as questions resolve.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {ENTRIES.map((e) => (
          <li key={e.href}>
            <Link
              href={e.href}
              className="block h-full rounded-xl border border-line bg-surface p-4 hover:border-accent"
            >
              <span className="font-semibold text-accent underline-offset-4 hover:underline">{e.title} →</span>
              <span className="mt-1 block text-sm text-ink-muted">{e.body}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-ink-muted">
        All experts, answers and reports in this demo are synthetic. Risks, triggers and past outcomes come from the
        ACAPS Risk Radar export. To reset the demo, run <code className="font-mono">python -m app.seed</code> in{' '}
        <code className="font-mono">backend/</code>.
      </p>
    </main>
  );
}
