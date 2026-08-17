// components/LegalPlaceholderWarning.tsx
//
// Rendered on the legal pages while lib/legalEntity.ts still holds placeholder
// values. An Impressum with invented details is worse than a visibly
// unfinished one, so this fails loudly rather than looking plausible.
import { LEGAL_ENTITY } from "@/lib/legalEntity";

export function LegalPlaceholderWarning() {
  if (!LEGAL_ENTITY.isPlaceholder) return null;

  return (
    <div className="rounded-lg border border-destructive p-4 text-sm">
      <p className="font-medium text-destructive">Diese Angaben sind noch nicht ausgefüllt.</p>
      <p className="mt-1 text-muted-foreground">
        Die Betreiberangaben in <span className="font-mono">lib/legalEntity.ts</span> sind
        Platzhalter. Diese Seite ist damit rechtlich nicht wirksam.
      </p>
    </div>
  );
}
