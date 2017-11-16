// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile } from '@microsoft/node-core-library';

import {
  IPackageJson,
  RushConfiguration,
  Rush
} from '@microsoft/rush-lib';
import Utilities from '@microsoft/rush-lib/lib/utilities/Utilities';

import { MinimalRushConfiguration } from './MinimalRushConfiguration';
import { RushVersionSelector } from './RushVersionSelector';

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

  // If we're inside a repo folder, and it's requesting a different version, then use the RushVersionManager to
  //  install it
  if (configuration && configuration.rushVersion !== currentPackageJson.version) {
    const versionSelector: RushVersionSelector = new RushVersionSelector(
      configuration.homeFolder,
      currentPackageJson.version
    );
    const rushWrapper: () => void = versionSelector.ensureRushVersionInstalled(configuration.rushVersion);
    rushWrapper();
  } else {
    // Otherwise invoke the rush-lib that came with this rush package
    const isManaged: boolean = !!configuration && configuration.rushVersion === currentPackageJson.version;
    Rush.launch(
      currentPackageJson.version,
      isManaged // Rush is "managed" if its version and configuration are dictated by a repo's rush.json
    );
  }
}
