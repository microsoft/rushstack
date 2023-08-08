// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as path from 'path';
import {
  JsonFile,
  Text,
  FileSystem,
  NewlineKind,
  InternalError,
  Terminal,
  ColorValue
} from '@rushstack/node-core-library';
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
import { PeriodicCallback } from './PeriodicCallback';
import {
  IOperationRunnerAfterExecuteContext,
  IOperationRunnerBeforeExecuteContext,
  OperationRunnerHooks
} from './OperationRunnerHooks';

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import type { IPhase } from '../../api/CommandLineConfiguration';

export interface IProjectDeps {
  files: { [filePath: string]: string };
  arguments: string;
}

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
  public readonly warningsAreAllowed: boolean;

  public readonly hooks: OperationRunnerHooks;
  public readonly periodicCallback: PeriodicCallback;
  public readonly logFilenameIdentifier: string;
  public static readonly periodicCallbackIntervalInSeconds: number = 10;

  private readonly _rushProject: RushConfigurationProject;
  private readonly _phase: IPhase;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _commandName: string;
  private readonly _commandToRun: string;
  private readonly _projectChangeAnalyzer: ProjectChangeAnalyzer;
  private readonly _packageDepsFilename: string;
  private readonly _selectedPhases: Iterable<IPhase>;

  public constructor(options: IOperationRunnerOptions) {
    const { phase } = options;

    this.name = options.displayName;
    this._rushProject = options.rushProject;
    this._phase = phase;
    this._rushConfiguration = options.rushConfiguration;
    this._commandName = phase.name;
    this._commandToRun = options.commandToRun;
    this._projectChangeAnalyzer = options.projectChangeAnalyzer;
    this._packageDepsFilename = `package-deps_${phase.logFilenameIdentifier}.json`;
    this.warningsAreAllowed =
      EnvironmentConfiguration.allowWarningsInSuccessfulBuild || phase.allowWarningsOnSuccess || false;
    this.logFilenameIdentifier = phase.logFilenameIdentifier;
    this._selectedPhases = options.selectedPhases;

    this.hooks = new OperationRunnerHooks();
    this.periodicCallback = new PeriodicCallback({
      interval: ShellOperationRunner.periodicCallbackIntervalInSeconds * 1000
    });
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    try {
      return await this._executeAsync(context);
    } catch (error) {
      throw new OperationError('executing', (error as Error).message);
    }
  }

  private async _executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const projectLogWritable: ProjectLogWritable = new ProjectLogWritable(
      this._rushProject,
      context.collatedWriter.terminal,
      this.logFilenameIdentifier
    );

    const finallyCallbacks: (() => {})[] = [];

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
      let lastProjectDeps: IProjectDeps | undefined = undefined;

      const currentDepsPath: string = path.join(
        this._rushProject.projectRushTempFolder,
        this._packageDepsFilename
      );

      if (FileSystem.exists(currentDepsPath)) {
        try {
          lastProjectDeps = JsonFile.load(currentDepsPath);
        } catch (e) {
          // Warn and ignore - treat failing to load the file as the project being not built.
          terminal.writeWarningLine(
            `Warning: error parsing ${this._packageDepsFilename}: ${e}. Ignoring and ` +
              `treating the command "${this._commandToRun}" as not run.`
          );
        }
      }

      let projectDeps: IProjectDeps | undefined;
      let trackedProjectFiles: string[] | undefined;
      try {
        const fileHashes: Map<string, string> | undefined =
          await this._projectChangeAnalyzer._tryGetProjectDependenciesAsync(this._rushProject, terminal);

        if (fileHashes) {
          const files: { [filePath: string]: string } = {};
          trackedProjectFiles = [];
          for (const [filePath, fileHash] of fileHashes) {
            files[filePath] = fileHash;
            trackedProjectFiles.push(filePath);
          }

          projectDeps = {
            files,
            arguments: this._commandToRun
          };
        }
      } catch (error) {
        // To test this code path:
        // Delete a project's ".rush/temp/shrinkwrap-deps.json" then run "rush build --verbose"
        terminal.writeLine('Unable to calculate incremental state: ' + (error as Error).toString());
        terminal.writeLine({
          text: 'Rush will proceed without incremental execution, caching, and change detection.',
          foregroundColor: ColorValue.Cyan
        });
      }

      const beforeExecuteContext: IOperationRunnerBeforeExecuteContext = {
        context,
        runner: this,
        terminal,
        projectDeps,
        lastProjectDeps,
        trackedProjectFiles,
        logPath: projectLogWritable.logPath,
        errorLogPath: projectLogWritable.errorLogPath,
        rushProject: this._rushProject,
        phase: this._phase,
        commandName: this._commandName,
        commandToRun: this._commandToRun,
        earlyReturnStatus: undefined,
        finallyCallbacks
      };

      await this.hooks.beforeExecute.promise(beforeExecuteContext);

      if (beforeExecuteContext.earlyReturnStatus) {
        return beforeExecuteContext.earlyReturnStatus;
      }

      // If the deps file exists, remove it before starting execution.
      FileSystem.deleteFile(currentDepsPath);

      // TODO: Remove legacyDepsPath with the next major release of Rush
      const legacyDepsPath: string = path.join(this._rushProject.projectFolder, 'package-deps.json');
      // Delete the legacy package-deps.json
      FileSystem.deleteFile(legacyDepsPath);

      if (!this._commandToRun) {
        // Write deps on success.
        if (projectDeps) {
          JsonFile.save(projectDeps, currentDepsPath, {
            ensureFolderExists: true
          });
        }

        return OperationStatus.Success;
      }

      // Run the operation
      terminal.writeLine('Invoking: ' + this._commandToRun);
      this.periodicCallback.start();

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

      let exitCode: number = 1;
      let status: OperationStatus = await new Promise(
        (resolve: (status: OperationStatus) => void, reject: (error: OperationError) => void) => {
          subProcess.on('close', (code: number) => {
            exitCode = code;
            try {
              if (code !== 0) {
                // Do NOT reject here immediately, give a chance for hooks to suppress the error
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

      const taskIsSuccessful: boolean =
        status === OperationStatus.Success ||
        (status === OperationStatus.SuccessWithWarning &&
          this.warningsAreAllowed &&
          !!this._rushConfiguration.experimentsConfiguration.configuration
            .buildCacheWithAllowWarningsInSuccessfulBuild);

      if (taskIsSuccessful && projectDeps) {
        // Write deps on success.
        await JsonFile.saveAsync(projectDeps, currentDepsPath, {
          ensureFolderExists: true
        });
      }

      const afterExecuteContext: IOperationRunnerAfterExecuteContext = {
        context,
        terminal,
        exitCode,
        status,
        taskIsSuccessful,
        logPath: projectLogWritable.logPath,
        errorLogPath: projectLogWritable.errorLogPath
      };

      await this.hooks.afterExecute.promise(afterExecuteContext);

      if (context.error) {
        throw context.error;
      }

      // Sync the status in case it was changed by the hook
      status = afterExecuteContext.status;

      if (terminalProvider.hasErrors) {
        status = OperationStatus.Failure;
      }

      return status;
    } finally {
      projectLogWritable.close();
      this.periodicCallback.stop();
      for (const callback of finallyCallbacks) {
        callback();
      }
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
