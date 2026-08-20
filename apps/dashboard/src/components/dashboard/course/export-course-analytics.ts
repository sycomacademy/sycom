import type { AppRouterOutputs } from "server/trpc/routers/_app";

import { toCsvBlob, type CsvColumn } from "@/lib/csv";

type ExportResult = AppRouterOutputs["course"]["exportAnalytics"];
type ExportLesson = ExportResult["lessons"][number];
type ExportStudent = ExportResult["students"][number];

const STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  in_progress: "In progress",
  not_started: "Not started",
};

const TYPE_LABELS: Record<ExportLesson["type"], string> = {
  article: "Article",
  exam: "Exam",
  quiz: "Quiz",
};

function statusLabel(status: string | undefined): string {
  if (!status) return STATUS_LABELS.not_started ?? "Not started";
  return STATUS_LABELS[status] ?? status;
}

/**
 * Lesson columns repeat their section and type in the header, because a gradebook
 * is read column-by-column and two sections can hold lessons with the same title.
 */
function lessonHeader(lesson: ExportLesson): string {
  return `${lesson.sectionTitle} › ${lesson.title} (${TYPE_LABELS[lesson.type]})`;
}

/**
 * One row per student, one column per lesson — the layout people expect to paste
 * into a gradebook. Scored lessons carry `status — score/max`; articles, which have
 * no score, carry the status alone.
 */
export function buildCourseAnalyticsCsvColumns(
  lessons: ExportResult["lessons"],
): CsvColumn<ExportStudent>[] {
  const columns: CsvColumn<ExportStudent>[] = [
    { header: "Name", value: (row) => row.name },
    { header: "Email", value: (row) => row.email },
    { header: "Enrollment status", value: (row) => row.enrollmentStatus },
    { header: "Enrolled", value: (row) => row.enrolledAt },
    { header: "Average quiz score (%)", value: (row) => row.averageQuizScore },
    { header: "Average exam score (%)", value: (row) => row.averageExamScore },
  ];

  const totals = { article: 0, exam: 0, quiz: 0 } as Record<ExportLesson["type"], number>;
  for (const lesson of lessons) totals[lesson.type] += 1;

  columns.push(
    {
      header: `Articles completed (of ${totals.article})`,
      value: (row) => row.completedCounts.article,
    },
    { header: `Quizzes completed (of ${totals.quiz})`, value: (row) => row.completedCounts.quiz },
    { header: `Exams completed (of ${totals.exam})`, value: (row) => row.completedCounts.exam },
    {
      header: `Lessons completed (of ${lessons.length})`,
      value: (row) =>
        row.completedCounts.article + row.completedCounts.quiz + row.completedCounts.exam,
    },
  );

  for (const lesson of lessons) {
    columns.push({
      header: lessonHeader(lesson),
      value: (row) => {
        const progress = row.progressByLesson.get(lesson.lessonId);
        const label = statusLabel(progress?.status);

        if (lesson.type === "article" || lesson.maxScore === 0) return label;
        if (progress?.bestScore == null) return label;

        return `${label} — ${progress.bestScore}/${lesson.maxScore}`;
      },
    });
  }

  return columns;
}

export function buildCourseAnalyticsCsv(result: ExportResult): Blob {
  return toCsvBlob(buildCourseAnalyticsCsvColumns(result.lessons), result.students);
}
