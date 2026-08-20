import { DIFFICULTY_LEVELS } from "@sycom/db/schema/course";
import { z } from "zod";

import type { HeadingMap } from "@sycom/ui/lib/docx";

/**
 * Only what a course needs to exist. Thumbnail, categories and instructors stay on
 * the course detail page — the point of this dialog is the document, and asking for
 * the full create form in front of it would bury the import.
 */
export const importNewCourseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  difficulty: z.enum(DIFFICULTY_LEVELS),
});

export type ImportNewCourseInput = z.infer<typeof importNewCourseSchema>;

export const DEFAULT_IMPORT_NEW_COURSE_VALUES: ImportNewCourseInput = {
  title: "",
  difficulty: "beginner",
};

/**
 * Which heading levels carry structure. Most documents use Heading 1 / Heading 2,
 * but a document that keeps its course title as Heading 1 shifts everything down,
 * so the author can say so instead of reformatting in Word.
 */
export const HEADING_MAP_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
  map: HeadingMap;
}> = [
  {
    value: "1-2",
    label: "Heading 1 → sections, Heading 2 → lessons",
    map: { sectionLevel: 1, lessonLevel: 2 },
  },
  {
    value: "2-3",
    label: "Heading 2 → sections, Heading 3 → lessons",
    map: { sectionLevel: 2, lessonLevel: 3 },
  },
  {
    value: "1-3",
    label: "Heading 1 → sections, Heading 3 → lessons",
    map: { sectionLevel: 1, lessonLevel: 3 },
  },
];

export const DEFAULT_HEADING_MAP_VALUE = "1-2";

export function headingMapForValue(value: string): HeadingMap {
  return (
    HEADING_MAP_OPTIONS.find((option) => option.value === value)?.map ?? {
      sectionLevel: 1,
      lessonLevel: 2,
    }
  );
}

export const DOCX_ACCEPT =
  ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
