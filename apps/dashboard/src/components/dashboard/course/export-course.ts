import type { JSONContent } from "@tiptap/core";

import { getFullExtensions } from "@sycom/components/tiptap/extensions/preset-full";
import { buildCourseDocumentHtml, renderDocx, type BuildSection } from "@sycom/ui/lib/docx";
import { collectLessonMediaRefs, makeSignedMediaUrlKey } from "@sycom/ui/lib/lesson-media";

import type { useTRPCClient } from "@/lib/trpc/client";

type TRPCClient = ReturnType<typeof useTRPCClient>;

/** `storage.getSignedMediaUrls` accepts at most 100 items per call. */
const SIGNED_URL_BATCH = 100;

export type ExportCourseInput = {
  courseTitle: string;
  sections: BuildSection[];
};

export type ExportCourseResult = {
  blob: Blob;
  filename: string;
  warnings: string[];
};

function slugForFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : "course";
}

async function blobToDataUri(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Read failed")));
    reader.readAsDataURL(blob);
  });
}

/**
 * Resolve every stored media reference in the course to a `data:` URI.
 *
 * html-to-docx will not fetch remote images, and the CDN only serves these through
 * short-lived signed URLs, so the bytes have to be pulled in here and inlined. An
 * image that can't be resolved is reported and dropped rather than failing the whole
 * export.
 */
async function buildMediaMap(
  trpcClient: TRPCClient,
  sections: BuildSection[],
  warnings: string[],
): Promise<Map<string, string>> {
  const refs = new Map<string, ReturnType<typeof collectLessonMediaRefs>[number]>();

  for (const section of sections) {
    for (const lesson of section.lessons) {
      for (const ref of collectLessonMediaRefs(lesson.content)) {
        // Only images can be embedded in a Word document; other media is dropped
        // with a warning by the builder when it finds no replacement.
        if (ref.resourceType === "image") refs.set(ref.publicId, ref);
      }
    }
  }

  const resolved = new Map<string, string>();
  const items = [...refs.values()];

  for (let index = 0; index < items.length; index += SIGNED_URL_BATCH) {
    const batch = items.slice(index, index + SIGNED_URL_BATCH);

    let urls: Record<string, string>;
    try {
      const response = await trpcClient.storage.getSignedMediaUrls.query({
        items: batch.map((ref) => ({
          publicId: ref.publicId,
          resourceType: ref.resourceType,
          format: ref.format ?? undefined,
          download: ref.download,
        })),
        expireIn: 300,
      });
      urls = response.urls;
    } catch {
      for (const ref of batch) warnings.push(`Couldn't sign media: ${ref.publicId}`);
      continue;
    }

    await Promise.all(
      batch.map(async (ref) => {
        const url = urls[makeSignedMediaUrlKey(ref.publicId, ref.download)];
        if (!url) return;

        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(String(response.status));
          resolved.set(ref.publicId, await blobToDataUri(await response.blob()));
        } catch {
          warnings.push(`Couldn't download media: ${ref.publicId}`);
        }
      }),
    );
  }

  return resolved;
}

/** Render a whole course as a single .docx, laid out so it can be imported back. */
export async function exportCourseToDocx(
  trpcClient: TRPCClient,
  input: ExportCourseInput,
): Promise<ExportCourseResult> {
  const warnings: string[] = [];
  const media = await buildMediaMap(trpcClient, input.sections, warnings);

  const { html, warnings: buildWarnings } = buildCourseDocumentHtml(
    { title: input.courseTitle, sections: input.sections },
    {
      extensions: getFullExtensions(),
      resolveMediaSrc: (src) => media.get(src) ?? null,
    },
  );
  warnings.push(...buildWarnings);

  return {
    blob: await renderDocx(html, { title: input.courseTitle }),
    filename: `${slugForFilename(input.courseTitle)}-${new Date().toISOString().slice(0, 10)}.docx`,
    warnings,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Shape the curriculum query result into what the document builder expects. */
export function toBuildSections(
  sections: ReadonlyArray<{
    title: string;
    description: string | null;
    lessons: ReadonlyArray<{ title: string; content: unknown }>;
  }>,
): BuildSection[] {
  return sections.map((section) => ({
    title: section.title,
    description: section.description,
    lessons: section.lessons.map((lesson) => ({
      title: lesson.title,
      content: (lesson.content ?? null) as JSONContent | null,
    })),
  }));
}
