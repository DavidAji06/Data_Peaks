import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Check, Lock, EyeOff, UserRound, Newspaper, Link2Off, Clock, CircleCheck,
  WifiOff, Loader2, House, FileQuestion, Users, Search, List, Globe2, RotateCcw, X, MapPin, Pencil,
} from "lucide-react";
import { dict, pct } from "./i18n";
import campImg from "@/assets/camp_sahel.jpg";
import convoyImg from "@/assets/convoy_chad.jpg";
import { Badge, Button, Card, LangToggle, SectionLabel, Wordmark, type Lang } from "./shared";
import { useExpert, type Expert } from "./useExpert";
import { useContexts, type ConflictContext } from "./contexts";
import { ApiError, type AnonymityLevel, type ApiSimilarRisk, type PanelStatus } from "@/lib/api";

const Globe = lazy(() => import("./Globe"));

type Screen = "profile" | "home" | "questions" | "group";
type GroupView = "compare" | "revise" | "done";
export type Privacy = "known" | "nickname" | "anonymous";
type T = (typeof dict)["en"];
type Prefs = { reducedMotion: boolean; listView: boolean };

const MIN_GROUP = 5;
export const toApiPrivacy: Record<Privacy, AnonymityLevel> = { known: "known_to_acaps", nickname: "pseudonymous", anonymous: "anonymous" };
const fromApiPrivacy: Record<AnonymityLevel, Privacy> = { known_to_acaps: "known", pseudonymous: "nickname", anonymous: "anonymous" };

const L = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);
const fmtDate = (lang: Lang, iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const to100 = (p: number) => Math.round(p * 100);

export function PhoneApp({ lang, setLang, onSignOut }: { lang: Lang; setLang: (l: Lang) => void; onSignOut: (why?: string) => void }) {
  const t = dict[lang];
  const ex = useExpert();
  const [screen, setScreen] = useState<Screen>("home");
  const [groupView, setGroupView] = useState<GroupView>("compare");
  const [answer, setAnswer] = useState(50);
  const [reason, setReason] = useState("");
  // Reduced motion follows the device setting; the globe/list choice is the toggle on Home.
  const [prefs, setPrefs] = useState<Prefs>({ reducedMotion: false, listView: false });
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setPrefs({ reducedMotion: true, listView: false });
  }, []);
  // A saved or emailed link the server no longer knows: back to sign-in, where a new one can be emailed
  useEffect(() => {
    if (ex.state === "invalid") onSignOut(`${t.e1}. ${t.e1T}`);
  }, [ex.state, onSignOut, t]);

  const go = (s: Screen, gv: GroupView = "compare") => {
    setScreen(s);
    setGroupView(gv);
  };

  const titles: Record<Screen, [string, string]> = {
    profile: [L(lang, "My profile", "Mon profil"), L(lang, "Your panel preferences", "Vos préférences")],
    home: [L(lang, "Expert panel", "Panel d'experts"), L(lang, "See what's changing", "Ce qui évolue")],
    questions: [L(lang, "Questions", "Questions"), L(lang, "Share your view on a developing risk", "Votre avis sur un risque émergent")],
    group: [L(lang, "Group view", "Avis du groupe"), L(lang, "How does your view compare?", "Comparez votre réponse")],
  };
  const pending = ex.questions.filter((q) => q.status === "open" && !q.answered).length;
  // A different question starts with a fresh answer form and the group comparison.
  const shownId = ex.data?.question.id;
  useEffect(() => {
    setAnswer(50);
    setReason("");
    setGroupView("compare");
  }, [shownId]);
  const openQuestion = (id: string, s: Screen) => {
    ex.selectQuestion(id);
    go(s);
  };
  const nav: [Screen, string, typeof House][] = [
    ["profile", L(lang, "Profile", "Profil"), UserRound],
    ["home", L(lang, "Home", "Accueil"), House],
    ["questions", "Questions", FileQuestion],
    ["group", L(lang, "Group", "Groupe"), Users],
  ];
  const needsData = screen === "questions" || screen === "group";
  // Questions and Group need a question: with none yet (personal link, nothing routed) show "You're up to date"
  const blocked = needsData && (ex.state !== "ready" || !ex.data);

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
          <Home t={t} lang={lang} ex={ex} active={screen === "home"} prefs={prefs} onOpen={openQuestion} />
        </div>
        {blocked && <LoadNotice lang={lang} t={t} ex={ex} onSignOut={onSignOut} />}
        {!blocked && screen === "group" && <QuestionSwitcher lang={lang} ex={ex} />}
        {!blocked && screen === "questions" && (
          <Question t={t} lang={lang} ex={ex} answer={answer} setAnswer={setAnswer} reason={reason} setReason={setReason}
            onSubmitted={() => go("group")} onGroup={() => go("group")} />
        )}
        {!blocked && screen === "group" && (
          <Group t={t} lang={lang} ex={ex} view={groupView} setView={setGroupView}
            onQuestion={() => go("questions")} onHome={() => go("home")} onProfile={() => go("profile")} />
        )}
        {screen === "profile" && <Profile t={t} lang={lang} ex={ex} onSignOut={onSignOut} />}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ shared bits */

