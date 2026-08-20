import {
  hasQuestionFence,
  parseQuestionPaste,
} from "@sycom/components/tiptap/extensions/question-paste";

import type { LessonBlock } from "./types";

/**
 * Word autoformats the question fence as you type it: `- [x] Foo` becomes a real
 * bullet (so mammoth emits `<li>[x] Foo</li>`, the marker eaten by the list) and
 * `> Foo` becomes a blockquote. Authors also mix Shift+Enter line breaks with
 * paragraph breaks, which decides whether a fence spans several elements or hides
 * inside one.
 *
 * Rather than teach the parser about HTML, we flatten each block back to the
 * plain-text lines the fence convention is written in and hand them to
 * `parseQuestionPaste` — the same function that already backs pasting questions
 * into the editor, and the single source of truth for the format.
 */

const FENCE_OPEN = /^:::\s*question\s*$/i;
const FENCE_CLOSE = /^:::\s*$/;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Flatten one element to text lines, treating `<br>` as a line separator. */
function inlineTextLines(element: Element): string[] {
  const lines: string[] = [];
  let current = "";

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        current += child.textContent ?? "";
        continue;
      }
      if (child.nodeType !== 1) continue;

      const el = child as Element;
      if (el.tagName === "BR") {
        lines.push(current);
        current = "";
        continue;
      }
      walk(el);
    }
  };

  walk(element);
  lines.push(current);
  return lines.map(collapse).filter((line) => line.length > 0);
}

/**
 * Re-emit the markers Word swallowed: list items get their `- ` back, blockquote
 * lines get their `> ` back. Everything else is flattened as-is.
 */
export function elementToFenceLines(element: Element): string[] {
  const tag = element.tagName;

  if (tag === "UL" || tag === "OL") {
    const lines: string[] = [];
    for (const item of Array.from(element.querySelectorAll("li"))) {
      const itemLines = inlineTextLines(item).filter((line) => line.length > 0);
      const [first, ...rest] = itemLines;
      if (first !== undefined) lines.push(`- ${first}`);
      lines.push(...rest);
    }
    return lines;
  }

  if (tag === "BLOCKQUOTE") {
    return inlineTextLines(element)
      .filter((line) => line.length > 0)
      .map((line) => (line.startsWith(">") ? line : `> ${line}`));
  }

  return inlineTextLines(element);
}

export function linesOpenFence(lines: readonly string[]): boolean {
  return lines.some((line) => FENCE_OPEN.test(line.trim()));
}

export function linesCloseFence(lines: readonly string[]): boolean {
  return lines.some((line) => FENCE_CLOSE.test(line.trim()));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Turn a collected fence region into lesson blocks. Prose that `parseQuestionPaste`
 * hands back — including the contents of a malformed fence, which it deliberately
 * keeps rather than drops — is re-wrapped as paragraphs. Inline formatting inside a
 * fence is lost, which is the trade for accepting every shape Word produces.
 */
export function fenceLinesToBlocks(lines: readonly string[]): LessonBlock[] {
  const text = lines.join("\n");
  if (!hasQuestionFence(text)) {
    return proseToBlocks(text);
  }

  const blocks: LessonBlock[] = [];
  for (const part of parseQuestionPaste(text)) {
    if (part.kind === "question") {
      blocks.push({ kind: "question", attrs: part.attrs });
    } else {
      blocks.push(...proseToBlocks(part.text));
    }
  }
  return blocks;
}

function proseToBlocks(text: string): LessonBlock[] {
  const html = text
    .split(/\r?\n/)
    .map(collapse)
    .filter((line) => line.length > 0)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  return html.length > 0 ? [{ kind: "html", html }] : [];
}

/** Serialise a question back to the fence, as paragraphs Word will leave alone. */
export function questionToFenceHtml(attrs: {
  prompt: string;
  options: ReadonlyArray<{ text: string; isCorrect?: boolean }>;
  explanation?: string;
}): string {
  const lines = [
    "::: question",
    attrs.prompt,
    ...attrs.options.map((option) => `- [${option.isCorrect ? "x" : " "}] ${option.text}`),
  ];

  const explanation = attrs.explanation?.trim();
  if (explanation) lines.push(`> ${explanation}`);
  lines.push(":::");

  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}
