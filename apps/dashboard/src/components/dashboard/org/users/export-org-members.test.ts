import { describe, expect, test } from "bun:test";

import { buildOrgMemberCsvColumns } from "./export-org-members";

type Fields = Parameters<typeof buildOrgMemberCsvColumns>[0];

const fields = [
  { id: "student_no", label: "Student number", type: "text", order: 0 },
  { id: "year", label: "Year of study", type: "number", order: 1 },
] as unknown as Fields;

function member(overrides: Record<string, unknown> = {}) {
  return {
    banned: false,
    cohorts: [],
    email: "sam@example.com",
    emailVerified: true,
    image: null,
    joinedAt: new Date("2026-02-01T00:00:00.000Z"),
    memberId: "m1",
    name: "Sam Lee",
    role: "student",
    studentProfile: {},
    twoFactorEnabled: false,
    userId: "u1",
    ...overrides,
  } as never;
}

const headers = (f: Fields) => buildOrgMemberCsvColumns(f).map((column) => column.header);
const valueOf = (f: Fields, header: string, row: never) =>
  buildOrgMemberCsvColumns(f)
    .find((column) => column.header === header)
    ?.value(row);

describe("buildOrgMemberCsvColumns", () => {
  test("appends one column per configured profile field, in the org's order", () => {
    expect(headers(fields).slice(-2)).toEqual(["Student number", "Year of study"]);
  });

  test("an org with no profile fields gets only the fixed columns", () => {
    const result = headers([] as unknown as Fields);

    expect(result).toEqual([
      "Name",
      "Email",
      "Role",
      "Status",
      "Email verified",
      "Two-factor enabled",
      "Joined",
      "Cohort count",
      "Cohorts",
    ]);
  });

  test("reads profile values by field id and blanks the ones not filled in", () => {
    const row = member({ studentProfile: { student_no: "S-2201" } });

    expect(valueOf(fields, "Student number", row)).toBe("S-2201");
    expect(valueOf(fields, "Year of study", row)).toBe("");
  });

  test("keeps a numeric profile value as a number", () => {
    const row = member({ studentProfile: { year: 2 } });
    expect(valueOf(fields, "Year of study", row)).toBe(2);
  });

  test("joins cohorts with semicolons and counts them", () => {
    const row = member({
      cohorts: [
        { id: "c1", name: "Autumn 2026" },
        { id: "c2", name: "Evening" },
      ],
    });

    expect(valueOf(fields, "Cohorts", row)).toBe("Autumn 2026; Evening");
    expect(valueOf(fields, "Cohort count", row)).toBe(2);
    expect(valueOf(fields, "Cohorts", member())).toBe("");
  });

  test("derives status from the ban and verification flags", () => {
    expect(valueOf(fields, "Status", member())).toBe("Verified");
    expect(valueOf(fields, "Status", member({ emailVerified: false }))).toBe("Unverified email");
    // A ban outranks verification.
    expect(valueOf(fields, "Status", member({ banned: true, emailVerified: false }))).toBe(
      "Banned",
    );
  });

  test("labels the role rather than emitting the raw enum", () => {
    expect(valueOf(fields, "Role", member({ role: "teacher" }))).toBe("Teacher");
  });
});
