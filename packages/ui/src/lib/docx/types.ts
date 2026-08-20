import type { LessonQuestionAttrs } from "@sycom/components/tiptap/extensions/question";

/**
 * Word documents map onto the curriculum tree by heading level: one level marks
 * sections, the next marks lessons, and everything below is lesson body.
 * Defaults are H1 → section, H2 → lesson; the import preview lets an author
 * remap a document that uses H2/H3 instead.
 */
export type HeadingMap = {
  sectionLevel: number;
  lessonLevel: number;
};

export const DEFAULT_HEADING_MAP: HeadingMap = { sectionLevel: 1, lessonLevel: 2 };

/**
 * The editor caps headings at 4 (`preset-full`), so with two levels spent on
 * structure a lesson body only has 3 and 4 left. Body headings are shifted by
 * this much on the way out and back on the way in.
 */
export const CONTENT_HEADING_OFFSET = 2;
export const MAX_HEADING_LEVEL = 4;

/**
 * An imported lesson body before it becomes TipTap JSON. Question fences are
 * pulled out during the split so the surrounding prose can go through
 * `generateJSON` untouched — questions are atom nodes with an options array
 * that no HTML round trip preserves.
 */
export type LessonBlock =
  | { kind: "html"; html: string }
  | { kind: "question"; attrs: LessonQuestionAttrs };

/** An image lifted out of the .docx, awaiting upload once its lesson row exists. */
export type PendingImage = {
  /** Matches the `pending:<id>` src left behind in the lesson content. */
  id: string;
  blob: Blob;
  contentType: string;
};

export type ParsedLesson = {
  title: string;
  blocks: LessonBlock[];
};

export type ParsedSection = {
  title: string;
  /** Plain text taken from blocks sitting between the section and its first lesson. */
  description: string | null;
  lessons: ParsedLesson[];
};

export type ParsedCourseDocument = {
  /** From the Word `Title` style when present; used only when creating a new course. */
  title: string | null;
  sections: ParsedSection[];
  /** Structural problems worth showing in the preview before anything is written. */
  warnings: string[];
};

/**
 * Mirrors the caps in `importCourseSectionsSchema` on the server. A Word document
 * has no such limits, so the splitter clamps to these rather than letting the import
 * fail on a heading or an intro that ran long.
 */
export const MAX_TITLE_LENGTH = 200;
export const MAX_SECTION_DESCRIPTION_LENGTH = 2000;

/**
 * Prose between a section heading and its first lesson is only treated as a
 * description when it is genuinely a blurb. Anything longer is real content and
 * becomes a lesson instead, so nothing an author wrote gets flattened or dropped.
 */
export const MAX_INLINE_DESCRIPTION_LENGTH = 500;

export const PENDING_IMAGE_PREFIX = "pending:";

export function pendingImageSrc(id: string): string {
  return `${PENDING_IMAGE_PREFIX}${id}`;
}

export function isPendingImageSrc(src: unknown): src is string {
  return typeof src === "string" && src.startsWith(PENDING_IMAGE_PREFIX);
}

export function pendingImageId(src: string): string {
  return src.slice(PENDING_IMAGE_PREFIX.length);
}
