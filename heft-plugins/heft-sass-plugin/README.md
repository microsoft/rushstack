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
| `exportAsDefault` | `true` | When `true`, wraps exports in a typed default interface. When `false`, generates individual named exports (`export const className: string`). Note: `false` is incompatible with `cssOutputFolders`. |
| `cssOutputFolders` | _(none)_ | Folders where compiled `.css` files are written. Each entry is either a plain folder path string, or an object with `folder` and optional `shimModuleFormat` (see below). |
| `fileExtensions` | `[".sass", ".scss", ".css"]` | File extensions to treat as CSS modules |
| `nonModuleFileExtensions` | `[".global.sass", ".global.scss", ".global.css"]` | File extensions to treat as global (non-module) stylesheets |
| `excludeFiles` | `[]` | Paths relative to `srcFolder` to skip entirely |
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

When `shimModuleFormat` is set, the plugin writes a `.js` shim alongside each `.css` file. For a CSS module, the shim re-exports the CSS:

```js
// ESM shim (shimModuleFormat: "esnext")
export { default } from "./Button.module.css";

// CommonJS shim (shimModuleFormat: "commonjs")
module.exports = require("./Button.module.css");
module.exports.default = module.exports;
```

For a global stylesheet, the shim is a side-effect-only import:

```js
// ESM shim
import "./global.global.css";
export {};

// CommonJS shim
require("./global.global.css");
```

## Sass import resolution

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

## Incremental builds

The plugin tracks inter-file dependencies (via `@use`, `@forward`, and `@import`) and only recompiles files that changed or whose dependencies changed. This makes `heft build --watch` fast even in large projects.

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
