# @rushstack/heft-static-asset-typings-plugin

This Heft plugin generates TypeScript `.d.ts` typings for static asset files, enabling type-safe
`import` statements for non-TypeScript files. It provides two task plugins:

- **`resource-assets-plugin`** — Generates `.d.ts` typings for _resource_ files such as images (`.png`,
  `.jpg`, `.svg`, etc.) and fonts. These are opaque binary blobs whose content is not meaningful to
  JavaScript; the generated typing simply exports a default `string` representing the asset URL
  (e.g. as resolved by a bundler's asset loader).

- **`source-assets-plugin`** — Generates `.d.ts` typings _and_ JavaScript module output for _source_
  files (`.html`, `.css`, `.txt`, `.md`, etc.) whose textual content is consumed at runtime. The
  generated JS modules read the file and re-export its content as a default `string`, making these
  assets importable as ES modules.

The terminology follows the [webpack convention](https://webpack.js.org/guides/asset-modules/)
where _resource_ assets are emitted as separate files referenced by URL, while _source_ assets are
inlined as strings.

Both plugins support incremental and watch-mode builds.

## Setup

1. Add the plugin as a `devDependency` of your project:

   ```bash
   rush add -p @rushstack/heft-static-asset-typings-plugin --dev
   ```

2. Load the appropriate plugin(s) in your project's **config/heft.json**:

   ### Resource assets (images, fonts, etc.)

   **Inline configuration** — specify options directly in heft.json:

   ```jsonc
   {
     "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
     "phasesByName": {
       "build": {
         "tasksByName": {
           "image-typings": {
             "taskPlugin": {
               "pluginPackage": "@rushstack/heft-static-asset-typings-plugin",
               "pluginName": "resource-assets-plugin",
               "options": {
                 "configType": "inline",
                 "config": {
                   "fileExtensions": [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".avif"],
                   "generatedTsFolders": ["temp/image-typings"]
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

   **File configuration** — load settings from a riggable config file:

   ```jsonc
   {
     "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
     "phasesByName": {
       "build": {
         "tasksByName": {
           "image-typings": {
             "taskPlugin": {
               "pluginPackage": "@rushstack/heft-static-asset-typings-plugin",
               "pluginName": "resource-assets-plugin",
               "options": {
                 "configType": "file",
                 "configFileName": "resource-assets.json"
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

   And create a **config/resource-assets.json** file (which can be provided by a rig):

   ```jsonc
   {
     "fileExtensions": [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".avif"],
     "generatedTsFolders": ["temp/image-typings"]
   }
   ```

   ### Source assets

   **Inline configuration:**

   ```jsonc
   {
     "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
     "phasesByName": {
       "build": {
         "tasksByName": {
           "text-typings": {
             "taskPlugin": {
               "pluginPackage": "@rushstack/heft-static-asset-typings-plugin",
               "pluginName": "source-assets-plugin",
               "options": {
                 "configType": "inline",
                 "config": {
                   "fileExtensions": [".html"],
                   "cjsOutputFolders": ["lib-commonjs"],
                   "esmOutputFolders": ["lib-esm"],
                   "generatedTsFolders": ["temp/text-typings"]
                 }
               }
             }
           },
           "typescript": {
             "taskDependencies": ["text-typings"]
             // ...
           }
         }
       }
     }
   }
   ```

   **File configuration:**

   ```jsonc
   {
     "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
     "phasesByName": {
       "build": {
         "tasksByName": {
           "text-typings": {
             "taskPlugin": {
               "pluginPackage": "@rushstack/heft-static-asset-typings-plugin",
               "pluginName": "source-assets-plugin",
               "options": {
                 "configType": "file",
                 "configFileName": "source-assets.json"
               }
             }
           },
           "typescript": {
             "taskDependencies": ["text-typings"]
             // ...
           }
         }
       }
     }
   }
   ```

   And create a **config/source-assets.json** file (which can be provided by a rig):

   ```jsonc
   {
     "fileExtensions": [".html"],
     "cjsOutputFolders": ["lib-commonjs"],
     "esmOutputFolders": ["lib-esm"],
     "generatedTsFolders": ["temp/text-typings"]
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

Both plugins support two configuration modes via the `configType` option:

### Inline mode (`configType: "inline"`)

Provide configuration directly in heft.json under `options.config`:

#### `resource-assets-plugin` inline config

| Option              | Type       | Default                  | Description                                     |
| ------------------- | ---------- | ------------------------ | ----------------------------------------------- |
| `fileExtensions`    | `string[]` | —                        | **(required)** File extensions to generate typings for. |
| `generatedTsFolders`| `string[]` | `["temp/static-asset-ts"]` | Folders where generated `.d.ts` files are written. The first entry should be listed in `rootDirs` so TypeScript can resolve the asset imports during type-checking. Additional entries are typically your project's published typings folder(s). |
| `sourceFolderPath`  | `string`   | `"src"`                  | Source folder to scan for asset files.           |

#### `source-assets-plugin` inline config

Includes all the above, plus:

| Option              | Type       | Default                  | Description                                          |
| ------------------- | ---------- | ------------------------ | ---------------------------------------------------- |
| `cjsOutputFolders`  | `string[]` | —                        | **(required)** Output folders for generated CommonJS `.js` modules. |
| `esmOutputFolders`   | `string[]` | `[]`                    | Output folders for generated ESM `.js` modules.      |

### File mode (`configType: "file"`)

Load configuration from a riggable JSON config file in the project's `config/` folder:

| Option           | Type     | Description                                                            |
| ---------------- | -------- | ---------------------------------------------------------------------- |
| `configFileName` | `string` | **(required)** Name of the JSON config file in the `config/` folder.   |

The config file supports the same properties as inline mode (see tables above). Config files
can be provided by a rig, making file mode ideal for shared build configurations.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-static-asset-typings-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
