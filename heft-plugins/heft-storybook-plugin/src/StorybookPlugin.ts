// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  AlreadyExistsBehavior,
  FileSystem,
  Import,
  IParsedPackageNameOrError,
  PackageName
} from '@rushstack/node-core-library';
import type {
  HeftConfiguration,
  IHeftTaskSession,
  IScopedLogger,
  IHeftTaskPlugin,
  CommandLineFlagParameter,
  IHeftTaskRunHookOptions
} from '@rushstack/heft';
import type {
  PluginName as Webpack4PluginName,
  IWebpack4PluginAccessor
} from '@rushstack/heft-webpack4-plugin';
import type {
  PluginName as Webpack5PluginName,
  IWebpack5PluginAccessor
} from '@rushstack/heft-webpack5-plugin';

const PLUGIN_NAME: string = 'StorybookPlugin';
const WEBPACK4_PLUGIN_NAME: typeof Webpack4PluginName = 'Webpack4Plugin';
const WEBPACK5_PLUGIN_NAME: typeof Webpack5PluginName = 'Webpack5Plugin';

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

  /**
   * Generate typings for Sass files before TypeScript compilation.
   */
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IStorybookPluginOptions
  ): void {
    this._logger = taskSession.logger;
    const storybookParameter: CommandLineFlagParameter =
      taskSession.parameters.getFlagParameter('--storybook');

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
      const configureWebpackTap: () => Promise<false> = async () => {
        // Discard Webpack's configuration to prevent Webpack from running
        this._logger.terminal.writeLine(
          'The command line includes "--storybook", redirecting Webpack to Storybook'
        );
        return false;
      };

      taskSession.requestAccessToPluginByName(
        '@rushstack/heft-webpack4-plugin',
        WEBPACK4_PLUGIN_NAME,
        (accessor: IWebpack4PluginAccessor) =>
          accessor.hooks.onLoadConfiguration.tapPromise(PLUGIN_NAME, configureWebpackTap)
      );

      taskSession.requestAccessToPluginByName(
        '@rushstack/heft-webpack5-plugin',
        WEBPACK5_PLUGIN_NAME,
        (accessor: IWebpack5PluginAccessor) =>
          accessor.hooks.onLoadConfiguration.tapPromise(PLUGIN_NAME, configureWebpackTap)
      );

      taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
        const resolvedStartupModulePath: string = await this._prepareStorybookAsync(
          taskSession,
          heftConfiguration,
          options
        );
        await this._runStorybookAsync(resolvedStartupModulePath);
      });
    }
  }

  private async _prepareStorybookAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IStorybookPluginOptions
  ): Promise<string> {
    const { storykitPackageName, startupModulePath } = options;
    this._logger.terminal.writeVerboseLine(`Probing for "${storykitPackageName}"`);

    // Example: "/path/to/my-project/node_modules/my-storykit"
    let storykitFolder: string;
    try {
      storykitFolder = Import.resolvePackage({
        packageName: storykitPackageName,
        baseFolderPath: heftConfiguration.buildFolder
      });
    } catch (ex) {
      throw new Error(`The ${taskSession.taskName} task cannot start: ` + (ex as Error).message);
    }

    this._logger.terminal.writeVerboseLine(`Found "${storykitPackageName}" in ` + storykitFolder);

    // Example: "/path/to/my-project/node_modules/my-storykit/node_modules"
    const storykitModuleFolder: string = `${storykitFolder}/node_modules`;
    const storykitModuleFolderExists: boolean = await FileSystem.existsAsync(storykitModuleFolder);
    if (!storykitModuleFolderExists) {
      throw new Error(
        `The ${taskSession.taskName} task cannot start because the storykit module folder does not exist:\n` +
          storykitModuleFolder +
          '\nDid you forget to install it?'
      );
    }

    this._logger.terminal.writeVerboseLine(`Resolving startupModulePath "${startupModulePath}"`);
    let resolvedStartupModulePath: string | undefined;
    try {
      resolvedStartupModulePath = Import.resolveModule({
        modulePath: startupModulePath,
        baseFolderPath: storykitModuleFolder
      });
    } catch (ex) {
      throw new Error(`The ${taskSession.taskName} task cannot start: ` + (ex as Error).message);
    }

    this._logger.terminal.writeVerboseLine(`Resolved startupModulePath is "${resolvedStartupModulePath}"`);

    // Example: "/path/to/my-project/.storybook"
    const dotStorybookFolder: string = `${heftConfiguration.buildFolder}/.storybook`;
    await FileSystem.ensureFolderAsync(dotStorybookFolder);

    // Example: "/path/to/my-project/.storybook/node_modules"
    const dotStorybookModuleFolder: string = `${dotStorybookFolder}/node_modules`;

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

    return resolvedStartupModulePath;
  }

  private async _runStorybookAsync(resolvedStartupModulePath: string): Promise<void> {
    this._logger.terminal.writeLine('Starting Storybook...');
    this._logger.terminal.writeLine(`Launching "${resolvedStartupModulePath}"`);

    require(resolvedStartupModulePath);

    this._logger.terminal.writeVerboseLine('Completed synchronous portion of launching startupModulePath');
  }
}
