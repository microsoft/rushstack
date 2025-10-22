// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile, JsonSchema, User } from '@rushstack/node-core-library';

import { RushConstants } from '../logic/RushConstants';
import schemaJson from '../schemas/rush-user-settings.schema.json';

interface IRushUserSettingsJson {
  buildCacheFolder?: string;
}

/**
 * Rush per-user configuration data.
 *
 * @beta
 */
export class RushUserConfiguration {
  private static _schema: JsonSchema = JsonSchema.fromLoadedObject(schemaJson);

  /**
   * If provided, store build cache in the specified folder. Must be an absolute path.
   */
  public readonly buildCacheFolder: string | undefined;

  private constructor(rushUserConfigurationJson: IRushUserSettingsJson | undefined) {
    this.buildCacheFolder = rushUserConfigurationJson?.buildCacheFolder;
    if (this.buildCacheFolder && !path.isAbsolute(this.buildCacheFolder)) {
      throw new Error('buildCacheFolder must be an absolute path');
    }
  }

  public static async initializeAsync(): Promise<RushUserConfiguration> {
    const rushUserFolderPath: string = RushUserConfiguration.getRushUserFolderPath();
    const rushUserSettingsFilePath: string = path.join(rushUserFolderPath, 'settings.json');
    let rushUserSettingsJson: IRushUserSettingsJson | undefined;
    try {
      rushUserSettingsJson = await JsonFile.loadAndValidateAsync(
        rushUserSettingsFilePath,
        RushUserConfiguration._schema
      );
    } catch (e) {
      if (!FileSystem.isNotExistError(e as Error)) {
        throw e;
      }
    }

    return new RushUserConfiguration(rushUserSettingsJson);
  }

  public static getRushUserFolderPath(): string {
    const homeFolderPath: string = User.getHomeFolder();
    return `${homeFolderPath}/${RushConstants.rushUserConfigurationFolderName}`;
  }
}
