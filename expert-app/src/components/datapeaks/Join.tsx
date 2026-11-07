import { useEffect, useState } from "react";
import { Check, Link2Off, Loader2, MapPin, WifiOff } from "lucide-react";
import { api, ApiError, setToken } from "@/lib/api";
import { dict } from "./i18n";
import { Button, Card, LangToggle, Wordmark, type Lang } from "./shared";
import { Eyebrow, PrivacyPicker, toApiPrivacy, type Privacy } from "./PhoneApp";

const L = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);

type State = "loading" | "ready" | "invalid" | "used" | "offline" | "joined";

/**
 * Activation from the invitation email (/?join=TOKEN). Kept to the minimum: the only choice is how
 * visible the expert is. Country comes from the invite; nickname, other country panels and the rest
 * are set later in the app. On success the expert's personal link becomes this tab's sign-in.
 */
export function Join({
  joinToken,
  lang,
  setLang,
  onDone,
}: {
  joinToken: string;
  lang: Lang;
  setLang: (l: Lang) => void;
  onDone: () => void;
}) {
  const t = dict[lang];
  const [state, setState] = useState<State>("loading");
  const [country, setCountry] = useState("");
  const [privacy, setPrivacy] = useState<Privacy>("nickname");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pseudonym, setPseudonym] = useState("");
  const [appLink, setAppLink] = useState<string | null>(null); // Shown only when the email didn't go out
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setState("loading");
    try {
      setCountry((await api.getJoin(joinToken)).country);
      setState("ready");
    } catch (e) {
      setState(
        e instanceof ApiError
          ? e.status === 404
            ? "invalid"
            : e.status === 409
              ? "used"
              : "offline"
          : "offline",
      );
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinToken]);

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.join(joinToken, {
        anonymity_level: toApiPrivacy[privacy],
        language: lang,
      });
      setToken(r.token);
      setPseudonym(r.pseudonym);
      setAppLink(r.link_emailed ? null : r.app_link);
      setState("joined");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setState("used");
      else
        setError(
          L(
            lang,
            "Couldn't activate. Check your connection and try again.",
            "Activation impossible. Vérifiez votre connexion et réessayez.",
          ),
        );
    } finally {
      setBusy(false);
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
          {L(lang, "Join the panel", "Rejoindre le panel")}
        </p>
        <p className="line-clamp-1 text-xs opacity-80">
          {L(lang, "One choice, under a minute", "Un seul choix, moins d'une minute")}
        </p>
        <span className="absolute -bottom-1 left-5 h-1.5 w-10 bg-primary" />
      </div>
      <main className="flex-1 overflow-y-auto px-5 py-6">
        {state === "loading" && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {L(lang, "Loading…", "Chargement…")}
          </div>
        )}

        {state === "invalid" && (
          <Card className="space-y-3 p-5">
            <Link2Off className="h-6 w-6 text-primary" />
            <h2 className="text-lg font-bold">
              {L(
                lang,
                "This invitation link doesn't work",
                "Ce lien d'invitation ne fonctionne pas",
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              {L(
                lang,
                "Ask your ACAPS contact to send a new invitation.",
                "Demandez une nouvelle invitation à votre contact ACAPS.",
              )}
            </p>
          </Card>
        )}

        {state === "used" && (
          <Card className="space-y-3 p-5">
            <Check className="h-6 w-6 text-primary" />
            <h2 className="text-lg font-bold">
              {L(lang, "This invitation was already used", "Cette invitation a déjà été utilisée")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {L(
                lang,
                "Open the app with your personal link instead. If you lost it, ask your ACAPS contact.",
                "Ouvrez l'application avec votre lien personnel. Si vous l'avez perdu, contactez ACAPS.",
              )}
            </p>
          </Card>
        )}

        {state === "offline" && (
          <Card className="space-y-3 p-5">
            <WifiOff className="h-6 w-6 text-primary" />
            <h2 className="text-lg font-bold">
              {L(lang, "Couldn't reach ACAPS", "Impossible de joindre ACAPS")}
            </h2>
            <Button variant="outline" className="w-full" onClick={() => void load()}>
              {L(lang, "Try again", "Réessayer")}
            </Button>
          </Card>
        )}

        {state === "ready" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h1 className="font-display text-4xl leading-none text-navy">
                {L(lang, "Welcome", "Bienvenue")}
              </h1>
              <p className="text-muted-foreground">
                {L(
                  lang,
                  "ACAPS will send you a short question when a risk in your country starts to shift. About 2 minutes each.",
                  "ACAPS vous enverra une courte question quand un risque dans votre pays évolue. Environ 2 minutes à chaque fois.",
                )}
              </p>
              <p className="flex items-center gap-1 font-condensed text-sm text-navy">
                <MapPin className="h-4 w-4" />
                {L(lang, "Panel", "Panel")}: {country}
              </p>
            </div>
            <section className="space-y-3">
              <Eyebrow>
                {L(lang, "How visible do you want to be?", "Quelle visibilité souhaitez-vous ?")}
              </Eyebrow>
              <PrivacyPicker t={t} value={privacy} onChange={setPrivacy} />
            </section>
            {error && (
              <p className="text-sm text-risk" role="alert">
                {error}
              </p>
            )}
            <Button className="h-14 w-full text-lg" onClick={() => void activate()}>
              {busy
                ? L(lang, "Activating…", "Activation…")
                : L(lang, "Activate my place", "Activer ma place")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {L(
                lang,
                "You get a nickname automatically. You can change it, and everything else, in your profile.",
                "Un pseudonyme vous est attribué. Vous pourrez le modifier, comme le reste, dans votre profil.",
              )}
            </p>
          </div>
        )}

        {state === "joined" && (
          <div className="flex flex-col items-center pt-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-9 w-9" />
            </div>
            <h1 className="mt-6 text-2xl font-bold leading-snug text-navy">
              {L(lang, "You're on the panel.", "Vous faites partie du panel.")}
            </h1>
            {privacy !== "anonymous" && (
              <p className="mt-3 font-condensed">
                {L(lang, "Your nickname", "Votre pseudonyme")}: <b>{pseudonym}</b>
              </p>
            )}
            {appLink === null ? (
              <p className="mt-3 text-muted-foreground">
                {L(
                  lang,
                  "We've emailed you your personal link. Keep that email: it opens your questions any time.",
                  "Nous vous avons envoyé votre lien personnel par e-mail. Gardez-le : il ouvre vos questions à tout moment.",
                )}
              </p>
            ) : (
              <div className="mt-4 w-full space-y-2 text-left">
                <p className="text-sm font-bold">
                  {L(lang, "Save your personal link", "Gardez votre lien personnel")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {L(
                    lang,
                    "It opens your questions any time. Don't share it: it signs you in.",
                    "Il ouvre vos questions à tout moment. Ne le partagez pas : il vous connecte.",
                  )}
                </p>
                <p className="break-all rounded-md border bg-card p-3 font-mono text-xs">
                  {appLink}
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    void navigator.clipboard?.writeText(appLink).then(
                      () => setCopied(true),
                      () => undefined,
                    )
                  }
                >
                  {copied ? L(lang, "Copied", "Copié") : L(lang, "Copy link", "Copier le lien")}
                </Button>
              </div>
            )}
            <Button className="mt-6 h-14 w-full text-lg" onClick={onDone}>
              {L(lang, "Open the app", "Ouvrir l'application")}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
