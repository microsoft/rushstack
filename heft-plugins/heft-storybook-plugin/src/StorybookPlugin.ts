// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'node:child_process';
import * as path from 'node:path';

import {
  AlreadyExistsBehavior,
  FileSystem,
  Import,
  type IParsedPackageNameOrError,
  PackageName,
  SubprocessTerminator,
  FileConstants,
  type IPackageJson,
  InternalError,
  JsonFile
} from '@rushstack/node-core-library';
import { TerminalStreamWritable, type ITerminal, TerminalProviderSeverity } from '@rushstack/terminal';
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
 * Storybook CLI build type targets
 */
enum StorybookBuildMode {
  /**
   * Invoke storybook in watch mode
   */
  WATCH = 'watch',
  /**
   * Invoke storybook in build mode
   */
  BUILD = 'build'
}

/**
 * Storybook CLI versions
 */
enum StorybookCliVersion {
  STORYBOOK6 = 'storybook6',
  STORYBOOK7 = 'storybook7',
  STORYBOOK8 = 'storybook8'
}

/**
 * Configuration object holding default storybook cli package and command
 */
interface IStorybookCliCallingConfig {
  command: Record<StorybookBuildMode, string[]>;
  packageName: string;
}

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
   * Specify how the Storybook CLI should be invoked.  Possible values:
   *
   *  - "storybook6": For a static build, Heft will expect the cliPackageName package
   *     to define a binary command named "build-storybook". For the dev server mode,
   *     Heft will expect to find a binary command named "start-storybook". These commands
   *     must be declared in the "bin" section of package.json since Heft invokes the script directly.
   *     The output folder will be specified using the "--output-dir" CLI parameter.
   *
   * - "storybook7": Heft looks for a single binary command named "sb". It will be invoked as
   *    "sb build" for static builds, or "sb dev" for dev server mode.
   *     The output folder will be specified using the "--output-dir" CLI parameter.
   *
   *  @defaultValue `storybook7`
   */
  cliCallingConvention?: `${StorybookCliVersion}`;

  /**
   * Specify the NPM package that provides the CLI binary to run.
   * It will be resolved from the folder of your storykit package.
   *
   * @defaultValue
   *  The default is `@storybook/cli` when `cliCallingConvention` is  `storybook7`
   *  and `@storybook/react` when `cliCallingConvention` is  `storybook6`
   */
  cliPackageName?: string;

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

  /**
   * Specifies an NPM dependency name that is used as the (cwd) target for the storybook commands
   * By default the plugin executes the storybook commands in the local package context,
   * but for distribution purposes it can be useful to split the TS library and storybook exports into two packages.
   *
   * @example
   * If you create a storybook app project "my-ui-storybook-library-app" for the storybook preview distribution,
   * and your main UI component library is my-ui-storybook-library.
   *
   * Your 'app' project is able to compile the 'library' storybook preview using the CWD target:
   *
   * `"cwdPackageName": "my-storybook-ui-library"`
   */
  cwdPackageName?: string;
  /**
   * Specifies whether to capture the webpack stats for the storybook build by adding the `--webpack-stats-json` CLI flag.
   */
  captureWebpackStats?: boolean;
}

interface IRunStorybookOptions extends IPrepareStorybookOptions {
  logger: IScopedLogger;
  isServeMode: boolean;
  workingDirectory: string;
  resolvedModulePath: string;
  outputFolder: string | undefined;
  moduleDefaultArgs: string[];
  verbose: boolean;
}

interface IPrepareStorybookOptions extends IStorybookPluginOptions {
  logger: IScopedLogger;
  taskSession: IHeftTaskSession;
  heftConfiguration: HeftConfiguration;
  isServeMode: boolean;
  isTestMode: boolean;
  isDocsMode: boolean;
}

const DEFAULT_STORYBOOK_VERSION: StorybookCliVersion = StorybookCliVersion.STORYBOOK7;
const DEFAULT_STORYBOOK_CLI_CONFIG: Record<StorybookCliVersion, IStorybookCliCallingConfig> = {
  [StorybookCliVersion.STORYBOOK6]: {
    packageName: '@storybook/react',
    command: {
      watch: ['start-storybook'],
      build: ['build-storybook']
    }
  },
  [StorybookCliVersion.STORYBOOK7]: {
    packageName: '@storybook/cli',
    command: {
      watch: ['sb', 'dev'],
      build: ['sb', 'build']
    }
  },
  [StorybookCliVersion.STORYBOOK8]: {
    packageName: 'storybook',
    command: {
      watch: ['sb', 'dev'],
      build: ['sb', 'build']
    }
  }
};

