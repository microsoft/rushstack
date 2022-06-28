// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as process from 'process';
import * as child_process from 'child_process';
import type {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  HeftConfiguration,
  IHeftTaskSession,
  IHeftTaskPlugin,
  IHeftTaskRunHookOptions,
  IScopedLogger
} from '@rushstack/heft';
import { FileSystem, Import, SubprocessTerminator } from '@rushstack/node-core-library';
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

const PLUGIN_NAME: string = 'ServerlessStackPlugin';
const SST_CLI_PACKAGE_NAME: string = '@serverless-stack/cli';

export interface IServerlessStackPluginOptions {}

export default class ServerlessStackPlugin implements IHeftTaskPlugin<IServerlessStackPluginOptions> {
  private _logger!: IScopedLogger;

  public apply(
    taskSession: IHeftTaskSession,
    heftConfiguration: HeftConfiguration,
    options: IServerlessStackPluginOptions
  ): void {
    this._logger = taskSession.logger;

    // Once https://github.com/serverless-stack/serverless-stack/issues/1537 is fixed, we may be
    // eliminate the need for this parameter.
    const sstParameter: CommandLineFlagParameter = taskSession.parametersByLongName.get(
      '--sst'
    ) as CommandLineFlagParameter;

    const sstStageParameter: CommandLineStringParameter = taskSession.parametersByLongName.get(
      '--sst-stage'
    ) as CommandLineStringParameter;

    // Only tap if the --sst flag is set.
    if (sstParameter.value) {
      taskSession.requestAccessToPluginByName(
        '@rushstack/heft-webpack4-plugin',
        Webpack4PluginName,
        async (accessor: IWebpack4PluginAccessor) => {
          accessor.onConfigureWebpackHook?.tapPromise(
            { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
            async (config: IWebpack4Configuration | null) => {
              // Discard Webpack's configuration to prevent Webpack from running
              this._logger.terminal.writeVerboseLine(
                'The command line includes "--sst", redirecting Webpack to Serverless Stack'
              );
              return null;
            }
          );
        }
      );

      taskSession.requestAccessToPluginByName(
        '@rushstack/heft-webpack5-plugin',
        Webpack5PluginName,
        async (accessor: IWebpack5PluginAccessor) => {
          accessor.onConfigureWebpackHook?.tapPromise(
            { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
            async (config: IWebpack5Configuration | null) => {
              // Discard Webpack's configuration to prevent Webpack from running
              this._logger.terminal.writeVerboseLine(
                'The command line includes "--sst", redirecting Webpack to Serverless Stack'
              );
              return null;
            }
          );
        }
      );

      taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (runOptions: IHeftTaskRunHookOptions) => {
        // TODO: Handle watch / serve mode
        await this._runServerlessStackAsync({
          taskSession,
          heftConfiguration,
          sstStage: sstStageParameter.value,
          debugMode: taskSession.debugMode,
          // serveMode:
          verbose: runOptions.verbose
        });
      });
    }
  }

  private async _runServerlessStackAsync(options: {
    taskSession: IHeftTaskSession;
    heftConfiguration: HeftConfiguration;
    sstStage?: string;
    debugMode?: boolean;
    serveMode?: boolean;
    verbose?: boolean;
  }): Promise<void> {
    let sstCliPackagePath: string;
    try {
      sstCliPackagePath = Import.resolvePackage({
        packageName: SST_CLI_PACKAGE_NAME,
        baseFolderPath: options.heftConfiguration.buildFolder
      });
    } catch (e) {
      throw new Error(
        `The ${options.taskSession.taskName} task cannot start because your project does not seem to have ` +
          `a dependency on the "${SST_CLI_PACKAGE_NAME}" package: ` +
          e.message
      );
    }

    const sstCliEntryPoint: string = path.join(sstCliPackagePath, 'bin/scripts.js');
    if (!(await FileSystem.existsAsync(sstCliEntryPoint))) {
      throw new Error(
        `The ${options.taskSession.taskName} task cannot start because the entry point was not found:\n` +
          sstCliEntryPoint
      );
    }

    this._logger.terminal.writeVerboseLine('Found SST package in' + sstCliPackagePath);

    const sstCommandArgs: string[] = [];
    sstCommandArgs.push(sstCliEntryPoint);

    if (options.serveMode) {
      sstCommandArgs.push('start');
    } else {
      sstCommandArgs.push('build');
    }
    if (options.debugMode) {
      sstCommandArgs.push('--verbose');
    }
    if (options.sstStage) {
      sstCommandArgs.push('--stage');
      sstCommandArgs.push(options.sstStage);
    }

    this._logger.terminal.writeVerboseLine('Launching child process: ' + JSON.stringify(sstCommandArgs));

    const sstCommandEnv: NodeJS.ProcessEnv = this._getWorkaroundEnvironment(sstCliPackagePath);

    const sstCommandResult: child_process.ChildProcess = child_process.spawn(
      process.execPath,
      sstCommandArgs,
      {
        cwd: options.heftConfiguration.buildFolder,
        stdio: ['inherit', 'pipe', 'pipe'],
        env: sstCommandEnv,
        ...SubprocessTerminator.RECOMMENDED_OPTIONS
      }
    );

    SubprocessTerminator.killProcessTreeOnExit(sstCommandResult, SubprocessTerminator.RECOMMENDED_OPTIONS);

    let completionResolve: () => void;
    let completionReject: (reason: Error) => void;

    const completionPromise: Promise<void> = new Promise((resolve, reject) => {
      completionResolve = resolve;
      completionReject = reject;
    });

    sstCommandResult.stdout?.on('data', (chunk: Buffer) => {
      this._writeOutput(chunk.toString(), (x) => this._logger.terminal.write(x));
    });
    sstCommandResult.stderr?.on('data', (chunk: Buffer) => {
      this._writeOutput(chunk.toString(), (x) => this._logger.terminal.writeError(x));
    });

    sstCommandResult.on('exit', (code: number | null) => {
      if (options.serveMode) {
        // The child process is not supposed to terminate in watch mode
        this._logger.terminal.writeErrorLine(`SST process terminated with exit code ${code}`);
        // TODO: Provide a Heft facility for this
        process.exit(1);
      } else {
        this._logger.terminal.writeVerboseLine(`SST process terminated with exit code ${code}`);
        if (!code) {
          completionResolve();
        } else {
          completionReject(new Error(`SST process terminated with exit code ${code}`));
        }
      }
    });

    return completionPromise;
  }

  private _writeOutput(chunk: string, write: (message: string) => void): void {
    const lines: string[] = chunk.split('\n');
    const lastLine: string = lines.pop() || '';

    lines.map((x) => write(x + '\n'));
    if (lastLine !== '') {
      write(lastLine);
    }
  }

  // The SST CLI emits a script "<project folder>/.build/run.js" with a bunch of phantom dependencies
  // on packages that NPM would shamefully hoist into the project's node_modules folder when
  // "@serverless-stack/cli" is being installed.  The only reason this works with PNPM is that
  // (to improve compatibility) its bin script sets up NODE_PATH to include "common/temp/node_modules/.pnpm/"
  // where those dependencies can be found, and this environment variable gets passed along to the run.js
  // child process.  SST is not following best practices -- regardless of which package manager you're using, there
  // is no guarantee that the versions found in this way will correspond to @serverless-stack/cli/package.json.
  //
  // Since we're invoking the "@serverless-stack/cli/bin/scripts.js" entry point directly, we need to
  // reproduce this workaround.
  private _getWorkaroundEnvironment(sstCliPackagePath: string): NodeJS.ProcessEnv {
    const sstCommandEnv: NodeJS.ProcessEnv = {
      ...process.env
    };

    const phantomPaths: string[] = [];
    let current: string = path.join(sstCliPackagePath);
    while (current) {
      phantomPaths.push(path.join(current, 'node_modules'));
      const parent: string = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }

    sstCommandEnv.NODE_PATH = phantomPaths.join(path.delimiter);
    return sstCommandEnv;
  }
}
