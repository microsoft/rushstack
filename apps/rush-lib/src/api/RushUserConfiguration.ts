// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile, JsonSchema } from '@rushstack/node-core-library';
import * as path from 'path';

import { Utilities } from '../utilities/Utilities';
import { RushConstants } from '../logic/RushConstants';

interface IRushUserConfigurationJson {
  buildCacheFolder?: string;
}

/**
 * Rush per-user configuration data.
 *
 * @beta
 */
export class RushUserConfiguration {
  private static _schema: JsonSchema = JsonSchema.fromFile(
    path.resolve(__dirname, '..', 'schemas', 'rush-user-configuration.schema.json')
  );

  /**
   * If provided, store build cache in the specified folder. Must be an absolute path.
   */
  public readonly buildCacheFolder: string | undefined;

  private constructor(rushUserConfigurationJson: IRushUserConfigurationJson | undefined) {
    this.buildCacheFolder = rushUserConfigurationJson?.buildCacheFolder;
    if (this.buildCacheFolder && !path.isAbsolute(this.buildCacheFolder)) {
      throw new Error('buildCacheFolder must be an absolute path');
    }
  }

  public static async initializeAsync(): Promise<RushUserConfiguration> {
    const homeFolderPath: string = Utilities.getHomeFolder();
    const rushUserConfigurationFilePath: string = path.join(
      homeFolderPath,
      RushConstants.rushUserConfigurationFilename
    );
    let rushUserConfigurationJson: IRushUserConfigurationJson | undefined;
    try {
      rushUserConfigurationJson = await JsonFile.loadAndValidateAsync(
        rushUserConfigurationFilePath,
        RushUserConfiguration._schema
      );
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }

    return new RushUserConfiguration(rushUserConfigurationJson);
  }
}
