import type { AppRouterOutputs } from "server/trpc/routers/_app";

import { toCsvBlob, type CsvColumn } from "@/lib/csv";

import { ORG_ROLE_LABELS, ORG_STATUS_LABELS, getOrgMemberStatus } from "./org-members-schema";

type ExportResult = AppRouterOutputs["organization"]["exportMembers"];
type ExportRow = ExportResult["rows"][number];

/**
 * Student profile fields are configured per organization, so the columns after the
 * fixed ones are whatever that org defined — labelled with the field's own label and
 * kept in its display order.
 */
export function buildOrgMemberCsvColumns(fields: ExportResult["fields"]): CsvColumn<ExportRow>[] {
  const columns: CsvColumn<ExportRow>[] = [
    { header: "Name", value: (row) => row.name },
    { header: "Email", value: (row) => row.email },
    { header: "Role", value: (row) => ORG_ROLE_LABELS[row.role] ?? row.role },
    { header: "Status", value: (row) => ORG_STATUS_LABELS[getOrgMemberStatus(row)] },
    { header: "Email verified", value: (row) => row.emailVerified },
    { header: "Two-factor enabled", value: (row) => row.twoFactorEnabled },
    { header: "Joined", value: (row) => row.joinedAt },
    { header: "Cohort count", value: (row) => row.cohorts.length },
    {
      // Semicolons rather than commas: a comma would need quoting and reads as a
      // column break to anyone splitting the file by hand.
      header: "Cohorts",
      value: (row) => row.cohorts.map((cohort) => cohort.name).join("; "),
    },
  ];

  for (const field of fields) {
    columns.push({
      header: field.label,
      value: (row) => row.studentProfile[field.id] ?? "",
    });
  }

  return columns;
}

export function buildOrgMembersCsv(result: ExportResult): Blob {
  return toCsvBlob(buildOrgMemberCsvColumns(result.fields), result.rows);
}
