/**
 * Optional certificate artwork hosted on the CDN.
 *
 * `@react-pdf/renderer` throws when an `<Image src>` 404s, so each asset stays
 * switched off until the file has actually been uploaded (see
 * `scripts/upload-brand-assets.ts`). Flip the flag in the same commit that adds
 * the file.
 */
export const certificateAssets = {
  /** Company seal shown bottom-right. Currently the Sycom icon mark, pending a real seal. */
  stamp: true,
  /** Handwritten signature shown above the signatory rule. */
  signature: true,
} as const;
