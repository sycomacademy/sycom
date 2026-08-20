/**
 * Render a sample certificate to `/tmp/sycom-certificate.pdf` for eyeballing.
 *
 * Usage (from repo root):
 *   bun run scripts/preview-certificate.ts
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: join(import.meta.dir, "..", "apps/server/.env") });

const { renderCertificatePdf } =
  await import("../packages/certificates/src/render-certificate-pdf");
const { mergeCertificatePdfPayload } = await import("../packages/certificates/src/course-settings");

// Also exercises the legacy remap: a course still storing the retired "minimal" ID.
const { templateId, payload } = mergeCertificatePdfPayload(
  { templateId: "minimal" },
  {
    recipientName: "Dennis Opoku",
    courseTitle:
      "Information Security Management Systems Lead Auditor Training Course (ISO/IEC 27001:2022)",
    certificateNumber: "SYC-MXQ8T2-1A9F3C7E",
    issuedAt: new Date(2026, 6, 16),
  },
);

console.log(`Template resolved to: ${templateId}`);
const buffer = await renderCertificatePdf(templateId, payload);

const out = "/tmp/sycom-certificate.pdf";
writeFileSync(out, buffer);
console.log(`Wrote ${out} (${buffer.length} bytes)`);
