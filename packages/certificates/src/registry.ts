import {
  CERTIFICATE_TEMPLATE_IDS,
  type CertificateTemplateId,
  isCertificateTemplateId,
} from "./meta";
import type { CertificateTemplateComponent } from "./templates/types";
import { SycomDefaultCertificate } from "./templates/sycom-default";

export const certificateTemplates: Record<CertificateTemplateId, CertificateTemplateComponent> = {
  "sycom-default": SycomDefaultCertificate,
};

export { CERTIFICATE_TEMPLATE_IDS, type CertificateTemplateId, isCertificateTemplateId };
