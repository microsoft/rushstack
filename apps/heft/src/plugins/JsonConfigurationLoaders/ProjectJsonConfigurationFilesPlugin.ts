// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { JsonConfigurationFilesPluginBase } from './JsonConfigurationFilesPluginBase';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';

export class ProjectJsonConfigurationFilesPlugin extends JsonConfigurationFilesPluginBase {
  public readonly displayName: string = 'projectJsonConfigurationFiles';

  protected _getConfigurationFileFullPath(
    jsonFilename: string,
    heftConfiguration: HeftConfiguration
  ): string | undefined {
    return path.resolve(heftConfiguration.projectHeftDataFolder, jsonFilename);
  }
}
