# @rushstack/heft-json-schema-typings-plugin

This is a Heft plugin that generates TypeScript `.d.ts` typings from JSON Schema files
(files matching `*.schema.json`). It uses the
[json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) library
to produce type declarations that can be imported alongside the schema at build time.

## Setup

1. Add the plugin as a `devDependency` of your project:

   ```bash
   rush add -p @rushstack/heft-json-schema-typings-plugin --dev
   ```

2. Load the plugin in your project's **heft.json** configuration:

   ```jsonc
   {
     "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
     "phasesByName": {
       "build": {
         "tasksByName": {
           "json-schema-typings": {
             "taskPlugin": {
               "pluginPackage": "@rushstack/heft-json-schema-typings-plugin",
               "options": {
                 // (Optional) Defaults shown below
                 // "srcFolder": "src",
                 // "generatedTsFolders": ["temp/schemas-ts"],
                 // "formatWithPrettier": false
               }
             }
           }
         }
       }
     }
   }
   ```

3. Place your `*.schema.json` files under the source folder (default: `src/`).
   The plugin will generate a corresponding `.d.ts` file for each schema.

## Plugin options

| Option               | Type       | Default              | Description                                                                      |
| -------------------- | ---------- | -------------------- | -------------------------------------------------------------------------------- |
| `srcFolder`          | `string`   | `"src"`              | Source directory to scan for `*.schema.json` files.                              |
| `generatedTsFolders` | `string[]` | `["temp/schemas-ts"]`| Output directories for the generated `.d.ts` files.                             |
| `formatWithPrettier` | `boolean`  | `false`              | When `true`, format generated typings with [prettier](https://prettier.io/). Requires `prettier` as an installed dependency. |

## Vendor extension: `x-tsdoc-release-tag`

The plugin recognises a custom vendor extension property called **`x-tsdoc-release-tag`** in
your JSON Schema files. When present at the top level of a schema, its value (a
[TSDoc release tag](https://tsdoc.org/pages/spec/tag_kinds/#release-tags) such as `@public`,
`@beta`, `@alpha`, or `@internal`) is injected into JSDoc comments of every exported
declaration in the generated `.d.ts` file.

This is useful when the generated types are re-exported from a package entry point that is
processed by [API Extractor](https://api-extractor.com/), which uses release tags to
determine the API surface visibility.

### Example

**my-config.schema.json**

```json
{
  "x-tsdoc-release-tag": "@public",
  "title": "My Config",
  "type": "object",
  "properties": {
    "name": { "type": "string" }
  },
  "additionalProperties": false
}
```

**Generated output (my-config.schema.json.d.ts)**

```ts
/**
 * @public
 */
export interface MyConfig {
  name?: string;
}
```

The `x-tsdoc-release-tag` property is stripped from the schema before type generation, so it
does not affect the shape of the emitted types. The value must be a single lowercase word
starting with `@` (for example `@public` or `@beta`); invalid values cause a build error.

> **Note:** `@rushstack/node-core-library`'s `JsonSchema` class accepts vendor extension
> keywords matching the `x-<vendor>-<keyword>` pattern by default, so schema files containing
> `x-tsdoc-release-tag` will validate without any additional configuration.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-json-schema-typings-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
