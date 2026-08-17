// app/impressum/page.tsx
//
// Angaben gemäß § 5 DDG. A plain server component: there is nothing to fetch
// and nothing interactive, so the "use client" + TanStack Query pattern that
// the data-driven pages follow would only add weight here.
import type { Metadata } from "next";
import { LegalPlaceholderWarning } from "@/components/LegalPlaceholderWarning";
import { LEGAL_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = {
  title: "Impressum — Lunch Match",
};

export default function ImpressumPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Impressum</h1>

      <LegalPlaceholderWarning />

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Angaben gemäß § 5 DDG</h2>
        <address className="not-italic text-sm leading-relaxed">
          {LEGAL_ENTITY.name}
          <br />
          {LEGAL_ENTITY.street}
          <br />
          {LEGAL_ENTITY.city}
          <br />
          {LEGAL_ENTITY.country}
        </address>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Kontakt</h2>
        <p className="text-sm">
          E-Mail: <span className="font-mono">{LEGAL_ENTITY.email}</span>
          {LEGAL_ENTITY.phone && (
            <>
              <br />
              Telefon: {LEGAL_ENTITY.phone}
            </>
          )}
        </p>
      </section>

      {LEGAL_ENTITY.vatId && (
        <section className="flex flex-col gap-2">
          <h2 className="font-medium">Umsatzsteuer-Identifikationsnummer</h2>
          <p className="text-sm">
            Gemäß § 27a Umsatzsteuergesetz: <span className="font-mono">{LEGAL_ENTITY.vatId}</span>
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Art des Angebots</h2>
        <p className="text-sm leading-relaxed">
          Lunch Match ist ein nicht-kommerzieller Prototyp, der im Rahmen einer Bachelorarbeit
          entstanden ist. Die Anwendung wird ausschließlich zu Demonstrations- und
          Forschungszwecken betrieben. Es werden keine Verträge geschlossen, keine Zahlungen
          abgewickelt und keine Werbung ausgespielt.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Haftung für Inhalte</h2>
        <p className="text-sm leading-relaxed">
          Die Inhalte dieser Anwendung werden von Nutzer:innen selbst erstellt — insbesondere
          Profilangaben und Nachrichten. Für diese Inhalte ist die jeweils verfassende Person
          verantwortlich. Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf
          diesen Seiten nach den allgemeinen Gesetzen verantwortlich, nach §§ 8 bis 10 DDG jedoch
          nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen.
          Bei Bekanntwerden einer konkreten Rechtsverletzung entfernen wir die betroffenen Inhalte
          umgehend.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Verbraucherstreitbeilegung</h2>
        <p className="text-sm leading-relaxed">
          Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle teilzunehmen.
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        Wie mit personenbezogenen Daten umgegangen wird, steht in der{" "}
        <a href="/datenschutz" className="underline hover:text-foreground">
          Datenschutzerklärung
        </a>
        .
      </p>
    </main>
  );
}
