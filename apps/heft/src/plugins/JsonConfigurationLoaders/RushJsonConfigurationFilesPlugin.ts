// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import * as RushUtilities from '../../utilities/RushUtilities';
import { JsonConfigurationFilesPluginBase } from './JsonConfigurationFilesPluginBase';

export class RushJsonConfigurationFilesPlugin extends JsonConfigurationFilesPluginBase {
  public readonly displayName: string = 'rushJsonConfigurationFiles';

  private __rushConfigurationFolder: string | undefined | null = undefined;

  private get _rushConfigurationFolder(): string | undefined {
    if (this.__rushConfigurationFolder === undefined) {
      try {
        this.__rushConfigurationFolder = RushUtilities.getRushConfigFolder();
      } catch (error) {
        this.__rushConfigurationFolder = null; // eslint-disable-line @rushstack/no-null
      }
    }

    return this.__rushConfigurationFolder || undefined;
  }

  protected _getConfigurationFileFullPath(jsonFilename: string): string | undefined {
    const rushConfigurationFolder: string | undefined = this._rushConfigurationFolder;
    if (rushConfigurationFolder) {
      return path.resolve(rushConfigurationFolder, 'heft', jsonFilename);
    } else {
      return undefined;
    }
  }
}
