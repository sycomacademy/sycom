/**
 * Data passed into every certificate PDF template. Populated at issue time.
 */
export type CertificatePdfPayload = {
  recipientName: string;
  courseTitle: string;
  certificateNumber: string;
  issuedAt: Date;
  /** Academy/organisation title printed beside the logo (default: Sycom Academy) */
  awardHeadline?: string;
  /** Line before the learner name (default: This is to certify that) */
  certifyPhrase?: string;
  /** Name printed under the signature rule */
  signatoryName?: string;
  /** Role printed under the signatory name (default: Chief Executive Officer) */
  signatoryTitle?: string;
  /** Legacy field kept so pre-existing course settings still parse; not rendered */
  issuerLine?: string;
  /** Small print at the foot of the certificate */
  footnoteLine?: string;
};
