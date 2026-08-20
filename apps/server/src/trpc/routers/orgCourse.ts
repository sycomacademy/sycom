import {
  addCourseInstructor,
  countCourseCoInstructors,
  createCourse,
  createSection,
  deleteCourse,
  deleteSectionById,
  getCourseAnalyticsExport,
  getCourseAnalyticsOverview,
  getCourseAnalyticsStudentDetail,
  getCourseCurriculum,
  getSectionById,
  listAvailableOrgCourseCoInstructors,
  listCourseAnalyticsStudents,
  listCourseCoInstructors,
  listCourses,
  recordApplicationAuditEvent,
  removeCourseInstructor,
  saveCurriculumOrder,
  setCourseCategories,
  updateCourse,
  updateSectionPatch,
} from "@sycom/db/queries/index";
import type { OrganizationRole } from "@sycom/db/schema/auth";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../init";
import type { Context } from "../context";
import { loadOrgCourseOrThrow, requireActiveOrgStaff } from "../lib/org-course-access";
import { auditRequestMeta } from "../lib/request-audit";
import {
  addCourseCoInstructorSchema,
  createCourseSchema,
  createSectionSchema,
  deleteCourseSchema,
  deleteSectionSchema,
  exportCourseAnalyticsSchema,
  getCourseAnalyticsOverviewSchema,
  getCourseAnalyticsStudentSchema,
  getCourseCurriculumSchema,
  getCourseSchema,
  listAvailableCourseCoInstructorsSchema,
  listCourseAnalyticsStudentsSchema,
  listCourseCoInstructorsSchema,
  listCoursesSchema,
  removeCourseCoInstructorSchema,
  saveCurriculumOrderSchema,
  setCourseCategoriesSchema,
  updateCourseSchema,
  updateSectionSchema,
} from "../schemas";
import { isUniqueViolation } from "../utils/helpers";

const CO_INSTRUCTOR_ELIGIBLE_ORG_ROLES: OrganizationRole[] = ["teacher", "admin"];

function requireSessionUserId(ctx: Pick<Context, "session">): string {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }
  return ctx.session.user.id;
}

function requireOrganizationIdFromCourse(existing: { organizationId: string | null }): string {
  const organizationId = existing.organizationId;
  if (!organizationId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
  }
  return organizationId;
}

