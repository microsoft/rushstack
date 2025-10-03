// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import * as semver from 'semver';

import { FileSystem, AlreadyReportedError } from '@rushstack/node-core-library';
import { Colorize, PrintUtilities } from '@rushstack/terminal';

import type { RushConfiguration } from '../api/RushConfiguration';
import { RushConstants } from './RushConstants';

// Refuses to run at all if the PNPM version is older than this, because there
// are known bugs or missing features in earlier releases.
const MINIMUM_SUPPORTED_NPM_VERSION: string = '4.5.0';

// Refuses to run at all if the PNPM version is older than this, because there
// are known bugs or missing features in earlier releases.
const MINIMUM_SUPPORTED_PNPM_VERSION: string = '5.0.0';

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
      // eslint-disable-next-line no-console
      console.error(Colorize.red(PrintUtilities.wrapWords(errorMessage)));
      throw new AlreadyReportedError();
    }
  }

  private static _validate(rushConfiguration: RushConfiguration): string | undefined {
    // Check for outdated tools
    if (rushConfiguration.isPnpm) {
      if (semver.lt(rushConfiguration.packageManagerToolVersion, MINIMUM_SUPPORTED_PNPM_VERSION)) {
        return (
          `The ${RushConstants.rushJsonFilename} file requests PNPM version ` +
          rushConfiguration.packageManagerToolVersion +
          `, but PNPM ${MINIMUM_SUPPORTED_PNPM_VERSION} is the minimum supported by Rush.`
        );
      }
    } else if (rushConfiguration.packageManager === 'npm') {
      if (semver.lt(rushConfiguration.packageManagerToolVersion, MINIMUM_SUPPORTED_NPM_VERSION)) {
        return (
          `The ${RushConstants.rushJsonFilename} file requests NPM version ` +
          rushConfiguration.packageManagerToolVersion +
          `, but NPM ${MINIMUM_SUPPORTED_NPM_VERSION} is the minimum supported by Rush.`
        );
      }
    }

    SetupChecks._checkForPhantomFolders(rushConfiguration);
  }

  private static _checkForPhantomFolders(rushConfiguration: RushConfiguration): void {
    const phantomFolders: string[] = [];
    const seenFolders: Set<string> = new Set<string>();

    // Check from the real parent of the common/temp folder
    const commonTempParent: string = path.dirname(FileSystem.getRealPath(rushConfiguration.commonTempFolder));
    SetupChecks._collectPhantomFoldersUpwards(commonTempParent, phantomFolders, seenFolders);

    // Check from the real folder containing rush.json
    const realRushJsonFolder: string = FileSystem.getRealPath(rushConfiguration.rushJsonFolder);
    SetupChecks._collectPhantomFoldersUpwards(realRushJsonFolder, phantomFolders, seenFolders);

    if (phantomFolders.length > 0) {
      if (phantomFolders.length === 1) {
        // eslint-disable-next-line no-console
        console.log(
          Colorize.yellow(
            PrintUtilities.wrapWords(
              'Warning: A phantom "node_modules" folder was found. This defeats Rush\'s protection against' +
                ' NPM phantom dependencies and may cause confusing build errors. It is recommended to' +
                ' delete this folder:'
            )
          )
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(
          Colorize.yellow(
            PrintUtilities.wrapWords(
              'Warning: Phantom "node_modules" folders were found. This defeats Rush\'s protection against' +
                ' NPM phantom dependencies and may cause confusing build errors. It is recommended to' +
                ' delete these folders:'
            )
          )
        );
      }
      for (const folder of phantomFolders) {
        // eslint-disable-next-line no-console
        console.log(Colorize.yellow(`"${folder}"`));
      }
      // eslint-disable-next-line no-console
      console.log(); // add a newline
    }
  }

  /**
   * Checks "folder" and each of its parents to see if it contains a node_modules folder.
   * The bad folders will be added to phantomFolders.
   * The seenFolders set is used to avoid duplicates.
   */
  private static _collectPhantomFoldersUpwards(
    folder: string,
    phantomFolders: string[],
    seenFolders: Set<string>
  ): void {
    // Stop if we reached a folder that we already analyzed
    while (!seenFolders.has(folder)) {
      seenFolders.add(folder);

      // If there is a node_modules folder under this folder, add it to the list of bad folders
      const nodeModulesFolder: string = path.join(folder, RushConstants.nodeModulesFolderName);
      if (FileSystem.exists(nodeModulesFolder)) {
        // Collect the names of files/folders in that node_modules folder
        const filenames: string[] = FileSystem.readFolderItemNames(nodeModulesFolder).filter(
          (x) => !x.startsWith('.')
        );

        let ignore: boolean = false;

        if (filenames.length === 0) {
          // If the node_modules folder is completely empty, then it's not a concern
          ignore = true;
        } else if (filenames.length === 1 && filenames[0] === 'vso-task-lib') {
          // Special case:  The Azure DevOps build agent installs the "vso-task-lib" NPM package
          // in a top-level path such as:
          //
          //   /home/vsts/work/node_modules/vso-task-lib
          //
          // It is always the only package in that node_modules folder.  The "vso-task-lib" package
          // is now deprecated, so it is unlikely to be a real dependency of any modern project.
          // To avoid false alarms, we ignore this specific case.
          ignore = true;
        }

        if (!ignore) {
          phantomFolders.push(nodeModulesFolder);
        }
      }

      // Walk upwards
      const parentFolder: string = path.dirname(folder);
      if (!parentFolder || parentFolder === folder) {
        // If path.dirname() returns its own input, then means we reached the root
        break;
      }

      folder = parentFolder;
    }
  }
}
