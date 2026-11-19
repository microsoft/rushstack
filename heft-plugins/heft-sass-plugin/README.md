# @rushstack/heft-sass-plugin

A [Heft](https://heft.rushstack.io/) plugin that compiles SCSS/Sass files during the build phase. It uses [`sass-embedded`](https://www.npmjs.com/package/sass-embedded) under the hood and produces:

- **TypeScript type definitions** (`.d.ts`) for CSS modules, giving you typed access to class names and `:export` values
- **Compiled CSS files** (optional) in one or more output folders
- **JavaScript shims** (optional) that re-export the CSS for consumption in CommonJS or ESM environments

> If `sass-embedded` is not supported on your platform, you can substitute it with the [`sass`](https://www.npmjs.com/package/sass) package using an npm alias.

## Links

- [CHANGELOG.md](https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-sass-plugin/CHANGELOG.md) - Find out what's new in the latest version

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.

---

## Setup

### 1. Add the plugin to your project

In your project's `package.json`:

```json
{
  "devDependencies": {
    "@rushstack/heft": "...",
    "@rushstack/heft-sass-plugin": "..."
  }
}
```

### 2. Register the plugin in `config/heft.json`

The `sass` task must run before `typescript` so that the generated `.d.ts` files are available when TypeScript compiles your project.

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
  "phasesByName": {
    "build": {
      "tasksByName": {
        "sass": {
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-sass-plugin"
          }
        },

        "typescript": {
          "taskDependencies": ["sass"],
          "taskPlugin": {
            "pluginPackage": "@rushstack/heft-typescript-plugin"
          }
        }
      }
    }
  }
}
```

### 3. Create `config/sass.json`

A minimal config uses all defaults:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft-sass-plugin.schema.json"
}
```

A more complete setup that emits CSS and shims for both ESM and CommonJS:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft-sass-plugin.schema.json",
  "cssOutputFolders": [
    { "folder": "lib-esm", "shimModuleFormat": "esnext" },
    { "folder": "lib-commonjs", "shimModuleFormat": "commonjs" }
  ],
  "fileExtensions": [".module.scss", ".module.sass"],
  "nonModuleFileExtensions": [".global.scss", ".global.sass"],
  "silenceDeprecations": ["mixed-decls", "import", "global-builtin", "color-functions"]
}
```

### 4. Add generated files to `tsconfig.json`

Point TypeScript at the generated type definitions by including the `generatedTsFolder` in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {}
  },
  "include": ["src", "temp/sass-ts"]
}
```

## CSS Modules vs. global stylesheets

The plugin distinguishes between two kinds of files based on their extension:

