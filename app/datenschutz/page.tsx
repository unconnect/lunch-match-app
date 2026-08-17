// app/datenschutz/page.tsx
//
// Informationspflicht nach Art. 13 DSGVO. Kept deliberately concrete: every
// claim here matches what the code actually does, so it has to be revisited
// whenever a new field, endpoint or third-party call is added.
import type { Metadata } from "next";
import { LegalPlaceholderWarning } from "@/components/LegalPlaceholderWarning";
import { LEGAL_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — Lunch Match",
};

export default function DatenschutzPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Datenschutzerklärung</h1>

      <LegalPlaceholderWarning />

      <p>
        Lunch Match ist ein Prototyp aus einer Bachelorarbeit. Die Anwendung verarbeitet nur die
        Daten, die für die Vermittlung einer gemeinsamen Mittagspause nötig sind — und speichert
        bewusst so wenig wie möglich: keine E-Mail-Adresse, keinen Namen, kein Passwort.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">1. Verantwortlicher</h2>
        <address className="not-italic">
          {LEGAL_ENTITY.name}
          <br />
          {LEGAL_ENTITY.street}
          <br />
          {LEGAL_ENTITY.city}
          <br />
          {LEGAL_ENTITY.country}
          <br />
          E-Mail: <span className="font-mono">{LEGAL_ENTITY.email}</span>
        </address>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">2. Welche Daten verarbeitet werden</h2>
        <p>
          <strong>Konto.</strong> Bei der Registrierung wird eine zufällige Account-ID erzeugt und
          gespeichert. Vom Recovery-Key wird ausschließlich ein bcrypt-Hash gespeichert — der
          Schlüssel selbst wird einmal angezeigt und danach nirgends abgelegt.
        </p>
        <p>
          <strong>Profil (freiwillig).</strong> Alias, Standortangabe (Adresse, Postleitzahl oder
          Ort) und die daraus ermittelten Koordinaten, gewählte Standortgenauigkeit, Branche und
          ob diese sichtbar ist, Position, Karrierelevel sowie das Schritteziel.
        </p>
        <p>
          <strong>Nutzung.</strong> Match-Anfragen, Nachrichten, Treffpunkt-Vorschläge und die
          zugehörigen Zeitstempel.
        </p>
        <p>
          Es findet keine Analyse des Nutzungsverhaltens statt, es gibt kein Tracking, keine
          Werbung und keine Weitergabe zu Werbezwecken.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">3. Standortdaten und die gewählte Genauigkeit</h2>
        <p>
          Aus der eingegebenen Standortangabe werden exakte Koordinaten ermittelt. Diese werden auf
          dem Server gespeichert und dort für Entfernungs- und Radiusberechnungen genutzt.
        </p>
        <p>
          Anderen Teilnehmenden gegenüber wird der Standort nur in der selbst gewählten Genauigkeit
          sichtbar: bei <em>Genau</em> die exakte Position, bei <em>Postleitzahl</em> auf etwa
          1&nbsp;km gerundet, bei <em>Ort</em> auf etwa 11&nbsp;km gerundet. Die Vergröberung
          geschieht serverseitig, bevor Daten das System verlassen — eine exakte Koordinate wird
          niemals an jemanden übermittelt, der sie nicht sehen soll.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">4. Rechtsgrundlagen</h2>
        <p>
          Die Verarbeitung der Konto-, Profil- und Nutzungsdaten erfolgt zur Erbringung des
          angefragten Dienstes gemäß Art. 6 Abs. 1 lit. b DSGVO. Die Verarbeitung technischer
          Server-Protokolle erfolgt zur Sicherstellung des Betriebs und der Sicherheit auf
          Grundlage des berechtigten Interesses nach Art. 6 Abs. 1 lit. f DSGVO.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">5. Externe Dienste</h2>
        <p>
          <strong>Nominatim (OpenStreetMap Foundation).</strong> Zur Umwandlung der eingegebenen
          Standortangabe in Koordinaten wird diese Angabe an Nominatim übermittelt.
        </p>
        <p>
          <strong>Overpass API (OpenStreetMap).</strong> Für Treffpunktvorschläge werden
          Koordinaten des Suchbereichs an die Overpass API übermittelt.
        </p>
        <p>
          <strong>Cloudflare.</strong> Die Anwendung ist über Cloudflare erreichbar. Dabei
          verarbeitet Cloudflare technisch notwendige Verbindungsdaten, insbesondere IP-Adressen.
        </p>
        <p>
          <strong>Hosting.</strong> Die Anwendung und ihre Datenbank laufen auf einem selbst
          betriebenen Server; die Daten werden nicht an einen externen Hosting-Dienstleister
          weitergegeben. Zur Absicherung gegen Datenverlust werden regelmäßig Sicherungskopien der
          Datenbank auf lokal angeschlossenen Datenträgern erstellt.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">6. Cookies</h2>
        <p>
          Es wird ausschließlich ein technisch notwendiges Sitzungs-Cookie gesetzt, das die
          Anmeldung aufrechterhält. Es dient keiner Analyse und keinem Tracking. Ohne dieses Cookie
          ist eine Anmeldung nicht möglich.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">7. Speicherdauer und Löschung</h2>
        <p>
          Konto- und Profildaten werden gespeichert, bis das Konto gelöscht wird. Das Konto lässt
          sich jederzeit selbst löschen: unter <em>Profil → Konto löschen</em>, bestätigt durch die
          Eingabe der eigenen Account-ID.
        </p>
        <p>
          Dabei werden das Profil samt Standortdaten, alle selbst geschriebenen Nachrichten, alle
          eigenen Treffpunkt-Vorschläge sowie Account-ID und Recovery-Key unwiderruflich entfernt.
          Personen, mit denen ein Austausch bestand, sehen die Unterhaltung weiterhin — jedoch ohne
          die gelöschten Nachrichten und nur noch mit dem Hinweis, dass das Konto gelöscht wurde.
          Bestand der Austausch ausschließlich mit einem bereits gelöschten Konto, wird die
          Unterhaltung vollständig entfernt.
        </p>
        <p>
          Da es sich um einen Prototyp handelt, kann der gesamte Datenbestand zu Demonstrations-
          zwecken zurückgesetzt werden. Die als Demo gekennzeichneten Konten sind öffentlich
          zugänglich und werden regelmäßig zurückgesetzt — dort sollten keine persönlichen Angaben
          hinterlegt werden.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">8. Keine Wiederherstellung von Konten</h2>
        <p>
          Konten sind bewusst anonym. Es gibt keine E-Mail-Adresse, über die ein Zugang
          zurückgesetzt werden könnte, und der Recovery-Key liegt nur als Hash vor. Geht er
          verloren, ist der Zugang endgültig verloren — auch der Betreiber kann ihn nicht
          wiederherstellen.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">9. Rechte der betroffenen Personen</h2>
        <p>
          Es bestehen die Rechte auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung
          (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und
          Widerspruch (Art. 21 DSGVO) sowie das Recht, sich bei einer Aufsichtsbehörde zu
          beschweren.
        </p>
        <p>
          Ein praktischer Hinweis: Da keine Identifikationsmerkmale wie Name oder E-Mail-Adresse
          erhoben werden, lässt sich eine Anfrage einer Person nur über die Anmeldung im Konto
          zuordnen. Das Recht auf Löschung lässt sich deshalb am unmittelbarsten selbst ausüben —
          über <em>Profil → Konto löschen</em>.
        </p>
      </section>

      <p className="text-muted-foreground">
        Betreiberangaben siehe{" "}
        <a href="/impressum" className="underline hover:text-foreground">
          Impressum
        </a>
        .
      </p>
    </main>
  );
}
