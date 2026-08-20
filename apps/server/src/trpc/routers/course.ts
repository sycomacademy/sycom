import {
  addCourseInstructor,
  countCourseCoInstructors,
  createSection,
  createCategory,
  createCourse,
  deleteSectionById,
  deleteCategory,
  deleteCourse,
  getCourseAnalyticsExport,
  getCourseAnalyticsOverview,
  getCourseAnalyticsStudentDetail,
  getCourseCurriculum,
  listCourseAnalyticsStudents,
  getCourseById,
  getSectionById,
  listAvailableCourseCoInstructors,
  listCategories,
  listCourseCoInstructors,
  listSeededCourseOrganizations,
  listCourses,
  recordApplicationAuditEvent,
  removeCourseInstructor,
  saveCurriculumOrder,
  seedCourseToOrganizations,
  setCourseCategories,
  updateCategory,
  updateCourse,
  updateCourseCertificateSettings,
  updateSectionPatch,
} from "@sycom/db/queries/index";
import type { UserRole } from "@sycom/db/schema/auth";
import { TRPCError } from "@trpc/server";

import { adminProcedure, protectedProcedure, router } from "../init";
import {
  assertCanDeletePublicCourse,
  assertCanReadPublicCourse,
  assertCanUpdatePublicCourse,
} from "../lib/public-course-access";
import { auditRequestMeta } from "../lib/request-audit";
import { platformPermissionMiddleware } from "../middleware/permissions";
import {
  addCourseInstructorSchema,
  addCourseCoInstructorSchema,
  createSectionSchema,
  createAdminCategorySchema,
  createCourseSchema,
  deleteSectionSchema,
  deleteAdminCategorySchema,
  deleteCourseSchema,
  exportCourseAnalyticsSchema,
  getCourseAnalyticsOverviewSchema,
  getCourseAnalyticsStudentSchema,
  getCourseSchema,
  getCourseCurriculumSchema,
  listCourseAnalyticsStudentsSchema,
  listAvailableCourseCoInstructorsSchema,
  listAdminCategoriesSchema,
  listCourseCoInstructorsSchema,
  listSeededCourseOrganizationsSchema,
  listCoursesSchema,
  removeCourseCoInstructorSchema,
  removeCourseInstructorSchema,
  saveCurriculumOrderSchema,
  seedAdminCourseSchema,
  setCourseCategoriesSchema,
  updateAdminCategorySchema,
  updateCourseSchema,
  updateCourseCertificateSettingsSchema,
  updateSectionSchema,
} from "../schemas";
import { isUniqueViolation } from "../utils/helpers";

