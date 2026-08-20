import { pendingImageSrc, type PendingImage } from "./types";

/**
 * Word's `Title` style otherwise converts to a plain `<h1>`, which is the level
 * that marks sections. Tagging it keeps a course title distinguishable from the
 * first section heading.
 */
export const COURSE_STYLE_MAP = ["p[style-name='Title'] => h1.doc-title:fresh"];

export type ReadDocxOptions = {
  /**
   * `extract` keeps images aside as blobs behind a `pending:` src, for callers that
   * will upload them to the CDN once they have an entity to attach them to.
   * `dataUri` inlines them, which is what a single editor session wants — there is
   * no import step afterwards to resolve a marker.
   */
  images?: "extract" | "dataUri";
};

export type ReadDocxResult = {
  html: string;
  /** Images lifted out of the file, keyed by the `pending:` src left in the HTML. */
  images: Map<string, PendingImage>;
  warnings: string[];
};

/**
 * Convert a .docx to HTML. By default embedded images are held
 * aside as blobs and replaced by a `pending:` marker: a course's worth of base64
 * would otherwise be written straight into `lesson.content`, and images belong in
 * the CDN with only their public id persisted.
 */
export async function readDocxFile(
  file: Blob,
  options: ReadDocxOptions = {},
): Promise<ReadDocxResult> {
  const arrayBuffer = await file.arrayBuffer();
  const mammoth = await import("mammoth");
  const images = new Map<string, PendingImage>();

  const convertImage =
    options.images === "dataUri"
      ? mammoth.images.dataUri
      : mammoth.images.imgElement(async (image) => {
          const id = crypto.randomUUID();
          const buffer = await image.readAsArrayBuffer();
          const contentType = image.contentType || "image/png";
          images.set(id, { id, blob: new Blob([buffer], { type: contentType }), contentType });
          return { src: pendingImageSrc(id) };
        });

  const { value, messages } = await mammoth.convertToHtml(
    { arrayBuffer },
    { styleMap: COURSE_STYLE_MAP, convertImage },
  );

  return {
    html: value,
    images,
    warnings: messages.filter((message) => message.type === "error").map((m) => m.message),
  };
}
