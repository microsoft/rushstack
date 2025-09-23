// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as child_process from 'node:child_process';

import { Text } from '@rushstack/node-core-library';
import { type ITerminal, type ITerminalProvider, TerminalProviderSeverity } from '@rushstack/terminal';

import type { IPhase } from '../../api/CommandLineConfiguration';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { Utilities } from '../../utilities/Utilities';
import type { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';
import { OperationError } from './OperationError';
import { OperationStatus } from './OperationStatus';

export interface IShellOperationRunnerOptions {
  phase: IPhase;
  rushProject: RushConfigurationProject;
  displayName: string;
  initialCommand: string;
  incrementalCommand: string | undefined;
  commandForHash: string;
}

/**
 * An `IOperationRunner` implementation that performs an operation via a shell command.
 * Currently contains the build cache logic, pending extraction as separate operations.
 * Supports skipping an operation if allowed and it is already up-to-date.
 */
export class ShellOperationRunner implements IOperationRunner {
  public readonly name: string;

  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly cacheable: boolean = true;
  public readonly warningsAreAllowed: boolean;
  /**
   * The creator is expected to use a different runner if the command is known to be a noop.
   */
  public readonly isNoOp: boolean = false;

  private readonly _commandForHash: string;
  private readonly _initialCommand: string;
  private readonly _incrementalCommand: string | undefined;

  private readonly _rushProject: RushConfigurationProject;

  public constructor(options: IShellOperationRunnerOptions) {
    const { phase } = options;

    this.name = options.displayName;
    this.warningsAreAllowed =
      EnvironmentConfiguration.allowWarningsInSuccessfulBuild || phase.allowWarningsOnSuccess || false;
    this._rushProject = options.rushProject;
    this._initialCommand = options.initialCommand;
    this._incrementalCommand = options.incrementalCommand;
    this._commandForHash = options.commandForHash;
  }

  public async executeAsync(context: IOperationRunnerContext, lastState?: {}): Promise<OperationStatus> {
    try {
      return await this._executeAsync(context, lastState);
    } catch (error) {
      throw new OperationError('executing', (error as Error).message);
    }
  }

  public getConfigHash(): string {
    return this._commandForHash;
  }

  private async _executeAsync(context: IOperationRunnerContext, lastState?: {}): Promise<OperationStatus> {
    return await context.runWithTerminalAsync(
      async (terminal: ITerminal, terminalProvider: ITerminalProvider) => {
        let hasWarningOrError: boolean = false;

        const commandToRun: string = (lastState && this._incrementalCommand) || this._initialCommand;

        // Run the operation
        terminal.writeLine(`Invoking (${lastState ? 'incremental' : 'initial'}): ${commandToRun}`);

        const { rushConfiguration, projectFolder } = this._rushProject;

        const { environment: initialEnvironment } = context;

        const subProcess: child_process.ChildProcess = Utilities.executeLifecycleCommandAsync(commandToRun, {
          rushConfiguration: rushConfiguration,
          workingDirectory: projectFolder,
          initCwd: rushConfiguration.commonTempFolder,
          handleOutput: true,
          environmentPathOptions: {
            includeProjectBin: true
          },
          initialEnvironment
        });

        // Hook into events, in order to get live streaming of the log
        subProcess.stdout?.on('data', (data: Buffer) => {
          const text: string = data.toString();
          terminalProvider.write(text, TerminalProviderSeverity.log);
        });
        subProcess.stderr?.on('data', (data: Buffer) => {
          const text: string = data.toString();
          terminalProvider.write(text, TerminalProviderSeverity.error);
          hasWarningOrError = true;
        });

        const status: OperationStatus = await new Promise(
          (resolve: (status: OperationStatus) => void, reject: (error: OperationError) => void) => {
            subProcess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
              try {
                // Do NOT reject here immediately, give a chance for other logic to suppress the error
                if (signal) {
                  context.error = new OperationError('error', `Terminated by signal: ${signal}`);
                  resolve(OperationStatus.Failure);
                } else if (exitCode !== 0) {
                  context.error = new OperationError('error', `Returned error code: ${exitCode}`);
                  resolve(OperationStatus.Failure);
                } else if (hasWarningOrError) {
                  resolve(OperationStatus.SuccessWithWarning);
                } else {
                  resolve(OperationStatus.Success);
                }
              } catch (error) {
                context.error = error as OperationError;
                reject(error as OperationError);
              }
            });
          }
        );

        return status;
      },
      {
        createLogFile: true
      }
    );
  }
}

/**
 * When running a command from the "scripts" block in package.json, if the command
 * contains Unix-style path slashes and the OS is Windows, the package managers will
 * convert slashes to backslashes.  This is a complicated undertaking.  For example, they
 * need to convert "node_modules/bin/this && ./scripts/that --name keep/this"
 * to "node_modules\bin\this && .\scripts\that --name keep/this", and they don't want to
 * convert ANY of the slashes in "cmd.exe /c echo a/b".  NPM and PNPM use npm-lifecycle for this,
 * but it unfortunately has a dependency on the entire node-gyp kitchen sink.  Yarn has a
 * simplified implementation in fix-cmd-win-slashes.js, but it's not exposed as a library.
 *
 * Fundamentally NPM's whole feature seems misguided:  They start by inviting people to write
 * shell scripts that will be executed by wildly different shell languages (e.g. cmd.exe and Bash).
 * It's very tricky for a developer to guess what's safe to do without testing every OS.
 * Even simple path separators are not portable, so NPM added heuristics to figure out which
 * slashes are part of a path or not, and convert them.  These workarounds end up having tons
 * of special cases.  They probably could have implemented their own entire minimal cross-platform
 * shell language with less code and less confusion than npm-lifecycle's approach.
 *
 * We've deprecated shell operators inside package.json.  Instead, we advise people to move their
 * scripts into conventional script files, and put only a file path in package.json.  So, for
 * Rush's workaround here, we really only care about supporting the small set of cases seen in the
 * unit tests.  For anything that doesn't fit those patterns, we leave the string untouched
 * (i.e. err on the side of not breaking anything).  We could revisit this later if someone
 * complains about it, but so far nobody has.  :-)
 */
export function convertSlashesForWindows(command: string): string {
  // The first group will match everything up to the first space, "&", "|", "<", ">", or quote.
  // The second group matches the remainder.
  const commandRegExp: RegExp = /^([^\s&|<>"]+)(.*)$/;

  const match: RegExpMatchArray | null = commandRegExp.exec(command);
  if (match) {
    // Example input: "bin/blarg --path ./config/blah.json && a/b"
    // commandPart="bin/blarg"
    // remainder=" --path ./config/blah.json && a/b"
    const commandPart: string = match[1];
    const remainder: string = match[2];

    // If the command part already contains a backslash, then leave it alone
    if (commandPart.indexOf('\\') < 0) {
      // Replace all the slashes with backslashes, e.g. to produce:
      // "bin\blarg --path ./config/blah.json && a/b"
      //
      // NOTE: we don't attempt to process the path parameter or stuff after "&&"
      return Text.replaceAll(commandPart, '/', '\\') + remainder;
    }
  }

  // Don't change anything
  return command;
}
