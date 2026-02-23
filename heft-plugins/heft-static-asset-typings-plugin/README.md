# @rushstack/heft-static-asset-typings-plugin

This Heft plugin generates TypeScript `.d.ts` typings for static asset files, enabling type-safe
`import` statements for non-TypeScript resources. It provides two task plugins:

- **`binary-assets-plugin`** — Generates `.d.ts` typings for binary files such as images (`.png`,
  `.jpg`, `.svg`, etc.). Each matched file gets a typing that exports a default string value representing
  the asset URL.

- **`text-assets-plugin`** — Generates `.d.ts` typings _and_ JavaScript module output for text-based
  files (`.html`, `.txt`, `.md`, etc.). The generated JS modules export the file contents as a
  default string, making text assets importable as ES modules.

Both plugins support incremental and watch-mode builds.

## Setup

1. Add the plugin as a `devDependency` of your project:

   ```bash
   rush add -p @rushstack/heft-static-asset-typings-plugin --dev
   ```

2. Load the appropriate plugin(s) in your project's **config/heft.json**:

   ### Binary assets (images, fonts, etc.)

   ```jsonc
   {
     "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
     "phasesByName": {
       "build": {
         "tasksByName": {
           "image-typings": {
             "taskPlugin": {
               "pluginPackage": "@rushstack/heft-static-asset-typings-plugin",
               "pluginName": "binary-assets-plugin",
               "options": {
                 "configType": "inline",
                 "config": {
                   "fileExtensions": [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".avif"],
                   "generatedTsFolder": "temp/image-typings"
                 }
               }
             }
           },
           "typescript": {
             "taskDependencies": ["image-typings"]
             // ...
           }
         }
       }
     }
   }
   ```

   ### Text assets

   ```jsonc
   {
     "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
     "phasesByName": {
       "build": {
         "tasksByName": {
           "text-assets": {
             "taskPlugin": {
               "pluginPackage": "@rushstack/heft-static-asset-typings-plugin",
               "pluginName": "text-assets-plugin",
               "options": {
                 "cjsOutputFolders": ["lib-commonjs"],
                 "esmOutputFolders": ["lib-esm"]
                 // "configFileName": "text-assets.json"  // (optional, name of riggable config file)
               }
             }
           },
           "typescript": {
             "taskDependencies": ["text-assets"]
             // ...
           }
         }
       }
     }
   }
   ```

3. Add the generated typings folder to your **tsconfig.json** `rootDirs` so that
   TypeScript can resolve the declarations:

   ```jsonc
   {
     "compilerOptions": {
       "rootDirs": ["src", "temp/image-typings"]
     }
   }
   ```

## Plugin options

### `binary-assets-plugin`

Supports two configuration modes:

**Inline mode** (`configType: "inline"`):

| Option                       | Type       | Default   | Description                                                          |
| ---------------------------- | ---------- | --------- | -------------------------------------------------------------------- |
| `config.fileExtensions`      | `string[]` | —         | **(required)** File extensions to generate typings for.              |
| `config.generatedTsFolder`   | `string`   | `"temp/static-asset-typings"` | Output folder for the generated `.d.ts` files.        |
| `config.secondaryGeneratedTsFolders` | `string[]` | `[]` | Additional output folders for generated `.d.ts` files.              |
| `config.sourceFolderPath`    | `string`   | `"src"`   | Source folder to scan for asset files.                               |

**File mode** (`configType: "file"`):

| Option           | Type     | Description                                                            |
| ---------------- | -------- | ---------------------------------------------------------------------- |
| `configFileName` | `string` | **(required)** Name of a riggable JSON config file in the `config/` folder. |

### `text-assets-plugin`

| Option           | Type       | Default              | Description                                                      |
| ---------------- | ---------- | -------------------- | ---------------------------------------------------------------- |
| `cjsOutputFolders` | `string[]` | —                  | **(required)** Output folders for generated CommonJS `.js` modules. |
| `esmOutputFolders` | `string[]` | `[]`                | Output folders for generated ESM `.js` modules.                  |
| `configFileName` | `string`   | `"text-assets.json"` | Name of a riggable JSON config file in the `config/` folder.     |

## Riggable config file format

Both plugins can load configuration from a riggable JSON config file (located in your project's
`config/` folder). The schema supports the following properties:

| Property                     | Type       | Default   | Description                                                    |
| ---------------------------- | ---------- | --------- | -------------------------------------------------------------- |
| `fileExtensions`             | `string[]` | —         | **(required)** File extensions to process.                     |
| `generatedTsFolder`          | `string`   | `"temp/static-asset-typings"` | Output folder for generated `.d.ts` typings.    |
| `secondaryGeneratedTsFolders`| `string[]` | `[]`      | Additional output folders for generated typings.               |
| `sourceFolderPath`           | `string`   | `"src"`   | Source folder to scan for matching files.                      |

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-static-asset-typings-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
