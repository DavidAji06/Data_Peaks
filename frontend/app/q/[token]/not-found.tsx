import { strings } from '@/lib/strings';

export default function InvalidLink() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-10">
      <div className="rounded-xl border border-line bg-surface p-5">
        <h1 className="text-lg font-semibold text-ink">{strings.en.errors.invalidLink}</h1>
        <p className="mt-2 text-ink-muted">{strings.en.errors.invalidLinkHelp}</p>
        <p lang="fr" className="mt-4 text-ink-muted">
          {strings.fr.errors.invalidLink} {strings.fr.errors.invalidLinkHelp}
        </p>
      </div>
    </main>
  );
}
