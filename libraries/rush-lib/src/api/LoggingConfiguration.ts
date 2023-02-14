// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';
import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';
import { RushConfiguration } from './RushConfiguration';

import schemaJson from '../schemas/logging.schema.json';

export interface ILogFoldingStyle {
  name: string;
  header?: string;
  footer?: string;
}

/**
 * This interface represents the raw artifactory.json file.
 * @beta
 */
export interface ILoggingConfigurationJson {
  logFoldingStyles: ILogFoldingStyle[];
}

/**
 * Use this class to load the "common/config/rush/logging.json" config file.
 */
export class LoggingConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  private readonly _jsonFileName: string;

  /**
   * Get the artifactory configuration.
   */
  public readonly configuration: Readonly<ILoggingConfigurationJson>;

  /**
   * @internal
   */
  public constructor(jsonFileName: string) {
    this._jsonFileName = jsonFileName;

    this.configuration = {
      logFoldingStyles: []
    };

    if (FileSystem.exists(this._jsonFileName)) {
      this.configuration = JsonFile.loadAndValidate(this._jsonFileName, LoggingConfiguration._jsonSchema);
    }

    const foldingStyleNames: Set<string> = new Set();
    for (const foldingStyle of this.configuration.logFoldingStyles) {
      if (foldingStyleNames.has(foldingStyle.name)) {
        throw new Error(
          `Log folding style '${foldingStyle.name}' is defined multiple times in ${this._jsonFileName}.`
        );
      }
      foldingStyleNames.add(foldingStyle.name);
    }
  }

  public getLogFoldingStyleByName(name: string): ILogFoldingStyle {
    for (const foldingStyle of this.configuration.logFoldingStyles) {
      if (foldingStyle.name === name) {
        return foldingStyle;
      }
    }
    throw new Error(`Log folding style '${name}' is not defined in the ${this._jsonFileName}.`);
  }

  public static load(rushConfiguration: RushConfiguration): LoggingConfiguration {
    const loggingConfiguration: LoggingConfiguration = new LoggingConfiguration(
      path.join(rushConfiguration.commonRushConfigFolder, 'logging.json')
    );
    return loggingConfiguration;
  }
}
