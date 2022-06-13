// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { resolve } from 'path';

import { JsonFile, JsonSchema } from '@rushstack/node-core-library';

import { ILocalizationFile, IParseFileOptions } from '../interfaces';

const LOC_JSON_SCHEMA_PATH: string = resolve(__dirname, '../schemas/locJson.schema.json');
const LOC_JSON_SCHEMA: JsonSchema = JsonSchema.fromFile(LOC_JSON_SCHEMA_PATH);

/**
 * @public
 */
export function parseLocJson(options: IParseFileOptions): ILocalizationFile {
  const parsedFile: ILocalizationFile = JsonFile.parseString(options.content);
  try {
    LOC_JSON_SCHEMA.validateObject(parsedFile, options.filePath);
  } catch (e) {
    throw new Error(`The loc file is invalid. Error: ${e}`);
  }
  return parsedFile;
}
