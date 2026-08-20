import { generateJSON } from "@tiptap/core";
import type { AnyExtension, JSONContent } from "@tiptap/core";

import { isPendingImageSrc, pendingImageId, type LessonBlock } from "./types";

/**
 * Turn split lesson blocks into a TipTap document. Prose runs go through
 * `generateJSON` so every mark and node the editor understands survives; questions
 * are inserted as the atom nodes they already are, having been parsed out of their
 * fence during the split.
 */
export function lessonBlocksToDoc(
  blocks: readonly LessonBlock[],
  extensions: AnyExtension[],
): JSONContent {
  const content: JSONContent[] = [];

  for (const block of blocks) {
    if (block.kind === "question") {
      content.push({ type: "question", attrs: { ...block.attrs } });
      continue;
    }

    const parsed = generateJSON(block.html, extensions) as JSONContent;
    if (Array.isArray(parsed.content)) content.push(...parsed.content);
  }

  // An empty doc is invalid for the editor; give it something to place a cursor in.
  if (content.length === 0) content.push({ type: "paragraph" });

  return { type: "doc", content };
}

/** Every `pending:` image id still referenced by a lesson document, in order. */
export function collectPendingImageIds(content: JSONContent | null | undefined): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  const walk = (node: JSONContent) => {
    const src = node.attrs?.src;
    if (isPendingImageSrc(src)) {
      const id = pendingImageId(src);
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    node.content?.forEach(walk);
  };

  if (content) walk(content);
  return ids;
}

/**
 * Swap resolved CDN public ids in for the `pending:` markers once the lesson row
 * exists and its images have been uploaded. Markers with no entry are left alone so
 * a failed upload stays visible rather than silently blanking the image.
 */
export function replacePendingImageSrcs(
  content: JSONContent,
  resolved: ReadonlyMap<string, string>,
): JSONContent {
  const next: JSONContent = { ...content };
  const src = next.attrs?.src;

  if (isPendingImageSrc(src)) {
    const publicId = resolved.get(pendingImageId(src));
    if (publicId) next.attrs = { ...next.attrs, src: publicId };
  }

  if (Array.isArray(next.content)) {
    next.content = next.content.map((child) => replacePendingImageSrcs(child, resolved));
  }

  return next;
}
