// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { JsonFile } from '@microsoft/node-core-library';

import { IPackageJson } from '@microsoft/rush-lib';
import { executeCli } from '@microsoft/rush-lib/lib/start';

import MinimalRushConfiguration from './MinimalRushConfiguration';
import RushVersionManager from './RushVersionManager';
import RushWrapper from './RushWrapper';

const currentPackageJson: IPackageJson = JsonFile.load(path.join(__dirname, '..', 'package.json'));

// Load the configuration
const configuration: MinimalRushConfiguration | undefined = MinimalRushConfiguration.loadFromDefaultLocation();

if (configuration) {
  const versionManager: RushVersionManager = new RushVersionManager(
    configuration.homeFolder,
    currentPackageJson.version
  );
  const rushWrapper: RushWrapper = versionManager.ensureRushVersionInstalled(configuration.rushVersion);
  rushWrapper.invokeRush();
} else {
  executeCli(currentPackageJson.version);
}
