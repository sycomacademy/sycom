import { appendImportedSections } from "@sycom/db/queries/index";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../init";
import { assertPlatformOrOrgCourseWrite } from "../lib/org-course-access";
import { importCourseSectionsSchema } from "../schemas";

/**
 * Bulk curriculum import from an authored document (today, Word).
 *
 * The document is parsed in the browser — mammoth and the TipTap schema both live
 * there, and the server has no DOM — so this procedure treats the tree as untrusted
 * input and leans on `importCourseSectionsSchema` to bound it.
 *
 * One procedure covers platform and organization courses alike, the way
 * `lesson.update` does: `assertPlatformOrOrgCourseWrite` resolves the course's scope
 * and applies the matching rule, so there is nothing to mirror into `orgCourse`.
 */
export const courseImportRouter = router({
  importSections: protectedProcedure
    .input(importCourseSectionsSchema)
    .mutation(async ({ ctx, input }) => {
      await assertPlatformOrOrgCourseWrite(ctx, input.courseId);

      const lessonCount = input.sections.reduce(
        (total, section) => total + section.lessons.length,
        0,
      );

      if (lessonCount === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The document produced no lessons",
        });
      }

      const created = await appendImportedSections(ctx.db, {
        courseId: input.courseId,
        sections: input.sections.map((section) => ({
          title: section.title,
          description: section.description ?? null,
          lessons: section.lessons.map((lesson) => ({
            title: lesson.title,
            content: lesson.content,
          })),
        })),
      });

      return { sections: created };
    }),
});