function questionStatus(lang: Lang, q: { status: string; answered: boolean; revised: boolean }) {
  if (q.status !== "open") return L(lang, "Closed", "Close");
  if (q.revised) return L(lang, "Revised", "Révisée");
  if (q.answered) return L(lang, "Answered", "Répondue");
  return L(lang, "Open", "Ouverte");
}

/** Open and closed questions. Resolved ones are listed under Track record instead. */
const liveQuestions = (ex: Expert) => ex.questions.filter((q) => q.status !== "resolved" || q.question_id === ex.data?.question.id);

/** Shared selection state: the tapped/swiped question is marked at once; details follow when it has loaded. */
function useQuestionPicker(ex: Expert) {
  const live = liveQuestions(ex);
  const shownId = ex.data?.question.id;
  const [picked, setPicked] = useState<string | null>(null);
  const current = picked ?? shownId;
  useEffect(() => {
    if (picked && picked === shownId) setPicked(null);
  }, [picked, shownId]);
  const pick = (id: string) => {
    if (id === current) return;
    setPicked(id);
    ex.selectQuestion(id);
  };
  return { live, current, loading: picked !== null, pick };
}

function Dots({ ids, current, onPick, dark = false }: { ids: string[]; current: string | undefined; onPick?: (id: string) => void; dark?: boolean }) {
  return (
    <div className="flex justify-center gap-1.5">
      {ids.map((id, i) => (
        <button key={id} onClick={() => onPick?.(id)} aria-label={`${i + 1} / ${ids.length}`}
          className={`h-1.5 rounded-full transition-all ${id === current ? (dark ? "w-5 bg-highlight" : "w-5 bg-primary") : dark ? "w-1.5 bg-navy-foreground/40" : "w-1.5 bg-input"}`} />
      ))}
    </div>
  );
}

