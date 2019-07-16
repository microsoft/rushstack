// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { EOL } from 'os';
import * as colors from 'colors';
import * as semver from 'semver';
import { PackageJsonLookup } from '@microsoft/node-core-library';

import { RushCommandLineParser } from '../cli/RushCommandLineParser';
import { RushConstants } from '../logic/RushConstants';
import { RushXCommandLine } from '../cli/RushXCommandLine';
import { CommandLineMigrationAdvisor } from '../cli/CommandLineMigrationAdvisor';
import { RushConfiguration } from './RushConfiguration';

/**
 * Options to pass to the rush "launch" functions.
 */
export interface ILaunchOptions {
  /**
   * True if the tool was invoked from within a project with a rush.json file, otherwise false. We
   * consider a project without a rush.json to be "unmanaged" and we'll print that to the command line when
   * the tool is executed. This is mainly used for debugging purposes.
   */
  isManaged: boolean;

  /**
   * If true, the wrapper process already printed a warning that the version of NodeJS hasn't been tested
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
   * and start a new NodeJS process.
   *
   * @param launcherVersion - The version of the `@microsoft/rush` wrapper used to call invoke the CLI.
   */
  public static launch(launcherVersion: string, arg: ILaunchOptions): void {
    const options: ILaunchOptions = Rush._normalizeLaunchOptions(arg);

    Rush._printStartupBanner(options.isManaged);

    const rushConfiguration: RushConfiguration | undefined = Rush._tryGetRushConfiguration();
    if (!options.alreadyReportedNodeTooNewError) {
      Rush._warnAboutNodeVersion(rushConfiguration);
    }

    if (!CommandLineMigrationAdvisor.checkArgv(process.argv)) {
      // The migration advisor recognized an obsolete command-line
      process.exitCode = 1;
      return;
    }

    const parser: RushCommandLineParser = new RushCommandLineParser({ rushConfiguration });
    parser.execute().catch(console.error); // CommandLineParser.execute() should never reject the promise
  }

  /**
   * This API is used by the `@microsoft/rush` front end to launch the "rushx" command-line.
   * Third-party tools should not use this API.  Instead, they should execute the "rushx" binary
   * and start a new NodeJS process.
   *
   * @param launcherVersion - The version of the `@microsoft/rush` wrapper used to call invoke the CLI.
   */
  public static launchRushX(launcherVersion: string, arg: ILaunchOptions): void {
    const options: ILaunchOptions = Rush._normalizeLaunchOptions(arg);

    Rush._printStartupBanner(options.isManaged);

    const rushConfiguration: RushConfiguration | undefined = Rush._tryGetRushConfiguration();
    if (!options.alreadyReportedNodeTooNewError) {
      Rush._warnAboutNodeVersion(rushConfiguration);
    }

    RushXCommandLine._launchRushXInternal(
      launcherVersion,
      {
        isManaged: options.isManaged,
        rushConfiguration: rushConfiguration
      }
    );
  }

  /**
   * The currently executing version of the "rush-lib" library.
   * This is the same as the Rush tool version for that release.
   */
  public static get version(): string {
    return PackageJsonLookup.loadOwnPackageJson(__dirname).version;
  }

  private static _tryGetRushConfiguration(): RushConfiguration | undefined {
    try {
      if (RushConfiguration.tryFindRushJsonLocation()) {
        return RushConfiguration.loadFromDefaultLocation({ showVerbose: true });
      }
    } catch (e) {
      // ignore
    }

    return undefined;
  }

  /**
   * This function normalizes legacy options to the current {@see ILaunchOptions} object.
   */
  private static _normalizeLaunchOptions(arg: ILaunchOptions): ILaunchOptions {
    return (typeof arg === 'boolean')
      ? { isManaged: arg } // In older versions of Rush, this the `launch` functions took a boolean arg for "isManaged"
      : arg;
  }

  private static _printStartupBanner(isManaged: boolean): void {
    interface IExtendedNodeProcess extends NodeJS.Process {
      release: {
        lts?: string;
      };
    }

    const nodeVersion: string = process.versions.node;
    const nodeMajorVersion: number = semver.major(nodeVersion);
    const nodeReleaseLabel: string = (nodeMajorVersion % 2 === 0)
      ? (!!(process as IExtendedNodeProcess).release.lts ? 'LTS' : 'pre-LTS')
      : 'unstable';

    console.log(
      EOL +
      colors.bold(`Rush Multi-Project Build Tool ${Rush.version}` + colors.yellow(isManaged ? '' : ' (unmanaged)')) +
      colors.cyan(` - ${RushConstants.rushWebSiteUrl}`) +
      EOL +
      `NodeJS version is ${nodeVersion} (${nodeReleaseLabel})` +
      EOL
    );
  }

  private static _warnAboutNodeVersion(rushConfiguration: RushConfiguration | undefined): void {
    const nodeVersion: string = process.versions.node;

    interface IExtendedNodeProcess extends NodeJS.Process {
      release: {
        lts?: string;
      };
    }

    if (semver.satisfies(nodeVersion, '>= 11.0.0')) {
      console.log();
      console.warn(colors.yellow(
        `Your version of Node.js (${nodeVersion}) has not been tested with this release` +
        `of the Rush engine.  Please consider upgrading the "rushVersion" setting in rush.json, ` +
        `or  downgrading Node.js.`
      ));
      console.log();
    } else if (
      rushConfiguration &&
      !rushConfiguration.suppressNodeLtsWarning &&
      !(process as IExtendedNodeProcess).release.lts
    ) {
      console.log();
      console.warn(colors.yellow(
        `Your version of Node.js (${nodeVersion}) has an odd major version number. ` +
        `These releases frequently have bugs.  Please consider installing a Long Term Support (LTS) ` +
        `version instead.`
      ));
      console.log();
    }
  }
}