export const courseRouter = router({
  // ---- Courses ----
  list: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["list"] }))
    .input(listCoursesSchema)
    .query(async ({ ctx, input }) => {
      return await listCourses(ctx.db, {
        ...input,
        scope: "platform",
        actor: {
          userId: ctx.session.user.id,
          role: (ctx.session.user.role ?? null) as UserRole | null,
        },
      });
    }),

  get: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(getCourseSchema)
    .query(async ({ ctx, input }) => {
      const detail = await getCourseById(ctx.db, input);
      if (!detail || detail.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanReadPublicCourse(ctx.session, detail);
      return detail;
    }),

  getCurriculum: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(getCourseCurriculumSchema)
    .query(async ({ ctx, input }) => {
      const detail = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!detail || detail.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanReadPublicCourse(ctx.session, detail);

      return await getCourseCurriculum(ctx.db, input);
    }),

  analyticsOverview: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(getCourseAnalyticsOverviewSchema)
    .query(async ({ ctx, input }) => {
      const detail = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!detail || detail.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, detail);

      return await getCourseAnalyticsOverview(ctx.db, input);
    }),

  listAnalyticsStudents: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(listCourseAnalyticsStudentsSchema)
    .query(async ({ ctx, input }) => {
      const detail = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!detail || detail.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, detail);

      return await listCourseAnalyticsStudents(ctx.db, input);
    }),

  exportAnalytics: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(exportCourseAnalyticsSchema)
    .query(async ({ ctx, input }) => {
      const detail = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!detail || detail.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, detail);

      return await getCourseAnalyticsExport(ctx.db, input);
    }),

  getAnalyticsStudent: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(getCourseAnalyticsStudentSchema)
    .query(async ({ ctx, input }) => {
      const detail = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!detail || detail.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, detail);

      const student = await getCourseAnalyticsStudentDetail(ctx.db, input);
      if (!student) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      }
      return student;
    }),

  create: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["create"] }))
    .input(createCourseSchema)
    .mutation(async ({ ctx, input }) => {
      let courseRow: { id: string };
      try {
        courseRow = await createCourse(ctx.db, {
          scope: "platform",
          title: input.title,
          slug: input.slug,
          description: input.description,
          imageUrl: input.imageUrl,
          difficulty: input.difficulty,
          status: input.status,
          createdBy: ctx.session.user.id,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A public course with this slug already exists",
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
            addedBy: ctx.session.user.id,
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
        event: "course_created",
        eventTitle: "Course created",
        eventSubtitle: `${input.title} was added to public courses`,
        actorId: ctx.session.user.id,
        actorType: "user",
        organizationId: null,
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

  createSection: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(createSectionSchema)
    .mutation(async ({ ctx, input }) => {
      const detail = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!detail || detail.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, detail);

      return await createSection(ctx.db, input);
    }),

  updateSection: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(updateSectionSchema)
    .mutation(async ({ ctx, input }) => {
      const section = await getSectionById(ctx.db, { sectionId: input.sectionId });
      if (!section) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Section not found" });
      }

      const detail = await getCourseById(ctx.db, { courseId: section.courseId });
      if (!detail || detail.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, detail);

      const updated = await updateSectionPatch(ctx.db, input);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Section not found" });
      }

      return updated;
    }),

  deleteSection: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(deleteSectionSchema)
    .mutation(async ({ ctx, input }) => {
      const section = await getSectionById(ctx.db, { sectionId: input.sectionId });
      if (!section) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Section not found" });
      }

      const detail = await getCourseById(ctx.db, { courseId: section.courseId });
      if (!detail || detail.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, detail);

      const deleted = await deleteSectionById(ctx.db, input);
      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Section not found" });
      }

      return { success: true };
    }),

  saveCurriculumOrder: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(saveCurriculumOrderSchema)
    .mutation(async ({ ctx, input }) => {
      const detail = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!detail || detail.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, detail);

      await saveCurriculumOrder(ctx.db, input);
      return { success: true };
    }),

  updateCertificateSettings: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(updateCourseCertificateSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!existing || existing.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, existing);

      await updateCourseCertificateSettings(ctx.db, {
        courseId: input.courseId,
        certificateSettings: input.certificateSettings,
      });

      return { success: true };
    }),

  update: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(updateCourseSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!existing || existing.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, existing);

      try {
        await updateCourse(ctx.db, { courseId: input.courseId, patch: input.patch });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A public course with this slug already exists",
          });
        }
        throw err;
      }

      const { ip, userAgent } = auditRequestMeta(ctx);
      await recordApplicationAuditEvent(ctx.db, {
        event: "course_updated",
        eventTitle: "Course updated",
        eventSubtitle: `${existing.title} metadata was updated`,
        actorId: ctx.session.user.id,
        actorType: "user",
        organizationId: null,
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

  delete: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["delete"] }))
    .input(deleteCourseSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!existing || existing.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanDeletePublicCourse(ctx.session, existing);

      await deleteCourse(ctx.db, input);

      const { ip, userAgent } = auditRequestMeta(ctx);
      await recordApplicationAuditEvent(ctx.db, {
        event: "course_deleted",
        eventTitle: "Course deleted",
        eventSubtitle: `${existing.title} was removed from public courses`,
        actorId: ctx.session.user.id,
        actorType: "user",
        organizationId: null,
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

  /** Platform admins only (`adminProcedure`); forks a public course into org libraries. */
  seed: adminProcedure
    .use(platformPermissionMiddleware({ course: ["seed"] }))
    .input(seedAdminCourseSchema)
    .mutation(async ({ ctx, input }) => {
      const source = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!source || source.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source course not found" });
      }

      let results;
      try {
        results = await seedCourseToOrganizations(ctx.db, {
          sourceCourseId: input.courseId,
          organizationIds: input.organizationIds,
          seededByUserId: ctx.session.user.id,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "One of the target organizations already has a course with this slug",
          });
        }
        throw err;
      }

      const { ip, userAgent } = auditRequestMeta(ctx);
      for (const result of results) {
        await recordApplicationAuditEvent(ctx.db, {
          event: "course_seeded_to_organization",
          eventTitle: "Course seeded",
          eventSubtitle: `${source.title} was seeded from public courses`,
          actorId: ctx.session.user.id,
          actorType: "user",
          organizationId: result.organizationId,
          ip,
          userAgent,
          metadata: {
            sourceCourseId: input.courseId,
            sourceCourseTitle: source.title,
            sourceCourseSlug: source.slug,
            newCourseId: result.newCourseId,
          },
        });
      }

      return { seeded: results };
    }),

  // ---- Instructors ----
  listCoInstructors: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(listCourseCoInstructorsSchema)
    .query(async ({ ctx, input }) => {
      const existing = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!existing || existing.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, existing);

      return await listCourseCoInstructors(ctx.db, input);
    }),

  addCoInstructor: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(addCourseCoInstructorSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!existing || existing.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, existing);

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
        addedBy: ctx.session.user.id,
      });

      return { success: true };
    }),

  removeCoInstructor: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(removeCourseCoInstructorSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!existing || existing.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, existing);

      await removeCourseInstructor(ctx.db, input);
      return { success: true };
    }),

  listAvailableCoInstructors: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(listAvailableCourseCoInstructorsSchema)
    .query(async ({ ctx, input }) => {
      const existing = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!existing || existing.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, existing);

      return await listAvailableCourseCoInstructors(ctx.db, {
        ...input,
        roles: ["platform_admin", "content_creator"],
      });
    }),

  listSeededOrganizations: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(listSeededCourseOrganizationsSchema)
    .query(async ({ ctx, input }) => {
      const existing = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!existing || existing.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, existing);

      return await listSeededCourseOrganizations(ctx.db, input);
    }),

  addInstructor: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(addCourseInstructorSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!existing || existing.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, existing);

      await addCourseInstructor(ctx.db, {
        courseId: input.courseId,
        userId: input.userId,
        role: input.role,
        addedBy: ctx.session.user.id,
      });

      const { ip, userAgent } = auditRequestMeta(ctx);
      await recordApplicationAuditEvent(ctx.db, {
        event: "course_instructor_added",
        eventTitle: "Course instructor added",
        eventSubtitle: `Instructor added to ${existing.title}`,
        actorId: ctx.session.user.id,
        actorType: "user",
        organizationId: null,
        ip,
        userAgent,
        metadata: {
          courseId: input.courseId,
          courseTitle: existing.title,
          instructorUserId: input.userId,
          role: input.role,
        },
      });

      return { success: true };
    }),

  removeInstructor: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(removeCourseInstructorSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!existing || existing.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, existing);

      await removeCourseInstructor(ctx.db, input);

      const { ip, userAgent } = auditRequestMeta(ctx);
      await recordApplicationAuditEvent(ctx.db, {
        event: "course_instructor_removed",
        eventTitle: "Course instructor removed",
        eventSubtitle: `Instructor removed from ${existing.title}`,
        actorId: ctx.session.user.id,
        actorType: "user",
        organizationId: null,
        ip,
        userAgent,
        metadata: {
          courseId: input.courseId,
          courseTitle: existing.title,
          instructorUserId: input.userId,
        },
      });

      return { success: true };
    }),

  setCategories: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(setCourseCategoriesSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await getCourseById(ctx.db, { courseId: input.courseId });
      if (!existing || existing.organizationId !== null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      }
      assertCanUpdatePublicCourse(ctx.session, existing);

      await setCourseCategories(ctx.db, input);
      return { success: true };
    }),

  // ---- Categories ----
  listCategories: protectedProcedure
    .use(platformPermissionMiddleware({ course: ["read"] }))
    .input(listAdminCategoriesSchema)
    .query(async ({ ctx, input }) => {
      return await listCategories(ctx.db, input);
    }),

  createCategory: adminProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(createAdminCategorySchema)
    .mutation(async ({ ctx, input }) => {
      let row: { id: string };
      try {
        row = await createCategory(ctx.db, input);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A category with this slug already exists",
          });
        }
        throw err;
      }

      const { ip, userAgent } = auditRequestMeta(ctx);
      await recordApplicationAuditEvent(ctx.db, {
        event: "category_created",
        eventTitle: "Category created",
        eventSubtitle: `${input.name} was added to the course taxonomy`,
        actorId: ctx.session.user.id,
        actorType: "user",
        organizationId: null,
        ip,
        userAgent,
        metadata: { categoryId: row.id, categoryName: input.name, categorySlug: input.slug },
      });

      return { categoryId: row.id };
    }),

  updateCategory: adminProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(updateAdminCategorySchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await updateCategory(ctx.db, input);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A category with this slug already exists",
          });
        }
        throw err;
      }

      const { ip, userAgent } = auditRequestMeta(ctx);
      await recordApplicationAuditEvent(ctx.db, {
        event: "category_updated",
        eventTitle: "Category updated",
        eventSubtitle: `Category metadata changed`,
        actorId: ctx.session.user.id,
        actorType: "user",
        organizationId: null,
        ip,
        userAgent,
        metadata: { categoryId: input.categoryId, patch: input.patch },
      });

      return { success: true };
    }),

  deleteCategory: adminProcedure
    .use(platformPermissionMiddleware({ course: ["update"] }))
    .input(deleteAdminCategorySchema)
    .mutation(async ({ ctx, input }) => {
      await deleteCategory(ctx.db, input);

      const { ip, userAgent } = auditRequestMeta(ctx);
      await recordApplicationAuditEvent(ctx.db, {
        event: "category_deleted",
        eventTitle: "Category deleted",
        eventSubtitle: `Category was removed from the taxonomy`,
        actorId: ctx.session.user.id,
        actorType: "user",
        organizationId: null,
        ip,
        userAgent,
        metadata: { categoryId: input.categoryId },
      });

      return { success: true };
    }),
});
