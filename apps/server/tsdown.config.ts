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
});
