# @rushstack/heft-zod-schema-plugin

A Heft task plugin that generates JSON Schema files (`*.schema.json`) from
[zod](https://zod.dev/) validators at build time.  It is the inverse of
[`@rushstack/heft-json-schema-typings-plugin`](https://www.npmjs.com/package/@rushstack/heft-json-schema-typings-plugin),
and is intended for projects that prefer to keep a single source of truth (the
zod schema) and have both the runtime validator and the published JSON Schema
generated from it.

## How it works

1. You author one TypeScript module per schema, e.g. `src/schemas/foo.zod.ts`,
   that exports a zod schema (typically as the default export).
2. The TypeScript compiler emits `lib/schemas/foo.zod.js`.
3. This plugin loads that compiled module, calls zod's built-in
   [`z.toJSONSchema()`](https://zod.dev/json-schema), and writes a
   `lib/schemas/foo.schema.json` file as a build artifact.
4. The companion TypeScript interface is obtained from the same source via
   `z.infer<typeof fooSchema>` — no second source of truth and no extra
   codegen step.

## Setup

1. Add the plugin and zod (4.0 or later) as dependencies of your project:

   ```bash
   rush add -p @rushstack/heft-zod-schema-plugin --dev
   rush add -p zod
   ```

2. Load the plugin in your project's **heft.json**.  Because the plugin reads
   compiled JavaScript, declare it as a task that runs **after** the
   `typescript` task:

   ```jsonc
   {
     "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
     "phasesByName": {
       "build": {
         "tasksByName": {
           "zod-schema": {
             "taskDependencies": ["typescript"],
             "taskPlugin": {
               "pluginPackage": "@rushstack/heft-zod-schema-plugin",
               "options": {
                 // (Optional) Defaults shown below
                 // "inputGlobs": ["lib/schemas/*.zod.js"],
                 // "outputFolder": "lib/schemas",
                 // "exportName": "default",
                 // "indent": 2
               }
             }
           }
         }
       }
     }
   }
   ```

3. Author your schema modules:

   ```ts
   // src/schemas/my-config.zod.ts
   import { z } from 'zod';

   const myConfigSchema = z.object({
     name: z.string().describe('The name of the item.'),
     count: z.number().int().optional()
   });

   export type IMyConfig = z.infer<typeof myConfigSchema>;
   export default myConfigSchema;
   ```

   Each build will (re-)generate `lib/schemas/my-config.schema.json` from the
   compiled `lib/schemas/my-config.zod.js`.

## Plugin options

| Option         | Type       | Default                       | Description                                                                                              |
| -------------- | ---------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `inputGlobs`   | `string[]` | `["lib/schemas/*.zod.js"]`    | Globs (relative to the project folder) identifying compiled zod modules.                                 |
| `outputFolder` | `string`   | `"lib/schemas"`               | Folder for the generated `*.schema.json` files.                                                          |
| `exportName`   | `string`   | `"default"`                   | Export to read from each module.  Use `"*"` to emit one schema per named `ZodType` export of the module. |
| `indent`       | `integer`  | `2`                           | Number of spaces used to pretty-print the JSON output.                                                   |

## Authoring metadata: `withSchemaMeta()`

Top-level metadata such as `$schema`, `$id`, `title`, and a TSDoc release tag
can be attached without depending on zod-internal APIs:

```ts
import { z } from 'zod';
import { withSchemaMeta } from '@rushstack/heft-zod-schema-plugin/lib/SchemaMetaHelpers';

const myConfigSchema = withSchemaMeta(
  z.object({
    name: z.string()
  }),
  {
    $schema: 'https://developer.microsoft.com/json-schemas/my-product/v1/my-config.schema.json',
    title: 'My Config',
    releaseTag: '@public'
  }
);

export type IMyConfig = z.infer<typeof myConfigSchema>;
export default myConfigSchema;
```

The `releaseTag` field is emitted as the `x-tsdoc-release-tag` vendor extension,
which is the same convention recognised by
[`@rushstack/heft-json-schema-typings-plugin`](https://www.npmjs.com/package/@rushstack/heft-json-schema-typings-plugin),
so you can chain the two plugins to produce both a `.schema.json` and a tagged
`.d.ts` from the same zod source.  The tag value must be a single lowercase
word starting with `@` (for example `@public` or `@beta`); invalid values cause
a build error.

## Generating TypeScript interfaces

The recommended pattern is to use zod's own `z.infer`:

```ts
export type IMyConfig = z.infer<typeof myConfigSchema>;
```

This works without any additional build step and stays in sync with the schema
automatically.

If your project needs a named, fully-expanded `interface` declaration in a
generated `.d.ts` file (for example to control the public API surface of an
API-Extractor-processed package), you can chain
[`@rushstack/heft-json-schema-typings-plugin`](https://www.npmjs.com/package/@rushstack/heft-json-schema-typings-plugin)
after this plugin and point its `srcFolder` option at the
`outputFolder` of this plugin.

## Links

- [CHANGELOG.md](
  https://github.com/microsoft/rushstack/blob/main/heft-plugins/heft-zod-schema-plugin/CHANGELOG.md) - Find
  out what's new in the latest version
- [@rushstack/heft](https://www.npmjs.com/package/@rushstack/heft) - Heft is a config-driven toolchain that invokes popular tools such as TypeScript, ESLint, Jest, Webpack, and API Extractor.
- [zod](https://zod.dev/) - TypeScript-first schema validation with static type inference.

Heft is part of the [Rush Stack](https://rushstack.io/) family of projects.
