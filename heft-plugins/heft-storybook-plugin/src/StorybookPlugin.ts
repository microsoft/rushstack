// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as childProcess from 'child_process';
import {
  AlreadyExistsBehavior,
  FileSystem,
  Import,
  IParsedPackageNameOrError,
  PackageName,
  SubprocessTerminator,
  TerminalWritable,
  type ITerminal,
  TerminalProviderSeverity
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
  IWebpackPluginAccessor as IWebpack4PluginAccessor
} from '@rushstack/heft-webpack4-plugin';
import type {
  PluginName as Webpack5PluginName,
  IWebpackPluginAccessor as IWebpack5PluginAccessor
} from '@rushstack/heft-webpack5-plugin';

const PLUGIN_NAME: 'storybook-plugin' = 'storybook-plugin';
const WEBPACK4_PLUGIN_NAME: typeof Webpack4PluginName = 'webpack4-plugin';
const WEBPACK5_PLUGIN_NAME: typeof Webpack5PluginName = 'webpack5-plugin';

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
   * The module entry point that Heft serve mode should use to launch the Storybook toolchain.
   * Typically it is the path loaded the `start-storybook` shell script.
   *
   * @example
   * If you are using `@storybook/react`, then the startup path would be:
   *
   * `"startupModulePath": "@storybook/react/bin/index.js"`
   */
  startupModulePath?: string;

  /**
   * The module entry point that Heft non-serve mode should use to launch the Storybook toolchain.
   * Typically it is the path loaded the `build-storybook` shell script.
   *
   * @example
   * If you are using `@storybook/react`, then the static build path would be:
   *
   * `"staticBuildModulePath": "@storybook/react/bin/build.js"`
   */
  staticBuildModulePath?: string;

  /**
   * The customized output dir for storybook static build.
   * If this is empty, then it will use the storybook default output dir.
   *
   * @example
   * If you want to change the static build output dir to staticBuildDir, then the static build output dir would be:
   *
   * `"staticBuildOutputFolder": "newStaticBuildDir"`
   */
  staticBuildOutputFolder?: string;
}

interface IRunStorybookOptions {
  workingDirectory: string;
  resolvedModulePath: string;
  outputFolder: string | undefined;
  verbose: boolean;
}

/** @public */
export default class StorybookPlugin implements IHeftTaskPlugin<IStorybookPluginOptions> {
  private _logger!: IScopedLogger;
  private _isServeMode: boolean = false;

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

