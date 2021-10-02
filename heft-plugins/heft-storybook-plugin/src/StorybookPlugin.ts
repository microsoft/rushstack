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
  HeftSession,
  IBuildStageContext,
  IBundleSubstage,
  IHeftPlugin,
  IHeftFlagParameter,
  IPreCompileSubstage,
  ScopedLogger
} from '@rushstack/heft';
import { StorybookRunner } from './StorybookRunner';

const PLUGIN_NAME: string = 'StorybookPlugin';
const TASK_NAME: string = 'heft-storybook';

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
export class StorybookPlugin implements IHeftPlugin<IStorybookPluginOptions> {
  public readonly pluginName: string = PLUGIN_NAME;

  private _logger!: ScopedLogger;
  private _storykitPackageName!: string;
  private _startupModulePath!: string;
  private _resolvedStartupModulePath!: string;

  /**
   * Generate typings for Sass files before TypeScript compilation.
   */
  public apply(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    options: IStorybookPluginOptions
  ): void {
    this._logger = heftSession.requestScopedLogger(TASK_NAME);

    if (!options.storykitPackageName) {
      throw new Error(
        `The ${TASK_NAME} task cannot start because the "storykitPackageName"` +
          ` plugin option was not specified`
      );
    }

    const parseResult: IParsedPackageNameOrError = PackageName.tryParse(options.storykitPackageName);
    if (parseResult.error) {
      throw new Error(
        `The ${TASK_NAME} task cannot start because the "storykitPackageName"` +
          ` plugin option is not a valid package name: ` +
          parseResult.error
      );
    }
    this._storykitPackageName = options.storykitPackageName;

    if (!options.startupModulePath) {
      throw new Error(
        `The ${TASK_NAME} task cannot start because the "startupModulePath"` +
          ` plugin option was not specified`
      );
    }
    this._startupModulePath = options.startupModulePath;

    const storybookParameters: IHeftFlagParameter = heftSession.commandLine.registerFlagParameter({
      associatedActionNames: ['start'],
      parameterLongName: '--storybook',
      description:
        '(EXPERIMENTAL) Used by the "@rushstack/heft-storybook-plugin" package to launch Storybook.'
    });

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      if (!storybookParameters.actionAssociated || !storybookParameters.value) {
        this._logger.terminal.writeVerboseLine(
          'The command line does not include "--storybook", so bundling will proceed without Storybook'
        );
        return;
      }

      this._logger.terminal.writeVerboseLine(
        'The command line includes "--storybook", redirecting Webpack to Storybook'
      );

      build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile: IPreCompileSubstage) => {
        preCompile.hooks.run.tapPromise(PLUGIN_NAME, () => {
          return this._onPreCompileAsync(heftConfiguration);
        });
      });

      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleSubstage) => {
        bundle.hooks.configureWebpack.tap(
          { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
          (webpackConfiguration: unknown) => {
            // Discard Webpack's configuration to prevent Webpack from running
            return null;
          }
        );

        bundle.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._onBundleRunAsync(heftSession, heftConfiguration);
        });
      });
    });
  }

  private async _onPreCompileAsync(heftConfiguration: HeftConfiguration): Promise<void> {
    this._logger.terminal.writeVerboseLine(`Probing for "${this._storykitPackageName}"`);

    // Example: "/path/to/my-project/node_modules/my-storykit"
    let storykitFolder: string;
    try {
      storykitFolder = Import.resolvePackage({
        packageName: this._storykitPackageName,
        baseFolderPath: heftConfiguration.buildFolder
      });
    } catch (ex) {
      throw new Error(`The ${TASK_NAME} task cannot start: ` + (ex as Error).message);
    }

    this._logger.terminal.writeVerboseLine(`Found "${this._storykitPackageName}" in ` + storykitFolder);

    // Example: "/path/to/my-project/node_modules/my-storykit/node_modules"
    const storykitModuleFolder: string = path.join(storykitFolder, 'node_modules');
    if (!(await FileSystem.existsAsync(storykitModuleFolder))) {
      throw new Error(
        `The ${TASK_NAME} task cannot start because the storykit module folder does not exist:\n` +
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
      throw new Error(`The ${TASK_NAME} task cannot start: ` + (ex as Error).message);
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

  private async _onBundleRunAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    this._logger.terminal.writeLine('Starting Storybook runner...');

    const storybookRunner: StorybookRunner = new StorybookRunner(
      heftConfiguration.terminalProvider,
      {
        buildFolder: heftConfiguration.buildFolder,
        resolvedStartupModulePath: this._resolvedStartupModulePath
      },
      // TODO: Extract SubprocessRunnerBase into a public API
      // eslint-disable-next-line
      heftSession as any
    );
    if (heftSession.debugMode) {
      await storybookRunner.invokeAsync();
    } else {
      await storybookRunner.invokeAsSubprocessAsync();
    }
  }
}
