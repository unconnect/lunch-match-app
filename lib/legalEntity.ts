// lib/legalEntity.ts
//
// Who operates this deployment. Both the Impressum (§ 5 DDG) and the
// "Verantwortlicher" section of the Datenschutzerklärung (Art. 13 DSGVO) read
// from here, so the details exist in exactly one place and cannot drift apart.
//
// ────────────────────────────────────────────────────────────────────────────
// THESE ARE PLACEHOLDERS. Fill them in before the app is publicly reachable.
// While `isPlaceholder` is true, both legal pages render a visible warning
// instead of pretending to be valid — a wrong Impressum is worse than an
// obviously unfinished one.
// ────────────────────────────────────────────────────────────────────────────

export interface LegalEntity {
  /** Full legal name of the operator (natural person or company). */
  name: string;
  /** Street and number — a PO box does not satisfy § 5 DDG. */
  street: string;
  /** Postal code and city. */
  city: string;
  country: string;
  /** Address for electronic contact. Required. */
  email: string;
  /** Optional. Leave empty to omit the line entirely. */
  phone?: string;
  /** Optional: USt-IdNr. per § 27a UStG, if one exists. */
  vatId?: string;
  /**
   * Whether the above are still placeholders. Flip to false once the real
   * details are in — nothing else keys off it.
   */
  isPlaceholder: boolean;
}

export const LEGAL_ENTITY: LegalEntity = {
  name: "TODO: vollständiger Name",
  street: "TODO: Straße und Hausnummer",
  city: "TODO: PLZ und Ort",
  country: "Deutschland",
  email: "TODO: kontakt@example.org",
  phone: undefined,
  vatId: undefined,
  isPlaceholder: true,
};
