import {
  elementToFenceLines,
  fenceLinesToBlocks,
  linesCloseFence,
  linesOpenFence,
} from "./question-block";
import {
  CONTENT_HEADING_OFFSET,
  DEFAULT_HEADING_MAP,
  MAX_HEADING_LEVEL,
  type HeadingMap,
  type LessonBlock,
  type ParsedCourseDocument,
  type ParsedLesson,
  type ParsedSection,
} from "./types";

export type SplitCourseDocumentOptions = {
  headingMap?: HeadingMap;
  /** Fallback section title for content that appears before the first section heading. */
  introSectionTitle?: string;
  /** Fallback lesson title for content that appears before the first lesson heading. */
  untitledLessonTitle?: string;
};

const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

function headingLevel(element: Element): number | null {
  if (!HEADING_TAGS.has(element.tagName)) return null;
  return Number(element.tagName.slice(1));
}

/**
 * The Word `Title` style is mapped to `h1.doc-title` by the import style map so it
 * stays distinguishable from a Heading 1, which carries structure.
 */
function isDocTitle(element: Element): boolean {
  return element.tagName === "H1" && element.classList.contains("doc-title");
}

function textOf(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Body headings sit below the two levels spent on structure, so shift them back up
 * to the range the editor actually uses. The clamp mirrors the one export applies.
 */
function promoteHeading(element: Element, document: Document): Element {
  const level = headingLevel(element);
  if (level === null) return element;

  const promoted = Math.min(MAX_HEADING_LEVEL, Math.max(1, level - CONTENT_HEADING_OFFSET));
  const replacement = document.createElement(`h${promoted}`);
  replacement.innerHTML = element.innerHTML;
  return replacement;
}

type LessonBuilder = {
  title: string;
  blocks: LessonBlock[];
  html: string[];
  fence: string[] | null;
};

function newLesson(title: string): LessonBuilder {
  return { title, blocks: [], html: [], fence: null };
}

function flushHtml(lesson: LessonBuilder) {
  if (lesson.html.length === 0) return;
  lesson.blocks.push({ kind: "html", html: lesson.html.join("") });
  lesson.html = [];
}

function closeFence(lesson: LessonBuilder) {
  if (!lesson.fence) return;
  lesson.blocks.push(...fenceLinesToBlocks(lesson.fence));
  lesson.fence = null;
}

function finishLesson(lesson: LessonBuilder): ParsedLesson {
  closeFence(lesson);
  flushHtml(lesson);
  return { title: lesson.title, blocks: lesson.blocks };
}

/**
 * Split the HTML mammoth produced for a whole course into the curriculum tree,
 * cutting at the configured section and lesson heading levels.
 */
export function splitCourseDocument(
  html: string,
  options: SplitCourseDocumentOptions = {},
): ParsedCourseDocument {
  const {
    headingMap = DEFAULT_HEADING_MAP,
    introSectionTitle = "Introduction",
    untitledLessonTitle = "Untitled lesson",
  } = options;

  const document = new DOMParser().parseFromString(html, "text/html");
  const warnings: string[] = [];

  let documentTitle: string | null = null;
  const sections: ParsedSection[] = [];

  let section: ParsedSection | null = null;
  let lesson: LessonBuilder | null = null;
  /** Blocks seen after a section heading but before its first lesson heading. */
  let sectionIntro: string[] = [];

  const startSection = (title: string) => {
    commitLesson();
    commitSection();
    section = { title, description: null, lessons: [] };
    sectionIntro = [];
  };

  /** Returns the new builder rather than assigning it, so the caller keeps a non-null binding. */
  const startLesson = (title: string): LessonBuilder => {
    commitLesson();
    if (!section) {
      section = { title: introSectionTitle, description: null, lessons: [] };
      sectionIntro = [];
    }
    return newLesson(title);
  };

  function commitLesson() {
    if (!(lesson && section)) return;
    section.lessons.push(finishLesson(lesson));
    lesson = null;
  }

  function commitSection() {
    if (!section) return;
    const description = sectionIntro.join(" ").replace(/\s+/g, " ").trim();
    section.description = description.length > 0 ? description : null;
    sections.push(section);
    section = null;
    sectionIntro = [];
  }

  const elements = Array.from(document.body.children);

  for (const [index, element] of elements.entries()) {
    // A fence in progress swallows everything until it closes, headings included —
    // otherwise an unclosed fence would silently eat the rest of the document.
    const openFenceLesson = lesson;
    if (openFenceLesson?.fence) {
      const lines = elementToFenceLines(element);
      openFenceLesson.fence.push(...lines);
      if (linesCloseFence(lines)) closeFence(openFenceLesson);
      continue;
    }

    if (isDocTitle(element)) {
      documentTitle = textOf(element) || null;
      continue;
    }

    const level = headingLevel(element);

    if (level === headingMap.sectionLevel) {
      // A document we exported writes the course title as a heading, because
      // html-to-docx has no way to emit Word's Title paragraph style. Recover it:
      // the very first heading, when the next one is a sibling at the same level,
      // titles the document rather than opening a section. That heading would
      // otherwise be dropped anyway as an empty section, so nothing is lost.
      if (
        index === 0 &&
        documentTitle === null &&
        headingLevel(elements[1] ?? element) === headingMap.sectionLevel
      ) {
        documentTitle = textOf(element) || null;
        continue;
      }

      const title = textOf(element);
      startSection(title || `Section ${sections.length + 1}`);
      continue;
    }

    if (level === headingMap.lessonLevel) {
      const title = textOf(element);
      lesson = startLesson(title || untitledLessonTitle);
      continue;
    }

    const lines = elementToFenceLines(element);

    if (linesOpenFence(lines)) {
      if (!lesson) lesson = startLesson(untitledLessonTitle);
      flushHtml(lesson);
      lesson.fence = [...lines];
      if (linesCloseFence(lines)) closeFence(lesson);
      continue;
    }

    if (!lesson) {
      // Prose sitting under a section heading describes the section until a lesson
      // heading arrives; prose before any heading has nowhere to go but a lesson.
      if (section) {
        const text = textOf(element);
        if (text.length > 0) sectionIntro.push(text);
        continue;
      }
      lesson = startLesson(untitledLessonTitle);
    }

    lesson.html.push(promoteHeading(element, document).outerHTML);
  }

  commitLesson();
  commitSection();

  const populated = sections.filter(
    (entry) => entry.lessons.length > 0 || (entry.description?.length ?? 0) > 0,
  );

  if (populated.length === 0) {
    warnings.push(
      "No headings found. Use Heading 1 for sections and Heading 2 for lessons, or change the mapping above.",
    );
  }

  for (const entry of populated) {
    if (entry.lessons.length === 0) {
      warnings.push(`Section "${entry.title}" has no lessons and will be created empty.`);
    }
  }

  return { title: documentTitle, sections: populated, warnings };
}

/**
 * Parse a document as the body of a single lesson: no heading cuts, and headings
 * keep the level the author gave them. This is what the editor's own Word import
 * uses, so a document pasted into one lesson gets the same question handling as a
 * whole-course import.
 */
export function splitLessonBody(html: string): LessonBlock[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  const lesson = newLesson("");

  for (const element of Array.from(document.body.children)) {
    if (lesson.fence) {
      const lines = elementToFenceLines(element);
      lesson.fence.push(...lines);
      if (linesCloseFence(lines)) closeFence(lesson);
      continue;
    }

    const lines = elementToFenceLines(element);
    if (linesOpenFence(lines)) {
      flushHtml(lesson);
      lesson.fence = [...lines];
      if (linesCloseFence(lines)) closeFence(lesson);
      continue;
    }

    lesson.html.push(element.outerHTML);
  }

  return finishLesson(lesson).blocks;
}
