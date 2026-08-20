import { and, asc, count, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";

import type { Database } from "..";
import { user } from "../schema/auth";
import { lesson, section, type LessonType } from "../schema/course";
import {
  enrollment,
  lessonAttempt,
  lessonProgress,
  type LessonProgressStatus,
} from "../schema/enrollment";
import { type ExamIntegrityEventRow, parseExamIntegrityEvents } from "./enrollment";
import { countQuestionBlocksInContent } from "./lesson";

export type CourseAnalyticsOverview = {
  averageExamScore: number | null;
  averageQuizScore: number | null;
  enrollmentCount: number;
};

export type CourseAnalyticsStudentRow = {
  articleCompletedCount: number;
  articleTotalCount: number;
  email: string;
  enrollmentId: string;
  examCompletedCount: number;
  examTotalCount: number;
  image: string | null;
  name: string;
  quizCompletedCount: number;
  quizTotalCount: number;
  userId: string;
};

export type ListCourseAnalyticsStudentsResult = {
  rows: CourseAnalyticsStudentRow[];
  totalCount: number;
};

export type CourseAnalyticsLessonResult = {
  bestScore: number | null;
  integrityEvents: ExamIntegrityEventRow[] | null;
  lessonId: string;
  maxScore: number;
  sectionTitle: string;
  status: LessonProgressStatus;
  title: string;
  type: LessonType;
};

export type CourseAnalyticsStudentDetail = {
  articles: CourseAnalyticsLessonResult[];
  email: string;
  enrollmentId: string;
  enrollmentStatus: string;
  exams: CourseAnalyticsLessonResult[];
  image: string | null;
  name: string;
  quizzes: CourseAnalyticsLessonResult[];
  userId: string;
};

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

async function loadCourseLessons(database: Database, courseId: string) {
  return database
    .select({
      content: lesson.content,
      lessonId: lesson.id,
      sectionOrder: section.order,
      sectionTitle: section.title,
      title: lesson.title,
      type: lesson.type,
    })
    .from(lesson)
    .innerJoin(section, eq(lesson.sectionId, section.id))
    .where(eq(section.courseId, courseId))
    .orderBy(asc(section.order), asc(section.createdAt), asc(lesson.order), asc(lesson.createdAt));
}

export async function getCourseAnalyticsOverview(
  database: Database,
  input: { courseId: string },
): Promise<CourseAnalyticsOverview> {
  const [enrollmentCountRow, lessonRows] = await Promise.all([
    database
      .select({ value: count() })
      .from(enrollment)
      .where(eq(enrollment.courseId, input.courseId)),
    loadCourseLessons(database, input.courseId),
  ]);

  const enrollmentCount = enrollmentCountRow[0]?.value ?? 0;

  const maxScoreByLesson = new Map<string, number>();
  for (const row of lessonRows) {
    if (row.type === "quiz" || row.type === "exam") {
      maxScoreByLesson.set(row.lessonId, countQuestionBlocksInContent(row.content));
    }
  }

  const assessmentLessonIds = [...maxScoreByLesson.keys()];
  if (assessmentLessonIds.length === 0 || enrollmentCount === 0) {
    return { averageExamScore: null, averageQuizScore: null, enrollmentCount };
  }

  const progressRows = await database
    .select({
      bestScore: lessonProgress.bestScore,
      lessonId: lessonProgress.lessonId,
      type: lesson.type,
    })
    .from(lessonProgress)
    .innerJoin(lesson, eq(lesson.id, lessonProgress.lessonId))
    .innerJoin(enrollment, eq(enrollment.id, lessonProgress.enrollmentId))
    .where(
      and(
        eq(enrollment.courseId, input.courseId),
        inArray(lessonProgress.lessonId, assessmentLessonIds),
      ),
    );

  let quizSum = 0;
  let quizCount = 0;
  let examSum = 0;
  let examCount = 0;
  for (const row of progressRows) {
    if (row.bestScore == null) continue;
    const maxScore = maxScoreByLesson.get(row.lessonId) ?? 0;
    if (maxScore === 0) continue;
    const ratio = (row.bestScore / maxScore) * 100;
    if (row.type === "quiz") {
      quizSum += ratio;
      quizCount += 1;
    } else if (row.type === "exam") {
      examSum += ratio;
      examCount += 1;
    }
  }

  return {
    averageExamScore: examCount === 0 ? null : roundToOneDecimal(examSum / examCount),
    averageQuizScore: quizCount === 0 ? null : roundToOneDecimal(quizSum / quizCount),
    enrollmentCount,
  };
}

export async function listCourseAnalyticsStudents(
  database: Database,
  input: {
    courseId: string;
    limit: number;
    offset: number;
    search?: string;
    sortBy: "name";
    sortDirection: "asc" | "desc";
  },
): Promise<ListCourseAnalyticsStudentsResult> {
  const filters: SQL[] = [eq(enrollment.courseId, input.courseId)];
  if (input.search) {
    const pattern = `%${input.search}%`;
    const expr = or(ilike(user.name, pattern), ilike(user.email, pattern));
    if (expr) filters.push(expr);
  }
  const where = and(...filters);
  const direction = input.sortDirection === "desc" ? desc : asc;

  const [rows, totalRow, lessonRows] = await Promise.all([
    database
      .select({
        email: user.email,
        enrollmentId: enrollment.id,
        image: user.image,
        name: user.name,
        userId: user.id,
      })
      .from(enrollment)
      .innerJoin(user, eq(user.id, enrollment.userId))
      .where(where)
      .orderBy(direction(user.name), asc(user.email))
      .limit(input.limit)
      .offset(input.offset),
    database
      .select({ value: count() })
      .from(enrollment)
      .innerJoin(user, eq(user.id, enrollment.userId))
      .where(where),
    database
      .select({ type: lesson.type })
      .from(lesson)
      .innerJoin(section, eq(lesson.sectionId, section.id))
      .where(eq(section.courseId, input.courseId)),
  ]);

  let articleTotalCount = 0;
  let quizTotalCount = 0;
  let examTotalCount = 0;
  for (const row of lessonRows) {
    if (row.type === "article") articleTotalCount += 1;
    else if (row.type === "quiz") quizTotalCount += 1;
    else if (row.type === "exam") examTotalCount += 1;
  }

  const enrollmentIds = rows.map((row) => row.enrollmentId);
  type CompletedKey = `${string}:${LessonType}`;
  const completedCounts = new Map<CompletedKey, number>();
  if (enrollmentIds.length > 0) {
    const completionRows = await database
      .select({
        enrollmentId: lessonProgress.enrollmentId,
        type: lesson.type,
        value: count(),
      })
      .from(lessonProgress)
      .innerJoin(lesson, eq(lesson.id, lessonProgress.lessonId))
      .where(
        and(
          inArray(lessonProgress.enrollmentId, enrollmentIds),
          eq(lessonProgress.status, "completed"),
        ),
      )
      .groupBy(lessonProgress.enrollmentId, lesson.type);
    for (const row of completionRows) {
      completedCounts.set(`${row.enrollmentId}:${row.type}`, row.value);
    }
  }

  return {
    rows: rows.map((row) => ({
      articleCompletedCount: completedCounts.get(`${row.enrollmentId}:article`) ?? 0,
      articleTotalCount,
      email: row.email,
      enrollmentId: row.enrollmentId,
      examCompletedCount: completedCounts.get(`${row.enrollmentId}:exam`) ?? 0,
      examTotalCount,
      image: row.image,
      name: row.name,
      quizCompletedCount: completedCounts.get(`${row.enrollmentId}:quiz`) ?? 0,
      quizTotalCount,
      userId: row.userId,
    })),
    totalCount: totalRow[0]?.value ?? 0,
  };
}

export async function getCourseAnalyticsStudentDetail(
  database: Database,
  input: { courseId: string; enrollmentId: string },
): Promise<CourseAnalyticsStudentDetail | null> {
  const [enrollmentRow] = await database
    .select({
      email: user.email,
      enrollmentId: enrollment.id,
      enrollmentStatus: enrollment.status,
      image: user.image,
      name: user.name,
      userId: user.id,
    })
    .from(enrollment)
    .innerJoin(user, eq(user.id, enrollment.userId))
    .where(and(eq(enrollment.id, input.enrollmentId), eq(enrollment.courseId, input.courseId)))
    .limit(1);

  if (!enrollmentRow) return null;

  const [lessonRows, progressRows] = await Promise.all([
    loadCourseLessons(database, input.courseId),
    database
      .select({
        bestScore: lessonProgress.bestScore,
        lessonId: lessonProgress.lessonId,
        status: lessonProgress.status,
      })
      .from(lessonProgress)
      .where(eq(lessonProgress.enrollmentId, input.enrollmentId)),
  ]);

  const progressByLesson = new Map(progressRows.map((row) => [row.lessonId, row]));

  const articles: CourseAnalyticsLessonResult[] = [];
  const quizzes: CourseAnalyticsLessonResult[] = [];
  const exams: CourseAnalyticsLessonResult[] = [];

  for (const row of lessonRows) {
    const progress = progressByLesson.get(row.lessonId);
    const result: CourseAnalyticsLessonResult = {
      bestScore: progress?.bestScore ?? null,
      integrityEvents: null,
      lessonId: row.lessonId,
      maxScore:
        row.type === "quiz" || row.type === "exam" ? countQuestionBlocksInContent(row.content) : 0,
      sectionTitle: row.sectionTitle,
      status: progress?.status ?? "not_started",
      title: row.title,
      type: row.type,
    };
    if (row.type === "article") articles.push(result);
    else if (row.type === "quiz") quizzes.push(result);
    else if (row.type === "exam") exams.push(result);
  }

  const examLessonIds = exams.map((e) => e.lessonId);
  if (examLessonIds.length > 0) {
    const attemptRows = await database
      .select({
        attemptNumber: lessonAttempt.attemptNumber,
        integrityEvents: lessonAttempt.integrityEvents,
        lessonId: lessonAttempt.lessonId,
      })
      .from(lessonAttempt)
      .where(
        and(
          eq(lessonAttempt.enrollmentId, input.enrollmentId),
          inArray(lessonAttempt.lessonId, examLessonIds),
        ),
      );

    const latestByLesson = new Map<
      string,
      { attemptNumber: number; events: ExamIntegrityEventRow[] }
    >();
    for (const row of attemptRows) {
      const parsed = parseExamIntegrityEvents(row.integrityEvents);
      const prev = latestByLesson.get(row.lessonId);
      if (!prev || row.attemptNumber > prev.attemptNumber) {
        latestByLesson.set(row.lessonId, {
          attemptNumber: row.attemptNumber,
          events: parsed,
        });
      }
    }

    for (const exam of exams) {
      const entry = latestByLesson.get(exam.lessonId);
      exam.integrityEvents = entry && entry.events.length > 0 ? entry.events : null;
    }
  }

  return {
    articles,
    email: enrollmentRow.email,
    enrollmentId: enrollmentRow.enrollmentId,
    enrollmentStatus: enrollmentRow.enrollmentStatus,
    exams,
    image: enrollmentRow.image,
    name: enrollmentRow.name,
    quizzes,
    userId: enrollmentRow.userId,
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type CourseAnalyticsExportLesson = {
  lessonId: string;
  title: string;
  sectionTitle: string;
  type: LessonType;
  /** Question count for quizzes and exams; 0 for articles, which aren't scored. */
  maxScore: number;
};

export type CourseAnalyticsExportProgress = {
  status: LessonProgressStatus;
  bestScore: number | null;
};

export type CourseAnalyticsExportStudent = {
  userId: string;
  enrollmentId: string;
  name: string;
  email: string;
  enrollmentStatus: string;
  enrolledAt: Date;
  completedCounts: Record<LessonType, number>;
  /** Mean of best-score percentages across attempted quizzes / exams. */
  averageQuizScore: number | null;
  averageExamScore: number | null;
  /** Keyed by lesson id; a lesson with no row was never started. */
  progressByLesson: Map<string, CourseAnalyticsExportProgress>;
};

export type CourseAnalyticsExportResult = {
  lessons: CourseAnalyticsExportLesson[];
  students: CourseAnalyticsExportStudent[];
};

/**
 * The whole gradebook for a course: every enrolled student against every lesson.
 *
 * `getCourseAnalyticsStudentDetail` answers the same question for one student, but
 * calling it per student would be a query per row. This loads the lessons once, the
 * enrolments once, and all of their progress in a single pass, then joins in memory
 * — three queries regardless of course or cohort size.
 */
export async function getCourseAnalyticsExport(
  database: Database,
  input: { courseId: string },
): Promise<CourseAnalyticsExportResult> {
  const [lessonRows, enrollmentRows] = await Promise.all([
    loadCourseLessons(database, input.courseId),
    database
      .select({
        email: user.email,
        enrolledAt: enrollment.createdAt,
        enrollmentId: enrollment.id,
        enrollmentStatus: enrollment.status,
        name: user.name,
        userId: user.id,
      })
      .from(enrollment)
      .innerJoin(user, eq(user.id, enrollment.userId))
      .where(eq(enrollment.courseId, input.courseId))
      .orderBy(asc(user.name), asc(user.email)),
  ]);

  const lessons: CourseAnalyticsExportLesson[] = lessonRows.map((row) => ({
    lessonId: row.lessonId,
    maxScore:
      row.type === "quiz" || row.type === "exam" ? countQuestionBlocksInContent(row.content) : 0,
    sectionTitle: row.sectionTitle,
    title: row.title,
    type: row.type,
  }));

  const lessonById = new Map(lessons.map((entry) => [entry.lessonId, entry]));
  const enrollmentIds = enrollmentRows.map((row) => row.enrollmentId);

  const progressRows =
    enrollmentIds.length > 0
      ? await database
          .select({
            bestScore: lessonProgress.bestScore,
            enrollmentId: lessonProgress.enrollmentId,
            lessonId: lessonProgress.lessonId,
            status: lessonProgress.status,
          })
          .from(lessonProgress)
          .where(inArray(lessonProgress.enrollmentId, enrollmentIds))
      : [];

  const progressByEnrollment = new Map<string, Map<string, CourseAnalyticsExportProgress>>();
  for (const row of progressRows) {
    // Progress can outlive the lesson it points at; skip rows with no lesson left.
    if (!lessonById.has(row.lessonId)) continue;
    const forEnrollment = progressByEnrollment.get(row.enrollmentId) ?? new Map();
    forEnrollment.set(row.lessonId, { bestScore: row.bestScore, status: row.status });
    progressByEnrollment.set(row.enrollmentId, forEnrollment);
  }

  const students = enrollmentRows.map((row) => {
    const progress = progressByEnrollment.get(row.enrollmentId) ?? new Map();
    const completedCounts: Record<LessonType, number> = { article: 0, exam: 0, quiz: 0 };
    const scoreTotals: Record<"exam" | "quiz", { sum: number; count: number }> = {
      exam: { count: 0, sum: 0 },
      quiz: { count: 0, sum: 0 },
    };

    for (const [lessonId, entry] of progress) {
      const lessonEntry = lessonById.get(lessonId);
      if (!lessonEntry) continue;

      if (entry.status === "completed") {
        completedCounts[lessonEntry.type] += 1;
      }

      if (
        (lessonEntry.type === "quiz" || lessonEntry.type === "exam") &&
        entry.bestScore !== null &&
        lessonEntry.maxScore > 0
      ) {
        const bucket = scoreTotals[lessonEntry.type];
        bucket.sum += (entry.bestScore / lessonEntry.maxScore) * 100;
        bucket.count += 1;
      }
    }

    const average = (bucket: { sum: number; count: number }) =>
      bucket.count === 0 ? null : roundToOneDecimal(bucket.sum / bucket.count);

    return {
      averageExamScore: average(scoreTotals.exam),
      averageQuizScore: average(scoreTotals.quiz),
      completedCounts,
      email: row.email,
      enrolledAt: row.enrolledAt,
      enrollmentId: row.enrollmentId,
      enrollmentStatus: row.enrollmentStatus,
      name: row.name,
      progressByLesson: progress,
      userId: row.userId,
    };
  });

  return { lessons, students };
}
