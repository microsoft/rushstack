// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { compileFromFile } from 'json-schema-to-typescript';

import { type ITypingsGeneratorBaseOptions, TypingsGenerator } from '@rushstack/typings-generator';

interface IJsonSchemaTypingsGeneratorBaseOptions extends ITypingsGeneratorBaseOptions {}

/**
 * Adds a TSDoc release tag (e.g. `@public`, `@beta`) to all exported declarations
 * in generated typings.
 *
 * `json-schema-to-typescript` does not emit release tags, so this function
 * post-processes the output to ensure API Extractor treats these types with the
 * correct release tag when they are re-exported from package entry points.
 */
function _addTsDocTagToExports(typingsData: string, tag: string): string {
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

export class JsonSchemaTypingsGenerator extends TypingsGenerator {
  public constructor(options: IJsonSchemaTypingsGeneratorBaseOptions) {
    super({
      ...options,
      fileExtensions: ['.schema.json'],
      // Don't bother reading the file contents, compileFromFile will read the file
      readFile: () => '',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      parseAndGenerateTypings: async (fileContents: string, filePath: string): Promise<string> => {
        const typings: string = await compileFromFile(filePath, {
          // The typings generator adds its own banner comment
          bannerComment: '',
          cwd: path.dirname(filePath)
        });

        // Check for an "x-tsdoc-tag" property in the schema (e.g. "@public" or "@beta").
        // If present, inject the tag into JSDoc comments for all exported declarations.
        const schemaContent: string = await readFile(filePath, 'utf-8');
        const schemaJson: { 'x-tsdoc-tag'?: string } = JSON.parse(schemaContent);
        const tsdocTag: string | undefined = schemaJson['x-tsdoc-tag'];

        if (tsdocTag) {
          return _addTsDocTagToExports(typings, tsdocTag);
        }

        return typings;
      }
    });
  }
}
