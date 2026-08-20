import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { CERTIFICATE } from "@sycom/ui/image/assets";
import { buildImageUrl } from "@sycom/ui/image/cdn";

import { certificateAssets } from "../assets";
import { BrandMark } from "../_components/brand-mark";
import { CornerArtwork } from "../_components/corner-artwork";
import { certificateColors } from "../_components/theme";
import type { CertificatePdfPayload } from "../types";

const PAGE_PADDING = 48;
/** Keeps type clear of the top-right artwork and the bottom-right stamp. */
const CONTENT_WIDTH = 500;

const styles = StyleSheet.create({
  /** Padding lives on `content` so full-bleed art can sit at the sheet edge. */
  page: {
    backgroundColor: certificateColors.background,
    fontFamily: "Helvetica",
    position: "relative",
  },
  topRule: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: certificateColors.primary,
  },
  content: {
    flexGrow: 1,
    paddingTop: PAGE_PADDING,
    paddingBottom: 40,
    paddingHorizontal: PAGE_PADDING,
  },
  body: {
    flexGrow: 1,
    maxWidth: CONTENT_WIDTH,
  },
  academy: {
    marginTop: 16,
    fontSize: 30,
    fontFamily: "Helvetica-Bold",
    color: certificateColors.foreground,
    letterSpacing: -0.4,
  },
  certify: {
    marginTop: 30,
    fontSize: 9,
    color: certificateColors.muted,
  },
  recipient: {
    marginTop: 8,
    fontSize: 23,
    fontFamily: "Helvetica-Bold",
    color: certificateColors.foreground,
  },
  attended: {
    marginTop: 11,
    fontSize: 9,
    color: certificateColors.muted,
  },
  course: {
    marginTop: 8,
    fontSize: 17,
    lineHeight: 1.35,
    color: certificateColors.foreground,
  },
  signatureBlock: {
    marginTop: 22,
  },
  signatureSlot: {
    height: 84,
    justifyContent: "flex-end",
  },
  /** Sits slightly over the rule, the way a real signature crosses the line. */
  signatureImage: {
    width: 120,
    height: 84,
    marginBottom: -9,
    objectFit: "contain",
    objectPositionX: 0,
  },
  signatureRule: {
    width: 280,
    borderBottomWidth: 0.75,
    borderBottomColor: certificateColors.foreground,
  },
  signatory: {
    marginTop: 7,
    fontSize: 8,
    color: certificateColors.foreground,
  },
  meta: {
    marginTop: 16,
    fontSize: 8,
    lineHeight: 1.8,
    color: certificateColors.foreground,
  },
  stamp: {
    position: "absolute",
    right: PAGE_PADDING,
    bottom: 76,
    width: 68,
    height: 68,
    objectFit: "contain",
  },
  footer: {
    borderTopWidth: 0.75,
    borderTopColor: certificateColors.border,
    paddingTop: 8,
  },
  footnote: {
    fontSize: 6.5,
    lineHeight: 1.5,
    color: certificateColors.muted,
  },
});

function formatIssuedDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

const DEFAULT_ACADEMY_TITLE = "Sycom Academy";
const DEFAULT_CERTIFY_PHRASE = "This is to certify that";
const DEFAULT_SIGNATORY_NAME = "Abdulrahman Akanbi";
const DEFAULT_SIGNATORY_TITLE = "Chief Executive Officer";
const DEFAULT_FOOTNOTE =
  "Sycom Solutions, 2 Infirmary St, Leeds LS1 2JP, United Kingdom. Verify this certificate using the certificate number above.";

export function SycomDefaultCertificate({
  recipientName,
  courseTitle,
  certificateNumber,
  issuedAt,
  awardHeadline,
  certifyPhrase,
  signatoryName,
  signatoryTitle,
  footnoteLine,
}: CertificatePdfPayload) {
  const academy = awardHeadline?.trim() || DEFAULT_ACADEMY_TITLE;
  const certify = certifyPhrase?.trim() || DEFAULT_CERTIFY_PHRASE;
  const signatory = signatoryName?.trim() || DEFAULT_SIGNATORY_NAME;
  const signatoryRole = signatoryTitle?.trim() || DEFAULT_SIGNATORY_TITLE;
  const footnote = footnoteLine?.trim() || DEFAULT_FOOTNOTE;

  return (
    <Document title={`Certificate — ${courseTitle}`} subject="Course completion" language="en">
      <Page orientation="landscape" size="A4" style={styles.page}>
        <CornerArtwork />
        <View style={styles.topRule} />

        <View style={styles.content}>
          <View style={styles.body}>
            <BrandMark width={80} />
            <Text style={styles.academy}>{academy}</Text>

            <Text style={styles.certify}>{certify}</Text>
            <Text style={styles.recipient}>{recipientName}</Text>

            <Text style={styles.attended}>has attended and passed</Text>
            <Text style={styles.course}>{courseTitle}</Text>

            <View style={styles.signatureBlock}>
              <View style={styles.signatureSlot}>
                {certificateAssets.signature ? (
                  <Image src={buildImageUrl(CERTIFICATE.SIGNATURE)} style={styles.signatureImage} />
                ) : null}
              </View>
              <View style={styles.signatureRule} />
              <Text style={styles.signatory}>{`${signatory}, ${signatoryRole}`}</Text>
            </View>

            <View style={styles.meta}>
              <Text>Date: {formatIssuedDate(issuedAt)}</Text>
              <Text>Certificate Number: {certificateNumber}</Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footnote}>{footnote}</Text>
          </View>
        </View>

        {certificateAssets.stamp ? (
          <Image src={buildImageUrl(CERTIFICATE.STAMP)} style={styles.stamp} />
        ) : null}
      </Page>
    </Document>
  );
}
