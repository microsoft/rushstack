// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { InternalError, type IPackageJson, PackageJsonLookup } from '@rushstack/node-core-library';
import type { ITerminalProvider } from '@rushstack/terminal';

import '../utilities/SetRushLibPath.ts';

import { RushCommandLineParser } from '../cli/RushCommandLineParser.ts';
import { RushStartupBanner } from '../cli/RushStartupBanner.ts';
import { RushXCommandLine } from '../cli/RushXCommandLine.ts';
import { CommandLineMigrationAdvisor } from '../cli/CommandLineMigrationAdvisor.ts';
import { EnvironmentVariableNames } from './EnvironmentConfiguration.ts';
import type { IBuiltInPluginConfiguration } from '../pluginFramework/PluginLoader/BuiltInPluginLoader.ts';
import { RushPnpmCommandLine } from '../cli/RushPnpmCommandLine.ts';
import { measureAsyncFn } from '../utilities/performance.ts';

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

  /**
   * Pass along the terminal provider from the CLI version selector.
   *
   * @privateRemarks
   * We should remove this.  The version selector package can be very old.  It's unwise for
   * `rush-lib` to rely on a potentially ancient `ITerminalProvider` implementation.
   */
  terminalProvider?: ITerminalProvider;

  /**
   * Used only by `@microsoft/rush/lib/start-dev.js` during development.
   * Specifies Rush devDependencies of the `@microsoft/rush` to be manually loaded.
   *
   * @remarks
   * Marked as `@internal` because `IBuiltInPluginConfiguration` is internal.
   * @internal
   */
  builtInPluginConfigurations?: IBuiltInPluginConfiguration[];
}

/**
 * General operations for the Rush engine.
 *
 * @public
 */
export class Rush {
  private static __rushLibPackageJson: IPackageJson | undefined = undefined;
  private static __rushLibPackageFolder: string | undefined = undefined;

  /**
   * This API is used by the `@microsoft/rush` front end to launch the "rush" command-line.
   * Third-party tools should not use this API.  Instead, they should execute the "rush" binary
   * and start a new Node.js process.
   *
   * @remarks
   * Earlier versions of the rush frontend used a different API contract. In the old contract,
   * the second argument was the `isManaged` value of the {@link ILaunchOptions} object.
   *
   * Even though this API isn't documented, it is still supported for legacy compatibility.
   */
  public static launch(launcherVersion: string, options: ILaunchOptions): void {
    options = Rush._normalizeLaunchOptions(options);

    if (!RushCommandLineParser.shouldRestrictConsoleOutput()) {
      RushStartupBanner.logBanner(Rush.version, options.isManaged);
    }

    if (!CommandLineMigrationAdvisor.checkArgv(process.argv)) {
      // The migration advisor recognized an obsolete command-line
      process.exitCode = 1;
      return;
    }

    Rush._assignRushInvokedFolder();
    const parser: RushCommandLineParser = new RushCommandLineParser({
      alreadyReportedNodeTooNewError: options.alreadyReportedNodeTooNewError,
      builtInPluginConfigurations: options.builtInPluginConfigurations
    });
    // CommandLineParser.executeAsync() should never reject the promise
    // eslint-disable-next-line no-console
    measureAsyncFn('rush:parser:executeAsync', () => parser.executeAsync()).catch(console.error);
  }

  /**
   * This API is used by the `@microsoft/rush` front end to launch the "rushx" command-line.
   * Third-party tools should not use this API.  Instead, they should execute the "rushx" binary
   * and start a new Node.js process.
   */
  public static launchRushX(launcherVersion: string, options: ILaunchOptions): void {
    options = Rush._normalizeLaunchOptions(options);
    Rush._assignRushInvokedFolder();
    // eslint-disable-next-line no-console
    RushXCommandLine.launchRushXAsync(launcherVersion, options).catch(console.error); // CommandLineParser.executeAsync() should never reject the promise
  }

  /**
   * This API is used by the `@microsoft/rush` front end to launch the "rush-pnpm" command-line.
   * Third-party tools should not use this API.  Instead, they should execute the "rush-pnpm" binary
   * and start a new Node.js process.
   */
  public static launchRushPnpm(launcherVersion: string, options: ILaunchOptions): void {
    Rush._assignRushInvokedFolder();
    RushPnpmCommandLine.launch(launcherVersion, { ...options });
  }

  /**
   * The currently executing version of the "rush-lib" library.
   * This is the same as the Rush tool version for that release.
   */
  public static get version(): string {
    return this._rushLibPackageJson.version;
  }

  /**
   * @internal
   */
  public static get _rushLibPackageJson(): IPackageJson {
    Rush._ensureOwnPackageJsonIsLoaded();
    return Rush.__rushLibPackageJson!;
  }

  public static get _rushLibPackageFolder(): string {
    Rush._ensureOwnPackageJsonIsLoaded();
    return Rush.__rushLibPackageFolder!;
  }

  private static _ensureOwnPackageJsonIsLoaded(): void {
    if (!Rush.__rushLibPackageJson) {
      const packageJsonFilePath: string | undefined =
        PackageJsonLookup.instance.tryGetPackageJsonFilePathFor(__dirname);
      if (!packageJsonFilePath) {
        throw new InternalError('Unable to locate the package.json file for this module');
      }
      Rush.__rushLibPackageFolder = path.dirname(packageJsonFilePath);
      Rush.__rushLibPackageJson = PackageJsonLookup.instance.loadPackageJson(packageJsonFilePath);
    }
  }

  /**
   * Assign the `RUSH_INVOKED_FOLDER` environment variable during startup.  This is only applied when
   * Rush is invoked via the CLI, not via the `@microsoft/rush-lib` automation API.
   *
   * @remarks
   * Modifying the parent process's environment is not a good design.  The better design is (1) to consolidate
   * Rush's code paths that invoke scripts, and (2) to pass down the invoked folder with each code path,
   * so that it can finally be applied in a centralized helper like `Utilities._createEnvironmentForRushCommand()`.
   * The natural time to do that refactoring is when we rework `Utilities.executeCommand()` to use
   * `Executable.spawn()` or rushell.
   */
  private static _assignRushInvokedFolder(): void {
    process.env[EnvironmentVariableNames.RUSH_INVOKED_FOLDER] = process.cwd();
  }

  /**
   * This function normalizes legacy options to the current {@link ILaunchOptions} object.
   */
  private static _normalizeLaunchOptions(arg: ILaunchOptions): ILaunchOptions {
    return typeof arg === 'boolean'
      ? { isManaged: arg } // In older versions of Rush, this the `launch` functions took a boolean arg for "isManaged"
      : arg;
  }
}
