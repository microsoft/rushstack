// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as child_process from 'child_process';
import * as path from 'path';
import {
  JsonFile,
  Text,
  FileSystem,
  JsonObject,
  NewlineKind,
  InternalError,
  ITerminal,
  Terminal,
  ColorValue
} from '@rushstack/node-core-library';
import {
  TerminalChunkKind,
  TextRewriterTransform,
  StderrLineTransform,
  SplitterTransform,
  DiscardStdoutTransform,
  PrintUtilities
} from '@rushstack/terminal';
import { CollatedTerminal } from '@rushstack/stream-collator';

import type { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { Utilities, UNINITIALIZED } from '../../utilities/Utilities';
import { OperationStatus } from './OperationStatus';
import { OperationError } from './OperationError';
import type { ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';
import { ProjectLogWritable } from './ProjectLogWritable';
import { ProjectBuildCache } from '../buildCache/ProjectBuildCache';
import type { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { CollatedTerminalProvider } from '../../utilities/CollatedTerminalProvider';
import type { IPhase } from '../../api/CommandLineConfiguration';
import { RushConstants } from '../RushConstants';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration';

export interface IProjectDeps {
  files: { [filePath: string]: string };
  arguments: string;
}

export interface IOperationRunnerOptions {
  rushProject: RushConfigurationProject;
  rushConfiguration: RushConfiguration;
  buildCacheConfiguration: BuildCacheConfiguration | undefined;
  commandToRun: string;
  isIncrementalBuildAllowed: boolean;
  projectChangeAnalyzer: ProjectChangeAnalyzer;
  displayName: string;
  phase: IPhase;
  /**
   * The set of phases being executed in the current command, for validation of rush-project.json
   */
  selectedPhases: Iterable<IPhase>;
}

function _areShallowEqual(object1: JsonObject, object2: JsonObject): boolean {
  for (const n in object1) {
    if (!(n in object2) || object1[n] !== object2[n]) {
      return false;
    }
  }
  for (const n in object2) {
    if (!(n in object1)) {
      return false;
    }
  }
  return true;
}

/**
 * An `IOperationRunner` subclass that performs an operation via a shell command.
 * Currently contains the build cache logic, pending extraction as separate operations.
 * Supports skipping an operation if allowed and it is already up-to-date.
 */
export class ShellOperationRunner implements IOperationRunner {
  public readonly name: string;

  // This runner supports cache writes by default.
  public isCacheWriteAllowed: boolean = true;
  public isSkipAllowed: boolean;
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = false;
  public readonly warningsAreAllowed: boolean;

  private readonly _rushProject: RushConfigurationProject;
  private readonly _phase: IPhase;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _buildCacheConfiguration: BuildCacheConfiguration | undefined;
  private readonly _commandName: string;
  private readonly _commandToRun: string;
  private readonly _isCacheReadAllowed: boolean;
  private readonly _projectChangeAnalyzer: ProjectChangeAnalyzer;
  private readonly _packageDepsFilename: string;
  private readonly _logFilenameIdentifier: string;
  private readonly _selectedPhases: Iterable<IPhase>;

  /**
   * UNINITIALIZED === we haven't tried to initialize yet
   * undefined === we didn't create one because the feature is not enabled
   */
  private _projectBuildCache: ProjectBuildCache | undefined | UNINITIALIZED = UNINITIALIZED;

  public constructor(options: IOperationRunnerOptions) {
    const { phase } = options;

    this.name = options.displayName;
    this._rushProject = options.rushProject;
    this._phase = phase;
    this._rushConfiguration = options.rushConfiguration;
    this._buildCacheConfiguration = options.buildCacheConfiguration;
    this._commandName = phase.name;
    this._commandToRun = options.commandToRun;
    this._isCacheReadAllowed = options.isIncrementalBuildAllowed;
    this.isSkipAllowed = options.isIncrementalBuildAllowed;
    this._projectChangeAnalyzer = options.projectChangeAnalyzer;
    this._packageDepsFilename = `package-deps_${phase.logFilenameIdentifier}.json`;
    this.warningsAreAllowed =
      EnvironmentConfiguration.allowWarningsInSuccessfulBuild || phase.allowWarningsOnSuccess || false;
    this._logFilenameIdentifier = phase.logFilenameIdentifier;
    this._selectedPhases = options.selectedPhases;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    try {
      return await this._executeAsync(context);
    } catch (error) {
      throw new OperationError('executing', (error as Error).message);
    }
  }

  private async _executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    // TERMINAL PIPELINE:
    //
    //                             +--> quietModeTransform? --> collatedWriter
    //                             |
    // normalizeNewlineTransform --1--> stderrLineTransform --2--> removeColorsTransform --> projectLogWritable
    //                                                        |
    //                                                        +--> stdioSummarizer
    const projectLogWritable: ProjectLogWritable = new ProjectLogWritable(
      this._rushProject,
      context.collatedWriter.terminal,
      this._logFilenameIdentifier
    );

    try {
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
      let trackedFiles: string[] | undefined;
      try {
        const fileHashes: Map<string, string> | undefined =
          await this._projectChangeAnalyzer._tryGetProjectDependenciesAsync(this._rushProject, terminal);

        if (fileHashes) {
          const files: { [filePath: string]: string } = {};
          trackedFiles = [];
          for (const [filePath, fileHash] of fileHashes) {
            files[filePath] = fileHash;
            trackedFiles.push(filePath);
          }

          projectDeps = {
            files,
            arguments: this._commandToRun
          };
        } else if (this.isSkipAllowed) {
          // To test this code path:
          // Remove the `.git` folder then run "rush build --verbose"
          terminal.writeLine({
            text: PrintUtilities.wrapWords(
              'This workspace does not appear to be tracked by Git. ' +
                'Rush will proceed without incremental execution, caching, and change detection.'
            ),
            foregroundColor: ColorValue.Cyan
          });
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

      // If possible, we want to skip this operation -- either by restoring it from the
      // cache, if caching is enabled, or determining that the project
      // is unchanged (using the older incremental execution logic). These two approaches,
      // "caching" and "skipping", are incompatible, so only one applies.
      //
      // Note that "caching" and "skipping" take two different approaches
      // to tracking dependents:
      //
      //   - For caching, "isCacheReadAllowed" is set if a project supports
      //     incremental builds, and determining whether this project or a dependent
      //     has changed happens inside the hashing logic.
      //
      //   - For skipping, "isSkipAllowed" is set to true initially, and during
      //     the process of running dependents, it will be changed by OperationExecutionManager to
      //     false if a dependency wasn't able to be skipped.
      //
      let buildCacheReadAttempted: boolean = false;
      if (this._isCacheReadAllowed) {
        const projectBuildCache: ProjectBuildCache | undefined = await this._tryGetProjectBuildCacheAsync(
          terminal,
          trackedFiles
        );

        buildCacheReadAttempted = !!projectBuildCache;
        const restoreFromCacheSuccess: boolean | undefined =
          await projectBuildCache?.tryRestoreFromCacheAsync(terminal);

        if (restoreFromCacheSuccess) {
          return OperationStatus.FromCache;
        }
      }
      if (this.isSkipAllowed && !buildCacheReadAttempted) {
        const isPackageUnchanged: boolean = !!(
          lastProjectDeps &&
          projectDeps &&
          projectDeps.arguments === lastProjectDeps.arguments &&
          _areShallowEqual(projectDeps.files, lastProjectDeps.files)
        );

        if (isPackageUnchanged) {
          return OperationStatus.Skipped;
        }
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
                reject(new OperationError('error', `Returned error code: ${code}`));
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

      const taskIsSuccessful: boolean =
        status === OperationStatus.Success ||
        (status === OperationStatus.SuccessWithWarning &&
          this.warningsAreAllowed &&
          !!this._rushConfiguration.experimentsConfiguration.configuration
            .buildCacheWithAllowWarningsInSuccessfulBuild);

      if (taskIsSuccessful && projectDeps) {
        // Write deps on success.
        const writeProjectStatePromise: Promise<boolean> = JsonFile.saveAsync(projectDeps, currentDepsPath, {
          ensureFolderExists: true
        });

        // If the command is successful, we can calculate project hash, and no dependencies were skipped,
        // write a new cache entry.
        const setCacheEntryPromise: Promise<boolean> | undefined = context.isCacheWriteAllowed
          ? (await this._tryGetProjectBuildCacheAsync(terminal, trackedFiles))?.trySetCacheEntryAsync(
              terminal
            )
          : undefined;

        const [, cacheWriteSuccess] = await Promise.all([writeProjectStatePromise, setCacheEntryPromise]);

        if (terminalProvider.hasErrors) {
          status = OperationStatus.Failure;
        } else if (cacheWriteSuccess === false) {
          status = OperationStatus.SuccessWithWarning;
        }
      }

      normalizeNewlineTransform.close();

      // If the pipeline is wired up correctly, then closing normalizeNewlineTransform should
      // have closed projectLogWritable.
      if (projectLogWritable.isOpen) {
        throw new InternalError('The output file handle was not closed');
      }

      return status;
    } finally {
      projectLogWritable.close();
    }
  }

  private async _tryGetProjectBuildCacheAsync(
    terminal: ITerminal,
    trackedProjectFiles: string[] | undefined
  ): Promise<ProjectBuildCache | undefined> {
    if (this._projectBuildCache === UNINITIALIZED) {
      this._projectBuildCache = undefined;

      if (this._buildCacheConfiguration && this._buildCacheConfiguration.buildCacheEnabled) {
        // Disable legacy skip logic if the build cache is in play
        this.isSkipAllowed = false;

        const projectConfiguration: RushProjectConfiguration | undefined =
          await RushProjectConfiguration.tryLoadForProjectAsync(this._rushProject, terminal);
        if (projectConfiguration) {
          projectConfiguration.validatePhaseConfiguration(this._selectedPhases, terminal);
          if (projectConfiguration.disableBuildCacheForProject) {
            terminal.writeVerboseLine('Caching has been disabled for this project.');
          } else {
            const operationSettings: IOperationSettings | undefined =
              projectConfiguration.operationSettingsByOperationName.get(this._commandName);
            if (!operationSettings) {
              terminal.writeVerboseLine(
                `This project does not define the caching behavior of the "${this._commandName}" command, so caching has been disabled.`
              );
            } else if (operationSettings.disableBuildCacheForOperation) {
              terminal.writeVerboseLine(
                `Caching has been disabled for this project's "${this._commandName}" command.`
              );
            } else {
              const projectOutputFolderNames: ReadonlyArray<string> =
                operationSettings.outputFolderNames || [];
              this._projectBuildCache = await ProjectBuildCache.tryGetProjectBuildCache({
                projectConfiguration,
                projectOutputFolderNames,
                buildCacheConfiguration: this._buildCacheConfiguration,
                terminal,
                command: this._commandToRun,
                trackedProjectFiles: trackedProjectFiles,
                projectChangeAnalyzer: this._projectChangeAnalyzer,
                phaseName: this._phase.name
              });
            }
          }
        } else {
          terminal.writeVerboseLine(
            `Project does not have a ${RushConstants.rushProjectConfigFilename} configuration file, ` +
              'or one provided by a rig, so it does not support caching.'
          );
        }
      }
    }

    return this._projectBuildCache;
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
