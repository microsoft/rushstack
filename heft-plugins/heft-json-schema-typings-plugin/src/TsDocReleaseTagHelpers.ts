// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export const X_TSDOC_RELEASE_TAG_KEY: 'x-tsdoc-release-tag' = 'x-tsdoc-release-tag';
const RELEASE_TAG_PATTERN: RegExp = /^@[a-z]+$/;

/**
 * Validates that a string looks like a TSDoc release tag — a single lowercase
 * word starting with `@` (e.g. `@public`, `@beta`, `@internal`).
 */
export function _validateTsDocReleaseTag(value: string, schemaPath: string): void {
  if (!RELEASE_TAG_PATTERN.test(value)) {
    throw new Error(
      `Invalid ${X_TSDOC_RELEASE_TAG_KEY} value ${JSON.stringify(value)} in ${schemaPath}. ` +
        'Expected a single lowercase word starting with "@" (e.g. "@public", "@beta").'
    );
  }
}

/**
 * Adds a TSDoc release tag (e.g. `@public`, `@beta`) to all exported declarations
 * in generated typings.
 *
 * `json-schema-to-typescript` does not emit release tags, so this function
 * post-processes the output to ensure API Extractor treats these types with the
 * correct release tag when they are re-exported from package entry points.
 */
export function _addTsDocReleaseTagToExports(typingsData: string, tag: string): string {
  // Normalize line endings for consistent regex matching.
  // The TypingsGenerator base class applies NewlineKind.OsDefault when writing.
  const normalized: string = typingsData.replace(/\r\n/g, '\n');

  // Pass 1: For exports preceded by an existing JSDoc comment, insert
  // the tag before the closing "*/".
  let result: string = normalized.replace(/ \*\/\n(export )/g, ` *\n * ${tag}\n */\n$1`);

  // Pass 2: For exports NOT preceded by a JSDoc comment, insert a new
  // JSDoc block. The negative lookbehind ensures Pass 1
  // results are not double-matched.
  result = result.replace(/(?<!\*\/\n)^(export )/gm, `/**\n * ${tag}\n */\n$1`);

  return result;
}
