// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile } from '@microsoft/node-core-library';

import {
  IPackageJson,
  RushConfiguration,
  Utilities
} from '@microsoft/rush-lib';
import { _CLI } from '@microsoft/rush-lib';

import MinimalRushConfiguration from './MinimalRushConfiguration';
import RushVersionManager from './RushVersionManager';
import RushWrapper from './RushWrapper';

const RUSH_PURGE_OPTION_NAME: string = 'purge';

if (process.argv[2] === RUSH_PURGE_OPTION_NAME) {
  const rushDirectory: string = path.join(RushConfiguration.getHomeDirectory(), '.rush');
  console.log(`Deleting ${rushDirectory} directory...`);
  Utilities.dangerouslyDeletePath(rushDirectory);
  console.log('done');
} else {
  // Load the configuration
  const configuration: MinimalRushConfiguration | undefined = MinimalRushConfiguration.loadFromDefaultLocation();
  const currentPackageJson: IPackageJson = JsonFile.load(path.join(__dirname, '..', 'package.json'));

  if (configuration && configuration.rushVersion !== currentPackageJson.version) {
    const versionManager: RushVersionManager = new RushVersionManager(
      configuration.homeFolder,
      currentPackageJson.version
    );
    const rushWrapper: RushWrapper = versionManager.ensureRushVersionInstalled(configuration.rushVersion);
    rushWrapper.invokeRush();
  } else {
    _CLI.start(currentPackageJson.version, false);
  }
}
