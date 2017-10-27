// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';
import * as colors from 'colors';

import rushVersion from './rushVersion';
import RushCommandLineParser from './cli/actions/RushCommandLineParser';

/**
 * Executes the Rush CLI. This is expected to be called by the @microsoft/rush package, which acts as a version manager
 *  for the Rush tool. The rush-lib API is exposed through the index.ts/js file.
 *
 * @param launcherVersion The version of the @microsoft/rush wrapper used to call invoke the CLI.
 * @param isManaged True if the tool was invoked from within a project with a rush.json file, otherwise false. We
 *  consider a project without a rush.json to be "unmanaged" and we'll print that to the command line when
 *  the tool is executed. This is mainly used for debugging purposes.
 */
export function start(isManaged: boolean): void {
  console.log(
    EOL +
    colors.bold(`Rush Multi-Package Build Tool ${rushVersion}` + colors.yellow(isManaged ? '' : ' (unmanaged)')) +
    colors.cyan(' - http://aka.ms/rush') +
    EOL
  );

  const parser: RushCommandLineParser = new RushCommandLineParser();

  parser.execute();
}
