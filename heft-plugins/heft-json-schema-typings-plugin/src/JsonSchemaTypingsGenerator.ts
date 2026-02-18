// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { compileFromFile } from 'json-schema-to-typescript';

import { type ITypingsGeneratorBaseOptions, TypingsGenerator } from '@rushstack/typings-generator';

import { _addTsDocTagToExports } from './TsDocTagHelpers';

interface IJsonSchemaTypingsGeneratorBaseOptions extends ITypingsGeneratorBaseOptions {}

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
