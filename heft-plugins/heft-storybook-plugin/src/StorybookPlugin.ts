// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import {
  FileSystem,
  IFileSystemCreateLinkOptions,
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
  IPreCompileSubstage,
  ScopedLogger
} from '@rushstack/heft';
import { StorybookRunner } from './StorybookRunner';

const PLUGIN_NAME: string = 'StorybookPlugin';
const TASK_NAME: string = 'heft-storybook';

/** @public */
export interface IStorybookPluginOptions {
  storykitPackageName: string;

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

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      // TODO: Expose an API for custom CLI parameters similar to HeftSession.registerAction()
      if (process.argv.indexOf('--storybook') < 0) {
        this._logger.terminal.writeVerboseLine(
          'The command line does not include "--storybook", so bundling will proceed without Storybook'
        );
        return;
      }

      this._logger.terminal.writeVerboseLine(
        'The command line includes "--storybook", redirecting Webpack to Storybook'
      );

      build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile: IPreCompileSubstage) => {
        preCompile.hooks.run.tap(PLUGIN_NAME, () => {
          this._onPreCompile(heftSession, heftConfiguration);
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

  private _onPreCompile(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    this._logger.terminal.writeVerboseLine(`Probing for "${this._storykitPackageName}"`);

    // Example: "/path/to/my-project/node_modules/my-storykit"
    let storykitFolder: string;
    try {
      storykitFolder = Import.resolvePackage({
        packageName: this._storykitPackageName,
        baseFolderPath: heftConfiguration.buildFolder
      });
    } catch (ex) {
      throw new Error(`The ${TASK_NAME} task cannot start: ` + ex.message);
    }

    this._logger.terminal.writeVerboseLine(`Found "${this._storykitPackageName}" in ` + storykitFolder);

    // Example: "/path/to/my-project/node_modules/my-storykit/node_modules"
    const storykitModuleFolder: string = path.join(storykitFolder, 'node_modules');
    if (!FileSystem.exists(storykitModuleFolder)) {
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
      throw new Error(`The ${TASK_NAME} task cannot start: ` + ex.message);
    }
    this._logger.terminal.writeVerboseLine(
      `Resolved startupModulePath is "${this._resolvedStartupModulePath}"`
    );

    // Example: "/path/to/my-project/.storybook"
    const dotStorybookFolder: string = path.join(heftConfiguration.buildFolder, '.storybook');
    FileSystem.ensureFolder(dotStorybookFolder);

    // Example: "/path/to/my-project/.storybook/node_modules"
    const dotStorybookModuleFolder: string = path.join(dotStorybookFolder, 'node_modules');

    // Example:
    //   LINK FROM: "/path/to/my-project/.storybook/node_modules"
    //   TARGET:    "/path/to/my-project/node_modules/my-storykit/node_modules"
    this._createFolderSymlink({
      newLinkPath: dotStorybookModuleFolder,
      linkTargetPath: storykitModuleFolder
    });
  }

  private _createFolderSymlink(options: IFileSystemCreateLinkOptions): void {
    // TODO: createSymbolicLinkJunction() is supposed to implement alreadyExistsBehavior
    FileSystem.deleteFile(options.newLinkPath);

    // This is how Rush links node_modules folders, for some historical reasons
    // related to filesystem permissions
    if (process.platform === 'win32') {
      FileSystem.createSymbolicLinkJunction(options);
    } else {
      FileSystem.createSymbolicLinkFolder(options);
    }
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
