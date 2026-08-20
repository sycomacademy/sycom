import { parseCourseCertificateSettings } from "@sycom/certificates/course-settings";
import { CourseCertificateEmail, render, sendEmail } from "@sycom/emails";
import { env } from "@sycom/env/server";

import { renderIssuedCertificatePdfBuffer } from "./certificate-pdf-issue";

const DEFAULT_ACADEMY_NAME = "Sycom Academy";

const issuedOnFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** `Introduction to Cybersecurity` -> `introduction-to-cybersecurity-certificate.pdf` */
function buildAttachmentFilename(courseTitle: string) {
  const slug =
    courseTitle
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "")
      .slice(0, 60) || "course";

  return `${slug}-certificate.pdf`;
}

export type SendCertificateEmailInput = {
  to: string;
  recipientName: string;
  courseTitle: string;
  certificateNumber: string;
  issuedAt: Date;
  courseCertificateSettings: unknown;
};

/**
 * Renders the course certificate PDF and emails it to the learner as an attachment.
 * Throws when Resend rejects the send so callers can avoid marking it as sent.
 */
export async function sendCourseCertificateEmail(input: SendCertificateEmailInput) {
  const pdf = await renderIssuedCertificatePdfBuffer(input.courseCertificateSettings, {
    recipientName: input.recipientName,
    courseTitle: input.courseTitle,
    certificateNumber: input.certificateNumber,
    issuedAt: input.issuedAt,
  });

  const academyName =
    parseCourseCertificateSettings(input.courseCertificateSettings)?.keywords?.awardHeadline ??
    DEFAULT_ACADEMY_NAME;

  const html = await render(
    CourseCertificateEmail({
      name: input.recipientName,
      courseTitle: input.courseTitle,
      certificateNumber: input.certificateNumber,
      issuedOn: issuedOnFormatter.format(input.issuedAt),
      academyName,
      coursesUrl: env.DASHBOARD_URL ? `${env.DASHBOARD_URL}/dashboard/courses` : undefined,
    }),
  );

  const response = await sendEmail({
    to: input.to,
    subject: `Congratulations — your ${input.courseTitle} certificate`,
    html,
    attachments: [{ filename: buildAttachmentFilename(input.courseTitle), content: pdf }],
  });

  if (response.error) {
    throw new Error(response.error.message || "Failed to send certificate email");
  }
}
