import { strings as s } from '@/lib/strings';

export default function InvalidInvite() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-10">
      <div className="rounded-xl border border-line bg-surface p-5">
        <h1 className="text-lg font-semibold text-ink">{s.join.invalidTitle}</h1>
        <p className="mt-2 text-ink-muted">{s.join.invalidHelp}</p>
      </div>
    </main>
  );
}
