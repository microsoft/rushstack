// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { IApiPackage } from './ApiItem';
import { JsonSchema, JsonFile, IJsonSchemaErrorInfo } from '@microsoft/node-core-library';

/**
 * Support for loading the *.api.json file.
 *
 * @public
 */
export class ApiJsonFile {
  /**
   * The JSON Schema for API Extractor's *.api.json files (api-json.schema.json).
   */
  public static jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, './api-json.schema.json'));

  /**
   * Loads an *.api.json data file, and validates that it conforms to the api-json.schema.json
   * schema.
   */
  public static loadFromFile(apiJsonFilePath: string): IApiPackage {
    return JsonFile.loadAndValidateWithCallback(apiJsonFilePath, ApiJsonFile.jsonSchema,
      (errorInfo: IJsonSchemaErrorInfo) => {

        const errorMessage: string
          = path.basename(apiJsonFilePath) + ' does not conform to the expected schema.\n'
          + '(Was it created by an incompatible release of API Extractor?)\n'
          + errorInfo.details;

        throw new Error(errorMessage);
      }
    );
  }
}
