// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile, JsonSchema, FileSystem } from '@rushstack/node-core-library';
import type { IExperimentsJson } from '@rushstack/rush-schemas/lib/experiments.zod';
import { Colorize } from '@rushstack/terminal';

import schemaJson from '../schemas/experiments.schema.json';

export type { IExperimentsJson };

const GRADUATED_EXPERIMENTS: Set<string> = new Set(['phasedCommands']);


const _EXPERIMENTS_JSON_SCHEMA: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

/**
 * Use this class to load the "common/config/rush/experiments.json" config file.
 * This file allows repo maintainers to enable and disable experimental Rush features.
 * @public
 */
export class ExperimentsConfiguration {
  /**
   * Get the experiments configuration.
   * @beta
   */
  public readonly configuration: Readonly<IExperimentsJson>;

  /**
   * @internal
   */
  public constructor(jsonFilePath: string) {
    try {
      this.configuration = JsonFile.loadAndValidate(jsonFilePath, _EXPERIMENTS_JSON_SCHEMA);
    } catch (e) {
      if (FileSystem.isNotExistError(e)) {
        this.configuration = {};
      } else {
        throw e;
      }
    }

    for (const experimentName of Object.getOwnPropertyNames(this.configuration)) {
      if (GRADUATED_EXPERIMENTS.has(experimentName)) {
        // eslint-disable-next-line no-console
        console.log(
          Colorize.yellow(
            `The experiment "${experimentName}" has graduated to a standard feature. Remove this experiment from ` +
              `"${jsonFilePath}".`
          )
        );
      }
    }
  }
}
