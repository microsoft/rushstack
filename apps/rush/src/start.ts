// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as semver from 'semver';

const nodeVersion: string = process.versions.node;

// tslint:disable-next-line

// We are on an ancient version of NodeJS that is known not to work with Rush
if (semver.satisfies(nodeVersion, '<= 6.4.0')) {
  console.error(colors.red(`Your version of Node.js (${nodeVersion}) is very old and incompatible with Rush.`
    + ` Please upgrade to the latest Long-Term Support (LTS) version.`));
  process.exit(1);
}

// We are on a much newer release than we have tested and support
// tslint:disable-next-line
else if (semver.satisfies(nodeVersion, '>=9.0.0')) {
  console.warn(colors.yellow(`Your version of Node.js (${nodeVersion}) has not been tested with this release of Rush.`
    + ` The Rush team will not accept issue reports for it.`
    + ` Please consider upgrading Rush or downgrading Node.js.`));
}

// We are not on an LTS release
// tslint:disable-next-line
else if (!semver.satisfies(nodeVersion, '^6.9.0')
      && !semver.satisfies(nodeVersion, '^8.9.0')) {
  console.warn(colors.yellow(`Your version of Node.js (${nodeVersion}) is not a Long-Term Support (LTS) release.`
    + ` These versions frequently contain bugs, and the Rush team will not accept issue reports for them.`
    + ` Please consider installing a stable release.`));
}

import * as path from 'path';
import { JsonFile, IPackageJson } from '@microsoft/node-core-library';
import { Rush } from '@microsoft/rush-lib';

import { MinimalRushConfiguration } from './MinimalRushConfiguration';
import { RushVersionSelector } from './RushVersionSelector';

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
