// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';
import * as path from 'path';
import * as colors from 'colors';
import { IPackageJson } from '@microsoft/node-core-library';

import { RushCommandLineParser } from './cli/actions/RushCommandLineParser';
import { RushConstants } from './RushConstants';

/**
 * Operations involving the rush tool and its operation.
 *
 * @public
 */
export class Rush {
  private static _version: string;

  /**
   * Executes the Rush CLI. This is expected to be called by the @microsoft/rush package, which acts as a version
   *  manager for the Rush tool. The rush-lib API is exposed through the index.ts/js file.
   *
   * @param launcherVersion - The version of the @microsoft/rush wrapper used to call invoke the CLI.
   * @param isManaged - True if the tool was invoked from within a project with a rush.json file, otherwise false. We
   *  consider a project without a rush.json to be "unmanaged" and we'll print that to the command line when
   *  the tool is executed. This is mainly used for debugging purposes.
   */
  public static launch(launcherVersion: string, isManaged: boolean): void {
    console.log(
      EOL +
      colors.bold(`Rush Multi-Project Build Tool ${Rush.version}` + colors.yellow(isManaged ? '' : ' (unmanaged)')) +
      colors.cyan(` - ${RushConstants.rushWebSiteUrl}`) +
      EOL
    );

    const parser: RushCommandLineParser = new RushCommandLineParser();

    parser.execute();
  }

  /**
   * The currently executing version of the "rush-lib" library.
   * This is the same as the Rush tool version for that release.
   * @public
   */
  public static get version(): string {
    if (!Rush._version) {
      const myPackageJsonFilename: string = path.resolve(path.join(__dirname, '..', 'package.json'));
      const myPackageJson: IPackageJson = require(myPackageJsonFilename);
      Rush._version = myPackageJson.version;
    }

    return Rush._version;
  }
}
