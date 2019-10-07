// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  JsonFile,
  JsonSchema,
  FileSystem
} from '@microsoft/node-core-library';

/**
 * This interface represents the raw experiments.json file which allows repo
 * maintainers to enable and disable experimental Rush features.
 * @beta
 */
export interface IExperimentsJson {
  /**
   * If this setting is enabled, incremental builds should use repo-wide dependency tracking
   * instead of project-specific tracking.
   */
  legacyIncrementalBuildDependencyDetection?: boolean;
}

/**
 * Use this class to load the "common/config/rush/experiments.json" config file.
 * This file allows repo maintainers to enable and disable experimental Rush features.
 * @beta
 */
export class ExperimentsConfiguration {
  private static _jsonSchema: JsonSchema = JsonSchema.fromFile(
    path.join(__dirname, '..', 'schemas', 'experiments.schema.json')
  );

  private _experimentConfiguration: IExperimentsJson;
  private _jsonFileName: string;

  /**
   * @internal
   */
  public constructor(jsonFileName: string) {
    this._jsonFileName = jsonFileName;
    this._experimentConfiguration = {};

    if (!FileSystem.exists(this._jsonFileName)) {
      this._experimentConfiguration = {};
    } else {
      this._experimentConfiguration = JsonFile.loadAndValidate(
        this._jsonFileName,
        ExperimentsConfiguration._jsonSchema
      );
    }
  }

  /**
   * Get the experiments configuration.
   */
  public get configuration(): Readonly<IExperimentsJson> {
    return this._experimentConfiguration;
  }
}
