import {
  createEnrollment,
  ensureCertificateForEnrollment,
  getCertificateSendContext,
  getCourseById,
  getCourseEnrollmentDetail,
  getEnrollmentProgressSummary,
  getLessonWithCourseId,
  getSectionById,
  listCourseEnrollments,
  markCertificateEmailSent,
  markLessonCompleted,
  markLessonStarted,
  removeEnrollment,
  submitLessonAttempt,
} from "@sycom/db/queries/index";
import { TRPCError } from "@trpc/server";

import { sendCourseCertificateEmail } from "../../lib/certificate-email";
import type { Context } from "../context";
import { protectedProcedure, router } from "../init";
import {
  assertCanReadCatalogCourse,
  assertCanReadPublicCourse,
  classifyCatalogEnrollAccess,
} from "../lib/public-course-access";
import { assertPlatformOrOrgCourseWrite } from "../lib/org-course-access";
import {
  enrollInCourseInputSchema,
  getCourseEnrollmentDetailSchema,
  getMyCourseProgressInputSchema,
  listCourseEnrollmentsSchema,
  markLessonCompletedInputSchema,
  markLessonStartedInputSchema,
  removeCourseEnrollmentSchema,
  sendCourseCertificateSchema,
  submitLessonAttemptInputSchema,
} from "../schemas";
import { platformPermissionMiddleware } from "../middleware/permissions";

type CourseDetail = NonNullable<Awaited<ReturnType<typeof getCourseById>>>;

async function loadPlatformCourse(
  database: Context["db"],
  courseId: string,
): Promise<CourseDetail> {
  const detail = await getCourseById(database, { courseId });
  if (!detail || detail.organizationId !== null) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
  }
  return detail;
}

async function loadCatalogCourse(
  database: Context["db"],
  session: Context["session"],
  courseId: string,
): Promise<CourseDetail> {
  const detail = await getCourseById(database, { courseId });
  if (!detail || detail.status !== "published") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
  }
  assertCanReadCatalogCourse(session, {
    organizationId: detail.organizationId,
    createdBy: detail.createdBy,
    instructors: detail.instructors,
  });
  return detail;
}

async function loadLearnerLesson(
  database: Context["db"],
  session: Context["session"],
  input: { courseId: string; lessonId: string },
) {
  const row = await getLessonWithCourseId(database, input.lessonId);
  if (!row || row.courseId !== input.courseId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lesson not found" });
  }
  await loadCatalogCourse(database, session, input.courseId);
  return row;
}

export const enrollmentRouter = router({
  listByCourse: protectedProcedure
    .input(listCourseEnrollmentsSchema)
    .query(async ({ ctx, input }) => {
      await assertPlatformOrOrgCourseWrite(ctx, input.courseId);
      return await listCourseEnrollments(ctx.db, input);
    }),

  getEnrollmentDetail: protectedProcedure
    .input(getCourseEnrollmentDetailSchema)
    .query(async ({ ctx, input }) => {
      await assertPlatformOrOrgCourseWrite(ctx, input.courseId);

      const row = await getCourseEnrollmentDetail(ctx.db, input);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Enrollment not found" });
      }
      return row;
    }),

  removeEnrollment: protectedProcedure
    .input(removeCourseEnrollmentSchema)
    .mutation(async ({ ctx, input }) => {
      await assertPlatformOrOrgCourseWrite(ctx, input.courseId);

      const deleted = await removeEnrollment(ctx.db, { enrollmentId: input.enrollmentId });
      if (!deleted || deleted.courseId !== input.courseId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Enrollment not found" });
      }
      return { success: true };
    }),

  sendCertificate: protectedProcedure
    .input(sendCourseCertificateSchema)
    .mutation(async ({ ctx, input }) => {
      await assertPlatformOrOrgCourseWrite(ctx, input.courseId);

      const context = await getCertificateSendContext(ctx.db, input);
      if (!context) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Enrollment not found" });
      }

      if (context.totalLessonCount === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This course has no lessons yet, so there is nothing to certify.",
        });
      }

      if (context.completedLessonCount < context.totalLessonCount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${context.recipientName} hasn't completed every lesson yet.`,
        });
      }

      const issued = await ensureCertificateForEnrollment(ctx.db, {
        enrollmentId: context.enrollmentId,
        courseId: context.courseId,
        userId: context.userId,
        courseCertificateSettings: context.courseCertificateSettings,
      });

      await sendCourseCertificateEmail({
        to: context.recipientEmail,
        recipientName: context.recipientName,
        courseTitle: context.courseTitle,
        certificateNumber: issued.certificateNumber,
        issuedAt: issued.issuedAt,
        courseCertificateSettings: context.courseCertificateSettings,
      });

      const sentAt = await markCertificateEmailSent(ctx.db, {
        certificateId: issued.id,
        sentTo: context.recipientEmail,
      });

      return { sentAt, sentTo: context.recipientEmail, resent: issued.emailSentAt !== null };
    }),

  enroll: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(enrollInCourseInputSchema)
    .mutation(async ({ ctx, input }) => {
      const detail = await loadPlatformCourse(ctx.db, input.courseId);
      assertCanReadPublicCourse(ctx.session, detail);
      const classification = classifyCatalogEnrollAccess(ctx.session, {
        organizationId: detail.organizationId,
        createdBy: detail.createdBy,
        instructors: detail.instructors,
      });
      if (classification.kind === "requires_payment") {
        throw new TRPCError({ code: "PAYMENT_REQUIRED", message: "Payment required" });
      }

      return await createEnrollment(ctx.db, {
        courseId: input.courseId,
        userId: ctx.session.user.id,
        accessSource: classification.accessSource,
      });
    }),

  getMyCourseProgress: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(getMyCourseProgressInputSchema)
    .query(async ({ ctx, input }) => {
      await loadCatalogCourse(ctx.db, ctx.session, input.courseId);
      return await getEnrollmentProgressSummary(ctx.db, {
        courseId: input.courseId,
        userId: ctx.session.user.id,
      });
    }),

  markLessonStarted: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(markLessonStartedInputSchema)
    .mutation(async ({ ctx, input }) => {
      await loadLearnerLesson(ctx.db, ctx.session, input);
      await markLessonStarted(ctx.db, { ...input, userId: ctx.session.user.id });
      return { success: true };
    }),

  markLessonCompleted: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(markLessonCompletedInputSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await loadLearnerLesson(ctx.db, ctx.session, input);
      if (row.type !== "article") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only article lessons can be marked complete directly",
        });
      }
      await markLessonCompleted(ctx.db, { ...input, userId: ctx.session.user.id });
      return { success: true };
    }),

  submitAttempt: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(submitLessonAttemptInputSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await loadLearnerLesson(ctx.db, ctx.session, input);
      if (row.type !== "quiz" && row.type !== "exam") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only quiz and exam lessons accept scored attempts",
        });
      }
      const now = new Date();
      if (row.openAt && now < row.openAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This assessment is not open yet" });
      }
      if (row.dueAt && now > row.dueAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This assessment is closed" });
      }
      const sectionRow = await getSectionById(ctx.db, { sectionId: row.sectionId });
      if (sectionRow?.dueAt && now > sectionRow.dueAt) {
        throw new TRPCError({ code: "FORBIDDEN", message: "This assessment is closed" });
      }
      return await submitLessonAttempt(ctx.db, { ...input, userId: ctx.session.user.id });
    }),
});
