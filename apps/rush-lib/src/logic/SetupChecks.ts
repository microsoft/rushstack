// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import * as path from 'path';
import * as fsx from 'fs-extra';
import * as semver from 'semver';
import { RushConfiguration } from '../api/RushConfiguration';
import { AlreadyReportedError } from '../utilities/AlreadyReportedError';
import { Utilities } from '../utilities/Utilities';
import { RushConstants } from '../api/RushConstants';

// Refuses to run at all if the PNPM version is older than this, because there
// are known bugs or missing features in earlier releases.
const MINIMUM_SUPPORTED_NPM_VERSION: string = '4.5.0';

// Refuses to run at all if the PNPM version is older than this, because there
// are known bugs or missing features in earlier releases.
const MINIMUM_SUPPORTED_PNPM_VERSION: string = '2.1.0';

/**
 * Validate that the developer's setup is good.
 *
 * These checks are invoked prior to the following commands:
 * - rush install
 * - rush update
 * - rush build
 * - rush rebuild
 */
export class SetupChecks {
  public static validate(rushConfiguration: RushConfiguration): void {
    // NOTE: The Node.js version is also checked in rush/src/start.ts
    const errorMessage: string | undefined = SetupChecks._validate(rushConfiguration);

    if (errorMessage) {
      console.error(colors.red(Utilities.wrapWords(errorMessage)));
      throw new AlreadyReportedError();
    }
  }

  private static _validate(rushConfiguration: RushConfiguration): string | undefined {
    // Check for outdated tools
    if (rushConfiguration.packageManager === 'pnpm') {
      if (semver.lt(rushConfiguration.packageManagerToolVersion, MINIMUM_SUPPORTED_PNPM_VERSION)) {
        return `The rush.json file requests PNPM version `
          + rushConfiguration.packageManagerToolVersion
          + `, but PNPM ${MINIMUM_SUPPORTED_PNPM_VERSION} is the minimum supported by Rush.`;
      }
    } else if (rushConfiguration.packageManager === 'npm') {
      if (semver.lt(rushConfiguration.packageManagerToolVersion, MINIMUM_SUPPORTED_NPM_VERSION)) {
        return `The rush.json file requests NPM version `
          + rushConfiguration.packageManagerToolVersion
          + `, but NPM ${MINIMUM_SUPPORTED_NPM_VERSION} is the minimum supported by Rush.`;
      }
    }

    SetupChecks._checkForPhantomFolders(rushConfiguration);
  }

  private static _checkForPhantomFolders(rushConfiguration: RushConfiguration): void {
    const phantomFolders: string[] = [];
    const seenFolders: Set<string> = new Set<string>();

    // Check from the real parent of the common/temp folder
    const commonTempParent: string = path.dirname(fsx.realpathSync(rushConfiguration.commonTempFolder));
    SetupChecks._collectPhantomFoldersRecursive(commonTempParent, phantomFolders, seenFolders);

    // Check from the real folder containing rush.json
    const realRushJsonFolder: string = fsx.realpathSync(rushConfiguration.rushJsonFolder);
    SetupChecks._collectPhantomFoldersRecursive(realRushJsonFolder, phantomFolders, seenFolders);

    if (phantomFolders.length > 0) {
      if (phantomFolders.length === 1) {
        console.log(colors.yellow(Utilities.wrapWords(
          'Warning: A phantom "node_modules" folder was found. This defeats Rush\'s protection against'
          + ' NPM phantom dependencies, and may cause confusing build errors. It\'s recommended to'
          + ' delete this folder:'
        )));
      } else {
        console.log(colors.yellow(Utilities.wrapWords(
          'Warning: Phantom "node_modules" folders were found. This defeats Rush\'s protection against'
          + ' NPM phantom dependencies, and may cause confusing build errors. It\'s recommended to'
          + ' delete these folders:'
        )));
      }
      for (const folder of phantomFolders) {
        console.log(colors.yellow(`"${folder}"`));
      }
      console.log(); // add a newline
    }
  }

  private static _collectPhantomFoldersRecursive(folder: string, phantomFolders: string[],
    seenFolders: Set<string>): void {

    if (seenFolders.has(folder)) {
      // Stop because we already analyzed this folder
      return;
    }
    seenFolders.add(folder);

    const nodeModulesFolder: string = path.join(folder, RushConstants.nodeModulesFolderName);
    if (fsx.existsSync(nodeModulesFolder)) {
      phantomFolders.push(nodeModulesFolder);
    }

    // Walk upwards until path.dirname() returns its own input, which means we reached the root
    const parentFolder: string = path.dirname(folder);
    if (parentFolder && parentFolder !== folder) {
      SetupChecks._collectPhantomFoldersRecursive(parentFolder, phantomFolders, seenFolders);
    }
  }
}
