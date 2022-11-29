// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as process from 'process';
import * as child_process from 'child_process';
import type {
  HeftConfiguration,
  HeftSession,
  IBuildStageContext,
  IBundleSubstage,
  IHeftFlagParameter,
  IHeftPlugin,
  IHeftStringParameter,
  ScopedLogger
} from '@rushstack/heft';
import { FileSystem, Import, SubprocessTerminator } from '@rushstack/node-core-library';

const PLUGIN_NAME: string = 'ServerlessStackPlugin';
const TASK_NAME: string = 'heft-serverless-stack';
const SST_CLI_PACKAGE_NAME: string = '@serverless-stack/cli';

/**
 * Options for `ServerlessStackPlugin`.
 *
 * @public
 */
export interface IServerlessStackPluginOptions {}

/** @public */
export class ServerlessStackPlugin implements IHeftPlugin<IServerlessStackPluginOptions> {
  public readonly pluginName: string = PLUGIN_NAME;

  private _logger!: ScopedLogger;

  public apply(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    options: IServerlessStackPluginOptions
  ): void {
    this._logger = heftSession.requestScopedLogger(TASK_NAME);

    const sstParameter: IHeftFlagParameter = heftSession.commandLine.registerFlagParameter({
      associatedActionNames: ['test', 'build', 'start'],
      parameterLongName: '--sst',
      // Once https://github.com/serverless-stack/serverless-stack/issues/1537 is fixed, we may be
      // eliminate the need for this parameter.
      description: 'Invokes the SST postprocessing - requires AWS credentials'
    });

    const sstStageParameter: IHeftStringParameter = heftSession.commandLine.registerStringParameter({
      associatedActionNames: ['test', 'build', 'start'],
      parameterLongName: '--sst-stage',
      argumentName: 'STAGE_NAME',
      description:
        'Specifies the Serverless Stack stage; equivalent to to the "--stage" parameter from the "sst" CLI'
    });

    let sstCliPackagePath: string;

    try {
      sstCliPackagePath = Import.resolvePackage({
        packageName: SST_CLI_PACKAGE_NAME,
        baseFolderPath: heftConfiguration.buildFolder
      });
    } catch (e) {
      throw new Error(
        `The ${TASK_NAME} task cannot start because your project does not seem to have a dependency on the` +
          ` "${SST_CLI_PACKAGE_NAME}" package: ` +
          e.message
      );
    }

    const sstCliEntryPoint: string = this._getSstCliEntryPoint(sstCliPackagePath);

    this._logger.terminal.writeVerboseLine('Found SST package in' + sstCliPackagePath);

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.bundle.tap(PLUGIN_NAME, (bundle: IBundleSubstage) => {
        if (!sstParameter.value) {
          bundle.hooks.configureWebpack.tap(
            { name: PLUGIN_NAME, stage: Number.MAX_SAFE_INTEGER },
            (webpackConfiguration: unknown) => {
              // Discard Webpack's configuration to prevent Webpack from running
              return null;
            }
          );
        }

        bundle.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          if (!sstParameter.value) {
            this._logger.terminal.writeLine(
              'Skipping SST operations because the "--sst" command-line parameter was not specified.'
            );
          } else {
            await this._onBundleRunAsync({
              heftSession,
              heftConfiguration,
              serveMode: build.properties.serveMode,
              sstCliEntryPoint,
              sstCliPackagePath,
              sstStageParameter
            });
          }
        });
      });
    });
  }

  private async _onBundleRunAsync(options: {
    heftSession: HeftSession;
    heftConfiguration: HeftConfiguration;
    serveMode: boolean;
    sstCliEntryPoint: string;
    sstCliPackagePath: string;
    sstStageParameter: IHeftStringParameter;
  }): Promise<void> {
    const sstCommandArgs: string[] = [];
    sstCommandArgs.push(options.sstCliEntryPoint);

    if (options.serveMode) {
      sstCommandArgs.push('start');
    } else {
      sstCommandArgs.push('build');
    }
    if (options.heftSession.debugMode) {
      sstCommandArgs.push('--verbose');
    }
    if (options.sstStageParameter.value) {
      sstCommandArgs.push('--stage');
      sstCommandArgs.push(options.sstStageParameter.value);
    }

    this._logger.terminal.writeVerboseLine('Launching child process: ' + JSON.stringify(sstCommandArgs));

    const sstCommandEnv: NodeJS.ProcessEnv = this._getWorkaroundEnvironment(options.sstCliPackagePath);

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

  private _getSstCliEntryPoint(sstCliPackagePath: string): string {
    // Entry point for SST prior to v1.2.0
    let sstCliEntryPoint: string = path.join(sstCliPackagePath, 'bin/scripts.js');
    if (FileSystem.exists(sstCliEntryPoint)) {
      return sstCliEntryPoint;
    }

    // Entry point for SST v1.2.0 and later
    sstCliEntryPoint = path.join(sstCliPackagePath, 'bin/scripts.mjs');
    if (FileSystem.exists(sstCliEntryPoint)) {
      return sstCliEntryPoint;
    }

    throw new Error(
      `The ${TASK_NAME} task cannot start because the entry point was not found:\n${sstCliEntryPoint}`
    );
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
