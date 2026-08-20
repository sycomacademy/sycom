import { and, asc, count, eq, ilike, max, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "..";
import {
  certificate,
  enrollment,
  lessonAttempt,
  lessonProgress,
  type EnrollmentAccessSource,
  type LessonProgressStatus,
} from "../schema/enrollment";
import { course, lesson, section, type LessonType } from "../schema/course";
import { user } from "../schema/auth";
import { profile } from "../schema/profile";
import { getQuestionDefinitionsFromContent } from "./lesson";

type EnrollmentLessonProgress = {
  lessonId: string;
  sectionId: string;
  lessonTitle: string;
  lessonType: LessonType;
  openAt: Date | null;
  dueAt: Date | null;
  order: number;
  sectionOrder: number;
  status: LessonProgressStatus;
  bestScore: number | null;
  latestScore: number | null;
  attemptCount: number;
};

export type EnrollmentProgressSummary = {
  enrollmentId: string;
  courseId: string;
  userId: string;
  status: string;
  completedAt: Date | null;
  certificateId: string | null;
  lessons: EnrollmentLessonProgress[];
};

export type CourseEnrollmentRow = {
  enrollmentId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  bio: string | null;
  status: string;
  completedLessonCount: number;
  totalLessonCount: number;
  lastActivityAt: Date | null;
  certificateIssued: boolean;
  certificateSentAt: Date | null;
};

export type ListCourseEnrollmentsResult = {
  rows: CourseEnrollmentRow[];
  totalCount: number;
};

export type CourseEnrollmentDetail = {
  enrollmentId: string;
  courseId: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: string | null;
  bio: string | null;
  onboardedAt: Date | null;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  lastActivityAt: Date | null;
  certificateIssued: boolean;
  certificateSentAt: Date | null;
  lessons: EnrollmentLessonProgress[];
};

function now() {
  return new Date();
}

function buildCertificateNumber() {
  return `SYC-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function ensureEnrollment(
  database: Database,
  input: {
    courseId: string;
    userId: string;
    accessSource?: EnrollmentAccessSource;
    grantedByUserId?: string | null;
  },
) {
  const existing = await getEnrollmentForUserCourse(database, input);
  if (existing) {
    return existing;
  }

  const timestamp = now();
  const [created] = await database
    .insert(enrollment)
    .values({
      courseId: input.courseId,
      userId: input.userId,
      status: "active",
      startedAt: timestamp,
      lastActivityAt: timestamp,
      accessSource: input.accessSource ?? "free",
      grantedByUserId: input.grantedByUserId ?? null,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create enrollment");
  }

  return created;
}

async function touchEnrollment(database: Database, enrollmentId: string) {
  await database
    .update(enrollment)
    .set({ lastActivityAt: now(), updatedAt: now() })
    .where(eq(enrollment.id, enrollmentId));
}

async function ensureLessonProgress(
  database: Database,
  input: { enrollmentId: string; lessonId: string; status?: LessonProgressStatus },
) {
  const [existing] = await database
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.enrollmentId, input.enrollmentId),
        eq(lessonProgress.lessonId, input.lessonId),
      ),
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  const timestamp = now();
  const [created] = await database
    .insert(lessonProgress)
    .values({
      enrollmentId: input.enrollmentId,
      lessonId: input.lessonId,
      status: input.status ?? "not_started",
      startedAt: input.status === "in_progress" ? timestamp : null,
      lastViewedAt: input.status === "in_progress" ? timestamp : null,
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create lesson progress");
  }

  return created;
}

async function maybeIssueCertificate(
  database: Database,
  input: { enrollmentId: string; courseId: string; userId: string },
) {
  const summary = await getEnrollmentProgressSummary(database, {
    courseId: input.courseId,
    userId: input.userId,
  });

  if (!summary) {
    return;
  }

  const allLessonsCompleted =
    summary.lessons.length > 0 &&
    summary.lessons.every((lessonProgressRow) => lessonProgressRow.status === "completed");

  if (!allLessonsCompleted) {
    return;
  }

  const [existingCertificate] = await database
    .select({ id: certificate.id })
    .from(certificate)
    .where(eq(certificate.enrollmentId, input.enrollmentId))
    .limit(1);

  if (!existingCertificate) {
    const [courseRow] = await database
      .select({ certificateSettings: course.certificateSettings })
      .from(course)
      .where(eq(course.id, input.courseId))
      .limit(1);

    await database.insert(certificate).values({
      enrollmentId: input.enrollmentId,
      courseId: input.courseId,
      userId: input.userId,
      certificateNumber: buildCertificateNumber(),
      issuedAt: now(),
      metadata:
        courseRow?.certificateSettings != null
          ? { courseCertificateSettings: courseRow.certificateSettings }
          : null,
    });
  }

  await database
    .update(enrollment)
    .set({ status: "completed", completedAt: now(), updatedAt: now() })
    .where(eq(enrollment.id, input.enrollmentId));
}

export async function getEnrollmentForUserCourse(
  database: Database,
  input: { courseId: string; userId: string },
) {
  const [row] = await database
    .select()
    .from(enrollment)
    .where(and(eq(enrollment.courseId, input.courseId), eq(enrollment.userId, input.userId)))
    .limit(1);

  return row ?? null;
}

export async function createEnrollment(
  database: Database,
  input: {
    courseId: string;
    userId: string;
    accessSource?: EnrollmentAccessSource;
    grantedByUserId?: string | null;
  },
) {
  return ensureEnrollment(database, input);
}

export async function getEnrollmentProgressSummary(
  database: Database,
  input: { courseId: string; userId: string },
): Promise<EnrollmentProgressSummary | null> {
  const currentEnrollment = await getEnrollmentForUserCourse(database, input);
  if (!currentEnrollment) {
    return null;
  }

  const [certificateRow, lessonRows] = await Promise.all([
    database
      .select({ id: certificate.id })
      .from(certificate)
      .where(eq(certificate.enrollmentId, currentEnrollment.id))
      .limit(1),
    database
      .select({
        lessonId: lesson.id,
        sectionId: lesson.sectionId,
        lessonTitle: lesson.title,
        lessonType: lesson.type,
        openAt: lesson.openAt,
        dueAt: lesson.dueAt,
        order: lesson.order,
        sectionOrder: section.order,
        status: lessonProgress.status,
        bestScore: lessonProgress.bestScore,
        latestScore: lessonProgress.latestScore,
        attemptCount: lessonProgress.attemptCount,
      })
      .from(lesson)
      .innerJoin(section, eq(lesson.sectionId, section.id))
      .leftJoin(
        lessonProgress,
        and(
          eq(lessonProgress.lessonId, lesson.id),
          eq(lessonProgress.enrollmentId, currentEnrollment.id),
        ),
      )
      .where(eq(section.courseId, input.courseId))
      .orderBy(
        asc(section.order),
        asc(section.createdAt),
        asc(lesson.order),
        asc(lesson.createdAt),
      ),
  ]);

  return {
    enrollmentId: currentEnrollment.id,
    courseId: currentEnrollment.courseId,
    userId: currentEnrollment.userId,
    status: currentEnrollment.status,
    completedAt: currentEnrollment.completedAt,
    certificateId: certificateRow[0]?.id ?? null,
    lessons: lessonRows.map((row) => ({
      ...row,
      status: row.status ?? "not_started",
      bestScore: row.bestScore ?? null,
      latestScore: row.latestScore ?? null,
      attemptCount: row.attemptCount ?? 0,
    })),
  };
}

export async function markLessonStarted(
  database: Database,
  input: { courseId: string; lessonId: string; userId: string },
) {
  const currentEnrollment = await ensureEnrollment(database, {
    courseId: input.courseId,
    userId: input.userId,
  });
  const currentProgress = await ensureLessonProgress(database, {
    enrollmentId: currentEnrollment.id,
    lessonId: input.lessonId,
    status: "in_progress",
  });

  if (currentProgress.status === "not_started") {
    await database
      .update(lessonProgress)
      .set({ status: "in_progress", startedAt: now(), lastViewedAt: now(), updatedAt: now() })
      .where(eq(lessonProgress.id, currentProgress.id));
  } else {
    await database
      .update(lessonProgress)
      .set({ lastViewedAt: now(), updatedAt: now() })
      .where(eq(lessonProgress.id, currentProgress.id));
  }

  await touchEnrollment(database, currentEnrollment.id);
}

export async function markLessonCompleted(
  database: Database,
  input: { courseId: string; lessonId: string; userId: string },
) {
  const currentEnrollment = await ensureEnrollment(database, {
    courseId: input.courseId,
    userId: input.userId,
  });
  const currentProgress = await ensureLessonProgress(database, {
    enrollmentId: currentEnrollment.id,
    lessonId: input.lessonId,
  });

  await database
    .update(lessonProgress)
    .set({
      status: "completed",
      startedAt: currentProgress.startedAt ?? now(),
      completedAt: now(),
      lastViewedAt: now(),
      updatedAt: now(),
    })
    .where(eq(lessonProgress.id, currentProgress.id));

  await touchEnrollment(database, currentEnrollment.id);
  await maybeIssueCertificate(database, {
    enrollmentId: currentEnrollment.id,
    courseId: input.courseId,
    userId: input.userId,
  });
}

export type LessonAnswerDraft = {
  selected: string[];
  isCorrect: boolean;
};

export type LessonAnswerDraftMap = Record<string, LessonAnswerDraft>;

function parseDraftAnswers(value: unknown): LessonAnswerDraftMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: LessonAnswerDraftMap = {};
  for (const [questionId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as { selected?: unknown; isCorrect?: unknown };
    if (Array.isArray(entry.selected) && typeof entry.isCorrect === "boolean") {
      out[questionId] = {
        selected: entry.selected.filter((s): s is string => typeof s === "string"),
        isCorrect: entry.isCorrect,
      };
    }
  }
  return out;
}

export async function getLearnerLessonAnswers(
  database: Database,
  input: { courseId: string; userId: string; lessonId: string },
): Promise<{ answers: LessonAnswerDraftMap; source: "completed" | "draft" | "none" }> {
  const currentEnrollment = await getEnrollmentForUserCourse(database, {
    courseId: input.courseId,
    userId: input.userId,
  });
  if (!currentEnrollment) return { answers: {}, source: "none" };

  const [latestAttempt] = await database
    .select({ answers: lessonAttempt.answers })
    .from(lessonAttempt)
    .where(
      and(
        eq(lessonAttempt.enrollmentId, currentEnrollment.id),
        eq(lessonAttempt.lessonId, input.lessonId),
      ),
    )
    .orderBy(sql`${lessonAttempt.attemptNumber} desc`)
    .limit(1);
  if (latestAttempt) {
    const list =
      (latestAttempt.answers as Array<{
        questionId?: string;
        selected?: string[];
        isCorrect?: boolean;
      }>) ?? [];
    const answers: LessonAnswerDraftMap = {};
    for (const entry of list) {
      if (typeof entry.questionId === "string" && Array.isArray(entry.selected)) {
        answers[entry.questionId] = {
          selected: entry.selected,
          isCorrect: Boolean(entry.isCorrect),
        };
      }
    }
    return { answers, source: "completed" };
  }

  const [progressRow] = await database
    .select({ draftAnswers: lessonProgress.draftAnswers })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.enrollmentId, currentEnrollment.id),
        eq(lessonProgress.lessonId, input.lessonId),
      ),
    )
    .limit(1);
  if (!progressRow) return { answers: {}, source: "none" };
  const [lessonTypeRow] = await database
    .select({ type: lesson.type })
    .from(lesson)
    .where(eq(lesson.id, input.lessonId))
    .limit(1);
  let answers = parseDraftAnswers(progressRow.draftAnswers);
  if (lessonTypeRow?.type === "article") {
    answers = Object.fromEntries(Object.entries(answers).filter(([, entry]) => entry.isCorrect));
  }
  return { answers, source: "draft" };
}

export type ExamIntegrityEventRow = { kind: string; at: string };

export function parseExamIntegrityEvents(value: unknown): ExamIntegrityEventRow[] {
  if (!Array.isArray(value)) return [];
  const out: ExamIntegrityEventRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { kind?: unknown; at?: unknown };
    if (typeof row.kind !== "string" || typeof row.at !== "string") continue;
    out.push({ kind: row.kind, at: row.at });
  }
  return out;
}

export async function appendExamIntegrityEvent(
  database: Database,
  input: {
    courseId: string;
    lessonId: string;
    userId: string;
    kind: string;
  },
) {
  const currentEnrollment = await ensureEnrollment(database, {
    courseId: input.courseId,
    userId: input.userId,
  });
  const currentProgress = await ensureLessonProgress(database, {
    enrollmentId: currentEnrollment.id,
    lessonId: input.lessonId,
  });
  const existing = parseExamIntegrityEvents(currentProgress.examIntegrityEvents);
  const next: ExamIntegrityEventRow[] = [
    ...existing,
    { kind: input.kind, at: now().toISOString() },
  ];
  await database
    .update(lessonProgress)
    .set({ examIntegrityEvents: next, updatedAt: now() })
    .where(eq(lessonProgress.id, currentProgress.id));
}

export async function recordLessonAnswerDraft(
  database: Database,
  input: {
    courseId: string;
    userId: string;
    lessonId: string;
    questionId: string;
    selected: string[];
    isCorrect: boolean;
  },
) {
  const currentEnrollment = await ensureEnrollment(database, {
    courseId: input.courseId,
    userId: input.userId,
  });
  const currentProgress = await ensureLessonProgress(database, {
    enrollmentId: currentEnrollment.id,
    lessonId: input.lessonId,
  });

  const next = parseDraftAnswers(currentProgress.draftAnswers);
  next[input.questionId] = { selected: input.selected, isCorrect: input.isCorrect };

  await database
    .update(lessonProgress)
    .set({ draftAnswers: next, updatedAt: now() })
    .where(eq(lessonProgress.id, currentProgress.id));
}

export async function submitLessonAttempt(
  database: Database,
  input: {
    courseId: string;
    lessonId: string;
    userId: string;
    answers: Array<{ questionId: string; selected: string[] }>;
  },
): Promise<{ score: number; maxScore: number; passed: boolean }> {
  const currentEnrollment = await ensureEnrollment(database, {
    courseId: input.courseId,
    userId: input.userId,
  });
  const currentProgress = await ensureLessonProgress(database, {
    enrollmentId: currentEnrollment.id,
    lessonId: input.lessonId,
  });

  const [lessonRow] = await database
    .select()
    .from(lesson)
    .where(eq(lesson.id, input.lessonId))
    .limit(1);
  if (!lessonRow) {
    throw new Error("Lesson not found");
  }

  const questions = getQuestionDefinitionsFromContent(lessonRow.content);
  const maxScore = questions.length;
  const answerMap = new Map(
    input.answers.map((answer) => [answer.questionId, [...answer.selected].sort()]),
  );
  let score = 0;
  const evaluatedAnswers = questions.map((question) => {
    const selected = answerMap.get(question.questionId) ?? [];
    const isCorrect =
      selected.length === question.correctIds.length &&
      question.correctIds.every((correctId, index) => selected[index] === correctId);

    if (isCorrect) {
      score += 1;
    }

    return {
      correctIds: question.correctIds,
      isCorrect,
      prompt: question.prompt,
      questionId: question.questionId,
      selected,
      type: question.type,
    };
  });

  const passed = maxScore > 0 && score === maxScore;

  const examIntegritySnapshot =
    lessonRow.type === "exam"
      ? parseExamIntegrityEvents(currentProgress.examIntegrityEvents)
      : null;

  const [attemptNumberRow] = await database
    .select({ value: max(lessonAttempt.attemptNumber) })
    .from(lessonAttempt)
    .where(
      and(
        eq(lessonAttempt.enrollmentId, currentEnrollment.id),
        eq(lessonAttempt.lessonId, input.lessonId),
      ),
    );

  await database.insert(lessonAttempt).values({
    enrollmentId: currentEnrollment.id,
    lessonId: input.lessonId,
    attemptNumber: (attemptNumberRow?.value ?? 0) + 1,
    score,
    maxScore,
    passed,
    answers: evaluatedAnswers,
    integrityEvents: examIntegritySnapshot?.length ? examIntegritySnapshot : null,
    submittedAt: now(),
  });

  const timestamp = now();
  await database
    .update(lessonProgress)
    .set({
      status: "completed",
      startedAt: currentProgress.startedAt ?? timestamp,
      completedAt: timestamp,
      lastViewedAt: timestamp,
      bestScore:
        currentProgress.bestScore == null ? score : Math.max(currentProgress.bestScore, score),
      latestScore: score,
      attemptCount: currentProgress.attemptCount + 1,
      draftAnswers: null,
      updatedAt: timestamp,
      ...(lessonRow.type === "exam" ? { examIntegrityEvents: null } : {}),
    })
    .where(eq(lessonProgress.id, currentProgress.id));

  await touchEnrollment(database, currentEnrollment.id);
  await maybeIssueCertificate(database, {
    enrollmentId: currentEnrollment.id,
    courseId: input.courseId,
    userId: input.userId,
  });

  return { score, maxScore, passed };
}

export async function countCourseEnrollments(database: Database, input: { courseId: string }) {
  const [row] = await database
    .select({ value: count() })
    .from(enrollment)
    .where(eq(enrollment.courseId, input.courseId));

  return row?.value ?? 0;
}

export async function listCourseEnrollments(
  database: Database,
  input: { courseId: string; search?: string; limit: number; offset: number },
): Promise<ListCourseEnrollmentsResult> {
  const filters: SQL[] = [eq(enrollment.courseId, input.courseId)];

  if (input.search) {
    const pattern = `%${input.search}%`;
    const expr = or(ilike(user.name, pattern), ilike(user.email, pattern));
    if (expr) filters.push(expr);
  }

  const where = and(...filters);

  const [rows, totalRow] = await Promise.all([
    database
      .select({
        enrollmentId: enrollment.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        bio: profile.bio,
        status: enrollment.status,
        completedLessonCount: sql<number>`(
          select count(*)::int
          from ${lessonProgress}
          where ${lessonProgress.enrollmentId} = ${enrollment.id}
            and ${lessonProgress.status} = 'completed'
        )`,
        totalLessonCount: sql<number>`(
          select count(*)::int
          from ${lesson}
          inner join ${section} on ${lesson.sectionId} = ${section.id}
          where ${section.courseId} = ${enrollment.courseId}
        )`,
        lastActivityAt: enrollment.lastActivityAt,
        certificateIssued: sql<boolean>`exists(
          select 1 from ${certificate} where ${certificate.enrollmentId} = ${enrollment.id}
        )`,
        certificateSentAt: sql<Date | null>`(
          select ${certificate.emailSentAt}
          from ${certificate}
          where ${certificate.enrollmentId} = ${enrollment.id}
          limit 1
        )`,
      })
      .from(enrollment)
      .innerJoin(user, eq(user.id, enrollment.userId))
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(where)
      .orderBy(asc(user.name), asc(user.email))
      .limit(input.limit)
      .offset(input.offset),
    database
      .select({ value: count() })
      .from(enrollment)
      .innerJoin(user, eq(user.id, enrollment.userId))
      .where(where),
  ]);

  return {
    rows,
    totalCount: totalRow[0]?.value ?? 0,
  };
}

export async function getCourseEnrollmentDetail(
  database: Database,
  input: { courseId: string; enrollmentId: string },
): Promise<CourseEnrollmentDetail | null> {
  const [enrollmentRow, lessonRows, certificateRow] = await Promise.all([
    database
      .select({
        enrollmentId: enrollment.id,
        courseId: enrollment.courseId,
        userId: enrollment.userId,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        bio: profile.bio,
        onboardedAt: profile.onboardedAt,
        status: enrollment.status,
        startedAt: enrollment.startedAt,
        completedAt: enrollment.completedAt,
        lastActivityAt: enrollment.lastActivityAt,
      })
      .from(enrollment)
      .innerJoin(user, eq(user.id, enrollment.userId))
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(and(eq(enrollment.id, input.enrollmentId), eq(enrollment.courseId, input.courseId)))
      .limit(1),
    database
      .select({
        lessonId: lesson.id,
        sectionId: lesson.sectionId,
        lessonTitle: lesson.title,
        lessonType: lesson.type,
        openAt: lesson.openAt,
        dueAt: lesson.dueAt,
        order: lesson.order,
        sectionOrder: section.order,
        status: lessonProgress.status,
        bestScore: lessonProgress.bestScore,
        latestScore: lessonProgress.latestScore,
        attemptCount: lessonProgress.attemptCount,
      })
      .from(lesson)
      .innerJoin(section, eq(lesson.sectionId, section.id))
      .leftJoin(
        lessonProgress,
        and(
          eq(lessonProgress.lessonId, lesson.id),
          eq(lessonProgress.enrollmentId, input.enrollmentId),
        ),
      )
      .where(eq(section.courseId, input.courseId))
      .orderBy(
        asc(section.order),
        asc(section.createdAt),
        asc(lesson.order),
        asc(lesson.createdAt),
      ),
    database
      .select({ id: certificate.id, emailSentAt: certificate.emailSentAt })
      .from(certificate)
      .where(eq(certificate.enrollmentId, input.enrollmentId))
      .limit(1),
  ]);

  const row = enrollmentRow[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    certificateIssued: Boolean(certificateRow[0]),
    certificateSentAt: certificateRow[0]?.emailSentAt ?? null,
    lessons: lessonRows.map((lessonRow) => ({
      ...lessonRow,
      status: lessonRow.status ?? "not_started",
      bestScore: lessonRow.bestScore ?? null,
      latestScore: lessonRow.latestScore ?? null,
      attemptCount: lessonRow.attemptCount ?? 0,
    })),
  };
}

export async function removeEnrollment(database: Database, input: { enrollmentId: string }) {
  const [deleted] = await database
    .delete(enrollment)
    .where(eq(enrollment.id, input.enrollmentId))
    .returning({ id: enrollment.id, courseId: enrollment.courseId, userId: enrollment.userId });

  return deleted ?? null;
}

export type CertificateSendContext = {
  enrollmentId: string;
  courseId: string;
  userId: string;
  recipientName: string;
  recipientEmail: string;
  courseTitle: string;
  courseCertificateSettings: unknown;
  completedLessonCount: number;
  totalLessonCount: number;
  certificate: {
    id: string;
    certificateNumber: string;
    issuedAt: Date;
    emailSentAt: Date | null;
  } | null;
};

/** Everything needed to render + email a course certificate for one enrollment. */
export async function getCertificateSendContext(
  database: Database,
  input: { courseId: string; enrollmentId: string },
): Promise<CertificateSendContext | null> {
  const [row] = await database
    .select({
      enrollmentId: enrollment.id,
      courseId: enrollment.courseId,
      userId: enrollment.userId,
      recipientName: user.name,
      recipientEmail: user.email,
      courseTitle: course.title,
      courseCertificateSettings: course.certificateSettings,
      completedLessonCount: sql<number>`(
        select count(*)::int
        from ${lessonProgress}
        where ${lessonProgress.enrollmentId} = ${enrollment.id}
          and ${lessonProgress.status} = 'completed'
      )`,
      totalLessonCount: sql<number>`(
        select count(*)::int
        from ${lesson}
        inner join ${section} on ${lesson.sectionId} = ${section.id}
        where ${section.courseId} = ${enrollment.courseId}
      )`,
      certificateId: certificate.id,
      certificateNumber: certificate.certificateNumber,
      certificateIssuedAt: certificate.issuedAt,
      certificateEmailSentAt: certificate.emailSentAt,
    })
    .from(enrollment)
    .innerJoin(user, eq(user.id, enrollment.userId))
    .innerJoin(course, eq(course.id, enrollment.courseId))
    .leftJoin(certificate, eq(certificate.enrollmentId, enrollment.id))
    .where(and(eq(enrollment.id, input.enrollmentId), eq(enrollment.courseId, input.courseId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const { certificateId, certificateNumber, certificateIssuedAt, certificateEmailSentAt, ...rest } =
    row;

  return {
    ...rest,
    certificate:
      certificateId && certificateNumber && certificateIssuedAt
        ? {
            id: certificateId,
            certificateNumber,
            issuedAt: certificateIssuedAt,
            emailSentAt: certificateEmailSentAt,
          }
        : null,
  };
}

/**
 * Returns the enrollment's certificate, issuing one first when it doesn't exist yet
 * (manual issue from the certificates page; automatic issue happens on course completion).
 */
export async function ensureCertificateForEnrollment(
  database: Database,
  input: {
    enrollmentId: string;
    courseId: string;
    userId: string;
    courseCertificateSettings?: unknown;
  },
): Promise<{ id: string; certificateNumber: string; issuedAt: Date; emailSentAt: Date | null }> {
  const [existing] = await database
    .select({
      id: certificate.id,
      certificateNumber: certificate.certificateNumber,
      issuedAt: certificate.issuedAt,
      emailSentAt: certificate.emailSentAt,
    })
    .from(certificate)
    .where(eq(certificate.enrollmentId, input.enrollmentId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await database
    .insert(certificate)
    .values({
      enrollmentId: input.enrollmentId,
      courseId: input.courseId,
      userId: input.userId,
      certificateNumber: buildCertificateNumber(),
      issuedAt: now(),
      metadata:
        input.courseCertificateSettings != null
          ? { courseCertificateSettings: input.courseCertificateSettings }
          : null,
    })
    .returning({
      id: certificate.id,
      certificateNumber: certificate.certificateNumber,
      issuedAt: certificate.issuedAt,
      emailSentAt: certificate.emailSentAt,
    });

  if (!created) {
    throw new Error("Failed to issue certificate");
  }

  return created;
}

/** Records that the certificate PDF was emailed to `sentTo`. */
export async function markCertificateEmailSent(
  database: Database,
  input: { certificateId: string; sentTo: string },
): Promise<Date> {
  const sentAt = now();
  await database
    .update(certificate)
    .set({ emailSentAt: sentAt, emailSentTo: input.sentTo })
    .where(eq(certificate.id, input.certificateId));

  return sentAt;
}
