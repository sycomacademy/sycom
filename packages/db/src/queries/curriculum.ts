import { and, asc, eq, max } from "drizzle-orm";

import type { Database } from "..";
import { lesson, section, type LessonType } from "../schema/course";

export type CurriculumLesson = {
  id: string;
  sectionId: string;
  title: string;
  type: LessonType;
  openAt: Date | null;
  dueAt: Date | null;
  order: number;
  content: unknown;
  updatedAt: Date;
};

export type CurriculumSection = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  openAt: Date | null;
  dueAt: Date | null;
  order: number;
  lessons: CurriculumLesson[];
};

export type CurriculumLessonOutline = {
  id: string;
  sectionId: string;
  title: string;
  type: LessonType;
  openAt: Date | null;
  dueAt: Date | null;
  order: number;
};

export type CurriculumSectionOutline = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  openAt: Date | null;
  dueAt: Date | null;
  order: number;
  lessons: CurriculumLessonOutline[];
};

export type CurriculumSectionOrderInput = {
  sectionId: string;
  lessonIds: string[];
};

export async function getSectionById(database: Database, input: { sectionId: string }) {
  const [row] = await database
    .select({
      id: section.id,
      courseId: section.courseId,
      title: section.title,
      description: section.description,
      openAt: section.openAt,
      dueAt: section.dueAt,
      order: section.order,
    })
    .from(section)
    .where(eq(section.id, input.sectionId))
    .limit(1);

  return row ?? null;
}

export async function getLessonCourseContext(database: Database, input: { lessonId: string }) {
  const [row] = await database
    .select({
      lessonId: lesson.id,
      sectionId: lesson.sectionId,
      courseId: section.courseId,
    })
    .from(lesson)
    .innerJoin(section, eq(lesson.sectionId, section.id))
    .where(eq(lesson.id, input.lessonId))
    .limit(1);

  return row ?? null;
}

export async function getCourseCurriculum(
  database: Database,
  input: { courseId: string },
): Promise<CurriculumSection[]> {
  const [sectionRows, lessonRows] = await Promise.all([
    database
      .select({
        id: section.id,
        courseId: section.courseId,
        title: section.title,
        description: section.description,
        openAt: section.openAt,
        dueAt: section.dueAt,
        order: section.order,
      })
      .from(section)
      .where(eq(section.courseId, input.courseId))
      .orderBy(asc(section.order), asc(section.createdAt)),
    database
      .select({
        id: lesson.id,
        sectionId: lesson.sectionId,
        title: lesson.title,
        type: lesson.type,
        openAt: lesson.openAt,
        dueAt: lesson.dueAt,
        order: lesson.order,
        content: lesson.content,
        updatedAt: lesson.updatedAt,
      })
      .from(lesson)
      .innerJoin(section, eq(lesson.sectionId, section.id))
      .where(eq(section.courseId, input.courseId))
      .orderBy(
        asc(section.order),
        asc(section.createdAt),
        asc(lesson.order),
        asc(lesson.createdAt),
      ),
  ]);

  const lessonsBySection = new Map<string, CurriculumLesson[]>();
  for (const lessonRow of lessonRows) {
    const rows = lessonsBySection.get(lessonRow.sectionId) ?? [];
    rows.push(lessonRow);
    lessonsBySection.set(lessonRow.sectionId, rows);
  }

  return sectionRows.map((sectionRow) => ({
    ...sectionRow,
    lessons: lessonsBySection.get(sectionRow.id) ?? [],
  }));
}

/** Curriculum structure without lesson document payloads (for learner shell). */
export async function getCourseCurriculumOutline(
  database: Database,
  input: { courseId: string },
): Promise<CurriculumSectionOutline[]> {
  const [sectionRows, lessonRows] = await Promise.all([
    database
      .select({
        id: section.id,
        courseId: section.courseId,
        title: section.title,
        description: section.description,
        openAt: section.openAt,
        dueAt: section.dueAt,
        order: section.order,
      })
      .from(section)
      .where(eq(section.courseId, input.courseId))
      .orderBy(asc(section.order), asc(section.createdAt)),
    database
      .select({
        id: lesson.id,
        sectionId: lesson.sectionId,
        title: lesson.title,
        type: lesson.type,
        openAt: lesson.openAt,
        dueAt: lesson.dueAt,
        order: lesson.order,
      })
      .from(lesson)
      .innerJoin(section, eq(lesson.sectionId, section.id))
      .where(eq(section.courseId, input.courseId))
      .orderBy(
        asc(section.order),
        asc(section.createdAt),
        asc(lesson.order),
        asc(lesson.createdAt),
      ),
  ]);

  const lessonsBySection = new Map<string, CurriculumLessonOutline[]>();
  for (const lessonRow of lessonRows) {
    const rows = lessonsBySection.get(lessonRow.sectionId) ?? [];
    rows.push(lessonRow);
    lessonsBySection.set(lessonRow.sectionId, rows);
  }

  return sectionRows.map((sectionRow) => ({
    ...sectionRow,
    lessons: lessonsBySection.get(sectionRow.id) ?? [],
  }));
}

