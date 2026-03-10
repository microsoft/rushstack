// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { JsonSchema, JsonFile, NewlineKind } from '@rushstack/node-core-library';

import type { IConfigFile } from './IConfigFile.ts';
import apiDocumenterSchema from '../schemas/api-documenter.schema.json';

/**
 * Helper for loading the api-documenter.json file format.  Later when the schema is more mature,
 * this class will be used to represent the validated and normalized configuration, whereas `IConfigFile`
 * represents the raw JSON file structure.
 */
export class DocumenterConfig {
  public readonly configFilePath: string;
  public readonly configFile: IConfigFile;

  /**
   * Specifies what type of newlines API Documenter should use when writing output files.  By default, the output files
   * will be written with Windows-style newlines.
   */
  public readonly newlineKind: NewlineKind;

  /**
   * The JSON Schema for API Documenter config file (api-documenter.schema.json).
   */
  public static readonly jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(apiDocumenterSchema);

  /**
   * The config file name "api-documenter.json".
   */
  public static readonly FILENAME: string = 'api-documenter.json';

  private constructor(filePath: string, configFile: IConfigFile) {
    this.configFilePath = filePath;
    this.configFile = configFile;

    switch (configFile.newlineKind) {
      case 'lf':
        this.newlineKind = NewlineKind.Lf;
        break;
      case 'os':
        this.newlineKind = NewlineKind.OsDefault;
        break;
      default:
        this.newlineKind = NewlineKind.CrLf;
        break;
    }
  }

  /**
   * Load and validate an api-documenter.json file.
   */
  public static loadFile(configFilePath: string): DocumenterConfig {
    const configFile: IConfigFile = JsonFile.loadAndValidate(configFilePath, DocumenterConfig.jsonSchema);

    return new DocumenterConfig(path.resolve(configFilePath), configFile);
  }
}
