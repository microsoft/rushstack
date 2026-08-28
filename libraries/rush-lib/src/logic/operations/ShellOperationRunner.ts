// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as child_process from 'node:child_process';
import * as path from 'node:path';

import { Path } from '@rushstack/node-core-library';
import { type ITerminal, type ITerminalProvider, TerminalProviderSeverity } from '@rushstack/terminal';

import type { IPhase } from '../../api/CommandLineConfiguration';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { Utilities } from '../../utilities/Utilities';
import { IS_WINDOWS } from '../../utilities/executionUtilities';
import type { IOperationRunner, IOperationRunnerContext, IOperationLastState } from './IOperationRunner';
import type { IOperationChildProcessReporter } from './OperationEventSink';
import { OperationError } from './OperationError';
import { OperationStatus } from './OperationStatus';

export interface IShellOperationRunnerOptions {
  phase: IPhase;
  rushProject: RushConfigurationProject;
  displayName: string;
  initialCommand: string;
  incrementalCommand: string | undefined;
  commandForHash: string;
  ignoredParameterValues: ReadonlyArray<string>;
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

  private readonly _ignoredParameterValues: ReadonlyArray<string>;

  public constructor(options: IShellOperationRunnerOptions) {
    const {
      phase,
      displayName,
      rushProject,
      initialCommand,
      incrementalCommand,
      commandForHash,
      ignoredParameterValues
    } = options;

    this.name = displayName;
    this.warningsAreAllowed =
      EnvironmentConfiguration.allowWarningsInSuccessfulBuild || phase.allowWarningsOnSuccess || false;
    this._rushProject = rushProject;
    this._initialCommand = initialCommand;
    this._incrementalCommand = incrementalCommand;
    this._commandForHash = commandForHash;
    this._ignoredParameterValues = ignoredParameterValues;
  }

  public async executeAsync(
    context: IOperationRunnerContext,
    lastState?: IOperationLastState
  ): Promise<OperationStatus> {
    return await context.runWithTerminalAsync(
      async (
        terminal: ITerminal,
        terminalProvider: ITerminalProvider,
        structuredChildOutputTerminalProvider: ITerminalProvider
      ) => {
        let hasWarningOrError: boolean = false;

        // Log any ignored parameters
        if (this._ignoredParameterValues.length > 0) {
          terminal.writeLine(
            `These parameters were ignored for this operation by project-level configuration: ${this._ignoredParameterValues.join(' ')}`
          );
        }
        const incrementalCommand: string | undefined =
          lastState && this._incrementalCommand ? this._incrementalCommand : undefined;
        const commandToRun: string = incrementalCommand ?? this._initialCommand;

        // Run the operation
        terminal.writeLine(
          `Invoking (${incrementalCommand !== undefined ? 'incremental' : 'initial'}): ${commandToRun}`
        );

        const { rushConfiguration, projectFolder } = this._rushProject;

        const { environment: initialEnvironment } = context;
        const childProcessReporter: IOperationChildProcessReporter | undefined =
          !IS_WINDOWS && isHeftCommand(commandToRun) ? context.createChildProcessReporter() : undefined;

        const subProcess: child_process.ChildProcess = Utilities.executeLifecycleCommandAsync(commandToRun, {
          rushConfiguration: rushConfiguration,
          workingDirectory: projectFolder,
          initCwd: rushConfiguration.commonTempFolder,
          handleOutput: true,
          environmentPathOptions: {
            includeProjectBin: true
          },
          initialEnvironment,
          additionalEnvironment: childProcessReporter?.environment,
          stdio: childProcessReporter?.stdio
        });
        let reporterError: Error | undefined;
        const reporterDrainPromise: Promise<void> = childProcessReporter
          ? childProcessReporter
              .attachAsync(subProcess, structuredChildOutputTerminalProvider)
              .catch((error) => {
                reporterError =
                  error instanceof Error ? error : new Error('The Heft child reporter channel failed.');
              })
          : Promise.resolve();

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

        const closePromise: Promise<{
          readonly exitCode: number | null;
          readonly signal: NodeJS.Signals | null;
        }> = new Promise(
          (
            resolve: (result: {
              readonly exitCode: number | null;
              readonly signal: NodeJS.Signals | null;
            }) => void,
            reject: (error: OperationError) => void
          ) => {
            subProcess.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
              try {
                resolve({ exitCode, signal });
              } catch (error) {
                context.error = error as OperationError;
                reject(error as OperationError);
              }
            });
          }
        );
        const [{ exitCode, signal }]: [
          { readonly exitCode: number | null; readonly signal: NodeJS.Signals | null },
          void
        ] = await Promise.all([closePromise, reporterDrainPromise]);

        if (reporterError) {
          // eslint-disable-next-line require-atomic-updates -- This operation context has one active runner.
          context.error = new OperationError('error', reporterError.message);
          return OperationStatus.Failure;
        } else if (signal) {
          // eslint-disable-next-line require-atomic-updates -- This operation context has one active runner.
          context.error = new OperationError('error', `Terminated by signal: ${signal}`);
          return OperationStatus.Failure;
        } else if (exitCode !== 0) {
          // eslint-disable-next-line require-atomic-updates -- This operation context has one active runner.
          context.error = new OperationError('error', `Returned error code: ${exitCode}`);
          return OperationStatus.Failure;
        } else if (hasWarningOrError || childProcessReporter?.hasWarningOrError) {
          return OperationStatus.SuccessWithWarning;
        } else {
          return OperationStatus.Success;
        }
      },
      {
        createLogFile: true
      }
    );
  }

  public getConfigHash(): string {
    return this._commandForHash;
  }
}

/**
 * Returns whether a lifecycle command directly launches Heft.
 *
 * @internal
 */
export function isHeftCommand(command: string): boolean {
  let quote: "'" | '"' | undefined;
  let escaped: boolean = false;
  for (const character of command) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if ('&|;<>()`$\r\n'.includes(character)) {
      return false;
    }
  }
  if (quote || escaped) {
    return false;
  }

  const tokens: string[] =
    command
      .match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
      ?.map((token: string) => token.replace(/^(['"])(.*)\1$/, '$2')) ?? [];
  if (tokens.length === 0) {
    return false;
  }

  const executableName: string = path.basename(tokens[0].replace(/\\/g, '/')).toLowerCase();
  if (executableName === 'heft' || executableName === 'heft.cmd' || executableName === 'heft.exe') {
    return true;
  }
  if ((executableName === 'node' || executableName === 'node.exe') && tokens.length > 1) {
    const scriptName: string = path.basename(tokens[1].replace(/\\/g, '/')).toLowerCase();
    return scriptName === 'heft' || scriptName === 'heft.js';
  }
  return false;
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
      return Path.convertToBackslashes(commandPart) + remainder;
    }
  }

  // Don't change anything
  return command;
}
