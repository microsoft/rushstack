// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import MinimalRushConfiguration from './MinimalRushConfiguration';
import RushVersionManager from './RushVersionManager';
import RushWrapper from './RushWrapper';

// Load the configuration
const minimalRushConfiguration: MinimalRushConfiguration = MinimalRushConfiguration.loadFromDefaultLocation();

const versionManager: RushVersionManager = new RushVersionManager(minimalRushConfiguration.homeFolder);
const rushWrapper: RushWrapper = versionManager.ensureRushVersionInstalled(minimalRushConfiguration.rushVersion);
rushWrapper.invokeRush();
