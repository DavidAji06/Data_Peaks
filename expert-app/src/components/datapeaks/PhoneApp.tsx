import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Check, Lock, EyeOff, UserRound, Newspaper, Link2Off, Clock, CircleCheck,
  WifiOff, Loader2, House, FileQuestion, Users, Search, List, Globe2, RotateCcw, X, MapPin,
} from "lucide-react";
import { dict, pct } from "./i18n";
import campImg from "@/assets/camp_sahel.jpg";
import convoyImg from "@/assets/convoy_chad.jpg";
import { Badge, Button, Card, LangToggle, SectionLabel, Wordmark, beatsGuessing, type Lang } from "./shared";
import { useExpert, type Expert } from "./useExpert";
import { CONTEXTS, type ConflictContext } from "./contexts";
import type { AnonymityLevel } from "@/lib/api";

const Globe = lazy(() => import("./Globe"));

type Screen = "profile" | "home" | "questions" | "group";
type GroupView = "compare" | "revise" | "done";
type Privacy = "known" | "nickname" | "anonymous";
type T = (typeof dict)["en"];
type Prefs = { reducedMotion: boolean; listView: boolean };

const MIN_GROUP = 5;
const toApiPrivacy: Record<Privacy, AnonymityLevel> = { known: "known_to_acaps", nickname: "pseudonymous", anonymous: "anonymous" };
const fromApiPrivacy: Record<AnonymityLevel, Privacy> = { known_to_acaps: "known", pseudonymous: "nickname", anonymous: "anonymous" };
const COUNTRIES_EN = ["Chad", "Sudan", "South Sudan", "Niger", "Mali", "CAR"];
const COUNTRIES_FR = ["Tchad", "Soudan", "Soudan du Sud", "Niger", "Mali", "RCA"];
const TOPICS_API = ["conflict", "displacement", "protection", "food security", "humanitarian access"];
const FREQ_TO_MAX = [2, 4, 1]; // index of t.freqList -> max_open_questions
const PREFS_KEY = "dp-prefs";

const L = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);
const fmtDate = (lang: Lang, iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const to100 = (p: number) => Math.round(p * 100);

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { reducedMotion: false, listView: false, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* storage unavailable */
  }
  return { reducedMotion: false, listView: false };
}

export function PhoneApp({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const t = dict[lang];
  const ex = useExpert();
  const [screen, setScreen] = useState<Screen>("home");
  const [groupView, setGroupView] = useState<GroupView>("compare");
  const [answer, setAnswer] = useState(50);
  const [reason, setReason] = useState("");
  const [prefs, setPrefsState] = useState<Prefs>({ reducedMotion: false, listView: false });
  useEffect(() => {
    const p = readPrefs();
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) p.reducedMotion = true;
    setPrefsState(p);
  }, []);
  const setPrefs = (p: Prefs) => {
    setPrefsState(p);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {
      /* storage unavailable */
    }
  };

  const go = (s: Screen, gv: GroupView = "compare") => {
    setScreen(s);
    setGroupView(gv);
  };

  const titles: Record<Screen, [string, string]> = {
    profile: [L(lang, "My profile", "Mon profil"), L(lang, "Your panel settings and track record", "Vos préférences et votre historique")],
    home: [L(lang, "Expert panel", "Panel d'experts"), L(lang, "See what's changing", "Ce qui évolue")],
    questions: [L(lang, "Questions", "Questions"), L(lang, "Share your view on a developing risk", "Votre avis sur un risque émergent")],
    group: [L(lang, "Group view", "Avis du groupe"), L(lang, "How does your view compare?", "Comparez votre réponse")],
  };
  const pending = ex.data && !ex.data.answered && ex.data.question.status === "open" ? 1 : 0;
  const nav: [Screen, string, typeof House][] = [
    ["profile", L(lang, "Profile", "Profil"), UserRound],
    ["home", L(lang, "Home", "Accueil"), House],
    ["questions", "Questions", FileQuestion],
    ["group", L(lang, "Group", "Groupe"), Users],
  ];
  const needsData = screen === "questions" || screen === "group";
  const blocked = ex.state !== "ready" && needsData;

  return (
    <div className="mx-auto flex min-h-[760px] w-full max-w-[420px] flex-col overflow-hidden bg-background sm:rounded-2xl sm:border-8 sm:border-foreground sm:shadow-xl">
      <header className="flex items-center justify-between bg-card px-4 pt-3 pb-2 text-navy">
        <Wordmark size="sm" tagline={false} />
        <LangToggle lang={lang} setLang={setLang} />
      </header>
      <div className="relative bg-foreground px-5 py-2.5 text-background">
        <p className="font-display text-2xl leading-none tracking-wide">{titles[screen][0]}</p>
        <p className="line-clamp-1 text-xs opacity-80">{titles[screen][1]}</p>
        <span className="absolute -bottom-1 left-5 h-1.5 w-10 bg-primary" />
      </div>
      <nav className="flex gap-1 border-b bg-card px-2 pt-3 pb-1.5" role="tablist" aria-label="Sections">
        {nav.map(([s, label, Icon]) => (
          <button key={s} role="tab" aria-selected={screen === s} onClick={() => go(s)}
            className={`relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded px-1 py-1 font-condensed text-xs font-bold ${screen === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <Icon className="h-4 w-4" aria-hidden />
            {label}
            {s === "questions" && pending > 0 && (
              <span className="absolute top-0.5 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-risk px-1 text-[10px] leading-none text-primary-foreground" aria-label={`${pending} open`}>{pending}</span>
            )}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-y-auto px-5 py-6">
        {/* Home stays mounted so the globe keeps its camera and selection between tabs. */}
        <div hidden={screen !== "home"}>
          <Home t={t} lang={lang} ex={ex} active={screen === "home"} prefs={prefs} onQuestions={() => go("questions")} onGroup={() => go("group")} />
        </div>
        {blocked && <LoadNotice lang={lang} t={t} ex={ex} />}
        {!blocked && screen === "questions" && (
          <Question t={t} lang={lang} ex={ex} answer={answer} setAnswer={setAnswer} reason={reason} setReason={setReason}
            onSubmitted={() => go("group")} onGroup={() => go("group")} />
        )}
        {!blocked && screen === "group" && (
          <Group t={t} lang={lang} ex={ex} view={groupView} setView={setGroupView}
            onQuestion={() => go("questions")} onHome={() => go("home")} onProfile={() => go("profile")} />
        )}
        {screen === "profile" && <Profile t={t} lang={lang} ex={ex} prefs={prefs} setPrefs={setPrefs} onOpen={(s) => go(s)} />}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ shared bits */

function LoadNotice({ t, lang, ex }: { t: T; lang: Lang; ex: Expert }) {
  if (ex.state === "loading")
    return <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{L(lang, "Loading…", "Chargement…")}</div>;
  if (ex.state === "invalid") return <InvalidLink t={t} lang={lang} />;
  return <OfflineCard lang={lang} ex={ex} />;
}

function InvalidLink({ t, lang }: { t: T; lang: Lang }) {
  return (
    <Card className="space-y-3 p-5">
      <Link2Off className="h-6 w-6 text-primary" /><h2 className="text-lg font-bold">{t.e1}</h2>
      <p className="text-sm text-muted-foreground">{L(lang, "It may have expired. Ask your ACAPS contact for a new link.", "Il a peut-être expiré. Demandez un nouveau lien à votre contact ACAPS.")}</p>
    </Card>
  );
}

function OfflineCard({ lang, ex }: { lang: Lang; ex: Expert }) {
  return (
    <Card className="space-y-3 p-5">
      <WifiOff className="h-6 w-6 text-primary" />
      <h2 className="text-lg font-bold">{L(lang, "Couldn't reach ACAPS", "Impossible de joindre ACAPS")}</h2>
      <p className="text-sm text-muted-foreground">{L(lang, "Nothing has been sent. Check your connection and try again.", "Rien n'a été envoyé. Vérifiez votre connexion et réessayez.")}</p>
      <Button variant="outline" className="w-full" onClick={() => void ex.refresh()}>{L(lang, "Try again", "Réessayer")}</Button>
    </Card>
  );
}

function BackBtn({ t, onClick }: { t: T; onClick: () => void }) {
  return <button onClick={onClick} className="-ml-1 flex items-center text-sm font-medium text-primary-strong"><ChevronLeft className="h-4 w-4" />{t.back}</button>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-condensed text-xs font-bold uppercase tracking-widest text-muted-foreground">{children}</p>;
}

function PrivacyPicker({ t, value, onChange }: { t: T; value: Privacy; onChange: (p: Privacy) => void }) {
  const opts = [
    { id: "known" as const, title: t.pKnown, text: t.pKnownT, Icon: UserRound },
    { id: "nickname" as const, title: t.pNick, text: t.pNickT, Icon: Lock },
    { id: "anonymous" as const, title: t.pAnon, text: t.pAnonT, Icon: EyeOff },
  ];
  return (
    <div className="space-y-2" role="radiogroup">
      {opts.map(({ id, title, text, Icon }) => (
        <button key={id} role="radio" aria-checked={value === id} onClick={() => onChange(id)}
          className={`flex w-full gap-3 rounded-md border-2 p-4 text-left transition-colors ${value === id ? "border-primary bg-accent" : "bg-card"}`}>
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
          <span className="flex-1"><span className="block font-bold">{title}</span><span className="block text-sm text-muted-foreground">{text}</span></span>
          <span className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 ${value === id ? "border-primary bg-primary shadow-[inset_0_0_0_3px_var(--card)]" : "border-input"}`} />
        </button>
      ))}
      <p className="text-xs text-muted-foreground">{t.privacyNote}</p>
    </div>
  );
}

