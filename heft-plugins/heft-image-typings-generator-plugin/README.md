# @rushstack/heft-image-typings-generator-plugin

This is a Heft plugin that generates TypeScript `.d.ts` typings for image files (`.png`, `.jpg`,
`.gif`, `.svg`, etc.). Each matched image file produces a typing that exports a default string
for the image URL, enabling type-safe image imports in TypeScript projects.

## Setup

1. Add the plugin as a `devDependency` of your project:

   ```bash
   rush add -p @rushstack/heft-image-typings-generator-plugin --dev
   ```

2. Load the plugin in your project's **config/heft.json** configuration:

   ```jsonc
   {
     "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
     "phasesByName": {
       "build": {
         "tasksByName": {
           "image-typings": {
             "taskPlugin": {
               "pluginPackage": "@rushstack/heft-image-typings-generator-plugin",
               "options": {
                 "fileExtensions": [".png", ".jpg", ".gif", ".svg"],
                 "generatedTsFolder": "temp/image-typings"
                 // "srcFolder": "src"  // (optional, defaults to "src")
               }
             }
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

| Option              | Type       | Default | Description                                                       |
| ------------------- | ---------- | ------- | ----------------------------------------------------------------- |
| `fileExtensions`    | `string[]` | —       | **(required)** File extensions to generate typings for, e.g. `[".png", ".jpg"]`. |
| `generatedTsFolder` | `string`   | —       | **(required)** Output folder for the generated `.d.ts` files.     |
| `srcFolder`         | `string`   | `"src"` | Source folder to scan for image files.                            |

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-image-typings-generator-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
