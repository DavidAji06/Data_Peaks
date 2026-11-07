'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buttonClass, Card, Notice } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api-error';
import { joinPanel, updateSettings } from '@/lib/client-api';
import { strings as s } from '@/lib/strings';
import type { AnonymityLevel, ApiSettingsUpdate, DataSource, ExpertSettings } from '@/lib/types';
import { ACAPS_COUNTRIES } from '@/lib/countries';
import { AnonymityPicker } from './AnonymityPicker';

const p = s.privacy;
const TOPIC_KEYS = Object.keys(p.topics);
/** More anonymous = higher. Moving down reveals more to ACAPS, including on past answers. */
const PRIVACY_RANK: Record<AnonymityLevel, number> = { known_to_acaps: 0, pseudonymous: 1, anonymous: 2 };

type Props =
  | { mode: 'join'; token: string; source: DataSource; country: string }
  | { mode: 'settings'; token: string; source: DataSource; settings: ExpertSettings };

/**
 * Sign-up (POST /join/{token}) and privacy settings (PATCH /q/{token}/settings) share this form:
 * anonymity level, country, topics, and how many open questions at a time.
 * The token is only used in the request URL; it is never displayed.
 */
export function ProfileForm(props: Props) {
  const router = useRouter();
  const start = props.mode === 'settings' ? props.settings : null;
  const [level, setLevel] = useState<AnonymityLevel | null>(start?.anonymityLevel ?? null);
  const [country, setCountry] = useState(start?.country ?? (props.mode === 'join' ? props.country : ''));
  const [topics, setTopics] = useState<string[]>(start?.topics ?? []);
  const [load, setLoad] = useState(start?.maxOpenQuestions ?? 3);
  const [saved, setSaved] = useState<ExpertSettings | null>(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null); // pseudonym after joining

  // Topics the backend already has that aren't in our list stay visible and selectable.
  const topicKeys = [...TOPIC_KEYS, ...topics.filter((t) => !TOPIC_KEYS.includes(t))];
  const toggleTopic = (t: string) => setTopics((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const levelChanged = saved !== null && level !== null && level !== saved.anonymityLevel;
  const lessPrivate = levelChanged && PRIVACY_RANK[level] < PRIVACY_RANK[saved.anonymityLevel];

  function changes(): ApiSettingsUpdate {
    if (!saved) return {};
    const u: ApiSettingsUpdate = {};
    if (level && level !== saved.anonymityLevel) u.anonymity_level = level;
    if (country.trim() !== saved.country) u.country = country.trim();
    const same = topics.length === saved.topics.length && topics.every((t) => saved.topics.includes(t));
    if (!same) u.topics = topics;
    if (load !== saved.maxOpenQuestions) u.max_open_questions = load;
    return u;
  }

  async function submit() {
    setError(null);
    setNotice(null);
    if (props.mode === 'join' && !level) return setError(s.join.needLevel);
    if (country.trim().length < 2) return setError(s.join.needCountry);
    setBusy(true);
    try {
      if (props.mode === 'join') {
        const r = await joinPanel(props.source, props.token, {
          anonymity_level: level as AnonymityLevel,
          country: country.trim(),
          topics,
          max_open_questions: load,
        });
        setJoined(r.pseudonym);
      } else {
        const u = changes();
        if (Object.keys(u).length === 0) {
          setNotice(s.settings.noChange);
        } else {
          const next = await updateSettings(props.source, props.token, u);
          setSaved(next);
          setLevel(next.anonymityLevel);
          setCountry(next.country);
          setTopics(next.topics);
          setLoad(next.maxOpenQuestions);
          setNotice(s.settings.saved);
          router.refresh();
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'not_found') setError(props.mode === 'join' ? s.join.invalidTitle : s.errors.invalidLink);
      else if (e instanceof ApiError && e.kind === 'conflict') setError(s.join.usedTitle);
      else if (e instanceof ApiError && e.kind === 'validation') setError(e.detail);
      else setError(s.errors.networkSettings);
    } finally {
      setBusy(false);
    }
  }

  if (joined) {
    return (
      <Card className="mt-4">
        <h1 className="text-xl font-semibold text-ink">{s.join.doneTitle}</h1>
        <p className="mt-2 text-ink">{s.join.donePseudonym(joined)}</p>
        <p className="mt-2 text-ink-muted">{s.join.doneNext}</p>
      </Card>
    );
  }

  const field = 'mt-1 min-h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-ink';

  return (
    <form
      className="mt-4 grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Card>
        <AnonymityPicker value={level} onChange={setLevel} name="anonymity-level" />
        {levelChanged && (
          <div className="mt-3">
            <Notice tone={lessPrivate ? 'warning' : 'info'}>
              {lessPrivate && <p className="font-medium">{s.settings.lessPrivate}</p>}
              <p>{s.settings.retroWarning}</p>
            </Notice>
          </div>
        )}
      </Card>

      <Card>
        <label className="block">
          <span className="font-medium text-ink">{p.countryLabel}</span>
          <span className="block text-sm text-ink-muted">{p.countryHelp}</span>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            maxLength={80}
            autoComplete="off"
            list="acaps-countries"
            className={field}
          />
          <datalist id="acaps-countries">
            {ACAPS_COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <fieldset className="mt-5">
          <legend className="font-medium text-ink">{p.topicsLabel}</legend>
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {topicKeys.map((t) => (
              <label key={t} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-surface-muted">
                <input
                  type="checkbox"
                  checked={topics.includes(t)}
                  onChange={() => toggleTopic(t)}
                  disabled={!topics.includes(t) && topics.length >= 10}
                  className="h-5 w-5 accent-accent"
                />
                <span className="text-ink">{p.topics[t] ?? t}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="font-medium text-ink">{p.loadLabel}</legend>
          <div className="mt-2 flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className={`flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium ${
                  load === n ? 'border-accent bg-accent text-on-accent' : 'border-line-strong bg-surface text-ink'
                }`}
              >
                <input type="radio" name="load" value={n} checked={load === n} onChange={() => setLoad(n)} className="sr-only" />
                {n}
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-muted">{p.loadHelp(load)}</p>
        </fieldset>
      </Card>

      {error && (
        <Notice tone="warning">
          <p>{error}</p>
        </Notice>
      )}
      {notice && <Notice>{notice}</Notice>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={buttonClass.primary}>
          {props.mode === 'join' ? (busy ? s.join.submitting : s.join.submit) : busy ? s.settings.saving : s.settings.save}
        </button>
        {props.mode === 'settings' && (
          <Link href={`/q/${encodeURIComponent(props.token)}`} className={buttonClass.link}>
            {s.settings.back}
          </Link>
        )}
      </div>
    </form>
  );
}
