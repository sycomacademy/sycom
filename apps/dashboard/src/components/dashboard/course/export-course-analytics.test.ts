import { describe, expect, test } from "bun:test";

import { toCsv } from "@/lib/csv";

import { buildCourseAnalyticsCsvColumns } from "./export-course-analytics";

type Lessons = Parameters<typeof buildCourseAnalyticsCsvColumns>[0];

const lessons = [
  { lessonId: "l1", title: "Overview", sectionTitle: "Basics", type: "article", maxScore: 0 },
  { lessonId: "l2", title: "TCP quiz", sectionTitle: "Basics", type: "quiz", maxScore: 4 },
  { lessonId: "l3", title: "Final", sectionTitle: "Wrap up", type: "exam", maxScore: 10 },
] as unknown as Lessons;

function student(overrides: Record<string, unknown> = {}) {
  return {
    averageExamScore: null,
    averageQuizScore: null,
    completedCounts: { article: 0, exam: 0, quiz: 0 },
    email: "sam@example.com",
    enrolledAt: new Date("2026-01-05T00:00:00.000Z"),
    enrollmentId: "e1",
    enrollmentStatus: "active",
    name: "Sam Lee",
    progressByLesson: new Map(),
    userId: "u1",
    ...overrides,
  } as never;
}

function rowsOf(csv: string): string[][] {
  return csv
    .slice(1)
    .replace(/\r\n$/, "")
    .split("\r\n")
    .map((line) => line.split(","));
}

describe("buildCourseAnalyticsCsvColumns", () => {
  test("puts one column per lesson, labelled with its section and type", () => {
    const headers = buildCourseAnalyticsCsvColumns(lessons).map((column) => column.header);

    expect(headers.slice(0, 6)).toEqual([
      "Name",
      "Email",
      "Enrollment status",
      "Enrolled",
      "Average quiz score (%)",
      "Average exam score (%)",
    ]);
    expect(headers).toContain("Articles completed (of 1)");
    expect(headers).toContain("Lessons completed (of 3)");
    expect(headers.slice(-3)).toEqual([
      "Basics › Overview (Article)",
      "Basics › TCP quiz (Quiz)",
      "Wrap up › Final (Exam)",
    ]);
  });

  test("writes score alongside status for scored lessons, status alone for articles", () => {
    const columns = buildCourseAnalyticsCsvColumns(lessons);
    const row = student({
      completedCounts: { article: 1, exam: 0, quiz: 1 },
      progressByLesson: new Map([
        ["l1", { status: "completed", bestScore: null }],
        ["l2", { status: "completed", bestScore: 3 }],
        ["l3", { status: "in_progress", bestScore: 6 }],
      ]),
    });

    const values = columns.slice(-3).map((column) => column.value(row));
    expect(values).toEqual(["Completed", "Completed — 3/4", "In progress — 6/10"]);
  });

  test("a lesson the student never opened reads as Not started", () => {
    const columns = buildCourseAnalyticsCsvColumns(lessons);
    expect(columns.slice(-3).map((column) => column.value(student()))).toEqual([
      "Not started",
      "Not started",
      "Not started",
    ]);
  });

  test("a scored lesson with no recorded score omits the score, not the status", () => {
    const columns = buildCourseAnalyticsCsvColumns(lessons);
    const row = student({
      progressByLesson: new Map([["l2", { status: "in_progress", bestScore: null }]]),
    });

    expect(columns.at(-2)?.value(row)).toBe("In progress");
  });

  test("totals count only completed lessons", () => {
    const columns = buildCourseAnalyticsCsvColumns(lessons);
    const total = columns.find((c) => c.header.startsWith("Lessons completed"));

    expect(total?.value(student({ completedCounts: { article: 1, exam: 1, quiz: 2 } }))).toBe(4);
  });

  test("a course with no lessons still exports its enrolled students", () => {
    const columns = buildCourseAnalyticsCsvColumns([] as unknown as Lessons);
    const csv = toCsv(columns, [student()]);

    expect(rowsOf(csv)).toHaveLength(2);
    expect(columns.some((c) => c.header.includes("›"))).toBe(false);
  });
});