export const orgCourseRouter = router({
  list: protectedProcedure.input(listCoursesSchema).query(async ({ ctx, input }) => {
    const { organizationId } = await requireActiveOrgStaff(ctx);

    return await listCourses(ctx.db, {
      ...input,
      scope: "organization",
      organizationId,
    });
  }),

  get: protectedProcedure.input(getCourseSchema).query(async ({ ctx, input }) => {
    return await loadOrgCourseOrThrow(ctx, input.courseId);
  }),

  getCurriculum: protectedProcedure
    .input(getCourseCurriculumSchema)
    .query(async ({ ctx, input }) => {
      await loadOrgCourseOrThrow(ctx, input.courseId);
      return await getCourseCurriculum(ctx.db, input);
    }),

  analyticsOverview: protectedProcedure
    .input(getCourseAnalyticsOverviewSchema)
    .query(async ({ ctx, input }) => {
      await loadOrgCourseOrThrow(ctx, input.courseId);
      return await getCourseAnalyticsOverview(ctx.db, input);
    }),

  listAnalyticsStudents: protectedProcedure
    .input(listCourseAnalyticsStudentsSchema)
    .query(async ({ ctx, input }) => {
      await loadOrgCourseOrThrow(ctx, input.courseId);
      return await listCourseAnalyticsStudents(ctx.db, input);
    }),

  exportAnalytics: protectedProcedure
    .input(exportCourseAnalyticsSchema)
    .query(async ({ ctx, input }) => {
      await loadOrgCourseOrThrow(ctx, input.courseId);
      return await getCourseAnalyticsExport(ctx.db, input);
    }),

  getAnalyticsStudent: protectedProcedure
    .input(getCourseAnalyticsStudentSchema)
    .query(async ({ ctx, input }) => {
      await loadOrgCourseOrThrow(ctx, input.courseId);

      const student = await getCourseAnalyticsStudentDetail(ctx.db, input);
      if (!student) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      }
      return student;
    }),

  create: protectedProcedure.input(createCourseSchema).mutation(async ({ ctx, input }) => {
    const { organizationId } = await requireActiveOrgStaff(ctx);

    const actorId = requireSessionUserId(ctx);

    let courseRow: { id: string };
    try {
      courseRow = await createCourse(ctx.db, {
        scope: "organization",
        organizationId,
        title: input.title,
        slug: input.slug,
        description: input.description,
        imageUrl: input.imageUrl,
        difficulty: input.difficulty,
        status: input.status,
        createdBy: actorId,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A course with this slug already exists in this organization",
        });
      }
      throw err;
    }

    if (input.instructorIds.length > 0) {
      for (const [index, userId] of input.instructorIds.entries()) {
        await addCourseInstructor(ctx.db, {
          courseId: courseRow.id,
          userId,
          role: index === 0 ? "main" : "secondary",
          addedBy: actorId,
        });
      }
    }
    if (input.categoryIds.length > 0) {
      await setCourseCategories(ctx.db, {
        courseId: courseRow.id,
        categoryIds: input.categoryIds,
      });
    }

    const { ip, userAgent } = auditRequestMeta(ctx);
    await recordApplicationAuditEvent(ctx.db, {
      event: "org_course_created",
      eventTitle: "Organization course created",
      eventSubtitle: `${input.title} was added`,
      actorId,
      actorType: "user",
      organizationId,
      ip,
      userAgent,
      metadata: {
        courseId: courseRow.id,
        courseTitle: input.title,
        courseSlug: input.slug,
        status: input.status,
        difficulty: input.difficulty,
        instructorIds: input.instructorIds,
        categoryIds: input.categoryIds,
      },
    });

    return { courseId: courseRow.id };
  }),

  createSection: protectedProcedure.input(createSectionSchema).mutation(async ({ ctx, input }) => {
    await loadOrgCourseOrThrow(ctx, input.courseId);
    return await createSection(ctx.db, input);
  }),

  updateSection: protectedProcedure.input(updateSectionSchema).mutation(async ({ ctx, input }) => {
    const section = await getSectionById(ctx.db, { sectionId: input.sectionId });
    if (!section) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Section not found" });
    }

    await loadOrgCourseOrThrow(ctx, section.courseId);

    const updated = await updateSectionPatch(ctx.db, input);
    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Section not found" });
    }

    return updated;
  }),

  deleteSection: protectedProcedure.input(deleteSectionSchema).mutation(async ({ ctx, input }) => {
    const section = await getSectionById(ctx.db, { sectionId: input.sectionId });
    if (!section) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Section not found" });
    }

    await loadOrgCourseOrThrow(ctx, section.courseId);

    const deleted = await deleteSectionById(ctx.db, input);
    if (!deleted) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Section not found" });
    }

    return { success: true };
  }),

  saveCurriculumOrder: protectedProcedure
    .input(saveCurriculumOrderSchema)
    .mutation(async ({ ctx, input }) => {
      await loadOrgCourseOrThrow(ctx, input.courseId);
      await saveCurriculumOrder(ctx.db, input);
      return { success: true };
    }),

  update: protectedProcedure.input(updateCourseSchema).mutation(async ({ ctx, input }) => {
    const existing = await loadOrgCourseOrThrow(ctx, input.courseId);
    const actorId = requireSessionUserId(ctx);
    const organizationIdForAudit = requireOrganizationIdFromCourse(existing);

    try {
      await updateCourse(ctx.db, { courseId: input.courseId, patch: input.patch });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A course with this slug already exists in this organization",
        });
      }
      throw err;
    }

    const { ip, userAgent } = auditRequestMeta(ctx);
    await recordApplicationAuditEvent(ctx.db, {
      event: "org_course_updated",
      eventTitle: "Organization course updated",
      eventSubtitle: `${existing.title} metadata was updated`,
      actorId,
      actorType: "user",
      organizationId: organizationIdForAudit,
      ip,
      userAgent,
      metadata: {
        courseId: input.courseId,
        courseTitle: existing.title,
        patch: input.patch,
      },
    });

    return { success: true };
  }),

  delete: protectedProcedure.input(deleteCourseSchema).mutation(async ({ ctx, input }) => {
    const existing = await loadOrgCourseOrThrow(ctx, input.courseId);
    const actorId = requireSessionUserId(ctx);
    const organizationIdForAudit = requireOrganizationIdFromCourse(existing);

    await deleteCourse(ctx.db, input);

    const { ip, userAgent } = auditRequestMeta(ctx);
    await recordApplicationAuditEvent(ctx.db, {
      event: "org_course_deleted",
      eventTitle: "Organization course deleted",
      eventSubtitle: `${existing.title} was removed`,
      actorId,
      actorType: "user",
      organizationId: organizationIdForAudit,
      ip,
      userAgent,
      metadata: {
        courseId: input.courseId,
        courseTitle: existing.title,
        courseSlug: existing.slug,
        instructorNames: existing.instructors.map((i) => i.name),
        categoryNames: existing.categories.map((c) => c.name),
      },
    });

    return { success: true };
  }),

  listCoInstructors: protectedProcedure
    .input(listCourseCoInstructorsSchema)
    .query(async ({ ctx, input }) => {
      await loadOrgCourseOrThrow(ctx, input.courseId);
      return await listCourseCoInstructors(ctx.db, input);
    }),

  addCoInstructor: protectedProcedure
    .input(addCourseCoInstructorSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await loadOrgCourseOrThrow(ctx, input.courseId);

      if (existing.createdBy === input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The main instructor is already assigned",
        });
      }

      const coInstructorCount = await countCourseCoInstructors(ctx.db, {
        courseId: input.courseId,
      });
      if (coInstructorCount >= 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A course can have at most 3 co-instructors",
        });
      }

      await addCourseInstructor(ctx.db, {
        courseId: input.courseId,
        userId: input.userId,
        role: "secondary",
        addedBy: requireSessionUserId(ctx),
      });

      return { success: true };
    }),

  removeCoInstructor: protectedProcedure
    .input(removeCourseCoInstructorSchema)
    .mutation(async ({ ctx, input }) => {
      await loadOrgCourseOrThrow(ctx, input.courseId);
      await removeCourseInstructor(ctx.db, input);
      return { success: true };
    }),

  listAvailableCoInstructors: protectedProcedure
    .input(listAvailableCourseCoInstructorsSchema)
    .query(async ({ ctx, input }) => {
      const existing = await loadOrgCourseOrThrow(ctx, input.courseId);

      return await listAvailableOrgCourseCoInstructors(ctx.db, {
        ...input,
        organizationId: requireOrganizationIdFromCourse(existing),
        orgRoles: CO_INSTRUCTOR_ELIGIBLE_ORG_ROLES,
      });
    }),

  setCategories: protectedProcedure
    .input(setCourseCategoriesSchema)
    .mutation(async ({ ctx, input }) => {
      await loadOrgCourseOrThrow(ctx, input.courseId);
      await setCourseCategories(ctx.db, input);
      return { success: true };
    }),
});
