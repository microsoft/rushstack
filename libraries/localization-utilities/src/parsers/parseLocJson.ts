// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, JsonSchema } from '@rushstack/node-core-library';

import type { ILocalizationFile, IParseFileOptions } from '../interfaces.ts';
import locJsonSchema from '../schemas/locJson.schema.json';

const LOC_JSON_SCHEMA: JsonSchema = JsonSchema.fromLoadedObject(locJsonSchema);

/**
 * @public
 */
export function parseLocJson({ content, filePath, ignoreString }: IParseFileOptions): ILocalizationFile {
  const parsedFile: ILocalizationFile = JsonFile.parseString(content);
  try {
    LOC_JSON_SCHEMA.validateObject(parsedFile, filePath, { ignoreSchemaField: true });
  } catch (e) {
    throw new Error(`The loc file is invalid. Error: ${e}`);
  }

  // Normalize file shape and possibly filter
  const newParsedFile: ILocalizationFile = {};
  for (const [key, stringData] of Object.entries(parsedFile)) {
    if (!ignoreString?.(filePath, key)) {
      // Normalize entry shape. We allow the values to be plain strings as a format that can be handed
      // off to webpack builds that don't understand the comment syntax.
      newParsedFile[key] = typeof stringData === 'string' ? { value: stringData } : stringData;
    }
  }

  return newParsedFile;
}
