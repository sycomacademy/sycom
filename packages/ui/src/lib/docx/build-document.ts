import { generateHTML } from "@tiptap/core";
import type { AnyExtension, JSONContent } from "@tiptap/core";

import type { LessonQuestionAttrs } from "@sycom/components/tiptap/extensions/question";

import { questionToFenceHtml } from "./question-block";
import { CONTENT_HEADING_OFFSET, MAX_HEADING_LEVEL } from "./types";

export type BuildLesson = {
  title: string;
  content: JSONContent | null;
};

export type BuildSection = {
  title: string;
  description?: string | null;
  lessons: BuildLesson[];
};

export type BuildCourseDocumentInput = {
  title: string;
  sections: BuildSection[];
};

export type BuildCourseDocumentOptions = {
  extensions: AnyExtension[];
  /**
   * Rewrites a stored media src (a CDN public id) to something Word can embed —
   * in practice a `data:` URI, since html-to-docx will not fetch remote images.
   * Returning null drops the node and records a warning.
   */
  resolveMediaSrc?: (src: string) => string | null;
};

export type BuildCourseDocumentResult = {
  html: string;
  warnings: string[];
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Push body headings below the levels that carry structure, so a lesson's own H1
 * cannot be mistaken for a section when the document is imported again. Levels
 * past the cap collapse — the editor only offers four, and two are spoken for.
 */
function demoteHeadings(node: JSONContent): JSONContent {
  const next: JSONContent = { ...node };

  if (next.type === "heading") {
    const level = Number(next.attrs?.level ?? 1);
    next.attrs = {
      ...next.attrs,
      level: Math.min(MAX_HEADING_LEVEL, level + CONTENT_HEADING_OFFSET),
    };
  }

  if (Array.isArray(next.content)) {
    next.content = next.content.map(demoteHeadings);
  }

  return next;
}

function isQuestionNode(node: JSONContent): boolean {
  return node.type === "question";
}

/**
 * `question` nodes are atoms whose options live in an attribute array; their
 * `renderHTML` emits a bare `<div data-type="question">` and drops the answers, so
 * they are written as the plain-text fence instead. That is also what makes a
 * round trip work: the fence is exactly what the importer reads back.
 */
function questionHtml(node: JSONContent): string {
  const attrs = (node.attrs ?? {}) as Partial<LessonQuestionAttrs>;
  return questionToFenceHtml({
    prompt: attrs.prompt ?? "",
    options: attrs.options ?? [],
    explanation: attrs.explanation,
  });
}

function rewriteMedia(
  node: JSONContent,
  resolve: (src: string) => string | null,
  warnings: string[],
): JSONContent | null {
  const next: JSONContent = { ...node };
  const src = next.attrs?.src;

  if (typeof src === "string" && src.length > 0) {
    const resolved = resolve(src);
    if (resolved === null) {
      warnings.push(`Skipped media that could not be exported: ${src}`);
      return null;
    }
    next.attrs = { ...next.attrs, src: resolved };
  }

  if (Array.isArray(next.content)) {
    next.content = next.content
      .map((child) => rewriteMedia(child, resolve, warnings))
      .filter((child): child is JSONContent => child !== null);
  }

  return next;
}

function lessonBodyHtml(
  content: JSONContent | null,
  options: BuildCourseDocumentOptions,
  warnings: string[],
): string {
  if (!content || !Array.isArray(content.content) || content.content.length === 0) {
    return "";
  }

  const parts: string[] = [];
  let buffer: JSONContent[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    parts.push(generateHTML({ type: "doc", content: buffer }, options.extensions));
    buffer = [];
  };

  for (const node of content.content) {
    if (isQuestionNode(node)) {
      flush();
      parts.push(questionHtml(node));
      continue;
    }

    let prepared: JSONContent | null = demoteHeadings(node);
    if (options.resolveMediaSrc) {
      prepared = rewriteMedia(prepared, options.resolveMediaSrc, warnings);
    }
    if (prepared) buffer.push(prepared);
  }

  flush();
  return parts.join("");
}

/**
 * Render a whole course as the HTML handed to html-to-docx. The heading layout is
 * the exact inverse of `splitCourseDocument`, so export → edit in Word → import
 * returns the same tree.
 */
export function buildCourseDocumentHtml(
  input: BuildCourseDocumentInput,
  options: BuildCourseDocumentOptions,
): BuildCourseDocumentResult {
  const warnings: string[] = [];
  const parts: string[] = [`<h1 class="doc-title">${escapeHtml(input.title)}</h1>`];

  for (const section of input.sections) {
    parts.push(`<h1>${escapeHtml(section.title)}</h1>`);

    const description = section.description?.trim();
    if (description) parts.push(`<p>${escapeHtml(description)}</p>`);

    for (const lesson of section.lessons) {
      parts.push(`<h2>${escapeHtml(lesson.title)}</h2>`);
      parts.push(lessonBodyHtml(lesson.content, options, warnings));
    }
  }

  return {
    html: `<!DOCTYPE html><html><body>${parts.join("")}</body></html>`,
    warnings,
  };
}
