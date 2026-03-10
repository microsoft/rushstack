// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable no-console */

import * as path from 'node:path';
import * as fs from 'node:fs';

const {
  installAndRun,
  findRushJsonFolder,
  RUSH_JSON_FILENAME,
  runWithErrorAndStatusCode
}: typeof import('./install-run.ts') = __non_webpack_require__('./install-run');
import type { ILogger } from '../utilities/npmrcUtilities.ts';

const PACKAGE_NAME: string = '@microsoft/rush';
const RUSH_PREVIEW_VERSION: string = 'RUSH_PREVIEW_VERSION';
const INSTALL_RUN_RUSH_LOCKFILE_PATH_VARIABLE: 'INSTALL_RUN_RUSH_LOCKFILE_PATH' =
  'INSTALL_RUN_RUSH_LOCKFILE_PATH';

function _getRushVersion(logger: ILogger): string {
  const rushPreviewVersion: string | undefined = process.env[RUSH_PREVIEW_VERSION];
  if (rushPreviewVersion !== undefined) {
    logger.info(`Using Rush version from environment variable ${RUSH_PREVIEW_VERSION}=${rushPreviewVersion}`);
    return rushPreviewVersion;
  }

  const rushJsonFolder: string = findRushJsonFolder();
  const rushJsonPath: string = path.join(rushJsonFolder, RUSH_JSON_FILENAME);
  try {
    const rushJsonContents: string = fs.readFileSync(rushJsonPath, 'utf-8');
    // Use a regular expression to parse out the rushVersion value because rush.json supports comments,
    // but JSON.parse does not and we don't want to pull in more dependencies than we need to in this script.
    const rushJsonMatches: string[] = rushJsonContents.match(
      /\"rushVersion\"\s*\:\s*\"([0-9a-zA-Z.+\-]+)\"/
    )!;
    return rushJsonMatches[1];
  } catch (e) {
    throw new Error(
      `Unable to determine the required version of Rush from ${RUSH_JSON_FILENAME} (${rushJsonFolder}). ` +
        `The 'rushVersion' field is either not assigned in ${RUSH_JSON_FILENAME} or was specified ` +
        'using an unexpected syntax.'
    );
  }
}

function _getBin(scriptName: string): string {
  switch (scriptName.toLowerCase()) {
    case 'install-run-rush-pnpm.js':
      return 'rush-pnpm';
    case 'install-run-rushx.js':
      return 'rushx';
    default:
      return 'rush';
  }
}

function _run(): void {
  const [
    nodePath /* Ex: /bin/node */,
    scriptPath /* /repo/common/scripts/install-run-rush.js */,
    ...packageBinArgs /* [build, --to, myproject] */
  ]: string[] = process.argv;

  // Detect if this script was directly invoked, or if the install-run-rushx script was invokved to select the
  // appropriate binary inside the rush package to run
  const scriptName: string = path.basename(scriptPath);
  const bin: string = _getBin(scriptName);
  if (!nodePath || !scriptPath) {
    throw new Error('Unexpected exception: could not detect node path or script path');
  }

  let commandFound: boolean = false;
  let logger: ILogger = { info: console.log, error: console.error };

  for (const arg of packageBinArgs) {
    if (arg === '-q' || arg === '--quiet') {
      // The -q/--quiet flag is supported by both `rush` and `rushx`, and will suppress
      // any normal informational/diagnostic information printed during startup.
      //
      // To maintain the same user experience, the install-run* scripts pass along this
      // flag but also use it to suppress any diagnostic information normally printed
      // to stdout.
      logger = {
        info: () => {},
        error: console.error
      };
    } else if (!arg.startsWith('-') || arg === '-h' || arg === '--help') {
      // We either found something that looks like a command (i.e. - doesn't start with a "-"),
      // or we found the -h/--help flag, which can be run without a command
      commandFound = true;
    }
  }

  if (!commandFound) {
    console.log(`Usage: ${scriptName} <command> [args...]`);
    if (scriptName === 'install-run-rush-pnpm.js') {
      console.log(`Example: ${scriptName} pnpm-command`);
    } else if (scriptName === 'install-run-rush.js') {
      console.log(`Example: ${scriptName} build --to myproject`);
    } else {
      console.log(`Example: ${scriptName} custom-command`);
    }
    process.exit(1);
  }

  runWithErrorAndStatusCode(logger, () => {
    const version: string = _getRushVersion(logger);
    logger.info(`The ${RUSH_JSON_FILENAME} configuration requests Rush version ${version}`);

    const lockFilePath: string | undefined = process.env[INSTALL_RUN_RUSH_LOCKFILE_PATH_VARIABLE];
    if (lockFilePath) {
      logger.info(
        `Found ${INSTALL_RUN_RUSH_LOCKFILE_PATH_VARIABLE}="${lockFilePath}", installing with lockfile.`
      );
    }

    return installAndRun(logger, PACKAGE_NAME, version, bin, packageBinArgs, lockFilePath);
  });
}

_run();
