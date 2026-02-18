// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Adds a TSDoc release tag (e.g. `@public`, `@beta`) to all exported declarations
 * in generated typings.
 *
 * `json-schema-to-typescript` does not emit release tags, so this function
 * post-processes the output to ensure API Extractor treats these types with the
 * correct release tag when they are re-exported from package entry points.
 */
export function _addTsDocTagToExports(typingsData: string, tag: string): string {
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
