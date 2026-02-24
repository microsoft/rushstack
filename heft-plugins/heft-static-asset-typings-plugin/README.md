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
               "pluginName": "binary-assets-plugin",
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
               "pluginName": "binary-assets-plugin",
               "options": {
                 "configType": "file",
                 "configFileName": "binary-assets.json"
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

   And create a **config/binary-assets.json** file (which can be provided by a rig):

   ```jsonc
   {
     "fileExtensions": [".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".avif"],
     "generatedTsFolders": ["temp/image-typings"]
   }
   ```

   ### Text assets

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
               "pluginName": "text-assets-plugin",
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
               "pluginName": "text-assets-plugin",
               "options": {
                 "configType": "file",
                 "configFileName": "text-assets.json"
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

   And create a **config/text-assets.json** file (which can be provided by a rig):

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

#### `binary-assets-plugin` inline config

| Option              | Type       | Default                  | Description                                     |
| ------------------- | ---------- | ------------------------ | ----------------------------------------------- |
| `fileExtensions`    | `string[]` | —                        | **(required)** File extensions to generate typings for. |
| `generatedTsFolders`| `string[]` | `["temp/static-asset-ts"]` | Folders where generated `.d.ts` files are written. The first entry should be listed in `rootDirs` so TypeScript can resolve the asset imports during type-checking. Additional entries are typically your project's published typings folder(s). |
| `sourceFolderPath`  | `string`   | `"src"`                  | Source folder to scan for asset files.           |

#### `text-assets-plugin` inline config

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
