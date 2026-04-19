// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The vendor-extension property name used to embed a TSDoc release tag in a generated
 * JSON Schema. Mirrors the `x-tsdoc-release-tag` extension recognised by
 * `@rushstack/heft-json-schema-typings-plugin` so that the same convention works in
 * both directions.
 */
export const X_TSDOC_RELEASE_TAG_KEY: 'x-tsdoc-release-tag' = 'x-tsdoc-release-tag';

const RELEASE_TAG_PATTERN: RegExp = /^@[a-z]+$/;

/**
 * Validates that a string looks like a TSDoc release tag - a single lowercase
 * word starting with `@` (e.g. `@public`, `@beta`, `@internal`).
 *
 * @internal
 */
export function _validateTsDocReleaseTag(value: string, sourceDescription: string): void {
  if (!RELEASE_TAG_PATTERN.test(value)) {
    throw new Error(
      `Invalid ${X_TSDOC_RELEASE_TAG_KEY} value ${JSON.stringify(value)} in ${sourceDescription}. ` +
        'Expected a single lowercase word starting with "@" (e.g. "@public", "@beta").'
    );
  }
}

/**
 * Top-level metadata that authors may attach to a zod schema for inclusion in the
 * generated `*.schema.json` output.
 *
 * @public
 */
export interface ISchemaMeta {
  /**
   * The JSON Schema dialect URL that the generated file should declare in its
   * top-level `$schema` property. If unset, the value emitted by `z.toJSONSchema()`
   * (or none) is used.
   */
  $schema?: string;

  /**
   * Optional `$id` to embed in the generated schema.
   */
  $id?: string;

  /**
   * Optional `title` for the generated schema. If not provided, an existing title
   * from the zod schema (e.g. via `.meta({ title })`) is preserved.
   */
  title?: string;

  /**
   * Optional human-readable description for the schema. If not provided, an existing
   * description from the zod schema is preserved.
   */
  description?: string;

  /**
   * A TSDoc release tag (e.g. `@public`, `@beta`, `@alpha`, `@internal`) to embed in
   * the generated schema as a vendor extension (`x-tsdoc-release-tag`).
   *
   * @remarks
   * The companion `@rushstack/heft-json-schema-typings-plugin` uses the same vendor
   * extension to inject release tags into generated `.d.ts` files, which keeps the
   * convention consistent across the two plugins.
   */
  releaseTag?: string;
}

const _schemaMetaMap: WeakMap<object, ISchemaMeta> = new WeakMap();

/**
 * Attaches schema-emission metadata (such as `$schema`, `title`, and a TSDoc
 * release tag) to a zod schema. The metadata is read by
 * `@rushstack/heft-zod-schema-plugin` when generating the corresponding
 * `*.schema.json` file.
 *
 * @remarks
 * The metadata is stored out-of-band in a `WeakMap` keyed on the schema instance
 * so that this helper does not depend on any particular zod version. The schema
 * itself is returned unchanged, which keeps `z.infer` results identical.
 *
 * @public
 */
export function withSchemaMeta<TSchema extends object>(schema: TSchema, meta: ISchemaMeta): TSchema {
  if (meta.releaseTag !== undefined) {
    _validateTsDocReleaseTag(meta.releaseTag, 'withSchemaMeta()');
  }
  _schemaMetaMap.set(schema, { ...meta });
  return schema;
}

/**
 * Looks up metadata previously attached to a schema with `withSchemaMeta`.
 *
 * @internal
 */
export function _getSchemaMeta(schema: object): ISchemaMeta | undefined {
  return _schemaMetaMap.get(schema);
}
