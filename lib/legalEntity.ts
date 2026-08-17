// lib/legalEntity.ts
//
// Who operates this deployment. Both the Impressum (§ 5 DDG) and the
// "Verantwortlicher" section of the Datenschutzerklärung (Art. 13 DSGVO) read
// from here, so the details exist in exactly one place and cannot drift apart.
//
// If these ever go back to placeholder values, set `isPlaceholder` to true with
// them: both legal pages then render a visible warning instead of pretending to
// be valid, because a wrong Impressum is worse than an obviously unfinished one.

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

// Operated privately and non-commercially: no company, no trade register entry,
// and no USt-IdNr. to list under § 27a UStG.
export const LEGAL_ENTITY: LegalEntity = {
  name: "Alexander Nikolas Reuber c/o POSTFLEX PFX-453-825",
  street: "Emsdettener Straße 10",
  city: "48268 Greven",
  country: "Deutschland",
  email: "moin@nikolasreuber.de",
  phone: undefined,
  vatId: undefined,
  isPlaceholder: false,
};
