import { render as reactEmailRender } from "@react-email/render";
import { env } from "@sycom/env/server";
import { createLoggerWithContext } from "@sycom/logger";
import type { ReactNode } from "react";
import { Resend } from "resend";
export { ResetPasswordEmail } from "./templates/reset-password";
export { OrgOwnerAssignedEmail } from "./templates/org-owner-assigned";
export { OrgMemberInviteEmail } from "./templates/org-member-invite";
export { PlatformInviteEmail } from "./templates/platform-invite";
export { VerifyEmail } from "./templates/verify-email";
export { CourseCertificateEmail } from "./templates/course-certificate";

export const resend = new Resend(env.RESEND_API_KEY);

const DEFAULT_FROM = env.RESEND_EMAIL_FROM;
const DEFAULT_REPLY_TO = env.RESEND_EMAIL_REPLY_TO;
const emailLogger = createLoggerWithContext("email:send");

type EmailAttachment = {
  filename: string;
  content: Buffer;
};

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  from?: string;
  headers?: Record<string, string>;
  replyTo?: string | string[];
  attachments?: EmailAttachment[];
};

/**
 * Send an email via Resend.
 */
export async function sendEmail({
  to,
  subject,
  html,
  from = DEFAULT_FROM,
  headers,
  replyTo = DEFAULT_REPLY_TO,
  attachments,
}: SendEmailArgs) {
  const response = await resend.emails.send({
    from,
    to,
    subject,
    html,
    headers,
    replyTo,
    attachments,
  });

  if (response.error) {
    emailLogger.error("Error sending email", {
      subject,
      to,
      error: response.error,
    });
  }

  return response;
}

/**
 * Render an email template component to HTML string.
 * Uses @react-email/render which supports async rendering and Suspense.
 */
export const render = async (component: ReactNode): Promise<string> => {
  return reactEmailRender(component);
};
