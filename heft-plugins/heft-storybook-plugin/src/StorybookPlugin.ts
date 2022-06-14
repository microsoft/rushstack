// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  AlreadyExistsBehavior,
  FileSystem,
  Import,
  IParsedPackageNameOrError,
  PackageName
} from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  HeftTaskSession,
  IScopedLogger,
  IHeftTaskPlugin,
  CommandLineFlagParameter,
  IHeftTaskRunHookOptions
} from '@rushstack/heft';
import { PluginName as Webpack4PluginName } from '@rushstack/heft-webpack4-plugin';
import type {
  IWebpackPluginAccessor as IWebpack4PluginAccessor,
  IWebpackConfiguration as IWebpack4Configuration
} from '@rushstack/heft-webpack4-plugin';
import { PluginName as Webpack5PluginName } from '@rushstack/heft-webpack5-plugin';
import type {
  IWebpackPluginAccessor as IWebpack5PluginAccessor,
  IWebpackConfiguration as IWebpack5Configuration
} from '@rushstack/heft-webpack5-plugin';

const PLUGIN_NAME: string = 'StorybookPlugin';

/**
 * Options for `StorybookPlugin`.
 *
 * @public
 */
export interface IStorybookPluginOptions {
  /**
   * Specifies an NPM package that will provide the Storybook dependencies for the project.
   *
   * @example
   * `"storykitPackageName": "my-react-storykit"`
   *
   * @remarks
   *
   * Storybook's conventional approach is for your app project to have direct dependencies
   * on NPM packages such as `@storybook/react` and `@storybook/addon-essentials`.  These packages have
   * heavyweight dependencies such as Babel, Webpack, and the associated loaders and plugins needed to
   * build the Storybook app (which is bundled completely independently from Heft).  Naively adding these
   * dependencies to your app's package.json muddies the waters of two radically different toolchains,
   * and is likely to lead to dependency conflicts, for example if Heft installs Webpack 5 but
   * `@storybook/react` installs Webpack 4.
   *
   * To solve this problem, `heft-storybook-plugin` introduces the concept of a separate
   * "storykit package".  All of your Storybook NPM packages are moved to be dependencies of the
   * storykit.  Storybook's browser API unfortunately isn't separated into dedicated NPM packages,
   * but instead is exported by the Node.js toolchain packages such as `@storybook/react`.  For
   * an even cleaner separation the storykit package can simply reexport such APIs.
   */
  storykitPackageName: string;

  /**
   * The module entry point that Heft should use to launch the Storybook toolchain.  Typically it
   * is the path loaded the `start-storybook` shell script.
   *
   * @example
   * If you are using `@storybook/react`, then the startup path would be:
   *
   * `"startupModulePath": "@storybook/react/bin/index.js"`
   */
  startupModulePath: string;
}

/** @public */
export default class StorybookPlugin implements IHeftTaskPlugin<IStorybookPluginOptions> {
  private _logger!: IScopedLogger;
  private _storykitPackageName!: string;
  private _startupModulePath!: string;
  private _resolvedStartupModulePath!: string;

