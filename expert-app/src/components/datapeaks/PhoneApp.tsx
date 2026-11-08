import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown, ChevronLeft, ChevronRight, Check, Lock, EyeOff, UserRound, Newspaper, Link2Off, Clock, CircleCheck,
  WifiOff, Loader2, House, FileQuestion, Users, Search, List, Globe2, RotateCcw, X, MapPin, Pencil,
} from "lucide-react";
import { colon, countryName, dict, pct, term } from "./i18n";

/** A signed difference in points, e.g. "+12%" (or "+12 %" in French). */
const signedPct = (lang: Lang, n: number) => (n > 0 ? "+" : "") + pct(lang, n);
import campImg from "@/assets/camp_sahel.jpg";
import convoyImg from "@/assets/convoy_chad.jpg";
import { Badge, Button, Card, LangToggle, SectionLabel, Wordmark, type Lang } from "./shared";
import { useExpert, type Expert } from "./useExpert";
import { useContexts, type ConflictContext, getImpactColor } from "./contexts";
import { ApiError, type AnonymityLevel, type ApiSimilarRisk, type PanelStatus } from "@/lib/api";

const Globe = lazy(() => import("./Globe"));

type Screen = "home" | "questions" | "group" | "profile";
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
    home: [L(lang, "Expert panel", "Panel d'experts"), L(lang, "See what's changing", "Ce qui évolue")],
    questions: [L(lang, "Questions", "Questions"), L(lang, "Share your view on a developing risk", "Votre avis sur un risque émergent")],
    group: [L(lang, "Group view", "Avis du groupe"), L(lang, "How does your view compare?", "Comparez votre réponse")],
    profile: [L(lang, "My profile", "Mon profil"), L(lang, "Your panel preferences", "Vos préférences")],
  };
  const pending = ex.questions.filter((q) => q.status === "open" && (!q.answered || !q.revised)).length;
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
    ["home", L(lang, "Home", "Accueil"), House],
    ["questions", "Questions", FileQuestion],
    ["group", L(lang, "Group", "Groupe"), Users],
    ["profile", L(lang, "Profile", "Profil"), UserRound],
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
      <nav className="flex gap-1 border-b bg-card px-2 pt-3 pb-1.5" role="tablist" aria-label={L(lang, "Sections", "Rubriques")}>
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
            onSubmitted={() => go("questions")} onGroup={() => go("group")} onHome={() => go("home")} />
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

export type QuestionPhase = "phase1" | "phase2" | "completed" | "closed";

export function getQuestionPhase(q: { status: string; answered: boolean; revised: boolean; delphi_round?: number }): QuestionPhase {
  if (q.status !== "open") return "closed";
  if (q.revised) return "completed";
  if (q.answered) {
    if (q.delphi_round === 1) return "phase1";
    return "phase2";
  }
  return "phase1";
}

