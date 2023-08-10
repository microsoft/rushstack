// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async, type ITerminal, type IAsyncTaskContext, Terminal } from '@rushstack/node-core-library';
import { CollatedTerminal } from '@rushstack/stream-collator';

import { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import {
  STAGE_CREATE_CACHE_OPERATIONS,
  type ICreateOperationsContext,
  type IPhasedCommandPlugin,
  type PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import type { IRawRepoState, ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import type { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { ProjectBuildCache } from '../buildCache/ProjectBuildCache';
import { type IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { getHashesForGlobsAsync } from '../buildCache/getHashesForGlobsAsync';
import { RushConstants } from '../RushConstants';
import { CollatedTerminalProvider } from '../../utilities/CollatedTerminalProvider';
import { ProjectLogWritable } from './ProjectLogWritable';
import { OperationMetadataManager } from './OperationMetadataManager';
import {
  DiscardStdoutTransform,
  StderrLineTransform,
  TerminalWritable,
  TextRewriterTransform
} from '@rushstack/terminal';
import { SplitterTransform } from '@rushstack/terminal';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IPhase } from '../../api/CommandLineConfiguration';
import { NewlineKind } from '@rushstack/node-core-library';

const PLUGIN_NAME: 'BuildCachePlugin' = 'BuildCachePlugin';

export interface IBuildCachePluginOptions {
  allowWarningsInSuccessfulBuild: boolean;
  buildCacheConfiguration: BuildCacheConfiguration;
  terminal: ITerminal;
  isIncrementalBuildAllowed: boolean;
}

interface IBuildCacheRecord {
  project: RushConfigurationProject;
  phase: IPhase;

  projectBuildCache: ProjectBuildCache | undefined;
  allowCacheWrite: boolean;

  operationMetadataManager: OperationMetadataManager;
  logPath: string;
  errorLogPath: string;

  cacheDisabledReason: string | undefined;

  readFromCache?: boolean;
  willWriteCache?: boolean;
}

/**
 * Runner that reads from the build cache.
 */
class BuildCacheReadOperationRunner implements IOperationRunner {
  public readonly name: string;
  public readonly supportsIncremental: boolean = false;
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = true;
  public readonly warningsAreAllowed: boolean = true;

  private readonly _record: IBuildCacheRecord;

  public constructor(record: IBuildCacheRecord, name: string) {
    this.name = name;
    this._record = record;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { _record: record } = this;
    const { project, phase, projectBuildCache } = record;

    if (!projectBuildCache) {
      return OperationStatus.NoOp;
    }

    const logWritable: ProjectLogWritable = new ProjectLogWritable(
      project,
      () => context.collatedWriter.terminal,
      `${phase.logFilenameIdentifier}.cache.read`
    );

    try {
      //#region OPERATION LOGGING
      // TERMINAL PIPELINE:
      //
      // normalizeNewlineTransform --> stderrLineTransform --2--> removeColorsTransform --> projectLogWritable
      //                                                     |
      //                                                     +--> stdioSummarizer
      const removeColorsTransform: TextRewriterTransform = new TextRewriterTransform({
        destination: logWritable,
        removeColors: true,
        normalizeNewlines: NewlineKind.OsDefault
      });

      const splitterTransform: SplitterTransform = new SplitterTransform({
        destinations: [removeColorsTransform, context.stdioSummarizer]
      });

      const stderrLineTransform: StderrLineTransform = new StderrLineTransform({
        destination: splitterTransform,
        newlineKind: NewlineKind.Lf // for StdioSummarizer
      });

      const collatedTerminal: CollatedTerminal = new CollatedTerminal(stderrLineTransform);
      const terminalProvider: CollatedTerminalProvider = new CollatedTerminalProvider(collatedTerminal, {
        debugEnabled: context.debugMode
      });
      const terminal: Terminal = new Terminal(terminalProvider);
      //#endregion

      const { cacheDisabledReason } = record;

      if (cacheDisabledReason) {
        terminal.writeVerboseLine(cacheDisabledReason);
      }

      const restoreFromCacheSuccess: boolean = await projectBuildCache.tryRestoreFromCacheAsync(terminal);
      record.readFromCache = restoreFromCacheSuccess;

      if (!restoreFromCacheSuccess) {
        terminal.writeWarningLine(`Failed to restore from cache. Proceeding with normal execution.`);
      }

      stderrLineTransform.close();

      const status: OperationStatus = restoreFromCacheSuccess
        ? OperationStatus.FromCache
        : OperationStatus.SuccessWithWarning;
      return status;
    } finally {
      logWritable.close();
    }
  }

  public getConfigHash(): string {
    return 'read';
  }
}

/**
 * Runner that writes the output of a prior operation to the build cache.
 */
class BuildCacheWriteOperationRunner implements IOperationRunner {
  public readonly name: string;
  public readonly supportsIncremental: boolean = false;
  public readonly reportTiming: boolean = true;
  public readonly silent: boolean = true;
  public readonly warningsAreAllowed: boolean = true;

  private readonly _record: IBuildCacheRecord;

  public constructor(record: IBuildCacheRecord, name: string) {
    this.name = name;
    this._record = record;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { _record: record } = this;
    const { project, phase, projectBuildCache, willWriteCache } = record;

    if (!projectBuildCache || !willWriteCache) {
      return OperationStatus.Skipped;
    }

    const logWritable: ProjectLogWritable = new ProjectLogWritable(
      project,
      () => context.collatedWriter.terminal,
      `${phase.logFilenameIdentifier}.cache.write`
    );

    try {
      //#region OPERATION LOGGING
      // TERMINAL PIPELINE:
      //
      // normalizeNewlineTransform --> stderrLineTransform --2--> removeColorsTransform --> projectLogWritable
      //                                                     |
      //                                                     +--> stdioSummarizer
      const removeColorsTransform: TextRewriterTransform = new TextRewriterTransform({
        destination: logWritable,
        removeColors: true,
        normalizeNewlines: NewlineKind.OsDefault
      });

      const splitterTransform: SplitterTransform = new SplitterTransform({
        destinations: [removeColorsTransform, context.stdioSummarizer]
      });

      const stderrLineTransform: StderrLineTransform = new StderrLineTransform({
        destination: splitterTransform,
        newlineKind: NewlineKind.Lf // for StdioSummarizer
      });

      const collatedTerminal: CollatedTerminal = new CollatedTerminal(stderrLineTransform);
      const terminalProvider: CollatedTerminalProvider = new CollatedTerminalProvider(collatedTerminal, {
        debugEnabled: context.debugMode
      });
      const terminal: Terminal = new Terminal(terminalProvider);
      //#endregion

      // If the command is successful, we can calculate project hash, and no dependencies were skipped,
      // write a new cache entry.
      const cacheWriteSuccess: boolean = await projectBuildCache.trySetCacheEntryAsync(terminal);

      stderrLineTransform.close();

      if (terminalProvider.hasErrors) {
        return OperationStatus.Failure;
      }

      if (cacheWriteSuccess === false) {
        return OperationStatus.SuccessWithWarning;
      }

      return OperationStatus.Success;
    } finally {
      logWritable.close();
    }
  }

  public getConfigHash(): string {
    return 'read';
  }
}

/**
 * Core phased command plugin that implements the build cache logic.
 */
export class BuildCachePlugin implements IPhasedCommandPlugin {
  private readonly _options: IBuildCachePluginOptions;

  public constructor(options: IBuildCachePluginOptions) {
    this._options = options;
  }

  public apply(hooks: PhasedCommandHooks): void {
    const stateMap: WeakMap<Operation, IBuildCacheRecord> = new WeakMap();

    let projectChangeAnalyzer!: ProjectChangeAnalyzer;

    const { allowWarningsInSuccessfulBuild, terminal, buildCacheConfiguration, isIncrementalBuildAllowed } =
      this._options;

    const isCacheWriteAllowed: boolean =
      buildCacheConfiguration.buildCacheEnabled && buildCacheConfiguration.cacheWriteEnabled;

    if (!buildCacheConfiguration.buildCacheEnabled) {
      terminal.writeLine(`The build cache has been disabled.`);
      return;
    }

    hooks.createOperations.tapPromise(
      {
        name: PLUGIN_NAME,
        stage: STAGE_CREATE_CACHE_OPERATIONS
      },
      async (operations: Set<Operation>, context: ICreateOperationsContext): Promise<Set<Operation>> => {
        projectChangeAnalyzer = context.projectChangeAnalyzer;
        const { projectConfigurations } = context;

        const buildCacheOperations: Set<Operation> = new Set();

        await Async.forEachAsync(operations, async (operation: Operation) => {
          const { associatedProject, associatedPhase, runner } = operation;
          if (!associatedProject || !associatedPhase || !runner) {
            return;
          }

          const { name: phaseName } = associatedPhase;

          const fileHashes: Map<string, string> | undefined =
            await projectChangeAnalyzer._tryGetProjectDependenciesAsync(associatedProject, terminal);

          if (!fileHashes) {
            throw new Error(
              `Build cache is only supported if running in a Git repository. Either disable the build cache or run Rush in a Git repository.`
            );
          }

          const operationMetadataManager: OperationMetadataManager = new OperationMetadataManager({
            phase: associatedPhase,
            rushProject: associatedProject
          });

          const trackedProjectFiles: string[] = Array.from(fileHashes.keys());

          let projectBuildCache: ProjectBuildCache | undefined;
          let cacheDisabledReason: string | undefined;

          const { logPath, errorLogPath } = ProjectLogWritable.getLogFilePaths(
            associatedProject,
            associatedPhase.logFilenameIdentifier
          );

          const buildCacheRecord: IBuildCacheRecord = {
            project: associatedProject,
            phase: associatedPhase,
            projectBuildCache,
            allowCacheWrite: isCacheWriteAllowed,
            logPath,
            errorLogPath,
            operationMetadataManager,
            cacheDisabledReason
          };

          stateMap.set(operation, buildCacheRecord);

          const projectConfiguration: RushProjectConfiguration | undefined =
            projectConfigurations.get(associatedProject);

          if (projectConfiguration) {
            if (projectConfiguration.disableBuildCacheForProject) {
              buildCacheRecord.cacheDisabledReason = 'Caching has been disabled for this project.';
            } else {
              const operationSettings: IOperationSettings | undefined =
                projectConfiguration.operationSettingsByOperationName.get(phaseName);
              if (!operationSettings) {
                buildCacheRecord.cacheDisabledReason = `This project does not define the caching behavior of the "${phaseName}" command, so caching has been disabled.`;
              } else if (operationSettings.disableBuildCacheForOperation) {
                buildCacheRecord.cacheDisabledReason = `Caching has been disabled for this project's "${phaseName}" command.`;
              } else {
                const projectOutputFolderNames: ReadonlyArray<string> =
                  operationSettings.outputFolderNames || [];

                const additionalProjectOutputFilePaths: ReadonlyArray<string> = [
                  ...(operationMetadataManager?.relativeFilepaths || [])
                ];

                const additionalContext: Record<string, string> = {};
                if (operationSettings.dependsOnEnvVars) {
                  for (const varName of operationSettings.dependsOnEnvVars) {
                    additionalContext['$' + varName] = process.env[varName] || '';
                  }
                }

                if (operationSettings.dependsOnAdditionalFiles) {
                  const repoState: IRawRepoState | undefined =
                    await projectChangeAnalyzer._ensureInitializedAsync(terminal);

                  const additionalFiles: Map<string, string> = await getHashesForGlobsAsync(
                    operationSettings.dependsOnAdditionalFiles,
                    associatedProject.projectFolder,
                    repoState
                  );

                  terminal.writeDebugLine(
                    `Including additional files to calculate build cache hash for ${
                      runner.name
                    }:\n  ${Array.from(additionalFiles.keys()).join('\n  ')} `
                  );

                  for (const [filePath, fileHash] of additionalFiles) {
                    additionalContext['file://' + filePath] = fileHash;
                  }
                }

                buildCacheRecord.projectBuildCache = await ProjectBuildCache.tryGetProjectBuildCache({
                  projectConfiguration,
                  projectOutputFolderNames,
                  additionalProjectOutputFilePaths,
                  additionalContext,
                  buildCacheConfiguration,
                  terminal,
                  command: runner.getConfigHash(),
                  trackedProjectFiles,
                  projectChangeAnalyzer,
                  phaseName
                });

                if (isIncrementalBuildAllowed) {
                  const readOperation: Operation = new Operation({
                    project: associatedProject,
                    phase: associatedPhase,
                    runner: new BuildCacheReadOperationRunner(
                      buildCacheRecord,
                      `${operation.name} (cache read)`
                    )
                  });
                  operation.addDependency(readOperation);
                  buildCacheOperations.add(readOperation);
                }

                if (isCacheWriteAllowed) {
                  const writeOperation: Operation = new Operation({
                    project: associatedProject,
                    phase: associatedPhase,
                    runner: new BuildCacheWriteOperationRunner(
                      buildCacheRecord,
                      `${operation.name} (cache write)`
                    )
                  });
                  writeOperation.addDependency(operation);
                  buildCacheOperations.add(writeOperation);
                }
              }
            }
          } else {
            buildCacheRecord.cacheDisabledReason =
              `Project does not have a ${RushConstants.rushProjectConfigFilename} configuration file, ` +
              'or one provided by a rig, so it does not support caching.';
          }
        });

        for (const operation of buildCacheOperations) {
          operations.add(operation);
        }

        return operations;
      }
    );

    if (isIncrementalBuildAllowed) {
      hooks.beforeExecuteOperation.tapPromise(
        PLUGIN_NAME,
        async (
          record: IOperationRunnerContext & IOperationExecutionResult,
          context: IAsyncTaskContext
        ): Promise<OperationStatus | undefined> => {
          const { operation } = record;
          const buildCacheRecord: IBuildCacheRecord | undefined = stateMap.get(operation);
          if (!buildCacheRecord) {
            // This operation doesn't support the build cache.
            return;
          }

          if (!operation.runner?.supportsIncremental) {
            return;
          }

          const { readFromCache } = buildCacheRecord;

          if (readFromCache) {
            const { operationMetadataManager, logPath, errorLogPath } = buildCacheRecord;

            const cacheConsoleWritable: TerminalWritable = record.quietMode
              ? new DiscardStdoutTransform({
                  destination: record.collatedWriter
                })
              : record.collatedWriter;

            const cacheCollatedTerminal: CollatedTerminal = new CollatedTerminal(cacheConsoleWritable);

            const buildCacheTerminalProvider: CollatedTerminalProvider = new CollatedTerminalProvider(
              cacheCollatedTerminal,
              {
                debugEnabled: record.debugMode
              }
            );
            const buildCacheTerminal: Terminal = new Terminal(buildCacheTerminalProvider);
            // Restore the original state of the operation without cache
            await operationMetadataManager.tryRestoreAsync({
              terminal: buildCacheTerminal,
              logPath,
              errorLogPath
            });
            // eslint-disable-next-line require-atomic-updates
            record.nonCachedDurationMs = operationMetadataManager.stateFile.state?.nonCachedDurationMs;

            return OperationStatus.FromCache;
          }
        }
      );
    }

    /**
     * After an operation executes, need to update whether or not downstream operations can write to the cache.
     * Also need to persist the metadata for the operation.
     */
    if (isCacheWriteAllowed) {
      hooks.afterExecuteOperation.tapPromise(
        PLUGIN_NAME,
        async (
          record: IOperationRunnerContext & IOperationExecutionResult,
          context: IAsyncTaskContext
        ): Promise<OperationStatus | undefined> => {
          const { operation } = record;
          const buildCacheRecord: IBuildCacheRecord | undefined = stateMap.get(operation);
          if (!buildCacheRecord) {
            return;
          }

          const { status } = record;

          const taskIsSuccessful: boolean =
            status === OperationStatus.Success ||
            (status === OperationStatus.SuccessWithWarning &&
              operation.runner!.warningsAreAllowed &&
              allowWarningsInSuccessfulBuild);

          buildCacheRecord.willWriteCache = taskIsSuccessful && buildCacheRecord.allowCacheWrite;

          if (status === OperationStatus.Skipped || !buildCacheRecord.willWriteCache) {
            for (const consumer of operation.consumers) {
              const consumerRecord: IBuildCacheRecord | undefined = stateMap.get(consumer);
              if (consumerRecord) {
                consumerRecord.allowCacheWrite = false;
              }
            }
            return;
          }

          if (taskIsSuccessful) {
            const { logPath, errorLogPath } = buildCacheRecord;

            // If the operation without cache was successful, we can save the metadata to disk
            const { duration: durationInSeconds } = record.stopwatch;
            const { operationMetadataManager } = buildCacheRecord;
            await operationMetadataManager.saveAsync({
              durationInSeconds,
              logPath,
              errorLogPath
            });
          }
        }
      );
    }
  }
}