    if (!options.startupModulePath && !options.staticBuildModulePath) {
      throw new Error(
        `The ${taskSession.taskName} task cannot start because the "startupModulePath" and the "staticBuildModulePath"` +
          ` plugin options were not specified`
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
        (accessor: IWebpack4PluginAccessor) => {
          // Discard Webpack's configuration to prevent Webpack from running only when starting a storybook server
          if (accessor.parameters.isServeMode) {
            this._isServeMode = true;
            accessor.hooks.onLoadConfiguration.tapPromise(PLUGIN_NAME, configureWebpackTap);
          }
        }
      );

      taskSession.requestAccessToPluginByName(
        '@rushstack/heft-webpack5-plugin',
        WEBPACK5_PLUGIN_NAME,
        (accessor: IWebpack5PluginAccessor) => {
          // Discard Webpack's configuration to prevent Webpack from running only when starting a storybook server
          if (accessor.parameters.isServeMode) {
            this._isServeMode = true;
            accessor.hooks.onLoadConfiguration.tapPromise(PLUGIN_NAME, configureWebpackTap);
          }
        }
      );

      taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
        const runStorybookOptions: IRunStorybookOptions = await this._prepareStorybookAsync(
          taskSession,
          heftConfiguration,
          options
        );
        await this._runStorybookAsync(runStorybookOptions);
      });
    }
  }

  private async _prepareStorybookAsync(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IStorybookPluginOptions
  ): Promise<IRunStorybookOptions> {
    const { storykitPackageName, startupModulePath, staticBuildModulePath, staticBuildOutputFolder } =
      options;
    this._logger.terminal.writeVerboseLine(`Probing for "${storykitPackageName}"`);

    // Example: "/path/to/my-project/node_modules/my-storykit"
    let storykitFolderPath: string;
    try {
      storykitFolderPath = Import.resolvePackage({
        packageName: storykitPackageName,
        baseFolderPath: heftConfiguration.buildFolderPath
      });
    } catch (ex) {
      throw new Error(`The ${taskSession.taskName} task cannot start: ` + (ex as Error).message);
    }

    this._logger.terminal.writeVerboseLine(`Found "${storykitPackageName}" in ` + storykitFolderPath);

    // Example: "/path/to/my-project/node_modules/my-storykit/node_modules"
    const storykitModuleFolderPath: string = `${storykitFolderPath}/node_modules`;
    const storykitModuleFolderExists: boolean = await FileSystem.existsAsync(storykitModuleFolderPath);
    if (!storykitModuleFolderExists) {
      throw new Error(
        `The ${taskSession.taskName} task cannot start because the storykit module folder does not exist:\n` +
          storykitModuleFolderPath +
          '\nDid you forget to install it?'
      );
    }

    // We only want to specify a different output dir when operating in build mode
    const outputFolder: string | undefined = this._isServeMode ? undefined : staticBuildOutputFolder;
    const modulePath: string | undefined = this._isServeMode ? startupModulePath : staticBuildModulePath;
    if (!modulePath) {
      this._logger.terminal.writeVerboseLine(
        'No matching module path option specified in heft.json, so bundling will proceed without Storybook'
      );
    }

    this._logger.terminal.writeVerboseLine(`Resolving modulePath "${modulePath}"`);
    let resolvedModulePath: string;
    try {
      resolvedModulePath = Import.resolveModule({
        modulePath: modulePath!,
        baseFolderPath: storykitModuleFolderPath
      });
    } catch (ex) {
      throw new Error(`The ${taskSession.taskName} task cannot start: ` + (ex as Error).message);
    }
    this._logger.terminal.writeVerboseLine(`Resolved modulePath is "${resolvedModulePath}"`);

    // Example: "/path/to/my-project/.storybook"
    const dotStorybookFolderPath: string = `${heftConfiguration.buildFolderPath}/.storybook`;
    await FileSystem.ensureFolderAsync(dotStorybookFolderPath);

    // Example: "/path/to/my-project/.storybook/node_modules"
    const dotStorybookModuleFolderPath: string = `${dotStorybookFolderPath}/node_modules`;

    // Example:
    //   LINK FROM: "/path/to/my-project/.storybook/node_modules"
    //   TARGET:    "/path/to/my-project/node_modules/my-storykit/node_modules"
    //
    // For node_modules links it's standard to use createSymbolicLinkJunction(), which avoids
    // administrator elevation on Windows; on other operating systems it will create a symbolic link.
    await FileSystem.createSymbolicLinkJunctionAsync({
      newLinkPath: dotStorybookModuleFolderPath,
      linkTargetPath: storykitModuleFolderPath,
      alreadyExistsBehavior: AlreadyExistsBehavior.Overwrite
    });

    return {
      workingDirectory: heftConfiguration.buildFolderPath,
      resolvedModulePath: resolvedModulePath,
      outputFolder: outputFolder,
      verbose: taskSession.parameters.verbose
    };
  }

  private async _runStorybookAsync(runStorybookOptions: IRunStorybookOptions): Promise<void> {
    const { workingDirectory, resolvedModulePath, outputFolder, verbose } = runStorybookOptions;
    this._logger.terminal.writeLine('Running Storybook compilation');
    this._logger.terminal.writeVerboseLine(`Loading Storybook module "${resolvedModulePath}"`);

    const storybookArgs: string[] = [];
    if (outputFolder) {
      storybookArgs.push('--output-dir', outputFolder);
    }
    if (!verbose) {
      storybookArgs.push('--quiet');
    }
    const storybookEnv: NodeJS.ProcessEnv = { ...process.env };

    await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
      const forkedProcess: childProcess.ChildProcess = childProcess.fork(resolvedModulePath, storybookArgs, {
        execArgv: process.execArgv,
        cwd: workingDirectory,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: storybookEnv,
        ...SubprocessTerminator.RECOMMENDED_OPTIONS
      });

      SubprocessTerminator.killProcessTreeOnExit(forkedProcess, SubprocessTerminator.RECOMMENDED_OPTIONS);

      // Apply the pipe here instead of doing it in the forked process args due to a bug in Node
      // We will output stderr to the normal stdout stream since all output is piped through
      // stdout. We have to rely on the exit code to determine if there was an error.
      const terminal: ITerminal = this._logger.terminal;
      const terminalOutStream: TerminalWritable = new TerminalWritable({
        terminal,
        severity: TerminalProviderSeverity.log
      });
      forkedProcess.stdout!.pipe(terminalOutStream);
      forkedProcess.stderr!.pipe(terminalOutStream);

      let processFinished: boolean = false;
      forkedProcess.on('error', (error: Error) => {
        processFinished = true;
        reject(new Error(`Storybook returned error: ${error}`));
      });

      forkedProcess.on('exit', (code: number | null) => {
        if (processFinished) {
          return;
        }
        processFinished = true;
        if (code !== 0) {
          reject(new Error(`Storybook exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }
}