function questionStatus(lang: Lang, q: { status: string; answered: boolean; revised: boolean; delphi_round?: number }) {
  const p = getQuestionPhase(q);
  if (p === "closed") return L(lang, "Closed", "Close");
  if (p === "completed") return L(lang, "Completed", "Finalisée");
  if (p === "phase2") return L(lang, "Round 2 · Consensus", "2e tour · Consensus");
  if (q.answered && q.delphi_round === 1) return L(lang, "Round 1 · Waiting", "1er tour · En attente");
  return L(lang, "Round 1 · Initial", "1er tour · Initial");
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
          const level = d.question.id === q.question_id && d.risk.risk_level ? ` · ${L(lang, `${d.risk.risk_level} risk`, `Risque ${term(lang, d.risk.risk_level).toLowerCase()}`)}` : "";
          return (
            <div key={q.question_id} role="tab" aria-selected={on} className="w-full shrink-0 snap-center px-5">
              <p className="flex items-center justify-between gap-2 font-condensed text-xs font-bold uppercase tracking-widest">
                <span className="truncate">{countryName(lang, q.risk.country)} · {L(lang, "Risk", "Risque")} {q.risk.id}{level}</span>
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
                <span className="truncate">{countryName(lang, q.risk.country)} · {q.risk.id}</span>
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
          <p className="text-sm text-muted-foreground">{L(lang, "Tap a dot to see the risk (colored by impact score).", "Touchez un point pour voir le risque (coloré par score d'impact).")}</p>
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
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: getImpactColor(c.impactScore) }} aria-hidden />
                  <span className="flex-1"><span className="block font-bold text-navy">{c.name[lang]}</span><span className="line-clamp-1 block text-xs text-muted-foreground">{c.riskTitle}{c.impactScore ? ` · Impact ${c.impactScore}/5` : ""}</span></span>
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
            <div className="mx-auto overflow-hidden rounded-full drop-shadow-[0_10px_18px_rgba(0,75,120,0.18)]" style={{ width: size, height: size }} aria-label={L(lang, "Interactive globe of monitored contexts. Use the list view for a text alternative.", "Globe interactif des contextes suivis. Utilisez la liste pour une alternative textuelle.")} role="img">
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
          <span className="flex items-center gap-1.5">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#2563EB" }} title="1 - Low (Blue)" />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#10B981" }} title="2 - Low (Green)" />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#84CC16" }} title="3 - Medium (Lime)" />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#EAB308" }} title="4 - High (Yellow)" />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#E0263C" }} title="5 - Critical (Red)" />
            </span>
            {L(lang, "Impact (1-5)", "Impact (1-5)")}
          </span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2" style={{ borderColor: "var(--globe-marker)" }} />{L(lang, "Your question", "Votre question")}</span>
          {selected && !listView && ([
            [62, L(lang, "Selected country", "Pays sélectionné")],
            [36, L(lang, "Shares a border", "Frontalier")],
            [16, L(lang, "Two borders away", "À deux frontières")],
          ] as const).map(([pct, label]) => (
            <span key={pct} className="flex items-center gap-1.5">
              <span className="h-2.5 w-3.5 rounded-sm" style={{ background: `color-mix(in srgb, var(--globe-marker) ${pct}%, var(--globe-land))` }} />{label}
            </span>
          ))}
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
          <Eyebrow><MapPin className="mr-1 inline h-3 w-3" />{L(lang, "Context", "Contexte")}{question ? ` · ${L(lang, "Risk", "Risque")} ${question.risk.id}` : ""}</Eyebrow>
          <h3 className="font-display text-3xl leading-none text-navy">{ctx.name[lang]}</h3>
        </div>
        <button onClick={onClose} aria-label={L(lang, "Close", "Fermer")} className="flex h-11 w-11 items-center justify-center rounded-full border"><X className="h-5 w-5" /></button>
      </div>
      <p className="mt-2 text-sm leading-snug">{question?.risk.title ?? ctx.riskTitle}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="risk">{L(lang, "ACAPS risk level", "Niveau de risque ACAPS")}{colon(lang)}{term(lang, d?.risk.risk_level ?? ctx.risks.find((r) => r.id === riskId)?.riskLevel ?? ctx.riskLevel)}</Badge>
        {ctx.impactScore != null && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-condensed text-xs font-bold text-white" style={{ background: getImpactColor(ctx.impactScore) }}>
            {L(lang, "Impact", "Impact")} {ctx.impactScore}/5
          </span>
        )}
        <Badge tone="muted">{rankedLabel}</Badge>
      </div>
      {ctx.risks.filter((r) => r.id !== riskId).map((r) => (
        <div key={r.id} className="mt-3 border-t pt-2">
          <p className="text-sm leading-snug">{r.title}</p>
          <Badge tone="risk">{L(lang, "ACAPS risk level", "Niveau de risque ACAPS")}{colon(lang)}{term(lang, r.riskLevel)}</Badge>
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

function DelphiCompletedCard({ lang, ex, onGroup, onHome }: { lang: Lang; ex: Expert; onGroup: () => void; onHome: () => void }) {
  const { first, latest } = ex.own;
  const g = ex.group;
  const enough = !!(g && g.response_count >= MIN_GROUP && g.median !== null);
  const medianVal = enough && g?.median !== null ? to100(g.median) : null;
  const shift = latest !== null && first !== null ? latest - first : null;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
          <CircleCheck className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-navy">{L(lang, "Delphi Consensus Evaluation Finalized", "Consensus Delphi finalisé")}</h2>
          <p className="text-xs text-muted-foreground">{L(lang, "Both rounds of expert elicitation are complete.", "Les deux tours de consultation sont terminés.")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary/40 p-3 text-center sm:grid-cols-3">
        <div>
          <p className="text-xs font-bold text-muted-foreground">{L(lang, "Round 1 Initial", "1er tour initial")}</p>
          <p className="font-display text-2xl text-navy">{first !== null ? pct(lang, first) : "—"}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-muted-foreground">{L(lang, "Round 2 Final", "2e tour final")}</p>
          <p className="font-display text-2xl text-primary-strong">{latest !== null ? pct(lang, latest) : (first !== null ? pct(lang, first) : "—")}</p>
        </div>
        <div className="col-span-2 rounded bg-card p-1 sm:col-span-1">
          <p className="text-xs font-bold text-muted-foreground">{L(lang, "Group Median", "Médiane groupe")}</p>
          <p className="font-display text-2xl text-navy">{medianVal !== null ? pct(lang, medianVal) : "—"}</p>
        </div>
      </div>

      {shift !== null && (
        <p className="font-condensed text-xs text-muted-foreground">
          {shift === 0
            ? L(lang, "You maintained your evaluation across both rounds.", "Vous avez maintenu votre évaluation sur les deux tours.")
            : L(lang, `Your evaluation adjusted by ${shift > 0 ? `+${shift}%` : `${shift}%`} in the consensus round.`, `Votre évaluation a évolué de ${shift > 0 ? `+${shift} %` : `${shift} %`} lors du tour de consensus.`)}
        </p>
      )}

      <p className="text-sm text-muted-foreground leading-snug">
        {L(lang,
          "Your two-round Delphi contribution has been saved. ACAPS analysts will synthesize the panel consensus alongside ground-truth field evidence.",
          "Votre contribution Delphi en deux tours a été enregistrée. Les analystes ACAPS vont synthétiser le consensus avec les éléments de terrain."
        )}
      </p>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onGroup}>{L(lang, "View Group Details", "Voir l'analyse du groupe")}</Button>
        <Button variant="ghost" className="flex-1" onClick={onHome}>{L(lang, "Back to Home", "Retour à l'accueil")}</Button>
      </div>
    </Card>
  );
}

function DelphiWaitingCard({ lang, ex, onHome }: { lang: Lang; ex: Expert; onGroup: () => void; onHome: () => void }) {
  const { first } = ex.own;
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
          <Clock className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-navy">{L(lang, "Round 1 Submitted — Awaiting Peer Panel", "1er tour soumis — En attente du panel")}</h2>
          <p className="text-xs text-muted-foreground">{L(lang, "Your initial forecast was received. Round 2 (Delphi Consensus) opens when 80% of regional experts respond.", "Votre estimation initiale a été reçue. Le 2e tour ouvrira dès que 80% des experts auront répondu.")}</p>
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-accent/30 p-3 text-center">
        <p className="text-xs font-bold text-muted-foreground">{L(lang, "Your Round 1 Independent Estimate", "Votre estimation du 1er tour")}</p>
        <p className="font-display text-3xl text-navy">{first !== null ? pct(lang, first) : "—"}</p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onHome}>{L(lang, "All Questions", "Toutes les questions")}</Button>
        <Button className="flex-1" onClick={() => void ex.refresh()}>{L(lang, "Check for Round 2", "Vérifier le 2e tour")}</Button>
      </div>
    </Card>
  );
}

