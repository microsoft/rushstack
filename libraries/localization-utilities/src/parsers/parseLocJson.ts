// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, JsonSchema } from '@rushstack/node-core-library';

import { ILocalizationFile, IParseFileOptions } from '../interfaces';

// Use `require` here to allow this package to be bundled with Webpack.
const LOC_JSON_SCHEMA: JsonSchema = JsonSchema.fromLoadedObject(require('../schemas/locJson.schema.json'));

/**
 * @public
 */
export function parseLocJson({ content, filePath, ignoreString }: IParseFileOptions): ILocalizationFile {
  const parsedFile: ILocalizationFile = JsonFile.parseString(content);
  try {
    LOC_JSON_SCHEMA.validateObject(parsedFile, filePath);
  } catch (e) {
    throw new Error(`The loc file is invalid. Error: ${e}`);
  }

  if (ignoreString) {
    const newParsedFile: ILocalizationFile = {};
    for (const [key, stringData] of Object.entries(parsedFile)) {
      if (!ignoreString(filePath, key)) {
        newParsedFile[key] = stringData;
      }
    }

    return newParsedFile;
  } else {
    return parsedFile;
  }
}
