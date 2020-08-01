// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// eslint-disable-next-line
const importLazy = require('import-lazy')(require);

console.log('Rush.ts  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
import { EOL } from 'os';
console.log('Rush.ts  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
import * as colors from 'colors';
console.log('Rush.ts  : 3: ' + (new Date().getTime() % 20000) / 1000.0);
// import { PackageJsonLookup } from '@rushstack/node-core-library';
// eslint-disable-next-line
const nodeCoreLibrary = importLazy('@rushstack/node-core-library');

console.log('Rush.ts  : 4: ' + (new Date().getTime() % 20000) / 1000.0);
import { RushCommandLineParser } from '../cli/RushCommandLineParser';
console.log('Rush.ts  : 5: ' + (new Date().getTime() % 20000) / 1000.0);
import { RushConstants } from '../logic/RushConstants';
console.log('Rush.ts  : 6: ' + (new Date().getTime() % 20000) / 1000.0);
import { RushXCommandLine } from '../cli/RushXCommandLine';
console.log('Rush.ts  : 7: ' + (new Date().getTime() % 20000) / 1000.0);
import { CommandLineMigrationAdvisor } from '../cli/CommandLineMigrationAdvisor';
console.log('Rush.ts  : 8: ' + (new Date().getTime() % 20000) / 1000.0);
import { NodeJsCompatibility } from '../logic/NodeJsCompatibility';
console.log('Rush.ts  : 9: ' + (new Date().getTime() % 20000) / 1000.0);
import { Utilities } from '../utilities/Utilities';
console.log('Rush.ts  : 10: ' + (new Date().getTime() % 20000) / 1000.0);

/**
 * Options to pass to the rush "launch" functions.
 *
 * @public
 */
export interface ILaunchOptions {
  /**
   * True if the tool was invoked from within a project with a rush.json file, otherwise false. We
   * consider a project without a rush.json to be "unmanaged" and we'll print that to the command line when
   * the tool is executed. This is mainly used for debugging purposes.
   */
  isManaged: boolean;

  /**
   * If true, the wrapper process already printed a warning that the version of Node.js hasn't been tested
   * with this version of Rush, so we shouldn't print a similar error.
   */
  alreadyReportedNodeTooNewError?: boolean;
}

/**
 * General operations for the Rush engine.
 *
 * @public
 */
export class Rush {
  /**
   * This API is used by the `@microsoft/rush` front end to launch the "rush" command-line.
   * Third-party tools should not use this API.  Instead, they should execute the "rush" binary
   * and start a new Node.js process.
   *
   * @param launcherVersion - The version of the `@microsoft/rush` wrapper used to call invoke the CLI.
   *
   * @remarks
   * Earlier versions of the rush frontend used a different API contract. In the old contract,
   * the second argument was the `isManaged` value of the {@link ILaunchOptions} object.
   *
   * Even though this API isn't documented, it is still supported for legacy compatibility.
   */
  public static launch(launcherVersion: string, arg: ILaunchOptions): void {
    console.log('Rush.launch  : 1: ' + (new Date().getTime() % 20000) / 1000.0);
    const options: ILaunchOptions = Rush._normalizeLaunchOptions(arg);

    if (!Utilities.isNonDebugTabCompletionRequest()) {
      Rush._printStartupBanner(options.isManaged);
    }

    if (!CommandLineMigrationAdvisor.checkArgv(process.argv)) {
      // The migration advisor recognized an obsolete command-line
      process.exitCode = 1;
      return;
    }

    const parser: RushCommandLineParser = new RushCommandLineParser({
      alreadyReportedNodeTooNewError: options.alreadyReportedNodeTooNewError
    });
    console.log('Rush.launch  : 2: ' + (new Date().getTime() % 20000) / 1000.0);
    parser.execute().catch(console.error); // CommandLineParser.execute() should never reject the promise
    console.log('Rush.launch  : 3: ' + (new Date().getTime() % 20000) / 1000.0);
  }

  /**
   * This API is used by the `@microsoft/rush` front end to launch the "rushx" command-line.
   * Third-party tools should not use this API.  Instead, they should execute the "rushx" binary
   * and start a new Node.js process.
   *
   * @param launcherVersion - The version of the `@microsoft/rush` wrapper used to call invoke the CLI.
   */
  public static launchRushX(launcherVersion: string, options: ILaunchOptions): void {
    options = Rush._normalizeLaunchOptions(options);

    Rush._printStartupBanner(options.isManaged);

    RushXCommandLine._launchRushXInternal(launcherVersion, { ...options });
  }

  /**
   * The currently executing version of the "rush-lib" library.
   * This is the same as the Rush tool version for that release.
   */
  public static get version(): string {
    return nodeCoreLibrary.PackageJsonLookup.loadOwnPackageJson(__dirname).version;
  }

  /**
   * This function normalizes legacy options to the current {@link ILaunchOptions} object.
   */
  private static _normalizeLaunchOptions(arg: ILaunchOptions): ILaunchOptions {
    return typeof arg === 'boolean'
      ? { isManaged: arg } // In older versions of Rush, this the `launch` functions took a boolean arg for "isManaged"
      : arg;
  }

  private static _printStartupBanner(isManaged: boolean): void {
    const nodeVersion: string = process.versions.node;
    const nodeReleaseLabel: string = NodeJsCompatibility.isOddNumberedVersion
      ? 'unstable'
      : NodeJsCompatibility.isLtsVersion
      ? 'LTS'
      : 'pre-LTS';

    console.log(
      EOL +
        colors.bold(
          `Rush Multi-Project Build Tool ${Rush.version}` + colors.yellow(isManaged ? '' : ' (unmanaged)')
        ) +
        colors.cyan(` - ${RushConstants.rushWebSiteUrl}`) +
        EOL +
        `Node.js version is ${nodeVersion} (${nodeReleaseLabel})` +
        EOL
    );
  }
}
