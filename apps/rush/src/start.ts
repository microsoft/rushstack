// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// The minimal set of imports that are safe even for ancient NodeJS versions:
import * as colors from 'colors';
import * as os from 'os';
import * as semver from 'semver';

const nodeVersion: string = process.versions.node;
let alreadyReportedNodeTooNewError: boolean = false;

interface IExtendedNodeProcess extends NodeJS.Process {
  release: {
    lts?: string;
  };
}

// We are on an ancient version of NodeJS that is known not to work with Rush
if (semver.satisfies(nodeVersion, '< 8.9.0')) {
  console.error(colors.red(
    `Your version of Node.js (${nodeVersion}) is very old and incompatible with Rush. ` +
    `Please upgrade to the latest Long-Term Support (LTS) version.`
  ));
  process.exit(1);
}

// We are on a much newer release than we have tested and support
// tslint:disable-next-line
else if (semver.satisfies(nodeVersion, '>= 11.0.0')) {
  console.warn(colors.yellow(
    `Your version of Node.js (${nodeVersion}) has not been tested with this release ` +
    `of Rush. Please consider installing a newer version of the "@microsoft/rush" ` +
    `package, or else downgrading Node.js.`
  ));
  alreadyReportedNodeTooNewError = true;
}

// We are not on an LTS release
// tslint:disable-next-line
else if ((process as IExtendedNodeProcess).release.lts) {
  console.warn(colors.yellow(
    `Your version of Node.js (${nodeVersion}) is not a Long-Term Support (LTS) release. ` +
    `These versions frequently have bugs. Please consider installing a stable release.`
  ));
}

import {
  Text,
  PackageJsonLookup
} from '@microsoft/node-core-library';
import { EnvironmentVariableNames } from '@microsoft/rush-lib';
import * as rushLib from '@microsoft/rush-lib';

import {
  RushCommandSelector,
  IExceuteOptions
} from './RushCommandSelector';
import { RushVersionSelector } from './RushVersionSelector';
import { MinimalRushConfiguration } from './MinimalRushConfiguration';

// Load the configuration
const configuration: MinimalRushConfiguration | undefined = MinimalRushConfiguration.loadFromDefaultLocation();

const currentPackageVersion: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;

let rushVersionToLoad: string | undefined = undefined;

const previewVersion: string | undefined = process.env[EnvironmentVariableNames.RUSH_PREVIEW_VERSION];

if (previewVersion) {
  if (!semver.valid(previewVersion, false)) {
    console.error(colors.red(`Invalid value for RUSH_PREVIEW_VERSION environment variable: "${previewVersion}"`));
    process.exit(1);
  }

  rushVersionToLoad = previewVersion;

  const lines: string[] = [];
  lines.push(
    `*********************************************************************`,
    `* WARNING! THE "RUSH_PREVIEW_VERSION" ENVIRONMENT VARIABLE IS SET.  *`,
    `*                                                                   *`,
    `* You are previewing Rush version:        ${Text.padEnd(previewVersion, 25)} *`
  );

  if (configuration) {
    lines.push(
      `* The rush.json configuration asks for:   ${Text.padEnd(configuration.rushVersion, 25)} *`
    );
  }

  lines.push(
    `*                                                                   *`,
    `* To restore the normal behavior, unset the RUSH_PREVIEW_VERSION    *`,
    `* environment variable.                                             *`,
    `*********************************************************************`
  );

  console.error(lines
    .map(line => colors.black(colors.bgYellow(line)))
    .join(os.EOL));

} else if (configuration) {
  rushVersionToLoad = configuration.rushVersion;
}

// If we are previewing an older Rush that doesn't understand the RUSH_PREVIEW_VERSION variable,
// then unset it.
if (rushVersionToLoad && semver.lt(rushVersionToLoad, '5.0.0-dev.18')) {
  delete process.env[EnvironmentVariableNames.RUSH_PREVIEW_VERSION];
}

// Rush is "managed" if its version and configuration are dictated by a repo's rush.json
const isManaged: boolean = !!configuration;
const executeOptions: IExceuteOptions = { isManaged, alreadyReportedNodeTooNewError };

// If we're inside a repo folder, and it's requesting a different version, then use the RushVersionManager to
// install it
if (rushVersionToLoad && rushVersionToLoad !== currentPackageVersion) {
  const versionSelector: RushVersionSelector = new RushVersionSelector(currentPackageVersion);
  versionSelector.ensureRushVersionInstalled(rushVersionToLoad, configuration, executeOptions)
    .catch((error: Error) => {
      console.log(colors.red('Error: ' + error.message));
    });
} else {
  // Otherwise invoke the rush-lib that came with this rush package
  RushCommandSelector.execute(currentPackageVersion, rushLib, executeOptions);
}