const STORYBOOK_FLAG_NAME: '--storybook' = '--storybook';
const STORYBOOK_TEST_FLAG_NAME: '--storybook-test' = '--storybook-test';
const DOCS_FLAG_NAME: '--docs' = '--docs';

/** @public */
export default class StorybookPlugin implements IHeftTaskPlugin<IStorybookPluginOptions> {
  /**
   * Generate typings for Sass files before TypeScript compilation.
   */
  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IStorybookPluginOptions
  ): void {
    const logger: IScopedLogger = taskSession.logger;
    const storybookParameter: CommandLineFlagParameter =
      taskSession.parameters.getFlagParameter(STORYBOOK_FLAG_NAME);
    const storybookTestParameter: CommandLineFlagParameter =
      taskSession.parameters.getFlagParameter(STORYBOOK_TEST_FLAG_NAME);
    const docsParameter: CommandLineFlagParameter = taskSession.parameters.getFlagParameter(DOCS_FLAG_NAME);

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
        logger.terminal.writeLine(
          'The command line includes "--storybook", redirecting Webpack to Storybook'
        );
        return false;
      };

      let isServeMode: boolean = false;
      taskSession.requestAccessToPluginByName(
        '@rushstack/heft-webpack4-plugin',
        WEBPACK4_PLUGIN_NAME,
        (accessor: IWebpack4PluginAccessor) => {
          isServeMode = accessor.parameters.isServeMode;

          // Discard Webpack's configuration to prevent Webpack from running only when performing Storybook build
          accessor.hooks.onLoadConfiguration.tapPromise(PLUGIN_NAME, configureWebpackTap);
        }
      );

      taskSession.requestAccessToPluginByName(
        '@rushstack/heft-webpack5-plugin',
        WEBPACK5_PLUGIN_NAME,
        (accessor: IWebpack5PluginAccessor) => {
          isServeMode = accessor.parameters.isServeMode;

          // Discard Webpack's configuration to prevent Webpack from running only when performing Storybook build
          accessor.hooks.onLoadConfiguration.tapPromise(PLUGIN_NAME, configureWebpackTap);
        }
      );

      taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
        const runStorybookOptions: IRunStorybookOptions = await this._prepareStorybookAsync({
          logger,
          taskSession,
          heftConfiguration,
          isServeMode,
          isTestMode: storybookTestParameter.value,
          isDocsMode: docsParameter.value,
          ...options
        });
        await this._runStorybookAsync(runStorybookOptions, options);
      });
    }
  }

  private async _prepareStorybookAsync(options: IPrepareStorybookOptions): Promise<IRunStorybookOptions> {
    const {
      logger,
      taskSession,
      heftConfiguration,
      storykitPackageName,
      staticBuildOutputFolder,
      isTestMode
    } = options;
    const storybookCliVersion: `${StorybookCliVersion}` = this._getStorybookVersion(options);
    const storyBookCliConfig: IStorybookCliCallingConfig = DEFAULT_STORYBOOK_CLI_CONFIG[storybookCliVersion];
    const cliPackageName: string = options.cliPackageName ?? storyBookCliConfig.packageName;
    const buildMode: StorybookBuildMode = taskSession.parameters.watch
      ? StorybookBuildMode.WATCH
      : StorybookBuildMode.BUILD;

    if (buildMode === StorybookBuildMode.WATCH && isTestMode) {
      throw new Error(`The ${STORYBOOK_TEST_FLAG_NAME} flag is not supported in watch mode`);
    }
    if (
      isTestMode &&
      (storybookCliVersion === StorybookCliVersion.STORYBOOK6 ||
        storybookCliVersion === StorybookCliVersion.STORYBOOK7)
    ) {
      throw new Error(
        `The ${STORYBOOK_TEST_FLAG_NAME} flag is only supported in Storybook version 8 and above.`
      );
    }

    logger.terminal.writeVerboseLine(`Probing for "${storykitPackageName}"`);
    // Example: "/path/to/my-project/node_modules/my-storykit"
    let storykitFolderPath: string;
    try {
      storykitFolderPath = Import.resolvePackage({
        packageName: storykitPackageName,
        baseFolderPath: heftConfiguration.buildFolderPath,
        useNodeJSResolver: true
      });
    } catch (ex) {
      throw new Error(`The ${taskSession.taskName} task cannot start: ` + (ex as Error).message);
    }

    logger.terminal.writeVerboseLine(`Found "${storykitPackageName}" in ` + storykitFolderPath);

    logger.terminal.writeVerboseLine(`Probing for "${cliPackageName}" in "${storykitPackageName}"`);
    // Example: "/path/to/my-project/node_modules/my-storykit/node_modules/@storybook/cli"
    let storyBookCliPackage: string;
    try {
      storyBookCliPackage = Import.resolvePackage({
        packageName: cliPackageName,
        baseFolderPath: storykitFolderPath,
        useNodeJSResolver: true
      });
    } catch (ex) {
      throw new Error(`The ${taskSession.taskName} task cannot start: ` + (ex as Error).message);
    }

    logger.terminal.writeVerboseLine(`Found "${cliPackageName}" in ` + storyBookCliPackage);

    const storyBookPackagePackageJsonFile: string = path.join(storyBookCliPackage, FileConstants.PackageJson);
    const packageJson: IPackageJson = await JsonFile.loadAsync(storyBookPackagePackageJsonFile);
    if (!packageJson.bin || typeof packageJson.bin === 'string') {
      throw new Error(
        `The cli package "${cliPackageName}" does not provide a 'bin' executables in the 'package.json'`
      );
    }
    const [moduleExecutableName, ...moduleDefaultArgs] = storyBookCliConfig.command[buildMode];
    const modulePath: string | undefined = packageJson.bin[moduleExecutableName];
    logger.terminal.writeVerboseLine(
      `Found storybook "${modulePath}" for "${buildMode}" mode in "${cliPackageName}"`
    );

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
    const outputFolder: string | undefined =
      buildMode === StorybookBuildMode.WATCH ? undefined : staticBuildOutputFolder;

    if (!modulePath) {
      logger.terminal.writeVerboseLine(
        'No matching module path option specified in heft.json, so bundling will proceed without Storybook'
      );
    }

    logger.terminal.writeVerboseLine(`Resolving modulePath "${modulePath}"`);
    let resolvedModulePath: string;
    try {
      resolvedModulePath = Import.resolveModule({
        modulePath: modulePath,
        baseFolderPath: storyBookCliPackage
      });
    } catch (ex) {
      throw new Error(`The ${taskSession.taskName} task cannot start: ` + (ex as Error).message);
    }
    logger.terminal.writeVerboseLine(`Resolved modulePath is "${resolvedModulePath}"`);

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
      ...options,
      workingDirectory: heftConfiguration.buildFolderPath,
      resolvedModulePath,
      moduleDefaultArgs,
      outputFolder,
      verbose: taskSession.parameters.verbose
    };
  }

  private async _runStorybookAsync(
    runStorybookOptions: IRunStorybookOptions,
    options: IStorybookPluginOptions
  ): Promise<void> {
    const { logger, resolvedModulePath, verbose, isServeMode, isTestMode, isDocsMode } = runStorybookOptions;
    let { workingDirectory, outputFolder } = runStorybookOptions;
    logger.terminal.writeLine('Running Storybook compilation');
    logger.terminal.writeVerboseLine(`Loading Storybook module "${resolvedModulePath}"`);
    const storybookCliVersion: `${StorybookCliVersion}` = this._getStorybookVersion(options);

    /**
     * Support \'cwdPackageName\' option
     * by changing the working directory of the storybook command
     */
    if (options.cwdPackageName) {
      // Map outputFolder to local context.
      if (outputFolder) {
        outputFolder = path.resolve(workingDirectory, outputFolder);
      }

      // Update workingDirectory to target context.
      workingDirectory = await Import.resolvePackageAsync({
        packageName: options.cwdPackageName,
        baseFolderPath: workingDirectory
      });

      logger.terminal.writeVerboseLine(`Changing Storybook working directory to "${workingDirectory}"`);
    }

    const storybookArgs: string[] = runStorybookOptions.moduleDefaultArgs ?? [];

    if (outputFolder) {
      storybookArgs.push('--output-dir', outputFolder);
    }

    if (options.captureWebpackStats) {
      storybookArgs.push('--webpack-stats-json');
    }

    if (!verbose) {
      storybookArgs.push('--quiet');
    }

    if (isTestMode) {
      storybookArgs.push('--test');
    }

    if (isDocsMode) {
      storybookArgs.push('--docs');
    }

    if (isServeMode) {
      // Instantiate storybook runner synchronously for incremental builds
      // this ensure that the process is not killed when heft watcher detects file changes
      this._invokeSync(
        logger,
        resolvedModulePath,
        storybookArgs,
        storybookCliVersion === StorybookCliVersion.STORYBOOK8
      );
    } else {
      await this._invokeAsSubprocessAsync(logger, resolvedModulePath, storybookArgs, workingDirectory);
    }
  }

  /**
   * Invoke storybook cli in a forked subprocess
   * @param command - storybook command
   * @param args - storybook args
   * @param cwd - working directory
   * @returns
   */
  private async _invokeAsSubprocessAsync(
    logger: IScopedLogger,
    command: string,
    args: string[],
    cwd: string
  ): Promise<void> {
    return await new Promise<void>((resolve, reject) => {
      const storybookEnv: NodeJS.ProcessEnv = { ...process.env };
      const forkedProcess: child_process.ChildProcess = child_process.fork(command, args, {
        execArgv: process.execArgv,
        cwd,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: storybookEnv,
        ...SubprocessTerminator.RECOMMENDED_OPTIONS
      });

      SubprocessTerminator.killProcessTreeOnExit(forkedProcess, SubprocessTerminator.RECOMMENDED_OPTIONS);

      const childPid: number | undefined = forkedProcess.pid;
      if (childPid === undefined) {
        throw new InternalError(`Failed to spawn child process`);
      }
      logger.terminal.writeVerboseLine(`Started storybook process #${childPid}`);

      // Apply the pipe here instead of doing it in the forked process args due to a bug in Node
      // We will output stderr to the normal stdout stream since all output is piped through
      // stdout. We have to rely on the exit code to determine if there was an error.
      const terminal: ITerminal = logger.terminal;
      const terminalOutStream: TerminalStreamWritable = new TerminalStreamWritable({
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

      forkedProcess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (processFinished) {
          return;
        }
        processFinished = true;
        if (exitCode) {
          reject(new Error(`Storybook exited with code ${exitCode}`));
        } else if (signal) {
          reject(new Error(`Storybook terminated by signal ${signal}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Invoke storybook cli synchronously within the current process
   * @param command - storybook command
   * @param args - storybook args
   * @param cwd - working directory
   */
  private _invokeSync(
    logger: IScopedLogger,
    command: string,
    args: string[],
    patchNpmConfigUserAgent: boolean
  ): void {
    logger.terminal.writeLine('Launching ' + command);

    // simulate storybook cli command
    const originalArgv: string[] = process.argv;
    const node: string = originalArgv[0];
    process.argv = [node, command, ...args];
    // npm_config_user_agent is used by Storybook to determine the package manager
    // in a Rush monorepo it can't determine it automatically so it raises a benign error
    // Storybook failed to check addon compatibility Error: Unable to find a usable package manager within NPM, PNPM, Yarn and Yarn 2
    // hardcode it to NPM to suppress the error
    //
    // This only happens for dev server mode, not for build mode, so does not need to be in _invokeAsSubprocessAsync
    //
    // Storing the original env and restoring it like happens with argv does not seem to work
    // At the time when storybook checks env.npm_config_user_agent it has been reset to undefined
    if (patchNpmConfigUserAgent) {
      process.env.npm_config_user_agent = 'npm';
    }

    // invoke command synchronously
    require(command);

    // restore original heft process argv
    process.argv = originalArgv;

    logger.terminal.writeVerboseLine('Completed synchronous portion of launching startupModulePath');
  }

  private _getStorybookVersion(options: IStorybookPluginOptions): `${StorybookCliVersion}` {
    return options.cliCallingConvention ?? DEFAULT_STORYBOOK_VERSION;
  }
}
