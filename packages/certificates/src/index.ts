export {
  CERTIFICATE_TEMPLATE_IDS,
  certificateTemplateDescriptions,
  certificateTemplateLabels,
  type CertificateTemplateId,
  isCertificateTemplateId,
  isLegacyCertificateTemplateId,
  LEGACY_CERTIFICATE_TEMPLATE_IDS,
} from "./meta";
export { certificateTemplates } from "./registry";
export type {
  CertificateIssueFacts,
  CourseCertificateKeywords,
  CourseCertificateSettings,
} from "./course-settings";
export { mergeCertificatePdfPayload, parseCourseCertificateSettings } from "./course-settings";
export type { CertificatePdfPayload } from "./types";
export { renderCertificatePdf } from "./render-certificate-pdf";
export { SycomDefaultCertificate } from "./templates/sycom-default";
