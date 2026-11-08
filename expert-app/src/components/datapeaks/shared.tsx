import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Lang = "en" | "fr";

export function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

/** ACAPS wordmark with pointer motif. */
export function Wordmark({ tagline = true, size = "md", lang = "en" }: { tagline?: boolean; size?: "sm" | "md"; lang?: Lang }) {
  return (
    <div className="flex flex-col leading-none">
      <div className="relative inline-flex flex-col items-end" aria-label="ACAPS">
        <svg viewBox="0 0 24 30" className={size === "sm" ? "mr-[0.35em] h-5 w-4" : "mr-[0.4em] h-7 w-6"} aria-hidden>
          <path d="M12 1a11 11 0 0 1 11 11c0 7.5-11 17-11 17S1 19.5 1 12A11 11 0 0 1 12 1z" className="fill-primary" />
          <circle cx="12" cy="12" r="7" className="fill-card" />
          <circle cx="12" cy="12" r="4" className="fill-foreground" />
        </svg>
        <span className={`-mt-1 font-sans font-medium lowercase leading-none tracking-tight text-foreground ${size === "sm" ? "text-xl" : "text-3xl"}`}>acaps</span>
      </div>
      {tagline && <span className="mt-1 font-condensed text-[10px] uppercase tracking-wider opacity-80">{lang === "fr" ? "Voir la crise, changer l'issue" : "See the crisis, change the outcome"}</span>}
    </div>
  );
}

export function Badge({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "risk" | "access" | "severity" | "highlight" | "muted" }) {
  const map = {
    primary: "bg-primary text-primary-foreground",
    risk: "bg-risk text-primary-foreground",
    access: "bg-access text-foreground",
    severity: "bg-severity text-primary-foreground",
    highlight: "bg-highlight text-highlight-foreground",
    muted: "bg-secondary text-secondary-foreground",
  };
  return <span className={`inline-block rounded-sm px-2 py-0.5 font-display text-sm tracking-wide ${map[tone]}`}>{children}</span>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 flex items-center gap-2 font-display text-lg tracking-wide text-navy"><span className="h-4 w-1 bg-highlight" />{children}</h2>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-l-4 border-l-primary bg-card p-4 shadow-sm", className)}>{children}</div>;
}

export function Button({ children, onClick, variant = "primary", className = "", disabled = false }: { children: ReactNode; onClick?: (() => void) | undefined; variant?: "primary" | "outline" | "navy" | "ghost"; className?: string; disabled?: boolean }) {
  const v = {
    primary: "bg-navy text-navy-foreground hover:opacity-90 font-display text-xl font-normal uppercase tracking-wide",
    navy: "bg-navy text-navy-foreground hover:opacity-90",
    outline: "border-2 border-navy text-navy hover:bg-accent font-display text-xl font-normal uppercase tracking-wide",
    ghost: "text-primary-strong hover:bg-accent",
  };
  return <button onClick={onClick} disabled={disabled} className={cn("min-h-12 rounded-md px-4 font-bold transition-colors disabled:opacity-50", v[variant], className)}>{children}</button>;
}

export function LangToggle({ lang, setLang, dark = false }: { lang: Lang; setLang: (l: Lang) => void; dark?: boolean }) {
  return (
    <div className={`inline-flex rounded-md border p-0.5 font-condensed text-sm ${dark ? "border-navy-foreground/30" : ""}`} role="group" aria-label={lang === "fr" ? "Langue" : "Language"}>
      {(["en", "fr"] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`rounded px-2.5 py-1 font-bold ${lang === l ? "bg-highlight text-highlight-foreground" : dark ? "text-navy-foreground" : "text-muted-foreground"}`}>
          {l === "en" ? "EN" : "FR"}
        </button>
      ))}
    </div>
  );
}

export const RISK_TITLE = "Escalating cross-border insecurity linked to the Sudan conflict increases protection risks and humanitarian needs in eastern Chad";
export const ANSWERS = [
  { name: "Analyst A", first: 45, changed: 50, reason: "Army reinforcements in Adré may deter incursions." },
  { name: "Analyst B", first: 55, changed: null, reason: "Rainy season ending opens crossing routes." },
  { name: "Analyst C", first: 60, changed: 62, reason: "New checkpoints reported near Tiné this week." },
  { name: "Analyst D", first: 65, changed: 60, reason: "Refugee arrivals in Ouaddaï up sharply in October." },
  { name: "Analyst E", first: 70, changed: null, reason: "RSF advances in West Darfur push fighters to the border." },
  { name: "Anonymous expert 1", first: 80, changed: 72, reason: "Local leaders report armed groups recruiting in camps." },
];