  /**
   * Generate typings for Sass files before TypeScript compilation.
   */
  public apply(
    taskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IStorybookPluginOptions
  ): void {
    const storybookParameter: CommandLineFlagParameter = taskSession.parametersByLongName.get(
      '--storybook'
    ) as CommandLineFlagParameter;

    this._logger = taskSession.logger;
    this._storykitPackageName = options.storykitPackageName;
    this._startupModulePath = options.startupModulePath;

    const parseResult: IParsedPackageNameOrError = PackageName.tryParse(options.storykitPackageName);
    if (parseResult.error) {
      throw new Error(
        `The ${taskSession.taskName} task cannot start because the "storykitPackageName"` +
          ` plugin option is not a valid package name: ` +
          parseResult.error
      );
    }

    // Only tap if the --storybook flag is present.
    if (storybookParameter.value) {
      taskSession.requestAccessToPluginByName(
        '@rushstack/heft-webpack4-plugin',
        Webpack4PluginName,
        (accessor: IWebpack4PluginAccessor) => {
          accessor.onConfigureWebpackHook?.tapPromise(
            { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
            async (config: IWebpack4Configuration | null) => {
              // Discard Webpack's configuration to prevent Webpack from running
              this._logger.terminal.writeVerboseLine(
                'The command line includes "--storybook", redirecting Webpack to Storybook'
              );
              return null;
            }
          );
        }
      );

      taskSession.requestAccessToPluginByName(
        '@rushstack/heft-webpack5-plugin',
        Webpack5PluginName,
        (accessor: IWebpack5PluginAccessor) => {
          accessor.onConfigureWebpackHook?.tapPromise(
            { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
            async (config: IWebpack5Configuration | null) => {
              // Discard Webpack's configuration to prevent Webpack from running
              this._logger.terminal.writeVerboseLine(
                'The command line includes "--storybook", redirecting Webpack to Storybook'
              );
              return null;
            }
          );
        }
      );

      taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
        await this._prepareStorybookAsync(taskSession, heftConfiguration);
        await this._runStorybookAsync();
      });
    }
  }

  private async _prepareStorybookAsync(
    taskSession: HeftTaskSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    this._logger.terminal.writeVerboseLine(`Probing for "${this._storykitPackageName}"`);

    // Example: "/path/to/my-project/node_modules/my-storykit"
    let storykitFolder: string;
    try {
      storykitFolder = Import.resolvePackage({
        packageName: this._storykitPackageName,
        baseFolderPath: heftConfiguration.buildFolder
      });
    } catch (ex) {
      throw new Error(`The ${taskSession.taskName} task cannot start: ` + (ex as Error).message);
    }

    this._logger.terminal.writeVerboseLine(`Found "${this._storykitPackageName}" in ` + storykitFolder);

    // Example: "/path/to/my-project/node_modules/my-storykit/node_modules"
    const storykitModuleFolder: string = path.join(storykitFolder, 'node_modules');
    if (!(await FileSystem.existsAsync(storykitModuleFolder))) {
      throw new Error(
        `The ${taskSession.taskName} task cannot start because the storykit module folder does not exist:\n` +
          storykitModuleFolder +
          '\nDid you forget to install it?'
      );
    }

    this._logger.terminal.writeVerboseLine(`Resolving startupModulePath "${this._startupModulePath}"`);
    try {
      this._resolvedStartupModulePath = Import.resolveModule({
        modulePath: this._startupModulePath,
        baseFolderPath: storykitModuleFolder
      });
    } catch (ex) {
      throw new Error(`The ${taskSession.taskName} task cannot start: ` + (ex as Error).message);
    }
    this._logger.terminal.writeVerboseLine(
      `Resolved startupModulePath is "${this._resolvedStartupModulePath}"`
    );

    // Example: "/path/to/my-project/.storybook"
    const dotStorybookFolder: string = path.join(heftConfiguration.buildFolder, '.storybook');
    await FileSystem.ensureFolderAsync(dotStorybookFolder);

    // Example: "/path/to/my-project/.storybook/node_modules"
    const dotStorybookModuleFolder: string = path.join(dotStorybookFolder, 'node_modules');

    // Example:
    //   LINK FROM: "/path/to/my-project/.storybook/node_modules"
    //   TARGET:    "/path/to/my-project/node_modules/my-storykit/node_modules"
    //
    // For node_modules links it's standard to use createSymbolicLinkJunction(), which avoids
    // administrator elevation on Windows; on other operating systems it will create a symbolic link.
    await FileSystem.createSymbolicLinkJunctionAsync({
      newLinkPath: dotStorybookModuleFolder,
      linkTargetPath: storykitModuleFolder,
      alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
    });
  }

  private async _runStorybookAsync(): Promise<void> {
    this._logger.terminal.writeLine('Starting Storybook...');
    this._logger.terminal.writeLine('Launching ' + this._resolvedStartupModulePath);

    require(this._resolvedStartupModulePath);

    this._logger.terminal.writeVerboseLine('Completed synchronous portion of launching startupModulePath');
  }
}
