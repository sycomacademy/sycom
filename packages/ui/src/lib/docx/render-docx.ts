// Vite hands us the URL of the vendor's prebuilt browser bundle rather than trying
// to bundle it — see `loadConverter` for why it can't be imported.
import converterUrl from "@turbodocx/html-to-docx/dist/html-to-docx.browser.js?url";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type HtmlToDocxFn = (
  html: string,
  headerHtml?: string | null,
  options?: { title?: string },
  footerHtml?: string | null,
) => Promise<Blob | ArrayBuffer>;

type ConverterGlobals = { global?: unknown; Buffer?: unknown; HTMLToDOCX?: HtmlToDocxFn };

let converter: Promise<HtmlToDocxFn> | null = null;

/**
 * `@turbodocx/html-to-docx` cannot be imported.
 *
 * Its `browser` field — the only build that doesn't pull in `fs`/`http`/`path`, so
 * the only one usable here — is a bare IIFE that assigns `var HTMLToDOCX` and
 * exports nothing. Imported as a module that `var` is module-scoped, so the
 * namespace comes back empty and `default` is undefined. It has to be loaded as a
 * classic script, which is what that build was written for.
 *
 * The bundle also expects two Node globals a bundler would normally have injected:
 * a bare `global`, and `Buffer` — which it reaches for while embedding images, so a
 * document with a picture fails with "Buffer is not defined" without the polyfill.
 */
async function installConverterGlobals(globals: ConverterGlobals): Promise<void> {
  globals.global ??= globalThis;
  if (globals.Buffer === undefined) {
    globals.Buffer = (await import("buffer")).Buffer;
  }
}

function loadConverter(): Promise<HtmlToDocxFn> {
  const globals = globalThis as unknown as ConverterGlobals;

  const pending =
    converter ??
    (async () => {
      await installConverterGlobals(globals);

      if (typeof globals.HTMLToDOCX === "function") {
        return globals.HTMLToDOCX;
      }

      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = converterUrl;
        script.addEventListener("load", () => resolve());
        script.addEventListener("error", () =>
          reject(new Error("Couldn't load the Word converter")),
        );
        document.head.append(script);
      });

      const loaded = globals.HTMLToDOCX;
      if (typeof loaded !== "function") {
        throw new Error("The Word converter loaded but exposed nothing");
      }
      return loaded;
    })();

  // A failed load shouldn't poison every later attempt.
  pending.catch(() => {
    if (converter === pending) converter = null;
  });

  converter = pending;
  return pending;
}

/**
 * The single place that knows which HTML→docx converter we use. The bundle is only
 * fetched the first time someone exports.
 */
export async function renderDocx(html: string, options: { title?: string } = {}): Promise<Blob> {
  const htmlToDocx = await loadConverter();
  const result = await htmlToDocx(html, undefined, { title: options.title });

  return result instanceof Blob ? result : new Blob([new Uint8Array(result)], { type: DOCX_MIME });
}