/** Questions tab: the navy title block is itself the selector. Swipe (or use the arrows) to move between questions; everything below follows. */
function QuestionHeaderCarousel({ lang, ex }: { lang: Lang; ex: Expert }) {
  const { live, current, loading, pick } = useQuestionPicker(ex);
  const d = ex.data!;
  const railRef = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slides = live.length
    ? live
    : [{ question_id: d.question.id, text: d.question.text, risk: { country: d.risk.country, id: d.risk.id }, status: d.question.status, answered: d.answered, revised: d.revised }];
  const idx = Math.max(0, slides.findIndex((q) => q.question_id === current));
  // Keep the rail on the selected slide (after a dot/arrow tap or a reload).
  useEffect(() => {
    const el = railRef.current;
    if (el && el.clientWidth && Math.round(el.scrollLeft / el.clientWidth) !== idx) el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  }, [idx]);
  // The block fits the visible question instead of the longest one.
  const [height, setHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const slide = railRef.current?.children[idx] as HTMLElement | undefined;
    if (!slide) return;
    const measure = () => setHeight(slide.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(slide);
    return () => ro.disconnect();
  }, [idx, slides.length]);
  const onScroll = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const el = railRef.current;
      if (!el || !el.clientWidth) return;
      const q = slides[Math.round(el.scrollLeft / el.clientWidth)];
      if (q) pick(q.question_id);
    }, 140);
  };
  const go = (i: number) => {
    const q = slides[Math.max(0, Math.min(slides.length - 1, i))];
    if (q) pick(q.question_id);
  };
  return (
    <div className="-mx-5 -mt-6 bg-navy pt-5 pb-4 text-navy-foreground">
      <div ref={railRef} onScroll={onScroll} role="tablist" aria-label={L(lang, "Your questions", "Vos questions")} style={{ height }}
        className="flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden transition-[height] duration-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {slides.map((q) => {
          const on = q.question_id === current;
          const level = d.question.id === q.question_id && d.risk.risk_level ? ` · ${d.risk.risk_level} risk` : "";
          return (
            <div key={q.question_id} role="tab" aria-selected={on} className="w-full shrink-0 snap-center px-5">
              <p className="flex items-center justify-between gap-2 font-condensed text-xs font-bold uppercase tracking-widest">
                <span className="truncate">{q.risk.country} · Risk {q.risk.id}{level}</span>
                <span className="shrink-0 opacity-80">{questionStatus(lang, q)}</span>
              </p>
              <h1 className="mt-2 font-display text-3xl leading-tight tracking-wide">{q.text}</h1>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between px-5">
        <span className="block h-1.5 w-10 bg-foreground" />
        {slides.length > 1 && (
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin opacity-80" aria-label={L(lang, "Loading", "Chargement")} />}
            <button onClick={() => go(idx - 1)} disabled={idx === 0} aria-label={L(lang, "Previous question", "Question précédente")} className="flex h-9 w-9 items-center justify-center rounded-full border border-navy-foreground/40 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <Dots ids={slides.map((q) => q.question_id)} current={current} onPick={pick} dark />
            <button onClick={() => go(idx + 1)} disabled={idx === slides.length - 1} aria-label={L(lang, "Next question", "Question suivante")} className="flex h-9 w-9 items-center justify-center rounded-full border border-navy-foreground/40 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Group tab: a rail of question cards. Tap a card to switch to it; tap the selected card to read the full question. */
function QuestionSwitcher({ lang, ex }: { lang: Lang; ex: Expert }) {
  const { live, current, loading, pick } = useQuestionPicker(ex);
  const [expanded, setExpanded] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setExpanded(false);
    const el = railRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [current]);
  if (!live.length) return null;
  return (
    <div className="-mx-5 -mt-6 mb-6 border-b bg-card pt-4 pb-3">
      <div className="flex items-center justify-between px-5">
        <Eyebrow>{L(lang, `Your questions (${live.length})`, `Vos questions (${live.length})`)}</Eyebrow>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label={L(lang, "Loading", "Chargement")} />}
      </div>
      <div ref={railRef} className="mt-2 flex snap-x snap-mandatory scroll-px-5 items-start gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist" aria-label={L(lang, "Your questions", "Vos questions")}>
        {live.map((q) => {
          const on = q.question_id === current;
          const open = on && expanded;
          const todo = q.status === "open" && !q.answered;
          return (
            <button key={q.question_id} role="tab" aria-selected={on} aria-expanded={on ? expanded : undefined}
              onClick={() => (on ? setExpanded(!expanded) : pick(q.question_id))}
              className={`flex shrink-0 snap-start flex-col justify-start rounded-lg border-2 p-3 text-left transition-colors ${live.length > 1 ? "w-[72%]" : "w-full"} ${open ? "min-h-32" : "h-32"} ${on ? "border-primary bg-accent" : "border-border bg-card"}`}>
              <span className="flex w-full items-center justify-between gap-2 font-condensed text-xs font-bold text-navy">
                <span className="truncate">{q.risk.country} · {q.risk.id}</span>
                <span className={`shrink-0 ${todo ? "text-risk" : "text-muted-foreground"}`}>{questionStatus(lang, q)}</span>
              </span>
              <span className={`mt-1.5 block text-sm leading-snug ${open ? "" : "line-clamp-3"}`}>{q.text}</span>
              <span className="mt-auto flex w-full items-center justify-between pt-1 font-condensed text-[11px] text-muted-foreground">
                <span>{L(lang, "Outcome by", "Résultat le")} {fmtDate(lang, q.deadline)}</span>
                {on && <span className="flex items-center gap-0.5 text-primary-strong">{open ? L(lang, "Show less", "Réduire") : L(lang, "Full question", "Question complète")}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden /></span>}
              </span>
            </button>
          );
        })}
      </div>
      {live.length > 1 && <div className="mt-2"><Dots ids={live.map((q) => q.question_id)} current={current} onPick={pick} /></div>}
    </div>
  );
}

function LoadNotice({ t, lang, ex, onSignOut }: { t: T; lang: Lang; ex: Expert; onSignOut: () => void }) {
  if (ex.state === "loading")
    return <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{L(lang, "Loading…", "Chargement…")}</div>;
  if (ex.state === "invalid") return <InvalidLink t={t} lang={lang} onSignIn={onSignOut} />;
  if (ex.state === "ready") return <UpToDate lang={lang} />;
  return <OfflineCard lang={lang} ex={ex} />;
}

function UpToDate({ lang }: { lang: Lang }) {
  return (
    <Card><p className="font-bold">{L(lang, "You're up to date.", "Vous êtes à jour.")}</p><p className="text-sm text-muted-foreground">{L(lang, "We'll let you know when your perspective is needed.", "Nous vous préviendrons quand votre avis sera utile.")}</p></Card>
  );
}

function InvalidLink({ t, lang, onSignIn }: { t: T; lang: Lang; onSignIn: () => void }) {
  return (
    <Card className="space-y-3 p-5">
      <Link2Off className="h-6 w-6 text-primary" /><h2 className="text-lg font-bold">{t.e1}</h2>
      <p className="text-sm text-muted-foreground">{t.e1T}</p>
      <Button variant="outline" className="w-full" onClick={() => onSignIn()}>{t.e1C}</Button>
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

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-condensed text-xs font-bold uppercase tracking-widest text-muted-foreground">{children}</p>;
}

export function PrivacyPicker({ t, value, onChange }: { t: T; value: Privacy; onChange: (p: Privacy) => void }) {
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

/* ------------------------------------------------------------------ HOME */

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function Home({ t, lang, ex, active, prefs, onOpen }: { t: T; lang: Lang; ex: Expert; active: boolean; prefs: Prefs; onOpen: (id: string, s: Screen) => void }) {
  const [filter, setFilter] = useState<0 | 1 | 2>(0); // all, my panels, my questions
  const [panelBusy, setPanelBusy] = useState(false);
  const [panelError, setPanelError] = useState(false);
  // Country panels live on the server: joining one is a request that an ACAPS moderator decides.
  const panelStatus = (ctx: ConflictContext): PanelStatus | null =>
    ex.panels.find((p) => p.country.toLowerCase() === ctx.name.en.toLowerCase())?.status ?? null;
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

  const { contexts, rankedAt, failed: contextsFailed } = useContexts(ex.token);
  const inCountry = (country: string, ctx: ConflictContext) =>
    country.split(",").some((n) => n.trim().toLowerCase() === ctx.name.en.toLowerCase());
  const assignedIds = contexts
    .filter((c) => c.hasQuestion || ex.questions.some((q) => q.status === "open" && inCountry(q.risk.country, c)))
    .map((c) => c.id);
  // "My panels": countries the expert answers for, or has asked to.
  const following = contexts.filter((c) => { const st = panelStatus(c); return st === "member" || st === "pending"; }).map((c) => c.id);
  const panelAction = async (ctx: ConflictContext) => {
    setPanelError(false);
    setPanelBusy(true);
    try {
      if (panelStatus(ctx) === "pending") await ex.withdrawPanel(ctx.name.en);
      else await ex.requestPanel(ctx.name.en);
    } catch {
      setPanelError(true);
    } finally {
      setPanelBusy(false);
    }
  };
  const rankedLabel = L(lang, "Ranked by Data Peaks pipeline", "Classé par le pipeline Data Peaks") + (rankedAt ? ` · ${fmtDate(lang, rankedAt)}` : "");
  const shown = contexts.filter((c) => (filter === 1 ? following.includes(c.id) : filter === 2 ? assignedIds.includes(c.id) : true));
  const results = contexts.filter((c) => (c.name.en + " " + c.name.fr).toLowerCase().includes(query.trim().toLowerCase()));
  const listView = listChoice || prefs.listView || !webgl;
  const selected = contexts.find((c) => c.id === selectedId) ?? null;

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
          <Chips options={[L(lang, "All contexts", "Tous"), L(lang, "My panels", "Mes panels"), L(lang, "My questions", "Mes questions")]} selected={[filter]} onChange={(s) => setFilter((s[0] ?? 0) as 0 | 1 | 2)} single />
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

        {contextsFailed && <p className="text-sm text-risk">{L(lang, "Couldn't load the map data. Check that the backend is running the latest version.", "Impossible de charger les données de la carte. Vérifiez que le backend est à jour.")}</p>}
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
          <Badge tone="muted">{rankedLabel}</Badge>
          {!listView && <button onClick={() => { setSelectedId(null); setResetSignal((n) => n + 1); }} className="ml-auto flex min-h-11 items-center gap-1 font-medium text-primary-strong"><RotateCcw className="h-3.5 w-3.5" />{L(lang, "Reset view", "Réinitialiser")}</button>}
        </div>

        {selected && (
          <ContextSheet lang={lang} ex={ex} ctx={selected} rankedLabel={rankedLabel}
            question={ex.questions.find((q) => q.status === "open" && inCountry(q.risk.country, selected)) ?? null} onOpen={onOpen}
            panel={panelStatus(selected)} panelBusy={panelBusy} panelError={panelError} canRequest={!!ex.settings}
            onPanel={() => void panelAction(selected)}
            onClose={() => setSelectedId(null)} />
        )}
      </section>
    </div>
  );
}

function ContextSheet({ lang, ex, ctx, rankedLabel, question, panel, panelBusy, panelError, canRequest, onPanel, onClose, onOpen }: {
  lang: Lang; ex: Expert; ctx: ConflictContext; rankedLabel: string; question: Expert["questions"][number] | null; panel: PanelStatus | null; panelBusy: boolean; panelError: boolean; canRequest: boolean; onPanel: () => void; onClose: () => void; onOpen: (id: string, s: Screen) => void;
}) {
  // Full details (trigger update, risk level) are only loaded for the question on screen.
  const d = question && ex.data?.question.id === question.question_id ? ex.data : null;
  const update = d?.trigger_update;
  const riskId = question?.risk.id ?? ctx.risks[0]?.id;
  return (
    <div className="rounded-t-2xl rounded-b-lg border border-t-4 border-t-primary bg-card p-4 shadow-md" role="dialog" aria-label={ctx.name[lang]}>
      <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-input" aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div>
          <Eyebrow><MapPin className="mr-1 inline h-3 w-3" />{L(lang, "Context", "Contexte")}{question ? ` · Risk ${question.risk.id}` : ""}</Eyebrow>
          <h3 className="font-display text-3xl leading-none text-navy">{ctx.name[lang]}</h3>
        </div>
        <button onClick={onClose} aria-label={L(lang, "Close", "Fermer")} className="flex h-11 w-11 items-center justify-center rounded-full border"><X className="h-5 w-5" /></button>
      </div>
      <p className="mt-2 text-sm leading-snug">{question?.risk.title ?? ctx.riskTitle}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="risk">{L(lang, "ACAPS risk level", "Niveau de risque ACAPS")}: {d?.risk.risk_level ?? ctx.risks.find((r) => r.id === riskId)?.riskLevel ?? ctx.riskLevel}</Badge>
        <Badge tone="muted">{rankedLabel}</Badge>
      </div>
      {ctx.risks.filter((r) => r.id !== riskId).map((r) => (
        <div key={r.id} className="mt-3 border-t pt-2">
          <p className="text-sm leading-snug">{r.title}</p>
          <Badge tone="risk">{L(lang, "ACAPS risk level", "Niveau de risque ACAPS")}: {r.riskLevel}</Badge>
        </div>
      ))}
      {update && (
        <div className="mt-3 rounded border-l-4 border-primary bg-accent p-3 text-sm">
          <p className="font-bold">{L(lang, "What's changed", "Ce qui a changé")}</p>
          <p className="line-clamp-2">{update.report.title}</p>
          <p className="mt-1 font-condensed text-xs text-muted-foreground">{update.region_match && update.matched_place ? L(lang, `Reporting near ${update.matched_place} (place-name match)`, `Informations près de ${update.matched_place} (correspondance de lieu)`) : L(lang, `Related reporting in ${ctx.name.en}`, `Informations liées en ${ctx.name.fr}`)}{update.report.published_at ? ` · ${fmtDate(lang, update.report.published_at)}` : ""}</p>
        </div>
      )}
      <div className="mt-4 space-y-2">
        {question ? (
          question.answered ? <Button className="h-12 w-full" onClick={() => onOpen(question.question_id, "group")}>{L(lang, "View group insight", "Voir l'avis du groupe")}</Button>
            : <Button className="h-12 w-full" onClick={() => onOpen(question.question_id, "questions")}>{L(lang, "Share your view", "Donner mon avis")}</Button>
        ) : <p className="text-sm text-muted-foreground">{L(lang, "No question assigned to you here.", "Aucune question ne vous est attribuée ici.")}</p>}
        {canRequest && (
          <>
            {panel === "member" ? (
              <p className="flex min-h-12 items-center justify-center gap-1 font-bold text-primary-strong"><Check className="h-4 w-4" />{L(lang, "On this panel", "Membre de ce panel")}</p>
            ) : (
              <Button variant="ghost" className="w-full" onClick={panelBusy ? undefined : onPanel}>
                {panelBusy ? "…"
                  : panel === "pending" ? L(lang, "Withdraw request", "Retirer la demande")
                  : panel === "declined" || panel === "removed" ? L(lang, "Ask again", "Redemander")
                  : L(lang, "Ask to join this panel", "Demander à rejoindre ce panel")}
              </Button>
            )}
            <p className="text-center text-xs text-muted-foreground">
              {panelError
                ? L(lang, "Couldn't save. Try again.", "Échec de l'enregistrement. Réessayez.")
                : panel === "member"
                  ? L(lang, "You get ACAPS questions about this country.", "Vous recevez les questions de l'ACAPS sur ce pays.")
                  : panel === "pending"
                    ? L(lang, "Request sent. ACAPS will review it.", "Demande envoyée. L'ACAPS va l'examiner.")
                    : panel === "declined"
                      ? L(lang, "ACAPS didn't approve your last request.", "L'ACAPS n'a pas approuvé votre dernière demande.")
                      : panel === "removed"
                        ? L(lang, "You're no longer on this panel.", "Vous ne faites plus partie de ce panel.")
                        : L(lang, "Panel members get ACAPS questions about this country. ACAPS approves each request.", "Les membres du panel reçoivent les questions de l'ACAPS sur ce pays. L'ACAPS approuve chaque demande.")}
            </p>
          </>
        )}
      </div>
    </div>
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
  const update = d.trigger_update;
  const cases = d.similar_risks.length
    ? d.similar_risks.map((s) => ({ place: s.country, code: s.risk_id, status: s.outcome, text: s.what_happened || s.title, full: s.what_happened_full || "", title: s.title, sources: s.sources ?? [], evolution: s.evolution }))
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
      <QuestionHeaderCarousel lang={lang} ex={ex} />
      {d.answered && (
        <Card className="space-y-3 p-5">
          <CircleCheck className="h-6 w-6 text-primary" /><h2 className="text-lg font-bold">{t.e3}</h2><p className="text-sm text-muted-foreground">{t.e3T}</p>
          <Button variant="outline" className="w-full" onClick={p.onGroup}>{t.e3C}</Button>
        </Card>
      )}
      {closed && (
        <Card className="space-y-2 p-5"><Clock className="h-6 w-6 text-primary" /><h2 className="text-lg font-bold">{t.e2}</h2><p className="text-sm text-muted-foreground">{L(lang, "Answers are no longer being collected.", "Les réponses ne sont plus collectées.")}</p></Card>
      )}
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
            <p className="font-medium leading-snug">{update ? update.report.title : t.news}</p>
            <p className="mt-1 font-condensed text-xs text-muted-foreground">
              {update
                ? [update.region_match && update.matched_place ? L(lang, `Reporting near ${update.matched_place} (place-name match)`, `Informations près de ${update.matched_place} (correspondance de lieu)`) : L(lang, `Related reporting in ${d.risk.country}`, `Informations liées : ${d.risk.country}`), update.report.source, fmtDate(lang, update.report.published_at)].filter(Boolean).join(" · ")
                : t.newsMeta}
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

/** Renders ACAPS text, turning markdown links like [OCHA 13/11/2025](https://...) into real links. */
function LinkedText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    parts.push(text.slice(last, m.index));
    parts.push(<a key={m.index} href={m[2]} target="_blank" rel="noreferrer" className="text-primary-strong underline">{m[1]}</a>);
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

type Case = { place: string; code: string; status: string; text: string; full?: string; title?: string; sources?: string[]; evolution?: ApiSimilarRisk["evolution"] };

function CasesCarousel({ t, cases }: { t: T; cases: Case[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
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
              <div>
                <p className="text-2xl font-medium text-navy">{c.place}</p>
                <p className="font-condensed text-xs text-muted-foreground">{c.code} · {c.status}</p>
                {expanded === i && c.title && <p className="mt-3 font-bold leading-snug">{c.title}</p>}
                {expanded === i && c.evolution && (c.evolution.hazard_materialisation || c.evolution.impact_materialisation || c.evolution.rationale_update) ? (
                  <div className="mt-3 space-y-3">
                    <p className="font-condensed text-xs font-bold uppercase tracking-widest text-muted-foreground">How it evolved</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="muted">Outcome: {c.status}</Badge>
                      {c.evolution.what_materialised && <Badge tone="muted">Materialised: {c.evolution.what_materialised}</Badge>}
                      {c.evolution.trend && <Badge tone="muted">Trend: {c.evolution.trend}</Badge>}
                    </div>
                    {([["Hazard", c.evolution.hazard_materialisation], ["Impact", c.evolution.impact_materialisation], ["Updates", c.evolution.rationale_update]] as const)
                      .filter(([, v]) => v)
                      .map(([label, v]) => (
                        <div key={label}>
                          <p className="text-sm font-bold text-navy">{label}</p>
                          <p className="whitespace-pre-line text-base leading-relaxed"><LinkedText text={v} /></p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="mt-3 text-base leading-relaxed">{expanded === i && c.full ? c.full : c.text}</p>
                )}
                {(c.full || c.title) && <button onClick={() => setExpanded(expanded === i ? null : i)} aria-expanded={expanded === i} className="mt-2 flex min-h-11 items-center gap-1 text-sm font-medium text-primary-strong">{expanded === i ? "Show less" : "Read the full case"}<ChevronDown className={`h-4 w-4 transition-transform ${expanded === i ? "rotate-180" : ""}`} /></button>}
              </div>
              {expanded === i && !!c.sources?.length && (
                <div className="mt-3 space-y-1 border-t pt-2">
                  <p className="font-condensed text-xs text-muted-foreground">Sources</p>
                  {c.sources.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="block break-all text-xs text-primary-strong underline">{new URL(url).hostname.replace(/^www\./, "")}</a>
                  ))}
                </div>
              )}
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
          {hasThemes && <p className="font-condensed text-xs font-bold uppercase tracking-widest text-muted-foreground">{L(lang, "AI summary of expert reasons", "Synthèse IA des raisons des experts")}</p>}
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

function Profile({ t, lang, ex, onSignOut }: { t: T; lang: Lang; ex: Expert; onSignOut: () => void }) {
  const s = ex.settings;
  const [privacy, setPrivacy] = useState<Privacy>("nickname");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");
  const [whoSees, setWhoSees] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nick, setNick] = useState("");
  const [nickError, setNickError] = useState<string | null>(null);

  useEffect(() => {
    if (!s) return;
    setPrivacy(fromApiPrivacy[s.anonymity_level]);
  }, [s]);

  const save = async () => {
    setSaving(true);
    setSaved("idle");
    try {
      await ex.saveSettings({ anonymity_level: toApiPrivacy[privacy] });
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

  const startRename = () => {
    setNick(s?.pseudonym ?? "");
    setNickError(null);
    setEditingName(true);
  };
  const saveName = async () => {
    setNickError(null);
    try {
      await ex.saveSettings({ pseudonym: nick.trim() });
      setEditingName(false);
    } catch (e) {
      setNickError(e instanceof ApiError && e.status !== 0 ? e.message : L(lang, "Couldn't save. Try again.", "Échec de l'enregistrement. Réessayez."));
    }
  };

  if (ex.state === "invalid") return <InvalidLink t={t} lang={lang} onSignIn={onSignOut} />;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-navy font-display text-2xl text-navy-foreground">
            {initials ? initials : <UserRound className="h-8 w-8" />}
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void saveName(); }}>
                <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={30} autoFocus
                  aria-label={L(lang, "Nickname", "Pseudonyme")} className="h-11 min-w-0 flex-1 rounded-md border bg-card px-3" />
                <Button variant="navy" className="h-11 px-3">{L(lang, "Save", "Enregistrer")}</Button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="font-display text-4xl leading-none text-navy">{name}</h1>
                {savedPrivacy !== "anonymous" && s && (
                  <button onClick={startRename} aria-label={L(lang, "Edit nickname", "Modifier le pseudonyme")} className="flex h-11 w-11 items-center justify-center rounded-full text-primary-strong hover:bg-accent">
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            <p className="font-condensed text-sm text-muted-foreground">{L(lang, "Expert panel", "Panel d'experts")}{s?.country ? ` · ${s.country}` : ""}</p>
          </div>
        </div>
        {editingName && (
          <div className="space-y-1">
            {nickError && <p className="text-sm text-risk" role="alert">{nickError}</p>}
            <p className="text-xs text-muted-foreground">{L(lang, "3–30 characters: letters, numbers, spaces, - and _.", "3 à 30 caractères : lettres, chiffres, espaces, - et _.")}</p>
            <button onClick={() => setEditingName(false)} className="text-sm font-medium text-primary-strong">{L(lang, "Cancel", "Annuler")}</button>
          </div>
        )}
      </div>

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

      <section className="space-y-2 border-t pt-6">
        <Button variant="outline" className="w-full" onClick={() => onSignOut()}>{L(lang, "Sign out", "Se déconnecter")}</Button>
        <p className="text-xs text-muted-foreground">{L(lang, "To sign in again, enter your email and we'll send you a new link.", "Pour vous reconnecter, saisissez votre e-mail : nous vous enverrons un nouveau lien.")}</p>
      </section>

    </div>
  );
}

