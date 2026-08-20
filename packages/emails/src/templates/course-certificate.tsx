import { Body, Container, Heading, Hr, Preview, Section, Text } from "@react-email/components";
import { Button } from "../_components/button";
import { Footer } from "../_components/footer";
import { Logo } from "../_components/logo";
import { colors, EmailThemeProvider } from "../_components/theme";

export type CourseCertificateEmailProps = {
  /** Learner's display name */
  name: string;
  courseTitle: string;
  certificateNumber: string;
  /** Pre-formatted issue date, e.g. "20 August 2026" */
  issuedOn: string;
  /** Name printed above the logo on the certificate (academy/organisation) */
  academyName: string;
  /** Optional link back to the learner's courses */
  coursesUrl?: string;
};

export function CourseCertificateEmail({
  name = "Alex Doe",
  courseTitle = "Introduction to Cybersecurity",
  certificateNumber = "SYC-XXXXXX-XXXXXXXX",
  issuedOn = "20 August 2026",
  academyName = "Sycom Academy",
  coursesUrl,
}: CourseCertificateEmailProps) {
  return (
    <EmailThemeProvider
      preview={<Preview>Congratulations — your {courseTitle} certificate is here</Preview>}
    >
      <Body
        className="mx-auto my-auto font-sans"
        style={{ backgroundColor: colors.surface, color: colors.foreground }}
      >
        <Container
          className="mx-auto my-10 max-w-xl border border-solid p-5"
          style={{ borderColor: colors.border, backgroundColor: colors.background }}
        >
          <Logo />

          <Heading
            className="mx-0 my-8 p-0 text-center text-xl font-semibold"
            style={{ color: colors.foreground }}
          >
            Congratulations, {name}!
          </Heading>

          <Text className="text-sm leading-6" style={{ color: colors.foreground }}>
            You&apos;ve completed <strong>{courseTitle}</strong>, and your certificate from{" "}
            <strong>{academyName}</strong> is attached to this email as a PDF.
          </Text>

          <Text className="text-sm leading-6" style={{ color: colors.foreground }}>
            Finishing a course takes real focus, and you saw it through. Keep the certificate for
            your records — share it with your team, add it to your CV, or post it to your LinkedIn
            profile. It&apos;s yours, and you earned it.
          </Text>

          <Hr style={{ borderColor: colors.border }} />

          <Section className="my-4">
            <Text className="my-1 text-xs" style={{ color: colors.muted }}>
              Course
            </Text>
            <Text className="my-1 text-sm font-medium" style={{ color: colors.foreground }}>
              {courseTitle}
            </Text>

            <Text className="mt-4 mb-1 text-xs" style={{ color: colors.muted }}>
              Certificate number
            </Text>
            <Text className="my-1 text-sm font-medium" style={{ color: colors.foreground }}>
              {certificateNumber}
            </Text>

            <Text className="mt-4 mb-1 text-xs" style={{ color: colors.muted }}>
              Issued on
            </Text>
            <Text className="my-1 text-sm font-medium" style={{ color: colors.foreground }}>
              {issuedOn}
            </Text>
          </Section>

          <Hr style={{ borderColor: colors.border }} />

          {coursesUrl ? (
            <Section className="mt-8 mb-8 text-center">
              <Button href={coursesUrl}>Explore more courses</Button>
            </Section>
          ) : null}

          <Text className="text-xs" style={{ color: colors.muted }}>
            Can&apos;t see the attachment? Reply to this email and we&apos;ll send it again.
          </Text>

          <Footer />
        </Container>
      </Body>
    </EmailThemeProvider>
  );
}

export default CourseCertificateEmail;
CourseCertificateEmail.PreviewProps = {
  name: "Alex Doe",
  courseTitle: "Introduction to Cybersecurity",
  certificateNumber: "SYC-MJ8K2P-4F7A9C1B",
  issuedOn: "20 August 2026",
  academyName: "Sycom Academy",
  coursesUrl: "https://example.com/dashboard/courses",
} as CourseCertificateEmailProps;