export async function createSection(
  database: Database,
  input: {
    courseId: string;
    title: string;
    description?: string | null;
    openAt?: Date | null;
    dueAt?: Date | null;
  },
): Promise<CurriculumSection> {
  const [orderRow] = await database
    .select({ value: max(section.order) })
    .from(section)
    .where(eq(section.courseId, input.courseId));

  const [created] = await database
    .insert(section)
    .values({
      courseId: input.courseId,
      title: input.title,
      description: input.description ?? null,
      openAt: input.openAt ?? null,
      dueAt: input.dueAt ?? null,
      order: (orderRow?.value ?? -1) + 1,
    })
    .returning({
      id: section.id,
      courseId: section.courseId,
      title: section.title,
      description: section.description,
      openAt: section.openAt,
      dueAt: section.dueAt,
      order: section.order,
    });

  if (!created) {
    throw new Error("Failed to create section");
  }

  return {
    ...created,
    lessons: [],
  };
}

export async function createLesson(
  database: Database,
  input: {
    courseId: string;
    sectionId: string;
    title: string;
    type?: LessonType;
    openAt?: Date | null;
    dueAt?: Date | null;
  },
): Promise<CurriculumLesson | null> {
  const [matchingSection] = await database
    .select({ id: section.id })
    .from(section)
    .where(and(eq(section.id, input.sectionId), eq(section.courseId, input.courseId)))
    .limit(1);

  if (!matchingSection) {
    return null;
  }

  const [orderRow] = await database
    .select({ value: max(lesson.order) })
    .from(lesson)
    .where(eq(lesson.sectionId, input.sectionId));

  const [created] = await database
    .insert(lesson)
    .values({
      sectionId: input.sectionId,
      title: input.title,
      type: input.type ?? "article",
      openAt: input.openAt ?? null,
      dueAt: input.dueAt ?? null,
      order: (orderRow?.value ?? -1) + 1,
      content: null,
    })
    .returning({
      id: lesson.id,
      sectionId: lesson.sectionId,
      title: lesson.title,
      type: lesson.type,
      openAt: lesson.openAt,
      dueAt: lesson.dueAt,
      order: lesson.order,
      content: lesson.content,
      updatedAt: lesson.updatedAt,
    });

  return created ?? null;
}

export async function updateSectionPatch(
  database: Database,
  input: {
    sectionId: string;
    patch: {
      title?: string;
      description?: string | null;
      openAt?: Date | null;
      dueAt?: Date | null;
    };
  },
): Promise<CurriculumSection | null> {
  const [updated] = await database
    .update(section)
    .set({
      ...input.patch,
      updatedAt: new Date(),
    })
    .where(eq(section.id, input.sectionId))
    .returning({
      id: section.id,
      courseId: section.courseId,
      title: section.title,
      description: section.description,
      openAt: section.openAt,
      dueAt: section.dueAt,
      order: section.order,
    });

  if (!updated) {
    return null;
  }

  return {
    ...updated,
    lessons: [],
  };
}

export async function deleteSectionById(database: Database, input: { sectionId: string }) {
  const [deleted] = await database
    .delete(section)
    .where(eq(section.id, input.sectionId))
    .returning({ id: section.id, courseId: section.courseId });

  return deleted ?? null;
}

export async function deleteLessonById(database: Database, input: { lessonId: string }) {
  const [deleted] = await database
    .delete(lesson)
    .where(eq(lesson.id, input.lessonId))
    .returning({ id: lesson.id, sectionId: lesson.sectionId });

  return deleted ?? null;
}

