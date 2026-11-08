import { useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { api, ApiError, setToken } from "@/lib/api";
import { Button, Card, LangToggle, Wordmark, type Lang } from "./shared";

const L = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);

/** The token in a pasted sign-in link (…/?token=…), or the bare token itself. */
function tokenFromPaste(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  try {
    const t = new URL(value).searchParams.get("token");
    if (t) return t;
  } catch {
    /* not a URL: maybe the bare token */
  }
  return /^[A-Za-z0-9_-]{8,}$/.test(value) ? value : null;
}

/**
 * Passwordless sign-in: the expert types their email and we send their personal link. The API
 * answers the same for known and unknown addresses, so this screen never says which it was.
 */
export function SignIn({
  lang,
  setLang,
  notice,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  notice?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  // Inside the Android app the email link may open in the browser instead: let the expert paste it.
  const [inApp, setInApp] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  useEffect(() => setInApp(/DataPeaksApp\//.test(navigator.userAgent)), []);

  const usePasted = () => {
    const token = tokenFromPaste(pasted);
    if (!token) {
      setPasteError(
        L(
          lang,
          "That doesn't look like the sign-in link from the email.",
          "Cela ne ressemble pas au lien de connexion de l'e-mail.",
        ),
      );
      return;
    }
    setToken(token);
    window.location.replace("/");
  };

  const send = async () => {
    const value = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setError(
        L(
          lang,
          "Enter the email address ACAPS invited.",
          "Saisissez l'adresse e-mail invitée par ACAPS.",
        ),
      );
      return;
    }
    setError(null);
    setState("sending");
    try {
      await api.requestLoginLink(value);
      setState("sent");
    } catch (e) {
      setState("idle");
      setError(
        e instanceof ApiError && e.status === 429
          ? L(
              lang,
              "Too many tries. Wait a few minutes and try again.",
              "Trop d'essais. Patientez quelques minutes et réessayez.",
            )
          : L(
              lang,
              "Couldn't reach ACAPS. Check your connection and try again.",
              "Impossible de joindre ACAPS. Vérifiez votre connexion et réessayez.",
            ),
      );
    }
  };

  return (
    <div className="mx-auto flex min-h-[760px] w-full max-w-[420px] flex-col overflow-hidden bg-background sm:rounded-2xl sm:border-8 sm:border-foreground sm:shadow-xl">
      <header className="flex items-center justify-between bg-card px-4 pt-3 pb-2 text-navy">
        <Wordmark size="sm" tagline={false} />
        <LangToggle lang={lang} setLang={setLang} />
      </header>
      <div className="relative bg-foreground px-5 py-2.5 text-background">
        <p className="font-display text-2xl leading-none tracking-wide">
          {L(lang, "Sign in", "Connexion")}
        </p>
        <p className="line-clamp-1 text-xs opacity-80">
          {L(lang, "ACAPS expert panel", "Panel d'experts ACAPS")}
        </p>
        <span className="absolute -bottom-1 left-5 h-1.5 w-10 bg-primary" />
      </div>
      <main className="flex-1 overflow-y-auto px-5 py-6">
        {state === "sent" ? (
          <Card className="space-y-3 p-5">
            <Mail className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-bold">
              {L(lang, "Check your email", "Consultez vos e-mails")}
            </h1>
            <p className="text-sm text-muted-foreground" role="status">
              {L(
                lang,
                `If ${email.trim()} belongs to a panel member, a sign-in link is on its way. It can take a minute; check your spam folder too.`,
                `Si ${email.trim()} appartient à un membre du panel, un lien de connexion est en route. Cela peut prendre une minute ; vérifiez aussi vos indésirables.`,
              )}
            </p>
            {inApp && (
              <form
                className="space-y-2 border-t pt-3"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  usePasted();
                }}
              >
                <label htmlFor="signin-paste" className="font-condensed text-sm text-navy">
                  {L(
                    lang,
                    "Did the link open in your browser? Copy it and paste it here:",
                    "Le lien s'est ouvert dans le navigateur ? Copiez-le et collez-le ici :",
                  )}
                </label>
                <input
                  id="signin-paste"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  className="h-12 w-full rounded-md border-2 border-input bg-card px-3 text-base outline-none focus:border-navy"
                  aria-invalid={pasteError ? true : undefined}
                  aria-describedby={pasteError ? "signin-paste-error" : undefined}
                />
                {pasteError && (
                  <p id="signin-paste-error" className="text-sm text-risk" role="alert">
                    {pasteError}
                  </p>
                )}
                <Button className="w-full">
                  {L(lang, "Sign in with this link", "Se connecter avec ce lien")}
                </Button>
              </form>
            )}
            <Button variant="outline" className="w-full" onClick={() => setState("idle")}>
              {L(lang, "Use another email", "Utiliser une autre adresse")}
            </Button>
          </Card>
        ) : (
          <form
            className="space-y-6"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <div className="space-y-2">
              <h1 className="font-display text-4xl leading-none text-navy">
                {L(lang, "Welcome back", "Bon retour")}
              </h1>
              <p className="text-muted-foreground">
                {L(
                  lang,
                  "Enter the email ACAPS invited and we'll send you a link that signs you in. No password needed.",
                  "Saisissez l'adresse e-mail invitée par ACAPS : nous vous enverrons un lien de connexion. Aucun mot de passe.",
                )}
              </p>
            </div>
            {notice && (
              <p
                className="rounded-md border border-risk/40 bg-card p-3 text-sm text-risk"
                role="alert"
              >
                {notice}
              </p>
            )}
            <div className="space-y-2">
              <label htmlFor="signin-email" className="font-condensed text-sm text-navy">
                {L(lang, "Email", "E-mail")}
              </label>
              <input
                id="signin-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 w-full rounded-md border-2 border-input bg-card px-3 text-base outline-none focus:border-navy"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "signin-error" : undefined}
              />
              {error && (
                <p id="signin-error" className="text-sm text-risk" role="alert">
                  {error}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={state === "sending"}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-navy px-4 font-display text-lg uppercase tracking-wide text-navy-foreground hover:opacity-90 disabled:opacity-60"
            >
              {state === "sending" && <Loader2 className="h-5 w-5 animate-spin" />}
              {L(lang, "Email me a sign-in link", "M'envoyer un lien de connexion")}
            </button>
            <p className="text-xs text-muted-foreground">
              {L(
                lang,
                "Not on the panel yet? ACAPS invites experts by email.",
                "Pas encore membre ? ACAPS invite les experts par e-mail.",
              )}
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
