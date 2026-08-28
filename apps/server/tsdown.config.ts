import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  deps: {
    alwaysBundle: [/@sycom\/.*/],
  },
  // Several third-party CJS deps that get swept into this bundle (pino,
  // tailwindcss via @react-email/tailwind, ...) reference `__dirname`/
  // `__filename` relative to their own location on disk. In pure ESM output
  // those globals don't exist, so those calls throw `ReferenceError:
  // __dirname is not defined` at runtime. This shims them to
  // `import.meta.url`-derived values for whatever bundled code still uses
  // them.
  //
  // NOTE: this shim computes __dirname relative to *this bundle's own
  // location*, not the original module's real location on disk — it's only
  // safe for code that's read-only-if-it-happens-to-be-there (or unreached
  // in practice, like pino's worker-transport path or the tailwind preflight
  // corePlugin, neither of which this app ever triggers). It is NOT a
  // substitute for properly externalizing a package that's actually used:
  // cloudinary and @react-pdf/renderer (see apps/server/package.json) used
  // to rely on this shim too, and it silently broke them — the miscalculated
  // path for cloudinary's SDK-version lookup happened to resolve to the
  // *monorepo root's* package.json (which exists but has no "version"
  // field), so it read `undefined` instead of throwing, and cloudinary's own
  // URL-signing code rejected that with "Must supply sdk_semver" instead of
  // falling back gracefully. Externalizing them (declaring them as direct
  // deps of this app) fixes that at the root — Node resolves them from
  // node_modules with their own correct, real __dirname.
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
