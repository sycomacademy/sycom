import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  deps: {
    alwaysBundle: [/@sycom\/.*/],
  },
  // Several third-party CJS deps that get swept into this bundle (cloudinary,
  // fontkit via @react-pdf/renderer, ...) reference `__dirname`/`__filename`
  // relative to their own location on disk. In pure ESM output those globals
  // don't exist, so those calls throw `ReferenceError: __dirname is not
  // defined` at runtime. This shims them to `import.meta.url`-derived values
  // for any bundled code that uses them — the standard tsdown fix for this,
  // and it doesn't change what gets bundled or how the output is chunked.
  shims: true,
  outputOptions: {
    // rolldown sometimes splits this single-entry server bundle into extra
    // chunks (e.g. a "react" chunk pulled out because it's require()'d from
    // several bundled CJS deps). When that chunk ends up needing a runtime
    // helper (__commonJSMin) back from the entry chunk, the two can end up
    // in a circular import where the helper isn't assigned yet when the
    // split-out chunk's top-level code runs — `TypeError: __commonJSMin is
    // not a function` on boot. There's no lazy/dynamic import anywhere in
    // this app that would benefit from multiple chunks, so disable splitting
    // entirely and always emit one self-contained file.
    codeSplitting: false,
  },
});
