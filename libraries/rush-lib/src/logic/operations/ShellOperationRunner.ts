// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import { Text, NewlineKind, InternalError, Terminal } from '@rushstack/node-core-library';
import {
  TerminalChunkKind,
  TextRewriterTransform,
  StderrLineTransform,
  SplitterTransform,
  DiscardStdoutTransform
} from '@rushstack/terminal';
import { CollatedTerminal } from '@rushstack/stream-collator';

import { Utilities } from '../../utilities/Utilities';
import { OperationStatus } from './OperationStatus';
import { OperationError } from './OperationError';
import { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';
import { ProjectLogWritable } from './ProjectLogWritable';
import { CollatedTerminalProvider } from '../../utilities/CollatedTerminalProvider';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import type { IPhase } from '../../api/CommandLineConfiguration';

export interface IOperationRunnerOptions {
  rushProject: RushConfigurationProject;
  rushConfiguration: RushConfiguration;
  commandToRun: string;
  projectChangeAnalyzer: ProjectChangeAnalyzer;
  displayName: string;
  phase: IPhase;
  /**
   * The set of phases being executed in the current command, for validation of rush-project.json
   */
  selectedPhases: Iterable<IPhase>;
}

/**
 * An `IOperationRunner` subclass that performs an operation via a shell command.
 * Currently contains the build cache logic, pending extraction as separate operations.
 * Supports skipping an operation if allowed and it is already up-to-date.
 */
export class ShellOperationRunner implements IOperationRunner {
  public readonly name: string;

  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly cacheable: boolean = true;
  public readonly warningsAreAllowed: boolean;

  private readonly _commandToRun: string;

  private readonly _logFilenameIdentifier: string;
  private readonly _rushProject: RushConfigurationProject;
  private readonly _rushConfiguration: RushConfiguration;

  public constructor(options: IOperationRunnerOptions) {
    const { phase } = options;

    this.name = options.displayName;
    this._rushProject = options.rushProject;
    this._rushConfiguration = options.rushConfiguration;
    this._commandToRun = options.commandToRun;
    this.warningsAreAllowed =
      EnvironmentConfiguration.allowWarningsInSuccessfulBuild || phase.allowWarningsOnSuccess || false;
    this._logFilenameIdentifier = phase.logFilenameIdentifier;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    try {
      return await this._executeAsync(context);
    } catch (error) {
      throw new OperationError('executing', (error as Error).message);
    }
  }

  public getConfigHash(): string {
    return this._commandToRun;
  }

  private async _executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const projectLogWritable: ProjectLogWritable = new ProjectLogWritable(
      this._rushProject,
      context.collatedWriter.terminal,
      this._logFilenameIdentifier
    );

    try {
      //#region OPERATION LOGGING
      // TERMINAL PIPELINE:
      //
      //                             +--> quietModeTransform? --> collatedWriter
      //                             |
      // normalizeNewlineTransform --1--> stderrLineTransform --2--> removeColorsTransform --> projectLogWritable
      //                                                        |
      //                                                        +--> stdioSummarizer
      const removeColorsTransform: TextRewriterTransform = new TextRewriterTransform({
        destination: projectLogWritable,
        removeColors: true,
        normalizeNewlines: NewlineKind.OsDefault
      });

      const splitterTransform2: SplitterTransform = new SplitterTransform({
        destinations: [removeColorsTransform, context.stdioSummarizer]
      });

      const stderrLineTransform: StderrLineTransform = new StderrLineTransform({
        destination: splitterTransform2,
        newlineKind: NewlineKind.Lf // for StdioSummarizer
      });

      const discardTransform: DiscardStdoutTransform = new DiscardStdoutTransform({
        destination: context.collatedWriter
      });

      const splitterTransform1: SplitterTransform = new SplitterTransform({
        destinations: [context.quietMode ? discardTransform : context.collatedWriter, stderrLineTransform]
      });

      const normalizeNewlineTransform: TextRewriterTransform = new TextRewriterTransform({
        destination: splitterTransform1,
        normalizeNewlines: NewlineKind.Lf,
        ensureNewlineAtEnd: true
      });

      const collatedTerminal: CollatedTerminal = new CollatedTerminal(normalizeNewlineTransform);
      const terminalProvider: CollatedTerminalProvider = new CollatedTerminalProvider(collatedTerminal, {
        debugEnabled: context.debugMode
      });
      const terminal: Terminal = new Terminal(terminalProvider);
      //#endregion

      let hasWarningOrError: boolean = false;
      const projectFolder: string = this._rushProject.projectFolder;

      // Run the operation
      terminal.writeLine('Invoking: ' + this._commandToRun);

      const subProcess: child_process.ChildProcess = Utilities.executeLifecycleCommandAsync(
        this._commandToRun,
        {
          rushConfiguration: this._rushConfiguration,
          workingDirectory: projectFolder,
          initCwd: this._rushConfiguration.commonTempFolder,
          handleOutput: true,
          environmentPathOptions: {
            includeProjectBin: true
          }
        }
      );

      // Hook into events, in order to get live streaming of the log
      if (subProcess.stdout !== null) {
        subProcess.stdout.on('data', (data: Buffer) => {
          const text: string = data.toString();
          collatedTerminal.writeChunk({ text, kind: TerminalChunkKind.Stdout });
        });
      }
      if (subProcess.stderr !== null) {
        subProcess.stderr.on('data', (data: Buffer) => {
          const text: string = data.toString();
          collatedTerminal.writeChunk({ text, kind: TerminalChunkKind.Stderr });
          hasWarningOrError = true;
        });
      }

      let status: OperationStatus = await new Promise(
        (resolve: (status: OperationStatus) => void, reject: (error: OperationError) => void) => {
          subProcess.on('close', (code: number) => {
            try {
              if (code !== 0) {
                // Do NOT reject here immediately, give a chance for other logic to suppress the error
                context.error = new OperationError('error', `Returned error code: ${code}`);
                resolve(OperationStatus.Failure);
              } else if (hasWarningOrError) {
                resolve(OperationStatus.SuccessWithWarning);
              } else {
                resolve(OperationStatus.Success);
              }
            } catch (error) {
              reject(error as OperationError);
            }
          });
        }
      );

      // projectLogWritable should be closed before copy the logs to build cache
      normalizeNewlineTransform.close();

      // If the pipeline is wired up correctly, then closing normalizeNewlineTransform should
      // have closed projectLogWritable.
      if (projectLogWritable.isOpen) {
        throw new InternalError('The output file handle was not closed');
      }

      if (terminalProvider.hasErrors) {
        status = OperationStatus.Failure;
      }

      return status;
    } finally {
      projectLogWritable.close();
    }
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
