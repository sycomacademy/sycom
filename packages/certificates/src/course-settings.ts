import {
  CERTIFICATE_TEMPLATE_IDS,
  type CertificateTemplateId,
  isCertificateTemplateId,
  isLegacyCertificateTemplateId,
} from "./meta";
import type { CertificatePdfPayload } from "./types";

export type CourseCertificateKeywords = {
  awardHeadline?: string;
  certifyPhrase?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  issuerLine?: string;
  footnoteLine?: string;
};

export type CourseCertificateSettings = {
  templateId: CertificateTemplateId;
  keywords?: CourseCertificateKeywords;
};

export type CertificateIssueFacts = Pick<
  CertificatePdfPayload,
  "recipientName" | "courseTitle" | "certificateNumber" | "issuedAt"
>;

/** Best-effort parse of JSON from `course.certificate_settings` (null → invalid shapes). */
export function parseCourseCertificateSettings(raw: unknown): CourseCertificateSettings | null {
  if (raw == null || typeof raw !== "object") {
    return null;
  }

  const o = raw as Record<string, unknown>;
  const templ = o.templateId;
  if (typeof templ !== "string") {
    return null;
  }

  let templateId: CertificateTemplateId;
  if (isCertificateTemplateId(templ)) {
    templateId = templ;
  } else if (isLegacyCertificateTemplateId(templ)) {
    templateId = CERTIFICATE_TEMPLATE_IDS[0];
  } else {
    return null;
  }

  const kr = o.keywords;
  let keywords: CourseCertificateKeywords | undefined;
  if (kr != null && typeof kr === "object") {
    const k = kr as Record<string, unknown>;
    const next: CourseCertificateKeywords = {};
    const assign = (key: keyof CourseCertificateKeywords) => {
      const v = k[key];
      if (typeof v === "string" && v.trim() !== "") {
        next[key] = v;
      }
    };
    assign("awardHeadline");
    assign("certifyPhrase");
    assign("signatoryName");
    assign("signatoryTitle");
    assign("issuerLine");
    assign("footnoteLine");
    if (Object.keys(next).length > 0) {
      keywords = next;
    }
  }

  return { templateId, keywords };
}

/**
 * Builds args for {@link renderCertificatePdf} using stored course JSONB + issuance facts.
 * Unknown/missing settings fall back to the first catalog template ID and omit keyword overrides.
 */
export function mergeCertificatePdfPayload(
  courseSettings: unknown | null | undefined,
  issue: CertificateIssueFacts,
): { templateId: CertificateTemplateId; payload: CertificatePdfPayload } {
  const parsed = parseCourseCertificateSettings(courseSettings);
  const templateId = parsed?.templateId ?? CERTIFICATE_TEMPLATE_IDS[0];
  const k = parsed?.keywords;
  return {
    templateId,
    payload: {
      ...issue,
      awardHeadline: k?.awardHeadline,
      certifyPhrase: k?.certifyPhrase,
      signatoryName: k?.signatoryName,
      signatoryTitle: k?.signatoryTitle,
      issuerLine: k?.issuerLine,
      footnoteLine: k?.footnoteLine,
    },
  };
}
