// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonSchema, JsonFile } from '@microsoft/node-core-library';
import { IConfigFile } from './IConfigFile';

/**
 * Helper for loading the api-documenter.json file format.  Later when the schema is more mature,
 * this class will be used to represent the validated and normalized configuration, whereas `IConfigFile`
 * represents the raw JSON file structure.
 */
export class DocumenterConfig {
  /**
   * The JSON Schema for API Extractor config file (api-extractor.schema.json).
   */
  public static readonly jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '..', 'schemas', 'api-documenter.schema.json'));

  /**
   * The config file name "api-extractor.json".
   */
  public static readonly FILENAME: string = 'api-documenter.json';

  /**
   * Load and validate an api-documenter.json file.
   */
  public static loadFile(configFilePath: string): IConfigFile {
    const configFile: IConfigFile = JsonFile.loadAndValidate(configFilePath, DocumenterConfig.jsonSchema);

    return configFile;
  }
}
