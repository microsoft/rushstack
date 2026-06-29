# Upgrade notes for @microsoft/api-extractor

### Upgrading past the bundled TypeScript 6.0 compiler engine

API Extractor analyzes your project using its **own bundled** TypeScript compiler, not the
TypeScript version your project builds with. This release upgrades the bundled compiler to
TypeScript 6.0.

TypeScript 6.0 changes the default `moduleResolution` for `module: "commonjs"` projects from
`node10` to `bundler` ([microsoft/TypeScript#62338](https://github.com/microsoft/TypeScript/pull/62338)).
If your project builds with TypeScript 5.x and does not set `moduleResolution` explicitly, API
Extractor's analysis may now resolve modules differently than your build — most visibly as
`TS2307` errors for dependencies that expose their typings only via `typesVersions`, or that
require extensionful import specifiers under an `exports` map.

If you hit this, in order of preference:

1. **Update the import or dependency.** Use extensionful specifiers
   (`import ... from 'some-package/subpath.js'`), or upgrade the dependency to a version whose
   `exports` map includes a `types` condition. This is the forward-compatible fix and also keeps
   your project resolving correctly under TypeScript 7.

2. **Pin `moduleResolution` for the analysis only.** Set it in `compiler.overrideTsconfig` in your
   `api-extractor.json`, so it applies to API Extractor without affecting your build:

   ```json
   "compiler": {
     "overrideTsconfig": {
       "extends": "./tsconfig.json",
       "compilerOptions": { "moduleResolution": "node10" }
     }
   }
   ```

   > **Note:** `node10` is deprecated in TypeScript 6.0 and removed in TypeScript 7.0
   > ([microsoft/TypeScript#62200](https://github.com/microsoft/TypeScript/issues/62200)), so treat
   > this as a transitional workaround rather than a long-term setting.
