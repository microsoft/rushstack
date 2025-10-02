// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITypingsGeneratorBaseOptions, TypingsGenerator } from '@rushstack/typings-generator';
import { compileFromFile } from 'json-schema-to-typescript';
import path from 'node:path';

interface IJsonSchemaTypingsGeneratorBaseOptions extends ITypingsGeneratorBaseOptions {}

export class JsonSchemaTypingsGenerator extends TypingsGenerator {
  public constructor(options: IJsonSchemaTypingsGeneratorBaseOptions) {
    super({
      ...options,
      fileExtensions: ['.schema.json'],
      // Don't bother reading the file contents, compileFromFile will read the file
      readFile: () => '',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      parseAndGenerateTypings: async (fileContents: string, filePath: string): Promise<string> =>
        await compileFromFile(filePath, {
          // The typings generator adds its own banner comment
          bannerComment: '',
          cwd: path.dirname(filePath)
        })
    });
  }
}