function DelphiRound2Question(p: {
  t: T;
  lang: Lang;
  ex: Expert;
  onDone: () => void;
  onGroup: () => void;
  onHome: () => void;
}) {
  const { lang, ex, t, onDone, onGroup } = p;
  const d = ex.data!;
  const g = ex.group;
  const first = ex.own.first;
  const firstReason = ex.own.firstReason;
  const enough = !!(g && g.response_count >= MIN_GROUP && g.median !== null && g.min !== null && g.max !== null);
  const medianVal = enough && g?.median !== null ? to100(g.median) : null;
  const divergence = first !== null && medianVal !== null ? first - medianVal : null;
  const isDivergent = divergence !== null && Math.abs(divergence) >= 15;

  const [decision, setDecision] = useState<"keep" | "adjust">(isDivergent ? "keep" : "adjust");
  const [adjustedVal, setAdjustedVal] = useState<number>(first ?? 50);
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  const save = async () => {
    if (!reason.trim()) {
      setErr(L(lang, "Please provide your reasoning for this consensus round.", "Veuillez expliquer votre raisonnement pour ce tour de consensus."));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const finalProb = decision === "keep" ? (first ?? 50) : adjustedVal;
      await ex.submitRevision(finalProb, reason.trim());
      onDone();
    } catch {
      setErr(L(lang, "Couldn't record your consensus evaluation. Please try again.", "Impossible d'enregistrer votre évaluation de consensus. Veuillez réessayer."));
    } finally {
      setSaving(false);
    }
  };

  const lists: [string, string[]][] = [
    [L(lang, "Where views align", "Points d'accord"), g?.themes.agreement ?? []],
    [L(lang, "Where views differ", "Points de désaccord"), g?.themes.disagreement ?? []],
    [L(lang, "Additional context", "Contexte supplémentaire"), g?.themes.new_information ?? []],
  ];
  const hasThemes = lists.some(([, items]) => items.length > 0);

  const cases = d.similar_risks.length
    ? d.similar_risks.map((s) => ({ place: s.country, code: s.risk_id, status: s.outcome, text: s.what_happened || s.title, full: s.what_happened_full || "", title: s.title, sources: s.sources ?? [], evolution: s.evolution }))
    : t.cases;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="rounded-xl border-2 border-primary/40 bg-accent p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="risk">{L(lang, "Phase 2: Delphi Consensus Round", "Phase 2 : Tour de consensus Delphi")}</Badge>
          <span className="font-condensed text-xs font-bold text-navy">{L(lang, "Round 2 of 2", "Tour 2 sur 2")}</span>
        </div>
        <h2 className="mt-2 font-display text-2xl leading-tight text-navy">{L(lang, "Compare with peers and reach consensus", "Comparez avec les pairs et visez le consensus")}</h2>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          {L(lang,
            "Your independent Round 1 estimate was recorded. Below are anonymized group statistics and peer rationale. Please decide whether to maintain your evaluation (and explain why if you disagree with the consensus) or adjust your estimate.",
            "Votre estimation indépendante du 1er tour est enregistrée. Examinez les statistiques et arguments des pairs ci-dessous, puis choisissez de maintenir votre avis (en motivant votre désaccord) ou d'ajuster votre estimation."
          )}
        </p>
      </div>

      <button
        onClick={() => setShowEvidence(!showEvidence)}
        className="flex items-center gap-1 text-xs font-medium text-primary-strong underline"
      >
        {showEvidence
          ? L(lang, "Hide background evidence & cases", "Masquer le contexte et cas passés")
          : L(lang, "View background evidence & past cases", "Voir le contexte et cas passés")}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showEvidence ? "rotate-180" : ""}`} />
      </button>

      {/* Collapsible evidence */}
      {showEvidence && (
        <div className="space-y-4 rounded-xl border bg-secondary/20 p-4">
          <div>
            <SectionLabel>{t.changed}</SectionLabel>
            <p className="mt-1 text-sm font-medium">{d.trigger_update ? d.trigger_update.report.title : t.news}</p>
            {d.trigger_update?.report.url && (
              <a href={d.trigger_update.report.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary-strong underline">{L(lang, "Source", "Source")}</a>
            )}
          </div>
          <div>
            <SectionLabel>{t.similar}</SectionLabel>
            <CasesCarousel t={t} lang={lang} cases={cases} />
          </div>
        </div>
      )}

      {/* Group Statistics */}
      <section className="space-y-3">
        <SectionLabel>{L(lang, "Peer Consensus Statistics", "Statistiques du consensus des pairs")}</SectionLabel>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
          <StatTile label={L(lang, "Your Round 1", "Votre 1er tour")} value={first !== null ? pct(lang, first) : "—"} />
          <StatTile label={L(lang, "Group Median", "Médiane du groupe")} value={enough ? pct(lang, medianVal!) : "—"} />
          <div className="col-span-2 rounded-md bg-secondary/60 p-3 text-foreground sm:col-span-1">
            <p className="text-xs font-bold leading-tight">{L(lang, "Panel Range", "Éventail du panel")}</p>
            <p className="mt-1 font-display text-2xl leading-none">
              {enough ? `${pct(lang, to100(g!.min!))}–${pct(lang, to100(g!.max!))}` : L(lang, "Collecting...", "En collecte...")}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{g?.response_count ?? 0} {L(lang, "experts answered", "experts ont répondu")}</p>
          </div>
        </div>

        {firstReason && (
          <div className="rounded-lg border bg-card p-3 text-sm">
            <span className="font-condensed text-xs font-bold uppercase tracking-wider text-muted-foreground">{L(lang, "Your Round 1 reasoning", "Votre raisonnement du 1er tour")}{colon(lang).trimEnd()}</span>
            <p className="mt-0.5 italic text-navy">“{firstReason}”</p>
          </div>
        )}

        {enough ? (
          <>
            <div className="pt-2">
              <CompareAxis lang={lang} min={to100(g!.min!)} max={to100(g!.max!)} median={medianVal!} first={first} latest={decision === "adjust" ? adjustedVal : first} />
            </div>

            {/* Divergence banner */}
            {isDivergent ? (
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-amber-950">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-xs font-black">!</span>
                  <span>{L(lang, "Notable Divergence from Group Consensus", "Divergence notable avec le consensus")} ({signedPct(lang, divergence!)})</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-amber-900/90">
                  {L(lang,
                    `Your Round 1 assessment (${first}%) is ${Math.abs(divergence!)}% ${divergence! > 0 ? "higher" : "lower"} than the group median (${medianVal}%). If you maintain your view, articulating what factors the consensus underweights provides crucial ground-truth signal for ACAPS.`,
                    `Votre évaluation du 1er tour (${first} %) est de ${Math.abs(divergence!)} % plus ${divergence! > 0 ? "élevée" : "basse"} que la médiane (${medianVal} %). Expliquer vos raisons apporte un éclairage crucial à ACAPS.`
                  )}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-xs font-black">✓</span>
                  <span>{L(lang, "Close to Group Consensus", "Proche du consensus du groupe")} ({divergence !== null ? signedPct(lang, divergence) : "—"})</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-emerald-900/90">
                  {L(lang,
                    `Your initial evaluation (${first}%) aligns closely with the panel median (${medianVal}%).`,
                    `Votre évaluation initiale (${first} %) est proche de la médiane du panel (${medianVal} %).`
                  )}
                </p>
              </div>
            )}
          </>
        ) : (
          <Card className="p-4 text-sm text-muted-foreground">
            {L(lang, "Group statistics will populate once at least 5 experts contribute.", "Les statistiques du groupe apparaîtront dès que 5 experts auront contribué.")} ({g?.response_count ?? 0}/5)
          </Card>
        )}
      </section>

      {/* AI summary */}
      {hasThemes && (
        <section className="space-y-3">
          <SectionLabel>{L(lang, "AI Summary of Peer Arguments", "Synthèse IA des arguments des pairs")}</SectionLabel>
          {lists.filter(([, items]) => items.length > 0).map(([title, items]) => (
            <div key={title} className="space-y-1.5">
              <p className="font-condensed text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
              <ul className="space-y-1.5">
                {items.map((it) => (
                  <li key={it} className="rounded border bg-card px-3 py-2 text-sm leading-snug">{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* Decision area */}
      <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs">
        <SectionLabel>{L(lang, "Your Delphi Consensus Decision", "Votre décision de consensus Delphi")}</SectionLabel>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={L(lang, "Delphi decision", "Décision Delphi")}>
          <button
            type="button"
            role="radio"
            aria-checked={decision === "keep"}
            onClick={() => { setDecision("keep"); setErr(null); }}
            className={`min-h-12 rounded-lg border-2 p-3 text-center transition-all ${
              decision === "keep" ? "border-primary bg-accent font-bold text-navy" : "border-input bg-card text-muted-foreground hover:bg-secondary/40"
            }`}
          >
            <span className="block text-sm">{L(lang, "Keep evaluation", "Conserver mon avis")}</span>
            <span className="font-display text-lg text-primary-strong">{pct(lang, first ?? 50)}</span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={decision === "adjust"}
            onClick={() => { setDecision("adjust"); setErr(null); }}
            className={`min-h-12 rounded-lg border-2 p-3 text-center transition-all ${
              decision === "adjust" ? "border-primary bg-accent font-bold text-navy" : "border-input bg-card text-muted-foreground hover:bg-secondary/40"
            }`}
          >
            <span className="block text-sm">{L(lang, "Adjust evaluation", "Ajuster mon avis")}</span>
            <span className="font-display text-lg text-primary-strong">{decision === "adjust" ? pct(lang, adjustedVal) : L(lang, "Revise %", "Réviser %")}</span>
          </button>
        </div>

        {decision === "keep" ? (
          <div className="space-y-3 pt-2">
            <div className="rounded-lg bg-secondary/40 p-3 text-sm">
              <p className="font-bold text-navy">{L(lang, "Maintaining your estimate at", "Maintien de votre estimation à")} {pct(lang, first ?? 50)}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {isDivergent
                  ? L(lang,
                      "Since your estimate differs from the group consensus, please explain why you maintain your evaluation. What evidence or local indicators does the general consensus overlook?",
                      "Votre estimation différant du consensus, veuillez expliquer pourquoi vous la maintenez. Quels facteurs le groupe néglige-t-il ?"
                    )
                  : L(lang,
                      "Please confirm the key reasons supporting your evaluation in light of peer perspectives.",
                      "Veuillez confirmer vos raisons principales à la lumière des avis des pairs."
                    )}
              </p>
            </div>
            <div>
              <label htmlFor="keep-reason" className="block text-sm font-bold text-navy">
                {isDivergent
                  ? L(lang, "Why do you disagree with the consensus? (required)", "Pourquoi êtes-vous en désaccord avec le consensus ? (requis)")
                  : L(lang, "Rationale for maintaining your estimate (required)", "Justification du maintien de votre estimation (requis)")}
              </label>
              <textarea
                id="keep-reason"
                maxLength={280}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={isDivergent ? L(lang, "e.g., Local market blockades indicate the consensus underestimates supply disruptions...", "ex. : Des blocages locaux indiquent que le consensus sous-estime...") : L(lang, "e.g., Confirmed by consistent peer reports and security dynamics...", "ex. : Confirmé par les rapports des pairs...")}
                className="mt-2 w-full rounded-md border-2 bg-card p-3 text-base focus:border-primary focus:outline-none"
              />
              <p className={`text-right font-condensed text-xs ${280 - reason.length < 20 ? "font-bold text-risk" : "text-muted-foreground"}`}>{reason.length}/280</p>
            </div>
            {err && <p className="text-sm font-medium text-risk">{err}</p>}
            <Button className="h-14 w-full text-lg" disabled={saving} onClick={() => void save()}>
              {saving ? "…" : L(lang, `Confirm & Submit Final (${pct(lang, first ?? 50)})`, `Confirmer et soumettre (${pct(lang, first ?? 50)})`)}
            </Button>
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            <section>
              <label htmlFor="adjust-likely" className="text-sm font-bold text-navy">
                {L(lang, "Adjusted probability estimate", "Estimation de probabilité ajustée")}
              </label>
              <div className="mt-1 flex items-baseline justify-center gap-3">
                <span className="font-display text-5xl leading-none text-primary-strong">{pct(lang, adjustedVal)}</span>
                <span className="font-condensed text-xs font-bold text-muted-foreground">
                  ({signedPct(lang, adjustedVal - (first ?? 50))} {L(lang, "from Round 1", "par rapport au 1er tour")}
                  {medianVal !== null && ` · ${signedPct(lang, adjustedVal - medianVal)} ${L(lang, "vs median", "par rapport à la médiane")}`})
                </span>
              </div>
              <input
                id="adjust-likely"
                type="range"
                min={0}
                max={100}
                step={5}
                value={adjustedVal}
                onChange={(e) => setAdjustedVal(+e.target.value)}
                className="acaps-range mt-3 h-3 w-full cursor-pointer"
              />
              <div className="mt-1 flex justify-between font-condensed text-xs text-muted-foreground">
                <span>0 · {t.veryUnlikely}</span>
                {medianVal !== null && <span className="font-bold text-navy">{L(lang, `Median: ${medianVal}%`, `Médiane : ${medianVal} %`)}</span>}
                <span>{t.veryLikely} · 100</span>
              </div>
            </section>
            <div>
              <label htmlFor="adjust-reason" className="block text-sm font-bold text-navy">
                {L(lang, "What influenced your adjustment towards consensus? (required)", "Qu'est-ce qui a motivé votre ajustement vers le consensus ? (requis)")}
              </label>
              <textarea
                id="adjust-reason"
                maxLength={280}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={L(lang, "e.g., Peer arguments regarding troop deployments convinced me the likelihood is lower...", "ex. : Les arguments des pairs sur les déploiements ont motivé mon réajustement...")}
                className="mt-2 w-full rounded-md border-2 bg-card p-3 text-base focus:border-primary focus:outline-none"
              />
              <p className={`text-right font-condensed text-xs ${280 - reason.length < 20 ? "font-bold text-risk" : "text-muted-foreground"}`}>{reason.length}/280</p>
            </div>
            {err && <p className="text-sm font-medium text-risk">{err}</p>}
            <Button className="h-14 w-full text-lg" disabled={saving} onClick={() => void save()}>
              {saving ? "…" : L(lang, `Submit Adjusted Evaluation (${pct(lang, adjustedVal)})`, `Soumettre l'évaluation ajustée (${pct(lang, adjustedVal)})`)}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function Question(p: {
  t: T;
  lang: Lang;
  ex: Expert;
  answer: number;
  setAnswer: (n: number) => void;
  reason: string;
  setReason: (s: string) => void;
  onSubmitted: () => void;
  onGroup: () => void;
  onHome?: () => void;
}) {
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

  // Completed both rounds, or closed after answering
  if (d.revised || (closed && d.answered)) {
    return (
      <div className="space-y-6">
        <QuestionHeaderCarousel lang={lang} ex={ex} />
        <DelphiCompletedCard lang={lang} ex={ex} onGroup={p.onGroup} onHome={p.onHome ?? p.onGroup} />
      </div>
    );
  }

  // Answered Round 1, waiting for Round 2 to open (below 80% threshold)
  if (d.answered && d.question.delphi_round === 1) {
    return (
      <div className="space-y-6">
        <QuestionHeaderCarousel lang={lang} ex={ex} />
        <DelphiWaitingCard lang={lang} ex={ex} onGroup={p.onGroup} onHome={p.onHome ?? p.onGroup} />
      </div>
    );
  }

  // Round 2 (Delphi consensus phase):
  if (d.answered && !closed) {
    return (
      <div className="space-y-6">
        <QuestionHeaderCarousel lang={lang} ex={ex} />
        <DelphiRound2Question
          t={t}
          lang={lang}
          ex={ex}
          onDone={() => void ex.refresh()}
          onGroup={p.onGroup}
          onHome={p.onHome ?? p.onGroup}
        />
      </div>
    );
  }

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
      {!closed && (
        <div className="rounded-lg border border-primary/30 bg-accent/60 p-3 text-sm">
          <div className="flex items-center gap-2 font-bold text-navy">
            <Badge tone="risk">{L(lang, "Round 1 of 2", "1er tour sur 2")}</Badge>
            <span>{L(lang, "Independent Assessment", "Évaluation indépendante")}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {L(lang,
              "Give your independent forecast without seeing peer answers. Round 2 opens once most of the panel has answered: you'll then see the group's view and can keep or adjust yours.",
              "Donnez votre estimation indépendante sans voir les réponses des autres. Le 2e tour s'ouvre quand la majorité du panel a répondu : vous verrez alors l'avis du groupe et pourrez maintenir ou ajuster le vôtre."
            )}
          </p>
        </div>
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
                ? [update.region_match && update.matched_place ? L(lang, `Reporting near ${update.matched_place} (place-name match)`, `Informations près de ${update.matched_place} (correspondance de lieu)`) : L(lang, `Related reporting in ${d.risk.country}`, `Informations liées : ${countryName(lang, d.risk.country)}`), update.report.source, fmtDate(lang, update.report.published_at)].filter(Boolean).join(" · ")
                : t.newsMeta}
            </p>
            {update?.report.url && <a href={update.report.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary-strong underline">{L(lang, "Source", "Source")}</a>}
          </div></div>
        </Card>
      </section>
      <section>
        <SectionLabel>{t.similar}</SectionLabel>
        <CasesCarousel t={t} lang={lang} cases={cases} />
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

function CasesCarousel({ t, lang, cases }: { t: T; lang: Lang; cases: Case[] }) {
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
                <p className="text-2xl font-medium text-navy">{countryName(lang, c.place)}</p>
                <p className="font-condensed text-xs text-muted-foreground">{c.code} · {term(lang, c.status)}</p>
                {expanded === i && c.title && <p className="mt-3 font-bold leading-snug">{c.title}</p>}
                {expanded === i && c.evolution && (c.evolution.hazard_materialisation || c.evolution.impact_materialisation || c.evolution.rationale_update) ? (
                  <div className="mt-3 space-y-3">
                    <p className="font-condensed text-xs font-bold uppercase tracking-widest text-muted-foreground">{L(lang, "How it evolved", "Évolution")}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="muted">{L(lang, "Outcome", "Résultat")}{colon(lang)}{term(lang, c.status)}</Badge>
                      {c.evolution.what_materialised && <Badge tone="muted">{L(lang, "Materialised", "Matérialisé")}{colon(lang)}{term(lang, c.evolution.what_materialised)}</Badge>}
                      {c.evolution.trend && <Badge tone="muted">{L(lang, "Trend", "Tendance")}{colon(lang)}{term(lang, c.evolution.trend)}</Badge>}
                    </div>
                    {([[L(lang, "Hazard", "Aléa"), c.evolution.hazard_materialisation], [L(lang, "Impact", "Impact"), c.evolution.impact_materialisation], [L(lang, "Updates", "Mises à jour"), c.evolution.rationale_update]] as const)
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
                {(c.full || c.title) && <button onClick={() => setExpanded(expanded === i ? null : i)} aria-expanded={expanded === i} className="mt-2 flex min-h-11 items-center gap-1 text-sm font-medium text-primary-strong">{expanded === i ? L(lang, "Show less", "Réduire") : L(lang, "Read the full case", "Lire le cas complet")}<ChevronDown className={`h-4 w-4 transition-transform ${expanded === i ? "rotate-180" : ""}`} /></button>}
              </div>
              {expanded === i && !!c.sources?.length && (
                <div className="mt-3 space-y-1 border-t pt-2">
                  <p className="font-condensed text-xs text-muted-foreground">{L(lang, "Sources", "Sources")}</p>
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
        <button onClick={() => go(idx - 1)} disabled={idx === 0} aria-label={L(lang, "Previous case", "Cas précédent")} className="flex h-11 w-11 items-center justify-center rounded-full border bg-card disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
        <div className="flex gap-2">
          {cases.map((c, i) => (
            <button key={c.code + i} onClick={() => go(i)} aria-label={countryName(lang, c.place)} className={`h-2.5 rounded-full transition-all ${i === idx ? "w-6 bg-primary" : "w-2.5 bg-input"}`} />
          ))}
        </div>
        <button onClick={() => go(idx + 1)} disabled={idx === cases.length - 1} aria-label={L(lang, "Next case", "Cas suivant")} className="flex h-11 w-11 items-center justify-center rounded-full border bg-card disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
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
        {!d.revised && !closed && (
          <Button className="h-14 w-full text-lg" onClick={onQuestion}>
            {L(lang, "Delphi Round 2 (Keep or Adjust)", "Décision 2e tour Delphi (Conserver ou ajuster)")}
          </Button>
        )}
        {d.revised ? (
          <>
            <p className="text-center text-sm text-muted-foreground">{L(lang, "You've completed both Delphi rounds.", "Vous avez terminé les deux tours Delphi.")}</p>
            <Button className="h-14 w-full text-lg" onClick={() => setView("done")}>{L(lang, "View Consensus Receipt", "Voir le reçu de consensus")}</Button>
          </>
        ) : !closed && (
          <Button variant="outline" className="h-14 w-full text-lg" onClick={() => setView("revise")}>{L(lang, "Revise my estimate", "Réviser mon estimation")}</Button>
        )}
        <Button variant="ghost" className="w-full" onClick={onQuestion}>{L(lang, "View context & background", "Voir le contexte et l'historique")}</Button>
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
      <div className="mt-2 flex justify-between font-condensed text-xs text-muted-foreground"><span>{pct(lang, 0)}</span><span>{pct(lang, 50)}</span><span>{pct(lang, 100)}</span></div>
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
            <p className="font-condensed text-sm text-muted-foreground">{L(lang, "Expert panel", "Panel d'experts")}{s?.country ? ` · ${countryName(lang, s.country)}` : ""}</p>
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

