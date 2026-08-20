export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * The single place that knows which HTML→docx converter we use, and the only
 * module that pulls it in — the import is lazy so the converter stays out of the
 * bundle until someone actually exports.
 */
export async function renderDocx(html: string, options: { title?: string } = {}): Promise<Blob> {
  const { default: HtmlToDocx } = await import("@turbodocx/html-to-docx");
  const result = (await HtmlToDocx(html, undefined, {
    title: options.title,
  })) as Blob | ArrayBuffer;

  return result instanceof Blob ? result : new Blob([new Uint8Array(result)], { type: DOCX_MIME });
}