**CSS modules** (extensions listed in `fileExtensions`, default: `.sass`, `.scss`, `.css`):
- Processed with [`postcss-modules`](https://www.npmjs.com/package/postcss-modules)
- Class names and `:export` values become properties in a generated TypeScript interface
- The generated `.d.ts` exports a typed `styles` object as its default export

**Global stylesheets** (extensions listed in `nonModuleFileExtensions`, default: `.global.sass`, `.global.scss`, `.global.css`):
- Compiled to plain CSS with no module scoping
- The generated `.d.ts` is a side-effect-only module (`export {}`)
- Useful for resets, themes, and base styles

**Partials** (filenames starting with `_`):
- Never compiled to output files; they are only meant to be `@use`d or `@forward`ed by other files

### Example: CSS module

```scss
// src/Button.module.scss
.root {
  background: blue;
}
.label {
  font-size: 14px;
}
:export {
  brandColor: #0078d4;
}
```

Generated `temp/sass-ts/Button.module.scss.d.ts`:

```typescript
interface IStyles {
  root: string;
  label: string;
  brandColor: string;
}
declare const styles: IStyles;
export default styles;
```

In your TypeScript source:

```typescript
import styles from './Button.module.scss';
// styles.root, styles.label, styles.brandColor are all typed strings
```

## Configuration reference

All options are set in `config/sass.json`. Every option is optional.

| Option | Default | Description |
|---|---|---|
| `srcFolder` | `"src/"` | Root directory that is scanned for SCSS files |
| `generatedTsFolder` | `"temp/sass-ts/"` | Output directory for generated `.d.ts` files |
| `secondaryGeneratedTsFolders` | `[]` | Additional directories to also write `.d.ts` files to (e.g. `"lib-esm"` when publishing typings alongside compiled output) |
| `exportAsDefault` | `true` | When `true`, wraps exports in a typed default interface. When `false`, generates individual named string exports. JavaScript shims use the same export style; configure the downstream CSS loader to match. |
| `cssOutputFolders` | _(none)_ | Folders where compiled `.css` files are written. Each entry is either a plain folder path string, or an object with `folder` and optional `shimModuleFormat` (see below). |
| `fileExtensions` | `[".sass", ".scss", ".css"]` | File extensions to treat as CSS modules |
| `nonModuleFileExtensions` | `[".global.sass", ".global.scss", ".global.css"]` | File extensions to treat as global (non-module) stylesheets |
| `excludeFiles` | `[]` | Paths relative to `srcFolder` to skip entirely |
| `loadPaths` | `[]` | Folders, relative to the project folder, to search when a bare specifier such as `@use "theme/colors"` cannot be resolved relative to the importing file. Analogous to the Sass compiler's `loadPaths` option. |
| `resolveBareSpecifiersAsPackages` | `false` | When `true`, a bare specifier that resolves neither relative to the importing file nor from `loadPaths` is additionally resolved as a package via Node module resolution. See [Bare specifiers](#bare-specifiers). |
| `doNotTrimOriginalFileExtension` | `false` | When `true`, preserves the original extension in the CSS output filename. E.g. `styles.scss` → `styles.scss.css` instead of `styles.css`. Useful when downstream tooling needs to distinguish the source format. |
| `preserveIcssExports` | `false` | When `true`, keeps the `:export { }` block in the emitted CSS. This is needed when a webpack loader (e.g. `css-loader`'s `icssParser`) must extract `:export` values at bundle time. Has no effect on the generated `.d.ts`. |
| `silenceDeprecations` | `[]` | List of Sass deprecation codes to suppress (e.g. `"mixed-decls"`, `"import"`, `"global-builtin"`, `"color-functions"`) |
| `ignoreDeprecationsInDependencies` | `false` | Suppresses deprecation warnings that originate from `node_modules` dependencies |
| `extends` | _(none)_ | Path to another `sass.json` config file to inherit settings from |

### CSS output folders and JS shims

Each entry in `cssOutputFolders` can be a plain string (folder path only) or an object:

```json
{
  "folder": "lib-esm",
  "shimModuleFormat": "esnext"
}
```

When `shimModuleFormat` is set, the plugin writes a `.js` shim alongside each `.css` file. For a CSS module with `exportAsDefault: true` (the default), the shim re-exports the CSS:

```js
// ESM shim (shimModuleFormat: "esnext")
export { default } from "./Button.module.css";

// CommonJS shim (shimModuleFormat: "commonjs")
module.exports = require("./Button.module.css");
module.exports.default = module.exports;
```

With `exportAsDefault: false`, the shim forwards named exports instead:

```js
// ESM shim
export * from "./Button.module.css";

// CommonJS shim
module.exports = require("./Button.module.css");
```

The ESM shim keeps named re-exports statically analyzable and does not forward the CSS loader's default
export. The CommonJS shim forwards the loader's exports unchanged, including any `__esModule` marker;
it does not synthesize a default styles object or overwrite a loader-provided default export.

The consuming bundler must configure its CSS loader for named exports (for example, css-loader with
`esModule: true` and `modules.namedExport: true`). Export names must match the generated typings; use
`modules.exportLocalsConvention: "as-is"` with css-loader versions that support it, or restrict names
to ones unchanged by the loader's convention. Non-identifier names such as `base-style` use quoted
export aliases in the typings (requiring TypeScript 5.6 or newer):

```typescript
declare const id0: string;
export { id0 as "base-style" };
```

Generated alias names avoid collisions with the stylesheet's own exports. The CSS loader must also
preserve these export names; consumers can access them with `styles["base-style"]`.
Aliases such as `id0` are private bindings inside the declaration file, not additional public exports
or runtime variables. `styles.id0` is available only if the stylesheet itself exports a name `id0`.
Named declarations use private bindings for identifier-shaped names as well, so JavaScript keywords
such as `class` and `function` never become invalid variable declarations.
Set `preserveIcssExports: true` when the downstream loader must process ICSS `:export` values or
`composes` declarations.

#### Loader compatibility

CSS Modules do not inherently require a JavaScript default export; the loader determines that
interface. [css-loader 5](https://github.com/webpack/css-loader/tree/v5.2.7#namedexport) already supported
opt-in named exports, but required camelCase names and disallowed JavaScript keywords.
[css-loader 7](https://github.com/webpack/css-loader/tree/v7.1.5#namedexport) enables named exports by
default with `esModule: true` and supports `exportLocalsConvention: "as-is"`.

The class name `default` is a special case: css-loader exposes it as `_default` in named mode, and
the generated typings follow that convention. A stylesheet exporting both `default` and `_default`
is rejected in named mode because the loader would produce duplicate exports; default-export mode
still supports both names.
For default-export mode, use ESM shims when a stylesheet has a `default` class: the legacy CommonJS
shim synthesizes a `.default` interop property, which can overwrite that key in a loader's class map.

Valid declarations alone cannot fix loader-generated JavaScript. css-loader 7.1.4 and 7.1.5 have a
reserved-word limitation for names such as `let`, `yield`, `await`, `eval`, and `arguments`. Avoid those
names in named mode, or use matching default-export settings until the loader supports them.
The [css-loader repository](https://github.com/webpack/css-loader) is archived; these are compatibility
limits of the tested releases, not a promise of a future loader fix.

For a global stylesheet, or a CSS module with no local exports, the shim is a side-effect-only import
regardless of `exportAsDefault`:

```js
// ESM shim
import "./global.global.css";
export {};

// CommonJS shim
require("./global.global.css");
```

## Sass import resolution

A load specifier is resolved in this order:

1. Relative to the importing file.
2. Each folder in the `loadPaths` option, in order (bare specifiers only).
3. As a package, via Node module resolution — only when `resolveBareSpecifiersAsPackages` is enabled
   (bare specifiers only).

The plugin supports the modern `pkg:` protocol for importing from npm packages:

```scss
@use "pkg:@fluentui/react/dist/sass/variables";
```

The legacy `~` prefix is automatically converted to `pkg:` for compatibility with older stylesheets:

```scss
// These are equivalent:
@use "~@fluentui/react/dist/sass/variables";
@use "pkg:@fluentui/react/dist/sass/variables";
```

This also applies to specifiers that are not part of an `@use`/`@import`/`@forward` rule, such as
`@include meta.load-css("~@fluentui/react/dist/sass/variables")`.

### Package entry points and exports

Package imports honor the package's `exports` field, using the `sass`, `style`, and `default`
conditions in the order they appear in the manifest. JavaScript-specific conditions such as `import`
and `require` are not selected. For example:

```json
{
  "exports": {
    ".": {
      "sass": "./styles/_index.scss",
      "default": "./lib/index.js"
    },
    "./tokens": {
      "sass": "./styles/_tokens.scss"
    },
    "./themes/*.scss": "./styles/themes/*.scss"
  }
}
```

```scss
@use "pkg:my-library";
@use "pkg:my-library/tokens";
@use "pkg:my-library/themes/dark";
```

Exported subpaths support Sass's extension, partial, and index-file lookup. Export **targets** must
specify complete `.scss`, `.sass`, or `.css` filenames; they are not expanded to partials or given
implicit extensions. Multiple matching exports are reported as an ambiguity.
Wildcard targets that do not exist are skipped, including when trying a fallback array. Other
filesystem errors are reported rather than treated as missing stylesheets.

When no export matches, a package-root import tries the top-level `sass` and `style` fields, followed
by an index stylesheet. A deep import falls back to the corresponding physical path in the package.
These fallbacks follow Sass's package-import conventions and preserve compatibility with packages
that do not declare Sass exports. Legacy `~` imports and opt-in bare package imports use the same
package resolution.

### Bare specifiers

A "bare" specifier is one that does not start with `.`, `/`, or a URL scheme, for example
`@use "@fluentui/react/dist/sass/variables"`.

Per the Sass specification the target of `@use`, `@import` and `@forward` is a **URL**, so a bare
specifier is a *relative path*, not a reference to a package. That is how this plugin treats it by
default, and `pkg:` is the supported way to reference a package:

```scss
// Preferred: unambiguous, and always enabled
@use "pkg:@fluentui/react/dist/sass/variables";
```

Some other Sass toolchains (the Dart Sass CLI's `--load-path`, `sass-loader`, Vite, the Angular CLI)
instead resolve bare specifiers from `node_modules`. Stylesheets authored for those toolchains — most
commonly inside third-party packages, where a consuming project cannot rewrite the import — depend on
that behavior. Two opt-in options support them:

```json
{
  "loadPaths": ["src/styles"],
  "resolveBareSpecifiersAsPackages": true
}
```

`loadPaths` resolves a bare specifier against a list of folders. `resolveBareSpecifiersAsPackages`
additionally locates the package using Node module resolution and resolves its Sass entry points as
described above. Both apply only after relative resolution has failed, so enabling them cannot change
the meaning of a specifier that already resolves.

## Incremental builds

The plugin tracks inter-file dependencies (via `@use`, `@forward`, and `@import`) and the package manifests
used to resolve package imports. Changes to `exports`, `sass`, or `style` entry points invalidate their
consumers, including when restoring the incremental cache. Package manifests are also watched for changes,
but are never compiled as stylesheets. Only changed files and their consumers are recompiled, keeping
`heft build --watch` fast even in large projects.

## Plugin accessor API

Other Heft plugins can hook into the Sass compilation pipeline via the `ISassPluginAccessor` interface:

```typescript
import { ISassPluginAccessor } from '@rushstack/heft-sass-plugin';

// In your plugin's apply() method:
const sassAccessor = session.requestAccessToPlugin<ISassPluginAccessor>(
  '@rushstack/heft-sass-plugin',
  'sass-plugin',
  '@rushstack/heft-sass-plugin'
);

sassAccessor.hooks.postProcessCss.tapPromise('my-plugin', async (css, filePath) => {
  // Transform CSS after Sass compilation but before it is written to cssOutputFolders
  return transformedCss;
});
```

The `postProcessCss` hook is an `AsyncSeriesWaterfallHook` that passes the compiled CSS string and source file path through each tap in sequence.
