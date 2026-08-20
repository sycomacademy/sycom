export {
  buildCourseDocumentHtml,
  type BuildCourseDocumentInput,
  type BuildCourseDocumentOptions,
  type BuildCourseDocumentResult,
  type BuildLesson,
  type BuildSection,
} from "./build-document";
export { elementToFenceLines, fenceLinesToBlocks, questionToFenceHtml } from "./question-block";
export {
  COURSE_STYLE_MAP,
  readDocxFile,
  type ReadDocxOptions,
  type ReadDocxResult,
} from "./read-document";
export { DOCX_MIME, renderDocx } from "./render-docx";
export {
  splitCourseDocument,
  splitLessonBody,
  type SplitCourseDocumentOptions,
} from "./split-document";
export { collectPendingImageIds, lessonBlocksToDoc, replacePendingImageSrcs } from "./to-tiptap";
export {
  CONTENT_HEADING_OFFSET,
  DEFAULT_HEADING_MAP,
  isPendingImageSrc,
  MAX_HEADING_LEVEL,
  pendingImageId,
  pendingImageSrc,
  PENDING_IMAGE_PREFIX,
  type HeadingMap,
  type LessonBlock,
  type ParsedCourseDocument,
  type ParsedLesson,
  type ParsedSection,
  type PendingImage,
} from "./types";