export async function saveCurriculumOrder(
  database: Database,
  input: { courseId: string; sections: CurriculumSectionOrderInput[] },
): Promise<void> {
  const sectionRows = await database
    .select({ id: section.id })
    .from(section)
    .where(eq(section.courseId, input.courseId))
    .orderBy(asc(section.order), asc(section.createdAt));

  const expectedSectionIds = sectionRows.map((row) => row.id).sort();
  const providedSectionIds = input.sections.map((row) => row.sectionId).sort();

  if (expectedSectionIds.length !== providedSectionIds.length) {
    throw new Error("Curriculum sections do not match the course");
  }

  if (expectedSectionIds.some((id, index) => id !== providedSectionIds[index])) {
    throw new Error("Curriculum sections do not match the course");
  }

  const lessonRows = await database
    .select({
      id: lesson.id,
      sectionId: lesson.sectionId,
    })
    .from(lesson)
    .innerJoin(section, eq(lesson.sectionId, section.id))
    .where(eq(section.courseId, input.courseId));

  const expectedLessonIds = lessonRows.map((row) => row.id).sort();
  const providedLessonIds = input.sections.flatMap((row) => row.lessonIds).sort();

  if (expectedLessonIds.length !== providedLessonIds.length) {
    throw new Error("Curriculum lessons do not match the course");
  }

  if (expectedLessonIds.some((id, index) => id !== providedLessonIds[index])) {
    throw new Error("Curriculum lessons do not match the course");
  }

  const lessonIdSet = new Set(expectedLessonIds);
  for (const sectionInput of input.sections) {
    for (const lessonId of sectionInput.lessonIds) {
      if (!lessonIdSet.has(lessonId)) {
        throw new Error("Curriculum lessons do not match the course");
      }
    }
  }

  for (const [sectionIndex, sectionInput] of input.sections.entries()) {
    await database
      .update(section)
      .set({ order: sectionIndex, updatedAt: new Date() })
      .where(eq(section.id, sectionInput.sectionId));

    for (const [lessonIndex, lessonId] of sectionInput.lessonIds.entries()) {
      await database
        .update(lesson)
        .set({
          sectionId: sectionInput.sectionId,
          order: lessonIndex,
          updatedAt: new Date(),
        })
        .where(eq(lesson.id, lessonId));
    }
  }
}

// ---------------------------------------------------------------------------
// Document import
// ---------------------------------------------------------------------------

export type ImportedLessonInput = {
  title: string;
  content: unknown;
};

export type ImportedSectionInput = {
  title: string;
  description?: string | null;
  lessons: ImportedLessonInput[];
};

export type ImportedSectionResult = {
  sectionId: string;
  lessonIds: string[];
};

/**
 * Append a parsed document's sections to a course, after everything already there.
 * Import never replaces or merges — an author who wants the old tree gone deletes
 * it themselves, so a mis-parsed file can't destroy existing work.
 *
 * Sections are inserted in sequence and rolled back together on failure, mirroring
 * `insertGeneratedCourseTree`; only the newly created rows are removed, so existing
 * curriculum is untouched either way.
 */
export async function appendImportedSections(
  database: Database,
  input: { courseId: string; sections: ImportedSectionInput[] },
): Promise<ImportedSectionResult[]> {
  const [orderRow] = await database
    .select({ value: max(section.order) })
    .from(section)
    .where(eq(section.courseId, input.courseId));

  let nextOrder = (orderRow?.value ?? -1) + 1;
  const created: ImportedSectionResult[] = [];

  try {
    for (const sectionInput of input.sections) {
      const [newSection] = await database
        .insert(section)
        .values({
          courseId: input.courseId,
          title: sectionInput.title,
          description: sectionInput.description ?? null,
          order: nextOrder,
        })
        .returning({ id: section.id });

      if (!newSection) {
        throw new Error("Failed to insert imported section");
      }
      nextOrder += 1;

      const lessonIds: string[] = [];

      if (sectionInput.lessons.length > 0) {
        const rows = await database
          .insert(lesson)
          .values(
            sectionInput.lessons.map((lessonInput, index) => ({
              sectionId: newSection.id,
              title: lessonInput.title,
              // Imported lessons are always articles; questions still land as real
              // question nodes, and an author promotes a lesson to quiz or exam
              // afterwards (both need scheduling the document can't express).
              type: "article" as const,
              content: lessonInput.content ?? null,
              order: index,
            })),
          )
          .returning({ id: lesson.id });

        lessonIds.push(...rows.map((row) => row.id));
      }

      created.push({ sectionId: newSection.id, lessonIds });
    }

    return created;
  } catch (err) {
    for (const entry of created) {
      await database.delete(section).where(eq(section.id, entry.sectionId));
    }
    throw err;
  }
}
