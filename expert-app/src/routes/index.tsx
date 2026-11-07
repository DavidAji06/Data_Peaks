import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PhoneApp } from "@/components/datapeaks/PhoneApp";
import type { Lang } from "@/components/datapeaks/shared";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ACAPS expert panel app" },
      { name: "description", content: "ACAPS expert panel mobile app: experts answer short questions on emerging humanitarian crises in under 2 minutes." },
      { property: "og:title", content: "ACAPS expert panel app" },
      { property: "og:description", content: "Experts answer short questions on emerging humanitarian crises in under 2 minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const [lang, setLang] = useState<Lang>("en");
  return (
    <div className="min-h-screen bg-muted sm:py-8">
      <PhoneApp lang={lang} setLang={setLang} />
    </div>
  );
}
