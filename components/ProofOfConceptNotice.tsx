// components/ProofOfConceptNotice.tsx
//
// Shown on the public entry points (landing page, account recovery) so visitors
// know what they are looking at before they create an account. The deployed
// instance is a thesis prototype, not a product: accounts are anonymous and
// unrecoverable by design, and the data set may be reset without warning.
import { Badge } from "@/components/ui/badge";

export function ProofOfConceptNotice() {
  return (
    <section
      aria-labelledby="poc-notice-heading"
      className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
    >
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="secondary">Proof of Concept</Badge>
        <h2 id="poc-notice-heading" className="font-medium text-foreground">
          Prototyp aus einer Bachelorarbeit
        </h2>
      </div>
      <p>
        Lunch Match ist eine Machbarkeitsstudie und kein fertiges Produkt. Die Anwendung
        wird zu Demonstrationszwecken betrieben, kann jederzeit offline gehen, und der
        Datenbestand wird gelegentlich zurückgesetzt.
      </p>
      <p className="mt-2">
        Konten sind bewusst anonym: ohne E-Mail-Adresse, ohne Passwort — und ohne
        Möglichkeit, den Zugang wiederherzustellen, wenn der Recovery-Key verloren geht.
        Bitte hinterlege hier keine Daten, die dir wichtig sind.
      </p>
    </section>
  );
}
