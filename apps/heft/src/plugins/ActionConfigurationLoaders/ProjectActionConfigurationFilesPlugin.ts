// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { ActionConfigurationFilesPluginBase } from './ActionConfigurationFilesPluginBase';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';

export class ProjectActionConfigurationFilesPlugin extends ActionConfigurationFilesPluginBase {
  public readonly displayName: string = 'projectActionConfigurationFiles';

  protected _getActionConfigurationFilePathByName(
    actionName: string,
    heftConfiguration: HeftConfiguration
  ): string | undefined {
    return path.resolve(heftConfiguration.projectHeftDataFolder, `${actionName}.json`);
  }
}
