/** Client-safe catalogue of presets (no `@react-pdf/renderer` imports). */

export const CERTIFICATE_TEMPLATE_IDS = ["sycom-default"] as const;
export type CertificateTemplateId = (typeof CERTIFICATE_TEMPLATE_IDS)[number];

/** Template IDs retired in favour of `sycom-default`; stored settings are remapped on read. */
export const LEGACY_CERTIFICATE_TEMPLATE_IDS = ["minimal", "default"] as const;

export const certificateTemplateLabels: Record<CertificateTemplateId, string> = {
  "sycom-default": "Sycom default",
};

export const certificateTemplateDescriptions: Record<CertificateTemplateId, string> = {
  "sycom-default":
    "Landscape academy layout: Sycom logo and artwork, learner name, course title, signatory block, stamp, and footer with date and certificate number.",
};

export function isCertificateTemplateId(id: string): id is CertificateTemplateId {
  return (CERTIFICATE_TEMPLATE_IDS as readonly string[]).includes(id);
}

export function isLegacyCertificateTemplateId(id: string): boolean {
  return (LEGACY_CERTIFICATE_TEMPLATE_IDS as readonly string[]).includes(id);
}