function Chips({ options, selected, onChange, single = false }: { options: string[]; selected: number[]; onChange: (s: number[]) => void; single?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o, i) => {
        const on = selected.includes(i);
        return <button key={o} aria-pressed={on} onClick={() => onChange(single ? [i] : on ? selected.filter((x) => x !== i) : [...selected, i])}
          className={`min-h-11 rounded-full border px-4 font-condensed text-sm ${on ? "border-navy bg-navy text-navy-foreground" : "bg-card"}`}>{o}</button>;
      })}
    </div>
  );
}

function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 py-2 text-left">
      <span><span className="block font-medium">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-input"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ HOME */

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function Home({ t, lang, ex, active, prefs, onQuestions, onGroup }: { t: T; lang: Lang; ex: Expert; active: boolean; prefs: Prefs; onQuestions: () => void; onGroup: () => void }) {
  const [filter, setFilter] = useState<0 | 1 | 2>(0); // all, following, my questions
  const [following, setFollowing] = useState<string[]>(["chad", "sudan"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [zoomSignal, setZoomSignal] = useState<{ n: number; dir: 1 | -1 }>({ n: 0, dir: 1 });
  const zoom = (dir: 1 | -1) => setZoomSignal((z) => ({ n: z.n + 1, dir }));
  const [listChoice, setListChoice] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [size, setSize] = useState(320);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setWebgl(hasWebGL());
  }, []);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize(Math.max(240, Math.min(360, Math.floor(e!.contentRect.width)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const liveRisk = ex.data?.risk.id;
  const assignedIds = CONTEXTS.filter((c) => c.liveRiskId && c.liveRiskId === liveRisk).map((c) => c.id);
  const shown = CONTEXTS.filter((c) => (filter === 1 ? following.includes(c.id) : filter === 2 ? assignedIds.includes(c.id) : true));
  const results = CONTEXTS.filter((c) => (c.name.en + " " + c.name.fr).toLowerCase().includes(query.trim().toLowerCase()));
  const listView = listChoice || prefs.listView || !webgl;
  const selected = CONTEXTS.find((c) => c.id === selectedId) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    setSearchOpen(false);
    setQuery("");
  };

  return (
    <div className="space-y-7">
      <div className="relative -mx-5 -mt-6 overflow-hidden">
        <img src={campImg} alt="" width={800} height={500} className="h-56 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-navy-foreground">
          <Badge tone="highlight">ACAPS</Badge>
          <h1 className="mt-2 font-display text-4xl leading-none">{t.welcomeTitle}</h1>
        </div>
      </div>
      <p className="text-muted-foreground">{t.welcomeText}</p>

      <section className="space-y-3">
        <div>
          <SectionLabel>{L(lang, "Where your view is needed", "Là où votre avis compte")}</SectionLabel>
          <p className="text-sm text-muted-foreground">{L(lang, "Tap a red dot to see the risk.", "Touchez un point rouge pour voir le risque.")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chips options={[L(lang, "All contexts", "Tous"), L(lang, "Following", "Suivis"), L(lang, "My questions", "Mes questions")]} selected={[filter]} onChange={(s) => setFilter((s[0] ?? 0) as 0 | 1 | 2)} single />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSearchOpen(!searchOpen)} aria-expanded={searchOpen} className="flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-4 font-condensed text-sm"><Search className="h-4 w-4" />{L(lang, "Search", "Rechercher")}</button>
          {webgl && !prefs.listView && (
            <button onClick={() => setListChoice(!listChoice)} className="flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-4 font-condensed text-sm">
              {listChoice ? <Globe2 className="h-4 w-4" /> : <List className="h-4 w-4" />}{listChoice ? L(lang, "Globe", "Globe") : L(lang, "List", "Liste")}
            </button>
          )}
        </div>
        {searchOpen && (
          <Card className="space-y-2 p-3">
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L(lang, "Search countries", "Rechercher un pays")} aria-label={L(lang, "Search countries", "Rechercher un pays")}
              onKeyDown={(e) => { if (e.key === "Enter" && results[0]) select(results[0].id); }}
              className="h-11 w-full rounded-md border-2 bg-card px-3 focus:border-primary focus:outline-none" />
            {results.length === 0 ? <p className="px-1 text-sm text-muted-foreground">{L(lang, "No contexts match.", "Aucun contexte ne correspond.")}</p> : (
              <ul className="max-h-48 overflow-y-auto">
                {results.map((c) => (
                  <li key={c.id}><button onClick={() => select(c.id)} className="flex w-full items-center justify-between rounded px-2 py-2 text-left hover:bg-accent">
                    <span className="font-medium">{c.name[lang]}</span>
                    {assignedIds.includes(c.id) && <span className="font-condensed text-xs text-primary-strong">{L(lang, "Your question", "Votre question")}</span>}
                  </button></li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <div ref={boxRef} className="w-full">
          {listView ? (
            <div className="space-y-2">
              {!webgl && <p className="text-xs text-muted-foreground">{L(lang, "The 3D globe isn't available on this device. Showing a list instead.", "Le globe 3D n'est pas disponible sur cet appareil. Affichage en liste.")}</p>}
              {shown.map((c) => (
                <button key={c.id} onClick={() => select(c.id)} className={`flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left ${selectedId === c.id ? "border-primary" : ""}`}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--globe-marker)" }} aria-hidden />
                  <span className="flex-1"><span className="block font-bold text-navy">{c.name[lang]}</span><span className="line-clamp-1 block text-xs text-muted-foreground">{c.riskTitle}</span></span>
                  {assignedIds.includes(c.id) && <Badge tone="primary">{L(lang, "Yours", "Vous")}</Badge>}
                </button>
              ))}
              <p className="text-xs text-muted-foreground">{L(lang, "A country without a dot has no monitored context in this dataset.", "Un pays sans point n'a pas de contexte suivi dans ces données.")}</p>
            </div>
          ) : (
            <div className="relative">
            <div className="absolute right-0 bottom-0 z-10 flex flex-col gap-2">
              <button onClick={() => zoom(1)} aria-label={L(lang, "Zoom in", "Zoom avant")} className="flex h-11 w-11 items-center justify-center rounded-full border bg-card text-xl font-bold text-navy shadow-sm">+</button>
              <button onClick={() => zoom(-1)} aria-label={L(lang, "Zoom out", "Zoom arrière")} className="flex h-11 w-11 items-center justify-center rounded-full border bg-card text-xl font-bold text-navy shadow-sm">−</button>
            </div>
            <div className="mx-auto rounded-full drop-shadow-[0_10px_18px_rgba(0,75,120,0.18)]" style={{ width: size, height: size }} aria-label={L(lang, "Interactive globe of monitored contexts. Use the list view for a text alternative.", "Globe interactif des contextes suivis. Utilisez la liste pour une alternative textuelle.")} role="img">
              {mounted ? (
                <Suspense fallback={<div className="h-full w-full animate-pulse rounded-full bg-secondary" />}>
                  <Globe size={size} contexts={shown} assignedIds={assignedIds} selectedId={selectedId} onSelect={select}
                    resetSignal={resetSignal} zoomSignal={zoomSignal} reducedMotion={prefs.reducedMotion} active={active} />
                </Suspense>
              ) : <div className="h-full w-full rounded-full bg-secondary" />}
            </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-condensed text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--globe-marker)" }} />{L(lang, "Monitored context", "Contexte suivi")}</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2" style={{ borderColor: "var(--globe-marker)" }} />{L(lang, "Your question", "Votre question")}</span>
          <Badge tone="muted">{L(lang, "Demo snapshot", "Données de démo")}</Badge>
          {!listView && <button onClick={() => { setSelectedId(null); setResetSignal((n) => n + 1); }} className="ml-auto flex min-h-11 items-center gap-1 font-medium text-primary-strong"><RotateCcw className="h-3.5 w-3.5" />{L(lang, "Reset view", "Réinitialiser")}</button>}
        </div>

        {selected && (
          <ContextSheet lang={lang} ex={ex} ctx={selected} assigned={assignedIds.includes(selected.id)}
            following={following.includes(selected.id)}
            onFollow={() => setFollowing((f) => (f.includes(selected.id) ? f.filter((x) => x !== selected.id) : [...f, selected.id]))}
            onClose={() => setSelectedId(null)} onQuestions={onQuestions} onGroup={onGroup} />
        )}
      </section>

      <NextContribution lang={lang} t={t} ex={ex} onQuestions={onQuestions} onGroup={onGroup} />
    </div>
  );
}

function ContextSheet({ lang, ex, ctx, assigned, following, onFollow, onClose, onQuestions, onGroup }: {
  lang: Lang; ex: Expert; ctx: ConflictContext; assigned: boolean; following: boolean; onFollow: () => void; onClose: () => void; onQuestions: () => void; onGroup: () => void;
}) {
  const d = assigned ? ex.data : null;
  const update = d?.trigger_update;
  const open = d && d.question.status === "open";
  return (
    <div className="rounded-t-2xl rounded-b-lg border border-t-4 border-t-primary bg-card p-4 shadow-md" role="dialog" aria-label={ctx.name[lang]}>
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-input" aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div>
          <Eyebrow><MapPin className="mr-1 inline h-3 w-3" />{L(lang, "Context", "Contexte")}{assigned && d ? ` · Risk ${d.risk.id}` : ""}</Eyebrow>
          <h3 className="font-display text-3xl leading-none text-navy">{ctx.name[lang]}</h3>
        </div>
        <button onClick={onClose} aria-label={L(lang, "Close", "Fermer")} className="flex h-11 w-11 items-center justify-center rounded-full border"><X className="h-5 w-5" /></button>
      </div>
      <p className="mt-2 text-sm leading-snug">{d?.risk.title ?? ctx.riskTitle}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="risk">{L(lang, "ACAPS risk level", "Niveau de risque ACAPS")}: {d?.risk.risk_level ?? ctx.riskLevel}</Badge>
        {!assigned && <Badge tone="muted">{L(lang, "Demo snapshot", "Données de démo")}</Badge>}
      </div>
      {update && (
        <div className="mt-3 rounded border-l-4 border-primary bg-accent p-3 text-sm">
          <p className="font-bold">{L(lang, "What's changed", "Ce qui a changé")}</p>
          <p className="line-clamp-2">{update.evidence || update.report.title}</p>
        </div>
      )}
      <div className="mt-4 space-y-2">
        {assigned && d ? (
          d.answered ? <Button className="h-12 w-full" onClick={onGroup}>{L(lang, "View group insight", "Voir l'avis du groupe")}</Button>
            : open ? <Button className="h-12 w-full" onClick={onQuestions}>{L(lang, "Share your view", "Donner mon avis")}</Button>
              : <p className="text-sm text-muted-foreground">{L(lang, "This question has closed.", "Cette question est close.")}</p>
        ) : <p className="text-sm text-muted-foreground">{L(lang, "No question assigned to you here.", "Aucune question ne vous est attribuée ici.")}</p>}
        <Button variant="ghost" className="w-full" onClick={onFollow}>{following ? L(lang, "✓ Following", "✓ Suivi") : L(lang, "Follow", "Suivre")}</Button>
      </div>
    </div>
  );
}

function NextContribution({ lang, t, ex, onQuestions, onGroup }: { lang: Lang; t: T; ex: Expert; onQuestions: () => void; onGroup: () => void }) {
  if (ex.state === "loading") return <Card className="h-40 animate-pulse" ><span className="sr-only">Loading</span></Card>;
  if (ex.state === "invalid") return <InvalidLink t={t} lang={lang} />;
  if (ex.state === "offline") return <OfflineCard lang={lang} ex={ex} />;
  const d = ex.data;
  if (!d) return (
    <Card><p className="font-bold">{L(lang, "You're up to date.", "Vous êtes à jour.")}</p><p className="text-sm text-muted-foreground">{L(lang, "We'll let you know when your perspective is needed.", "Nous vous préviendrons quand votre avis sera utile.")}</p></Card>
  );
  const closed = d.question.status !== "open";
  const status = closed ? L(lang, "Closed", "Close") : d.revised ? L(lang, "Revised", "Révisée") : d.answered ? L(lang, "Answered", "Répondue") : L(lang, "Open", "Ouverte");
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between"><Eyebrow>{L(lang, "Your next contribution", "Votre prochaine contribution")}</Eyebrow><Badge tone={closed ? "muted" : "primary"}>{status}</Badge></div>
      <p className="font-condensed text-sm font-bold text-navy">{d.risk.country} · Risk {d.risk.id}</p>
      <p className="line-clamp-2 font-medium leading-snug">{d.question.text}</p>
      <p className="font-condensed text-xs text-muted-foreground">{L(lang, "About 2 minutes", "Environ 2 minutes")} · {L(lang, "Outcome by", "Résultat le")} {fmtDate(lang, d.question.deadline)}</p>
      {closed ? <p className="text-sm text-muted-foreground">{t.e2}</p>
        : d.answered ? <Button className="h-14 w-full text-lg" onClick={onGroup}>{L(lang, "View group insight", "Voir l'avis du groupe")}</Button>
          : <Button className="h-14 w-full text-lg" onClick={onQuestions}>{L(lang, "Share your view", "Donner mon avis")}</Button>}
    </Card>
  );
}

/* ------------------------------------------------------------------ QUESTIONS (unchanged design) */

function AnswerFields({ t, lang, answer, setAnswer, reason, setReason, disabled = false, whyLabel }: { t: T; lang: Lang; answer: number; setAnswer: (n: number) => void; reason: string; setReason: (s: string) => void; disabled?: boolean; whyLabel?: string }) {
  const left = 280 - reason.length;
  return (
    <>
      <section>
        <label htmlFor="likely" className="text-lg font-bold text-navy">{t.howLikely}</label>
        <div className="mt-1 text-center font-display text-6xl leading-none text-primary-strong">{pct(lang, answer)}</div>
        <input id="likely" type="range" min={0} max={100} step={5} value={answer} disabled={disabled} onChange={(e) => setAnswer(+e.target.value)} className="acaps-range mt-3 h-3 w-full cursor-pointer disabled:opacity-50" />
        <div className="mt-1 flex justify-between font-condensed text-xs text-muted-foreground"><span>0 · {t.veryUnlikely}</span><span>{t.veryLikely} · 100</span></div>
      </section>
      <section>
        <label htmlFor="why" className="text-lg font-bold text-navy">{whyLabel ?? t.why}</label>
        <textarea id="why" maxLength={280} rows={3} value={reason} disabled={disabled} onChange={(e) => setReason(e.target.value)} placeholder={t.whyPh}
          className="mt-2 w-full rounded-md border-2 bg-card p-3 text-base focus:border-primary focus:outline-none disabled:opacity-50" />
        <p className={`text-right font-condensed text-xs ${left < 20 ? "font-bold text-risk" : "text-muted-foreground"}`}>{reason.length}/280</p>
      </section>
    </>
  );
}

function Question(p: { t: T; lang: Lang; ex: Expert; answer: number; setAnswer: (n: number) => void; reason: string; setReason: (s: string) => void; onSubmitted: () => void; onGroup: () => void }) {
  const { t, lang, ex } = p;
  const d = ex.data!;
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const closed = d.question.status !== "open";
  const level = d.risk.risk_level ? `${d.risk.risk_level} risk` : "";
  const update = d.trigger_update;
  const cases = d.similar_risks.length
    ? d.similar_risks.map((s) => ({ place: s.country, code: s.risk_id, status: s.outcome, text: s.what_happened || s.title }))
    : t.cases;

  const submit = async () => {
    if (!p.reason.trim()) return setErr(t.needReason);
    setSending(true);
    setErr(null);
    try {
      await ex.submitAnswer(p.answer, p.reason);
      p.onSubmitted();
    } catch {
      setErr(L(lang, "Couldn't send your answer. It has not been submitted yet — try again.", "Impossible d'envoyer votre réponse. Elle n'a pas encore été transmise — réessayez."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {d.answered && (
        <Card className="space-y-3 p-5">
          <CircleCheck className="h-6 w-6 text-primary" /><h2 className="text-lg font-bold">{t.e3}</h2><p className="text-sm text-muted-foreground">{t.e3T}</p>
          <Button variant="outline" className="w-full" onClick={p.onGroup}>{t.e3C}</Button>
        </Card>
      )}
      {closed && (
        <Card className="space-y-2 p-5"><Clock className="h-6 w-6 text-primary" /><h2 className="text-lg font-bold">{t.e2}</h2><p className="text-sm text-muted-foreground">{L(lang, "Answers are no longer being collected.", "Les réponses ne sont plus collectées.")}</p></Card>
      )}
      <div className="-mx-5 -mt-6 bg-navy px-5 pt-5 pb-6 text-navy-foreground">
        <p className="font-condensed text-xs font-bold uppercase tracking-widest">{d.risk.country} · Risk {d.risk.id}{level && ` · ${level}`}</p>
        <h1 className="mt-2 font-display text-3xl leading-tight tracking-wide">{d.question.text}</h1>
        <span className="mt-3 block h-1.5 w-10 bg-foreground" />
      </div>
      <div>
        <p className="mt-2 font-condensed text-sm text-muted-foreground">{L(lang, "Outcome by", "Résultat le")} {fmtDate(lang, d.question.deadline)}</p>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-2 flex items-center gap-1 text-sm font-medium text-primary-strong">
          {t.countsYes}<ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && <p className="mt-2 rounded border-l-4 border-primary bg-accent p-3 text-sm">{d.question.resolution_criteria || t.countsYesT}</p>}
      </div>
      <section>
        <SectionLabel>{t.changed}</SectionLabel>
        <Card className="overflow-hidden p-0">
          <img src={convoyImg} alt="" loading="lazy" width={800} height={500} className="h-32 w-full object-cover" />
          <div className="flex gap-3 p-4"><Newspaper className="h-5 w-5 shrink-0 text-primary" /><div>
            <p className="font-medium leading-snug">{update ? update.evidence || update.report.title : t.news}</p>
            <p className="mt-1 font-condensed text-xs text-muted-foreground">
              {update ? [update.report.title, update.report.source, update.report.published_at].filter(Boolean).join(" · ") : t.newsMeta}
            </p>
            {update?.report.url && <a href={update.report.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary-strong underline">Source</a>}
          </div></div>
        </Card>
      </section>
      <section>
        <SectionLabel>{t.similar}</SectionLabel>
        <CasesCarousel t={t} cases={cases} />
      </section>
      <AnswerFields {...p} disabled={d.answered || closed} />
      {err && <p className="text-sm text-risk">{err}</p>}
      {!d.answered && !closed && <Button className="h-14 w-full text-lg" onClick={() => void submit()}>{sending ? "…" : t.submit}</Button>}
    </div>
  );
}

type Case = { place: string; code: string; status: string; text: string };

function CasesCarousel({ t, cases }: { t: T; cases: Case[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const n = Math.max(0, Math.min(cases.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div>
      <div ref={ref} onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-roledescription="carousel">
        {cases.map((c, i) => (
          <div key={c.code + i} className="w-full shrink-0 snap-center px-1 py-1" aria-label={`${i + 1} / ${cases.length}`}>
            <Card className="h-full">
              <p className="text-2xl font-medium text-navy">{c.place}</p>
              <p className="font-condensed text-xs text-muted-foreground">{c.code} · {c.status}</p>
              <p className="mt-3 text-base leading-relaxed">{c.text}</p>
            </Card>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous case" className="flex h-11 w-11 items-center justify-center rounded-full border bg-card disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
        <div className="flex gap-2">
          {cases.map((c, i) => (
            <button key={c.code + i} onClick={() => go(i)} aria-label={c.place} className={`h-2.5 rounded-full transition-all ${i === idx ? "w-6 bg-primary" : "w-2.5 bg-input"}`} />
          ))}
        </div>
        <button onClick={() => go(idx + 1)} disabled={idx === cases.length - 1} aria-label="Next case" className="flex h-11 w-11 items-center justify-center rounded-full border bg-card disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">{t.casesNote}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ GROUP (group view + change + completed) */

function Group({ t, lang, ex, view, setView, onQuestion, onHome, onProfile }: {
  t: T; lang: Lang; ex: Expert; view: GroupView; setView: (v: GroupView) => void; onQuestion: () => void; onHome: () => void; onProfile: () => void;
}) {
  const d = ex.data!;
  if (ex.groupLocked || !ex.group) {
    return (
      <div className="flex flex-col items-center pt-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-navy text-navy-foreground"><Lock className="h-8 w-8" /></div>
        <h1 className="mt-6 font-display text-3xl leading-tight tracking-wide text-navy">{L(lang, "Share your view first", "Donnez d'abord votre avis")}</h1>
        <p className="mt-3 text-muted-foreground">{L(lang, "Answer independently before seeing the group's assessment.", "Répondez de manière indépendante avant de voir l'avis du groupe.")}</p>
        <Button className="mt-6 h-14 w-full text-lg" onClick={onQuestion}>{L(lang, "Go to question", "Aller à la question")}</Button>
      </div>
    );
  }
  if (view === "revise") return <Revise t={t} lang={lang} ex={ex} onBack={() => setView("compare")} onSaved={() => setView("done")} />;
  if (view === "done") return <Done t={t} lang={lang} ex={ex} onGroup={() => setView("compare")} onHome={onHome} onProfile={onProfile} />;

  const g = ex.group;
  const first = ex.own.first;
  const latest = ex.own.latest;
  const revisedValue = d.revised && latest !== null && latest !== first;
  const closed = d.question.status !== "open";
  const enough = g.response_count >= MIN_GROUP && g.median !== null && g.min !== null && g.max !== null;
  const lists: [string, string[]][] = [
    [L(lang, "Where views align", "Points d'accord"), g.themes.agreement],
    [L(lang, "Where views differ", "Points de désaccord"), g.themes.disagreement],
    [L(lang, "Additional context", "Contexte supplémentaire"), g.themes.new_information],
  ];
  const hasThemes = lists.some(([, items]) => items.length > 0);

  return (
    <div className="space-y-6">
      <GroupContext lang={lang} ex={ex} />
      <h1 className="font-display text-3xl leading-tight tracking-wide text-navy">{L(lang, "How does your view compare?", "Comment votre avis se situe-t-il ?")}</h1>
      <div className={`grid gap-3 text-center ${revisedValue ? "grid-cols-3" : "grid-cols-2"}`}>
        <StatTile label={L(lang, "Your first estimate", "Votre 1re estimation")} value={first !== null ? pct(lang, first) : "—"} />
        {revisedValue && <StatTile label={L(lang, "Your latest", "Votre dernière")} value={pct(lang, latest!)} />}
        <StatTile label={L(lang, "Group median", "Médiane du groupe")} value={enough ? pct(lang, to100(g.median!)) : "—"} />
      </div>
      {!enough ? (
        <Card>
          <p className="font-bold">{L(lang, "Waiting for enough responses", "En attente de réponses")}</p>
          <p className="text-sm text-muted-foreground">{L(lang, "Group insights appear once at least five experts have answered.", "Les résultats du groupe apparaissent dès que cinq experts ont répondu.")} ({g.response_count})</p>
        </Card>
      ) : (
        <>
          <p className="font-condensed text-sm text-muted-foreground">
            {L(lang, `${g.response_count} experts answered · Range ${to100(g.min!)}%–${to100(g.max!)}%`, `${g.response_count} experts ont répondu · Éventail ${to100(g.min!)} %–${to100(g.max!)} %`)}
          </p>
          <p className="text-sm text-muted-foreground">{L(lang, "The median is the middle answer: half the experts gave a lower estimate, half a higher one.", "La médiane est la réponse du milieu : la moitié des experts a donné une estimation plus basse, l'autre moitié plus haute.")}</p>
          <section>
            <SectionLabel>{t.range}</SectionLabel>
            <CompareAxis lang={lang} min={to100(g.min!)} max={to100(g.max!)} median={to100(g.median!)} first={first} latest={revisedValue ? latest : null} />
          </section>
          {hasThemes ? lists.filter(([, items]) => items.length).map(([title, items]) => (
            <section key={title}><SectionLabel>{title}</SectionLabel>
              <ul className="space-y-1.5">{items.map((i) => <li key={i} className="rounded border bg-card px-3 py-2 text-sm">{i}</li>)}</ul>
            </section>
          )) : <Card className="text-sm text-muted-foreground">{L(lang, "A reviewed summary is not available yet.", "Aucune synthèse validée n'est encore disponible.")}</Card>}
        </>
      )}
      <div className="space-y-3">
        <Button className="h-14 w-full text-lg" onClick={() => setView("done")}>{L(lang, "Keep my estimate", "Conserver mon estimation")}</Button>
        {d.revised ? (
          <p className="text-center text-sm text-muted-foreground">{L(lang, "You've used your one revision.", "Vous avez utilisé votre unique révision.")}</p>
        ) : !closed && (
          <Button variant="outline" className="h-14 w-full text-lg" onClick={() => setView("revise")}>{L(lang, "Revise my estimate", "Réviser mon estimation")}</Button>
        )}
        <Button variant="ghost" className="w-full" onClick={onQuestion}>{L(lang, "View context", "Voir le contexte")}</Button>
      </div>
    </div>
  );
}

function GroupContext({ lang, ex }: { lang: Lang; ex: Expert }) {
  const d = ex.data!;
  const [open, setOpen] = useState(false);
  const status = d.question.status !== "open" ? L(lang, "Closed", "Close") : L(lang, "Open", "Ouverte");
  return (
    <div className="-mx-5 -mt-6 border-b bg-card px-5 py-4">
      <Eyebrow>{d.risk.country} · Risk {d.risk.id} · {status}</Eyebrow>
      <p className={`mt-1 text-sm font-medium leading-snug ${open ? "" : "line-clamp-2"}`}>{d.question.text}</p>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 flex items-center gap-1 text-xs font-medium text-primary-strong">
        {open ? L(lang, "Show less", "Réduire") : L(lang, "Show full question", "Voir toute la question")}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-foreground p-3 text-background"><p className="text-xs font-bold leading-tight">{label}</p><p className="mt-1 font-display text-4xl leading-none">{value}</p></div>;
}

function CompareAxis({ lang, min, max, median, first, latest }: { lang: Lang; min: number; max: number; median: number; first: number | null; latest: number | null }) {
  const you = latest ?? first;
  const desc = L(lang, `Group median ${median}%, range ${min}% to ${max}%`, `Médiane ${median} %, éventail ${min} % à ${max} %`) + (you !== null ? L(lang, `, your estimate ${you}%`, `, votre estimation ${you} %`) : "");
  return (
    <div>
      <div className="relative mt-6 h-12" role="img" aria-label={desc}>
        <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded bg-secondary" />
        <div className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded bg-primary/40" style={{ left: `${min}%`, width: `${max - min}%` }} />
        <span className="absolute top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-navy" style={{ left: `${median}%` }} />
        <span className="absolute -top-5 -translate-x-1/2 font-condensed text-[11px] font-bold text-navy" style={{ left: `${median}%` }}>{L(lang, "Median", "Médiane")}</span>
        {latest !== null && first !== null && (
          <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-navy bg-card" style={{ left: `${first}%` }} title={L(lang, "First", "Première")} />
        )}
        {you !== null && (
          <>
            <span className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-navy bg-highlight" style={{ left: `${you}%` }} />
            <span className="absolute top-9 -translate-x-1/2 font-condensed text-[11px] font-bold text-primary-strong" style={{ left: `${you}%` }}>{L(lang, "You", "Vous")}</span>
          </>
        )}
      </div>
      <div className="mt-2 flex justify-between font-condensed text-xs text-muted-foreground"><span>0%</span><span>50%</span><span>100%</span></div>
    </div>
  );
}

function Revise({ t, lang, ex, onBack, onSaved }: { t: T; lang: Lang; ex: Expert; onBack: () => void; onSaved: () => void }) {
  const [answer, setAnswer] = useState(ex.own.latest ?? ex.own.first ?? 50);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setErr(false);
    try {
      await ex.submitRevision(answer, reason);
      onSaved();
    } catch {
      setErr(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-6">
      <BackBtn t={t} onClick={onBack} />
      <h1 className="font-display text-4xl leading-none text-navy">{L(lang, "Revise my estimate", "Réviser mon estimation")}</h1>
      <p className="text-sm text-muted-foreground">{ex.data?.question.text}</p>
      {ex.own.first !== null && (
        <p className="font-condensed text-sm">{t.firstWas(ex.own.first)}{answer === ex.own.first && <span className="ml-2 text-muted-foreground">· {L(lang, "Unchanged", "Inchangée")}</span>}</p>
      )}
      <p className="text-xs text-muted-foreground">{L(lang, "Your first answer stays on record. You can revise once.", "Votre première réponse reste enregistrée. Vous pouvez réviser une seule fois.")}</p>
      <AnswerFields t={t} lang={lang} answer={answer} setAnswer={setAnswer} reason={reason} setReason={setReason} whyLabel={L(lang, "What changed your mind? (optional)", "Qu'est-ce qui vous a fait changer d'avis ? (facultatif)")} />
      {err && <p className="text-sm text-risk">{L(lang, "Couldn't save your revision — try again.", "Impossible d'enregistrer la révision — réessayez.")}</p>}
      <Button className="h-14 w-full text-lg" onClick={() => void save()}>{saving ? "…" : L(lang, "Save revision", "Enregistrer la révision")}</Button>
    </div>
  );
}

function Done({ t, lang, ex, onGroup, onHome, onProfile }: { t: T; lang: Lang; ex: Expert; onGroup: () => void; onHome: () => void; onProfile: () => void }) {
  const { first, latest } = ex.own;
  return (
    <div className="flex flex-col items-center pt-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-9 w-9" /></div>
      <h1 className="mt-6 text-2xl font-bold leading-snug text-navy">{L(lang, "Your estimate is recorded.", "Votre estimation est enregistrée.")}</h1>
      {first !== null && (
        <p className="mt-3 font-condensed text-sm">
          {L(lang, "First estimate", "Première estimation")} {pct(lang, first)}
          {latest !== null && latest !== first && ` · ${L(lang, "Revised estimate", "Estimation révisée")} ${pct(lang, latest)}`}
        </p>
      )}
      <p className="mt-3 text-muted-foreground">{L(lang, "ACAPS will review the panel's input alongside other evidence.", "ACAPS examinera les contributions du panel avec d'autres éléments.")}</p>
      <p className="mt-1 text-muted-foreground">{L(lang, `We'll tell you what happened after ${fmtDate(lang, ex.data?.question.deadline)}.`, `Nous vous dirons ce qui s'est passé après le ${fmtDate(lang, ex.data?.question.deadline)}.`)}</p>
      <div className="mt-6 w-full space-y-3">
        <Button className="h-14 w-full text-lg" onClick={onGroup}>{L(lang, "View group", "Voir le groupe")}</Button>
        <Button variant="outline" className="h-14 w-full text-lg" onClick={onHome}>{L(lang, "Back to Home", "Retour à l'accueil")}</Button>
        <Button variant="ghost" className="w-full underline underline-offset-4" onClick={onProfile}>{t.viewProfile}</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ PROFILE */

function Profile({ t, lang, ex, prefs, setPrefs, onOpen }: { t: T; lang: Lang; ex: Expert; prefs: Prefs; setPrefs: (p: Prefs) => void; onOpen: (s: Screen) => void }) {
  const s = ex.settings;
  const [privacy, setPrivacy] = useState<Privacy>("nickname");
  const [countries, setCountries] = useState<number[]>([0]);
  const [topics, setTopics] = useState<number[]>([0, 1]);
  const [freq, setFreq] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");
  const [whoSees, setWhoSees] = useState(false);

  useEffect(() => {
    if (!s) return;
    setPrivacy(fromApiPrivacy[s.anonymity_level]);
    const c = COUNTRIES_EN.findIndex((x) => x.toLowerCase() === s.country.toLowerCase());
    if (c >= 0) setCountries([c]);
    const tp = s.topics.map((x) => TOPICS_API.indexOf(x.toLowerCase())).filter((i) => i >= 0);
    if (tp.length) setTopics(tp);
    const f = FREQ_TO_MAX.indexOf(s.max_open_questions);
    setFreq(f >= 0 ? f : 0);
  }, [s]);

  const save = async () => {
    setSaving(true);
    setSaved("idle");
    try {
      await ex.saveSettings({
        anonymity_level: toApiPrivacy[privacy],
        ...(countries.length ? { country: COUNTRIES_EN[countries[0]!] } : {}),
        topics: topics.map((i) => TOPICS_API[i]!),
        max_open_questions: FREQ_TO_MAX[freq] ?? 2,
      });
      setSaved("ok");
    } catch {
      setSaved("err");
    } finally {
      setSaving(false);
    }
  };

  const savedPrivacy: Privacy = s ? fromApiPrivacy[s.anonymity_level] : privacy;
  const name = savedPrivacy === "anonymous" ? L(lang, "Anonymous expert", "Expert anonyme") : s?.pseudonym ?? "—";
  const initials = savedPrivacy === "anonymous" ? null : (s?.pseudonym ?? "").split(" ").map((w) => w[0]).join("").slice(0, 2);
  const tr = ex.track;
  const rows = tr?.history ?? [];
  const avg = tr?.mean_brier ?? null;
  const label = (x: number) => (beatsGuessing(x) ? t.better : t.notBetter);
  const d = ex.data;

  if (ex.state === "invalid") return <InvalidLink t={t} lang={lang} />;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-navy font-display text-2xl text-navy-foreground">
          {initials ? initials : <UserRound className="h-8 w-8" />}
        </div>
        <div>
          <h1 className="font-display text-4xl leading-none text-navy">{name}</h1>
          <p className="font-condensed text-sm text-muted-foreground">{L(lang, "Expert panel", "Panel d'experts")}{s?.country ? ` · ${s.country}` : ""}</p>
        </div>
      </div>

      {/* A. Participation */}
      <section className="space-y-5">
        <Eyebrow>{L(lang, "Your participation", "Votre participation")}</Eyebrow>
        <div><SectionLabel>{t.countries}</SectionLabel><Chips options={lang === "fr" ? COUNTRIES_FR : COUNTRIES_EN} selected={countries} onChange={setCountries} single /></div>
        <div><SectionLabel>{t.topics}</SectionLabel><Chips options={t.topicList} selected={topics} onChange={setTopics} /></div>
        <div>
          <SectionLabel>{t.frequency}</SectionLabel>
          <select value={freq} onChange={(e) => setFreq(+e.target.value)} className="h-12 w-full rounded-md border bg-card px-3">{t.freqList.map((f, i) => <option key={f} value={i}>{f}</option>)}</select>
        </div>
        <p className="text-xs text-muted-foreground">{t.noPassword}</p>
      </section>

      {/* B. Privacy */}
      <section className="space-y-3">
        <Eyebrow>{L(lang, "Your privacy", "Votre confidentialité")}</Eyebrow>
        <PrivacyPicker t={t} value={privacy} onChange={setPrivacy} />
        <button onClick={() => setWhoSees(!whoSees)} aria-expanded={whoSees} className="flex items-center gap-1 text-sm font-medium text-primary-strong">
          {L(lang, "Who sees what?", "Qui voit quoi ?")}<ChevronDown className={`h-4 w-4 transition-transform ${whoSees ? "rotate-180" : ""}`} />
        </button>
        {whoSees && (
          <Card className="space-y-2 text-sm">
            <p><b>{L(lang, "Other experts", "Autres experts")}:</b> {L(lang, "only anonymised group figures (median, range, themes).", "uniquement des résultats de groupe anonymisés (médiane, éventail, thèmes).")}</p>
            <p><b>{L(lang, "ACAPS moderators", "Modérateurs ACAPS")}:</b> {L(lang, "your answers with your name, nickname or no label, depending on your choice.", "vos réponses avec votre nom, votre pseudonyme ou sans étiquette, selon votre choix.")}</p>
            <p><b>{L(lang, "Account administrators", "Administrateurs")}:</b> {L(lang, "keep your contact details to send you invitation links.", "conservent vos coordonnées pour vous envoyer les liens d'invitation.")}</p>
            <p><b>{L(lang, "Public", "Public")}:</b> {L(lang, "only group figures for resolved questions, never individual answers.", "uniquement les résultats de groupe des questions résolues, jamais les réponses individuelles.")}</p>
          </Card>
        )}
        <p className="text-xs text-muted-foreground">{L(lang, "Changes apply to your future answers.", "Les modifications s'appliquent à vos futures réponses.")}</p>
      </section>

      <div className="space-y-2">
        <Button className="h-14 w-full text-lg" onClick={() => void save()}>{saving ? L(lang, "Saving…", "Enregistrement…") : L(lang, "Save preferences", "Enregistrer mes préférences")}</Button>
        {saved === "ok" && <p className="flex items-center gap-1 text-sm text-success"><Check className="h-4 w-4" />{L(lang, "Preferences saved", "Préférences enregistrées")}</p>}
        {saved === "err" && <p className="text-sm text-risk">{L(lang, "Couldn't save. Your choices are still here — try again.", "Échec de l'enregistrement. Vos choix sont conservés — réessayez.")}</p>}
      </div>

      {/* C. Contribution history */}
      {d && (
        <section className="space-y-3">
          <Eyebrow>{L(lang, "Your contributions", "Vos contributions")}</Eyebrow>
          <button onClick={() => onOpen(d.answered ? "group" : "questions")} className="w-full text-left">
            <Card className="py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{d.question.text}</p>
                <Badge tone={d.answered ? "primary" : "muted"}>{d.question.status !== "open" ? L(lang, "Closed", "Close") : d.revised ? L(lang, "Revised", "Révisée") : d.answered ? L(lang, "Answered", "Répondue") : L(lang, "Open", "Ouverte")}</Badge>
              </div>
              <p className="mt-2 font-condensed text-xs text-muted-foreground">
                {d.risk.country} · Risk {d.risk.id}
                {ex.own.first !== null && ` · ${L(lang, "First", "Première")} ${pct(lang, ex.own.first)}`}
                {ex.own.latest !== null && ex.own.latest !== ex.own.first && ` · ${L(lang, "Latest", "Dernière")} ${pct(lang, ex.own.latest)}`}
              </p>
            </Card>
          </button>
        </section>
      )}

      {/* D. Track record */}
      <section>
        <SectionLabel>{t.track}</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Card><p className="font-condensed text-sm text-muted-foreground">{L(lang, "Questions resolved", "Questions résolues")}</p><p className="font-display text-5xl leading-none text-navy">{tr?.resolved ?? 0}</p></Card>
          <Card><p className="font-condensed text-sm text-muted-foreground">{L(lang, "Average score (Brier)", "Score moyen (Brier)")}</p><p className="font-display text-5xl leading-none text-navy">{avg !== null ? avg.toFixed(2) : "—"}</p>{avg !== null && <p className={`font-condensed text-xs font-bold ${beatsGuessing(avg) ? "text-success" : "text-muted-foreground"}`}>{label(avg)}</p>}</Card>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t.scoreHelp}</p>
        {(tr?.resolved ?? 0) < 3 && <p className="mt-1 text-xs text-muted-foreground">{L(lang, "Your score becomes meaningful after a few resolved questions.", "Votre score devient significatif après quelques questions résolues.")}</p>}
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <Card key={r.question_id} className="py-3">
              <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium leading-snug">{r.question_text}</p><Badge tone="muted">{L(lang, "Practice", "Exercice")}</Badge></div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-condensed text-xs text-muted-foreground">
                <span>{t.youSaid}: {pct(lang, to100(r.probability))}</span><span>· {r.outcome ? t.itHappened : t.itDidnt}</span>
                <span className={beatsGuessing(r.brier) ? "font-bold text-success" : ""}>· {t.score} {r.brier.toFixed(2)} — {label(r.brier)}</span>
              </div>
            </Card>
          ))}
          {rows.length > 0 && <p className="text-xs text-muted-foreground">{L(lang, "Practice scores use real ACAPS outcomes with simulated answers.", "Les scores d'exercice utilisent des résultats ACAPS réels et des réponses simulées.")}</p>}
        </div>
      </section>

      {/* E. How input was used */}
      <section><SectionLabel>{t.used}</SectionLabel><Card className="border-l-4 border-l-primary text-sm">{t.usedT} <span className="text-muted-foreground">({L(lang, "simulated example", "exemple simulé")})</span></Card></section>

      {/* F. App preferences */}
      <section>
        <SectionLabel>{L(lang, "App preferences", "Préférences de l'application")}</SectionLabel>
        <Card className="divide-y py-1">
          <Switch label={L(lang, "Reduced motion", "Animations réduites")} hint={L(lang, "No globe animation or pulsing markers", "Pas d'animation du globe")} checked={prefs.reducedMotion} onChange={(v) => setPrefs({ ...prefs, reducedMotion: v })} />
          <Switch label={L(lang, "Show map as list", "Afficher la carte en liste")} hint={L(lang, "Use a list instead of the 3D globe on Home", "Liste au lieu du globe 3D")} checked={prefs.listView} onChange={(v) => setPrefs({ ...prefs, listView: v })} />
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">{L(lang, "Saved on this device.", "Enregistré sur cet appareil.")}</p>
      </section>
    </div>
  );
}

