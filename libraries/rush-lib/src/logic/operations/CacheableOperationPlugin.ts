// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as crypto from 'crypto';
import {
  Async,
  ColorValue,
  FileSystem,
  InternalError,
  ITerminal,
  JsonFile,
  JsonObject,
  Sort,
  Terminal
} from '@rushstack/node-core-library';
import { CollatedTerminal, CollatedWriter } from '@rushstack/stream-collator';
import { DiscardStdoutTransform, PrintUtilities } from '@rushstack/terminal';
import { SplitterTransform, TerminalWritable } from '@rushstack/terminal';

import { CollatedTerminalProvider } from '../../utilities/CollatedTerminalProvider';
import { OperationStatus } from './OperationStatus';
import { CobuildLock, ICobuildCompletedState } from '../cobuild/CobuildLock';
import { ProjectBuildCache } from '../buildCache/ProjectBuildCache';
import { RushConstants } from '../RushConstants';
import { IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { getHashesForGlobsAsync } from '../buildCache/getHashesForGlobsAsync';
import { ProjectLogWritable } from './ProjectLogWritable';
import { CobuildConfiguration } from '../../api/CobuildConfiguration';
import { DisjointSet } from '../cobuild/DisjointSet';
import { PeriodicCallback } from './PeriodicCallback';
import { NullTerminalProvider } from '../../utilities/NullTerminalProvider';

import type { Operation } from './Operation';
import type { IOperationRunnerContext } from './IOperationRunner';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IPhase } from '../../api/CommandLineConfiguration';
import type { IRawRepoState, ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import type { OperationMetadataManager } from './OperationMetadataManager';
import type { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import type { OperationExecutionRecord } from './OperationExecutionRecord';

const PLUGIN_NAME: 'CacheablePhasedOperationPlugin' = 'CacheablePhasedOperationPlugin';
const PERIODIC_CALLBACK_INTERVAL_IN_SECONDS: number = 10;

export interface IProjectDeps {
  files: { [filePath: string]: string };
  arguments: string;
}

export interface IOperationBuildCacheContext {
  isCacheWriteAllowed: boolean;
  isCacheReadAllowed: boolean;
  isSkipAllowed: boolean;
  projectBuildCache: ProjectBuildCache | undefined;
  cobuildLock: CobuildLock | undefined;
  // The id of the cluster contains the operation, used when acquiring cobuild lock
  cobuildClusterId: string | undefined;
  // Controls the log for the cache subsystem
  buildCacheTerminal: ITerminal | undefined;
  buildCacheProjectLogWritable: ProjectLogWritable | undefined;
  periodicCallback: PeriodicCallback;
  projectDeps: IProjectDeps | undefined;
  currentDepsPath: string | undefined;
  cacheRestored: boolean;
}

export class CacheableOperationPlugin implements IPhasedCommandPlugin {
  private _buildCacheContextByOperationExecutionRecord: Map<
    OperationExecutionRecord,
    IOperationBuildCacheContext
  > = new Map<OperationExecutionRecord, IOperationBuildCacheContext>();

  private _createContext: ICreateOperationsContext | undefined;

  public apply(hooks: PhasedCommandHooks): void {
    hooks.beforeExecuteOperations.tapPromise(
      PLUGIN_NAME,
      async (
        recordByOperation: Map<Operation, IOperationExecutionResult>,
        context: ICreateOperationsContext
      ): Promise<void> => {
        const { buildCacheConfiguration, isIncrementalBuildAllowed, cobuildConfiguration } = context;
        if (!buildCacheConfiguration) {
          return;
        }

        this._createContext = context;

        let disjointSet: DisjointSet<OperationExecutionRecord> | undefined;
        if (cobuildConfiguration?.cobuildEnabled) {
          disjointSet = new DisjointSet<OperationExecutionRecord>();
        }

        const records: IterableIterator<OperationExecutionRecord> =
          recordByOperation.values() as IterableIterator<OperationExecutionRecord>;

        for (const record of records) {
          disjointSet?.add(record);
          const buildCacheContext: IOperationBuildCacheContext = {
            // Supports cache writes by default.
            isCacheWriteAllowed: true,
            isCacheReadAllowed: isIncrementalBuildAllowed,
            isSkipAllowed: isIncrementalBuildAllowed,
            projectBuildCache: undefined,
            cobuildLock: undefined,
            cobuildClusterId: undefined,
            buildCacheTerminal: undefined,
            buildCacheProjectLogWritable: undefined,
            periodicCallback: new PeriodicCallback({
              interval: PERIODIC_CALLBACK_INTERVAL_IN_SECONDS * 1000
            }),
            projectDeps: undefined,
            currentDepsPath: undefined,
            cacheRestored: false
          };
          // Upstream runners may mutate the property of build cache context for downstream runners
          this._buildCacheContextByOperationExecutionRecord.set(record, buildCacheContext);
        }

        if (disjointSet) {
          // If disjoint set exists, connect build cache disabled project with its consumers
          await Async.forEachAsync(
            records,
            async (record: OperationExecutionRecord) => {
              const { associatedProject: project, associatedPhase: phase } = record;
              if (project && phase) {
                const buildCacheEnabled: boolean = await this._tryGetProjectBuildCacheEnabledAsync({
                  buildCacheConfiguration,
                  rushProject: project,
                  commandName: phase.name
                });
                if (!buildCacheEnabled) {
                  /**
                   * Group the project build cache disabled with its consumers. This won't affect too much in
                   * a monorepo with high build cache coverage.
                   *
                   * The mental model is that if X disables the cache, and Y depends on X, then:
                   *   1. Y must be built by the same VM that build X;
                   *   2. OR, Y must be rebuilt on each VM that needs it.
                   * Approach 1 is probably the better choice.
                   */
                  for (const consumer of record.consumers) {
                    disjointSet?.union(record, consumer);
                  }
                }
              }
            },
            {
              concurrency: 10
            }
          );

          for (const set of disjointSet.getAllSets()) {
            if (cobuildConfiguration?.cobuildEnabled && cobuildConfiguration.cobuildContextId) {
              // Get a deterministic ordered array of operations, which is important to get a deterministic cluster id.
              const groupedRecords: OperationExecutionRecord[] = Array.from(set);
              Sort.sortBy(groupedRecords, (record: OperationExecutionRecord) => {
                return record.runner.name;
              });

              // Generates cluster id, cluster id comes from the project folder and phase name of all operations in the same cluster.
              const hash: crypto.Hash = crypto.createHash('sha1');
              for (const record of groupedRecords) {
                const { associatedPhase: phase, associatedProject: project } = record;
                if (project && phase) {
                  hash.update(project.projectRelativeFolder);
                  hash.update(RushConstants.hashDelimiter);
                  hash.update(phase.name);
                  hash.update(RushConstants.hashDelimiter);
                }
              }
              const cobuildClusterId: string = hash.digest('hex');

              // Assign same cluster id to all operations in the same cluster.
              for (const record of groupedRecords) {
                const buildCacheContext: IOperationBuildCacheContext =
                  this._getBuildCacheContextByOperationExecutionRecordOrThrow(record);
                buildCacheContext.cobuildClusterId = cobuildClusterId;
              }
            }
          }
        }
      }
    );

    hooks.beforeExecuteOperation.tapPromise(
      PLUGIN_NAME,
      async (runnerContext: IOperationRunnerContext): Promise<OperationStatus | undefined> => {
        const { _createContext: createContext } = this;
        if (!createContext) {
          return;
        }
        const {
          projectChangeAnalyzer,
          buildCacheConfiguration,
          cobuildConfiguration,
          phaseSelection: selectedPhases
        } = createContext;

        const record: OperationExecutionRecord = runnerContext as OperationExecutionRecord;
        const {
          associatedProject: project,
          associatedPhase: phase,
          _operationMetadataManager: operationMetadataManager
        } = record;

        if (!project || !phase) {
          return;
        }

        const buildCacheContext: IOperationBuildCacheContext | undefined =
          this._getBuildCacheContextByOperationExecutionRecord(record);

        if (!buildCacheContext) {
          return;
        }

        const runBeforeExecute = async ({
          projectChangeAnalyzer,
          buildCacheConfiguration,
          cobuildConfiguration,
          selectedPhases,
          project,
          phase,
          operationMetadataManager,
          buildCacheContext,
          record
        }: {
          projectChangeAnalyzer: ProjectChangeAnalyzer;
          buildCacheConfiguration: BuildCacheConfiguration | undefined;
          cobuildConfiguration: CobuildConfiguration | undefined;
          selectedPhases: ReadonlySet<IPhase>;
          project: RushConfigurationProject;
          phase: IPhase;
          operationMetadataManager: OperationMetadataManager | undefined;
          buildCacheContext: IOperationBuildCacheContext;
          record: OperationExecutionRecord;
        }): Promise<OperationStatus | undefined> => {
          const buildCacheTerminal: ITerminal = this._getBuildCacheTerminal({
            record,
            buildCacheConfiguration,
            rushProject: project,
            logFilenameIdentifier: phase.logFilenameIdentifier,
            quietMode: record.quietMode,
            debugMode: record.debugMode
          });
          buildCacheContext.buildCacheTerminal = buildCacheTerminal;

          const commandToRun: string = record.runner.commandToRun || '';

          const packageDepsFilename: string = `package-deps_${phase.logFilenameIdentifier}.json`;
          const currentDepsPath: string = path.join(project.projectRushTempFolder, packageDepsFilename);
          buildCacheContext.currentDepsPath = currentDepsPath;

          let projectDeps: IProjectDeps | undefined;
          let trackedProjectFiles: string[] | undefined;
          try {
            const fileHashes: Map<string, string> | undefined =
              await createContext.projectChangeAnalyzer._tryGetProjectDependenciesAsync(
                project,
                buildCacheTerminal
              );

            if (fileHashes) {
              const files: { [filePath: string]: string } = {};
              trackedProjectFiles = [];
              for (const [filePath, fileHash] of fileHashes) {
                files[filePath] = fileHash;
                trackedProjectFiles.push(filePath);
              }

              projectDeps = {
                files,
                arguments: commandToRun
              };
              buildCacheContext.projectDeps = projectDeps;
            }
          } catch (error) {
            // To test this code path:
            // Delete a project's ".rush/temp/shrinkwrap-deps.json" then run "rush build --verbose"
            buildCacheTerminal.writeLine(
              'Unable to calculate incremental state: ' + (error as Error).toString()
            );
            buildCacheTerminal.writeLine({
              text: 'Rush will proceed without incremental execution, caching, and change detection.',
              foregroundColor: ColorValue.Cyan
            });
          }

          if (!projectDeps && buildCacheContext.isSkipAllowed) {
            // To test this code path:
            // Remove the `.git` folder then run "rush build --verbose"
            buildCacheTerminal.writeLine({
              text: PrintUtilities.wrapWords(
                'This workspace does not appear to be tracked by Git. ' +
                  'Rush will proceed without incremental execution, caching, and change detection.'
              ),
              foregroundColor: ColorValue.Cyan
            });
          }

          // If the deps file exists, remove it before starting execution.
          FileSystem.deleteFile(currentDepsPath);

          // TODO: Remove legacyDepsPath with the next major release of Rush
          const legacyDepsPath: string = path.join(project.projectFolder, 'package-deps.json');
          // Delete the legacy package-deps.json
          FileSystem.deleteFile(legacyDepsPath);

          // No-op command
          if (!commandToRun) {
            // Write deps on success.
            if (projectDeps) {
              JsonFile.save(projectDeps, currentDepsPath, {
                ensureFolderExists: true
              });
            }
            return OperationStatus.NoOp;
          }

          let projectBuildCache: ProjectBuildCache | undefined = await this._tryGetProjectBuildCacheAsync({
            record,
            buildCacheConfiguration,
            rushProject: project,
            phase,
            selectedPhases,
            projectChangeAnalyzer,
            commandToRun,
            terminal: buildCacheTerminal,
            trackedProjectFiles,
            operationMetadataManager
          });

          // Try to acquire the cobuild lock
          let cobuildLock: CobuildLock | undefined;
          if (cobuildConfiguration?.cobuildEnabled) {
            if (
              cobuildConfiguration?.cobuildLeafProjectLogOnlyAllowed &&
              record.consumers.size === 0 &&
              !projectBuildCache
            ) {
              // When the leaf project log only is allowed and the leaf project is build cache "disabled", try to get
              // a log files only project build cache
              projectBuildCache = await this._tryGetLogOnlyProjectBuildCacheAsync({
                buildCacheConfiguration,
                cobuildConfiguration,
                record,
                rushProject: project,
                phase,
                projectChangeAnalyzer,
                commandToRun,
                terminal: buildCacheTerminal,
                trackedProjectFiles,
                operationMetadataManager
              });
              if (projectBuildCache) {
                buildCacheTerminal.writeVerboseLine(
                  `Log files only build cache is enabled for the project "${project.packageName}" because the cobuild leaf project log only is allowed`
                );
              } else {
                buildCacheTerminal.writeWarningLine(
                  `Failed to get log files only build cache for the project "${project.packageName}"`
                );
              }
            }

            cobuildLock = await this._tryGetCobuildLockAsync({
              record,
              projectBuildCache,
              cobuildConfiguration,
              packageName: project.packageName,
              phaseName: phase.name
            });
          }

          // eslint-disable-next-line require-atomic-updates -- we are mutating the build cache context intentionally
          buildCacheContext.cobuildLock = cobuildLock;

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
          //     the process of running dependents, it will be changed by this plugin to
          //     false if a dependency wasn't able to be skipped.
          //
          let buildCacheReadAttempted: boolean = false;

          const { logPath, errorLogPath } = ProjectLogWritable.getLogFilePaths({
            project,
            logFilenameIdentifier: phase.logFilenameIdentifier
          });
          const restoreCacheAsync = async (
            projectBuildCache: ProjectBuildCache | undefined,
            specifiedCacheId?: string
          ): Promise<boolean> => {
            const restoreFromCacheSuccess: boolean | undefined =
              await projectBuildCache?.tryRestoreFromCacheAsync(buildCacheTerminal, specifiedCacheId);
            if (restoreFromCacheSuccess) {
              // Restore the original state of the operation without cache
              await operationMetadataManager?.tryRestoreAsync({
                terminal: buildCacheTerminal,
                logPath,
                errorLogPath
              });
              buildCacheContext.cacheRestored = true;
            }
            return Boolean(restoreFromCacheSuccess);
          };
          if (cobuildLock) {
            // handling rebuilds. "rush rebuild" or "rush retest" command will save operations to
            // the build cache once completed, but does not retrieve them (since the "incremental"
            // flag is disabled). However, we still need a cobuild to be able to retrieve a finished
            // build from another cobuild in this case.
            const cobuildCompletedState: ICobuildCompletedState | undefined =
              await cobuildLock.getCompletedStateAsync();
            if (cobuildCompletedState) {
              const { status, cacheId } = cobuildCompletedState;

              const restoreFromCacheSuccess: boolean = await restoreCacheAsync(
                cobuildLock.projectBuildCache,
                cacheId
              );

              if (restoreFromCacheSuccess) {
                if (cobuildCompletedState) {
                  return cobuildCompletedState.status;
                }
                return status;
              }
            }
          } else if (buildCacheContext.isCacheReadAllowed) {
            buildCacheReadAttempted = !!projectBuildCache;
            const restoreFromCacheSuccess: boolean = await restoreCacheAsync(projectBuildCache);

            if (restoreFromCacheSuccess) {
              return OperationStatus.FromCache;
            }
          }
          if (buildCacheContext.isSkipAllowed && !buildCacheReadAttempted) {
            let lastProjectDeps: IProjectDeps | undefined = undefined;
            try {
              lastProjectDeps = JsonFile.load(currentDepsPath);
            } catch (e) {
              // Warn and ignore - treat failing to load the file as the project being not built.
              buildCacheTerminal.writeWarningLine(
                `Warning: error parsing ${packageDepsFilename}: ${e}. Ignoring and ` +
                  `treating the command "${commandToRun}" as not run.`
              );
            }

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

          if (buildCacheContext.isCacheWriteAllowed && cobuildLock) {
            const acquireSuccess: boolean = await cobuildLock.tryAcquireLockAsync();
            if (acquireSuccess) {
              const { periodicCallback } = buildCacheContext;
              periodicCallback.addCallback(async () => {
                await cobuildLock?.renewLockAsync();
              });
              periodicCallback.start();
            } else {
              // failed to acquire the lock, mark current operation to remote executing
              return OperationStatus.RemoteExecuting;
            }
          }
        };

        try {
          const earlyReturnStatus: OperationStatus | undefined = await runBeforeExecute({
            projectChangeAnalyzer,
            buildCacheConfiguration,
            cobuildConfiguration,
            selectedPhases,
            project,
            phase,
            operationMetadataManager,
            buildCacheContext,
            record
          });
          return earlyReturnStatus;
        } catch (e) {
          buildCacheContext.buildCacheProjectLogWritable?.close();
          throw e;
        }
      }
    );

    hooks.afterExecuteOperation.tapPromise(
      PLUGIN_NAME,
      async (runnerContext: IOperationRunnerContext): Promise<void> => {
        const record: OperationExecutionRecord = runnerContext as OperationExecutionRecord;
        const {
          status,
          consumers,
          changedProjectsOnly,
          stopwatch,
          _operationMetadataManager: operationMetadataManager,
          associatedProject: project,
          associatedPhase: phase
        } = record;

        if (!project || !phase || record.status === OperationStatus.NoOp) {
          return;
        }

        const buildCacheContext: IOperationBuildCacheContext | undefined =
          this._getBuildCacheContextByOperationExecutionRecord(record);

        if (!buildCacheContext) {
          return;
        }
        const {
          cobuildLock,
          projectBuildCache,
          isCacheWriteAllowed,
          buildCacheTerminal,
          projectDeps,
          currentDepsPath,
          cacheRestored
        } = buildCacheContext;

        try {
          if (!cacheRestored) {
            // Save the metadata to disk
            const { logFilenameIdentifier } = phase;
            const { duration: durationInSeconds } = stopwatch;
            const { logPath, errorLogPath } = ProjectLogWritable.getLogFilePaths({
              project,
              logFilenameIdentifier
            });
            await operationMetadataManager?.saveAsync({
              durationInSeconds,
              cobuildContextId: cobuildLock?.cobuildConfiguration.cobuildContextId,
              cobuildRunnerId: cobuildLock?.cobuildConfiguration.cobuildRunnerId,
              logPath,
              errorLogPath
            });
          }

          if (!buildCacheTerminal) {
            // This should not happen
            throw new InternalError(`Build Cache Terminal is not created`);
          }

          let setCompletedStatePromiseFunction: (() => Promise<void> | undefined) | undefined;
          let setCacheEntryPromise: (() => Promise<boolean> | undefined) | undefined;
          if (cobuildLock && isCacheWriteAllowed) {
            if (record.error) {
              // In order to prevent the worst case that all cobuild tasks go through the same failure,
              // allowing a failing build to be cached and retrieved, print the error message to the terminal
              // and clear the error in context.
              const message: string | undefined = record.error?.message;
              if (message) {
                record.collatedWriter.terminal.writeStderrLine(message);
              }
              record.error = undefined;
            }
            const { cacheId, contextId } = cobuildLock.cobuildContext;

            const finalCacheId: string =
              status === OperationStatus.Failure ? `${cacheId}-${contextId}-failed` : cacheId;
            switch (status) {
              case OperationStatus.SuccessWithWarning:
              case OperationStatus.Success:
              case OperationStatus.Failure: {
                const currentStatus: ICobuildCompletedState['status'] = status;
                setCompletedStatePromiseFunction = () => {
                  return cobuildLock?.setCompletedStateAsync({
                    status: currentStatus,
                    cacheId: finalCacheId
                  });
                };
                setCacheEntryPromise = () =>
                  cobuildLock.projectBuildCache.trySetCacheEntryAsync(buildCacheTerminal, finalCacheId);
              }
            }
          }

          const taskIsSuccessful: boolean =
            status === OperationStatus.Success ||
            (status === OperationStatus.SuccessWithWarning &&
              record.runner.warningsAreAllowed &&
              !!project.rushConfiguration.experimentsConfiguration.configuration
                .buildCacheWithAllowWarningsInSuccessfulBuild);

          if (taskIsSuccessful && projectDeps && currentDepsPath) {
            // Write deps on success.
            await JsonFile.saveAsync(projectDeps, currentDepsPath, {
              ensureFolderExists: true
            });
          }

          // If the command is successful, we can calculate project hash, and no dependencies were skipped,
          // write a new cache entry.
          if (!setCacheEntryPromise && taskIsSuccessful && isCacheWriteAllowed && projectBuildCache) {
            setCacheEntryPromise = () => projectBuildCache.trySetCacheEntryAsync(buildCacheTerminal);
          }
          if (!cacheRestored) {
            const cacheWriteSuccess: boolean | undefined = await setCacheEntryPromise?.();
            await setCompletedStatePromiseFunction?.();

            if (cacheWriteSuccess === false && status === OperationStatus.Success) {
              record.status = OperationStatus.SuccessWithWarning;
            }
          }

          // Status changes to direct dependents
          let blockCacheWrite: boolean = !buildCacheContext?.isCacheWriteAllowed;
          let blockSkip: boolean = !buildCacheContext?.isSkipAllowed;

          switch (record.status) {
            case OperationStatus.Skipped: {
              // Skipping means cannot guarantee integrity, so prevent cache writes in dependents.
              blockCacheWrite = true;
              break;
            }

            case OperationStatus.SuccessWithWarning:
            case OperationStatus.Success: {
              // Legacy incremental build, if asked, prevent skip in dependents if the operation executed.
              blockSkip ||= !changedProjectsOnly;
              break;
            }
          }

          // Apply status changes to direct dependents
          for (const consumer of consumers) {
            const consumerBuildCacheContext: IOperationBuildCacheContext | undefined =
              this._getBuildCacheContextByOperationExecutionRecord(consumer);
            if (consumerBuildCacheContext) {
              if (blockCacheWrite) {
                consumerBuildCacheContext.isCacheWriteAllowed = false;
              }
              if (blockSkip) {
                consumerBuildCacheContext.isSkipAllowed = false;
              }
            }
          }
        } finally {
          buildCacheContext.buildCacheProjectLogWritable?.close();
          buildCacheContext.periodicCallback.stop();
        }
      }
    );

    hooks.afterExecuteOperations.tapPromise(PLUGIN_NAME, async () => {
      this._buildCacheContextByOperationExecutionRecord.clear();
    });
  }

  private _getBuildCacheContextByOperationExecutionRecord(
    record: OperationExecutionRecord
  ): IOperationBuildCacheContext | undefined {
    const buildCacheContext: IOperationBuildCacheContext | undefined =
      this._buildCacheContextByOperationExecutionRecord.get(record);
    return buildCacheContext;
  }

  private _getBuildCacheContextByOperationExecutionRecordOrThrow(
    record: OperationExecutionRecord
  ): IOperationBuildCacheContext {
    const buildCacheContext: IOperationBuildCacheContext | undefined =
      this._getBuildCacheContextByOperationExecutionRecord(record);
    if (!buildCacheContext) {
      // This should not happen
      throw new InternalError(`Build cache context for runner ${record.name} should be defined`);
    }
    return buildCacheContext;
  }

  private async _tryGetProjectBuildCacheEnabledAsync({
    buildCacheConfiguration,
    rushProject,
    commandName
  }: {
    buildCacheConfiguration: BuildCacheConfiguration;
    rushProject: RushConfigurationProject;
    commandName: string;
  }): Promise<boolean> {
    const nullTerminalProvider: NullTerminalProvider = new NullTerminalProvider();
    // This is a silent terminal
    const terminal: ITerminal = new Terminal(nullTerminalProvider);

    if (buildCacheConfiguration && buildCacheConfiguration.buildCacheEnabled) {
      const projectConfiguration: RushProjectConfiguration | undefined =
        await RushProjectConfiguration.tryLoadForProjectAsync(rushProject, terminal);
      if (projectConfiguration && projectConfiguration.disableBuildCacheForProject) {
        const operationSettings: IOperationSettings | undefined =
          projectConfiguration.operationSettingsByOperationName.get(commandName);
        if (operationSettings && !operationSettings.disableBuildCacheForOperation) {
          return true;
        }
      }
    }
    return false;
  }

  private async _tryGetProjectBuildCacheAsync({
    buildCacheConfiguration,
    record,
    rushProject,
    phase,
    selectedPhases,
    projectChangeAnalyzer,
    commandToRun,
    terminal,
    trackedProjectFiles,
    operationMetadataManager
  }: {
    record: OperationExecutionRecord;
    buildCacheConfiguration: BuildCacheConfiguration | undefined;
    rushProject: RushConfigurationProject;
    phase: IPhase;
    selectedPhases: Iterable<IPhase>;
    projectChangeAnalyzer: ProjectChangeAnalyzer;
    commandToRun: string;
    terminal: ITerminal;
    trackedProjectFiles: string[] | undefined;
    operationMetadataManager: OperationMetadataManager | undefined;
  }): Promise<ProjectBuildCache | undefined> {
    const buildCacheContext: IOperationBuildCacheContext =
      this._getBuildCacheContextByOperationExecutionRecordOrThrow(record);
    if (!buildCacheContext.projectBuildCache) {
      if (buildCacheConfiguration && buildCacheConfiguration.buildCacheEnabled) {
        // Disable legacy skip logic if the build cache is in play
        buildCacheContext.isSkipAllowed = false;

        const projectConfiguration: RushProjectConfiguration | undefined =
          await RushProjectConfiguration.tryLoadForProjectAsync(rushProject, terminal);
        if (projectConfiguration) {
          const commandName: string = phase.name;
          projectConfiguration.validatePhaseConfiguration(selectedPhases, terminal);
          if (projectConfiguration.disableBuildCacheForProject) {
            terminal.writeVerboseLine('Caching has been disabled for this project.');
          } else {
            const operationSettings: IOperationSettings | undefined =
              projectConfiguration.operationSettingsByOperationName.get(commandName);
            if (!operationSettings) {
              terminal.writeVerboseLine(
                `This project does not define the caching behavior of the "${commandName}" command, so caching has been disabled.`
              );
            } else if (operationSettings.disableBuildCacheForOperation) {
              terminal.writeVerboseLine(
                `Caching has been disabled for this project's "${commandName}" command.`
              );
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
                  rushProject.projectFolder,
                  repoState
                );

                terminal.writeDebugLine(
                  `Including additional files to calculate build cache hash:\n  ${Array.from(
                    additionalFiles.keys()
                  ).join('\n  ')} `
                );

                for (const [filePath, fileHash] of additionalFiles) {
                  additionalContext['file://' + filePath] = fileHash;
                }
              }
              buildCacheContext.projectBuildCache = await ProjectBuildCache.tryGetProjectBuildCache({
                project: rushProject,
                projectOutputFolderNames,
                additionalProjectOutputFilePaths,
                additionalContext,
                buildCacheConfiguration,
                terminal,
                command: commandToRun,
                trackedProjectFiles: trackedProjectFiles,
                projectChangeAnalyzer: projectChangeAnalyzer,
                phaseName: phase.name
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

    return buildCacheContext.projectBuildCache;
  }

  // Get a ProjectBuildCache only cache/restore log files
  private async _tryGetLogOnlyProjectBuildCacheAsync({
    record,
    rushProject,
    terminal,
    commandToRun,
    buildCacheConfiguration,
    cobuildConfiguration,
    phase,
    trackedProjectFiles,
    projectChangeAnalyzer,
    operationMetadataManager
  }: {
    record: OperationExecutionRecord;
    buildCacheConfiguration: BuildCacheConfiguration | undefined;
    cobuildConfiguration: CobuildConfiguration;
    rushProject: RushConfigurationProject;
    phase: IPhase;
    commandToRun: string;
    terminal: ITerminal;
    trackedProjectFiles: string[] | undefined;
    projectChangeAnalyzer: ProjectChangeAnalyzer;
    operationMetadataManager: OperationMetadataManager | undefined;
  }): Promise<ProjectBuildCache | undefined> {
    const buildCacheContext: IOperationBuildCacheContext =
      this._getBuildCacheContextByOperationExecutionRecordOrThrow(record);
    if (buildCacheConfiguration && buildCacheConfiguration.buildCacheEnabled) {
      // Disable legacy skip logic if the build cache is in play
      buildCacheContext.isSkipAllowed = false;
      const projectConfiguration: RushProjectConfiguration | undefined =
        await RushProjectConfiguration.tryLoadForProjectAsync(rushProject, terminal);

      let projectOutputFolderNames: ReadonlyArray<string> = [];
      const additionalProjectOutputFilePaths: ReadonlyArray<string> = [
        ...(operationMetadataManager?.relativeFilepaths || [])
      ];
      const additionalContext: Record<string, string> = {
        // Force the cache to be a log files only cache
        logFilesOnly: '1'
      };
      if (cobuildConfiguration.cobuildContextId) {
        additionalContext.cobuildContextId = cobuildConfiguration.cobuildContextId;
      }
      if (projectConfiguration) {
        const commandName: string = phase.name;
        const operationSettings: IOperationSettings | undefined =
          projectConfiguration.operationSettingsByOperationName.get(commandName);
        if (operationSettings) {
          if (operationSettings.outputFolderNames) {
            projectOutputFolderNames = operationSettings.outputFolderNames;
          }
          if (operationSettings.dependsOnEnvVars) {
            for (const varName of operationSettings.dependsOnEnvVars) {
              additionalContext['$' + varName] = process.env[varName] || '';
            }
          }

          if (operationSettings.dependsOnAdditionalFiles) {
            const repoState: IRawRepoState | undefined = await projectChangeAnalyzer._ensureInitializedAsync(
              terminal
            );

            const additionalFiles: Map<string, string> = await getHashesForGlobsAsync(
              operationSettings.dependsOnAdditionalFiles,
              rushProject.projectFolder,
              repoState
            );

            for (const [filePath, fileHash] of additionalFiles) {
              additionalContext['file://' + filePath] = fileHash;
            }
          }
        }
      }
      const projectBuildCache: ProjectBuildCache | undefined =
        await ProjectBuildCache.tryGetProjectBuildCache({
          project: rushProject,
          projectOutputFolderNames,
          additionalProjectOutputFilePaths,
          additionalContext,
          buildCacheConfiguration,
          terminal,
          command: commandToRun,
          trackedProjectFiles,
          projectChangeAnalyzer: projectChangeAnalyzer,
          phaseName: phase.name
        });
      buildCacheContext.projectBuildCache = projectBuildCache;
      return projectBuildCache;
    }
  }

  private async _tryGetCobuildLockAsync({
    cobuildConfiguration,
    record,
    projectBuildCache,
    packageName,
    phaseName
  }: {
    cobuildConfiguration: CobuildConfiguration | undefined;
    record: OperationExecutionRecord;
    projectBuildCache: ProjectBuildCache | undefined;
    packageName: string;
    phaseName: string;
  }): Promise<CobuildLock | undefined> {
    const buildCacheContext: IOperationBuildCacheContext =
      this._getBuildCacheContextByOperationExecutionRecordOrThrow(record);
    if (!buildCacheContext.cobuildLock) {
      if (projectBuildCache && cobuildConfiguration && cobuildConfiguration.cobuildEnabled) {
        if (!buildCacheContext.cobuildClusterId) {
          // This should not happen
          throw new InternalError('Cobuild cluster id is not defined');
        }
        buildCacheContext.cobuildLock = new CobuildLock({
          cobuildConfiguration,
          projectBuildCache,
          cobuildClusterId: buildCacheContext.cobuildClusterId,
          lockExpireTimeInSeconds: PERIODIC_CALLBACK_INTERVAL_IN_SECONDS * 3,
          packageName,
          phaseName
        });
      }
    }
    return buildCacheContext.cobuildLock;
  }

  private _getBuildCacheTerminal({
    record,
    buildCacheConfiguration,
    rushProject,
    logFilenameIdentifier,
    quietMode,
    debugMode
  }: {
    record: OperationExecutionRecord;
    buildCacheConfiguration: BuildCacheConfiguration | undefined;
    rushProject: RushConfigurationProject;
    logFilenameIdentifier: string;
    quietMode: boolean;
    debugMode: boolean;
  }): ITerminal {
    const buildCacheContext: IOperationBuildCacheContext =
      this._getBuildCacheContextByOperationExecutionRecordOrThrow(record);
    if (!buildCacheContext.buildCacheTerminal) {
      buildCacheContext.buildCacheTerminal = this._createBuildCacheTerminal({
        record,
        buildCacheConfiguration,
        rushProject,
        logFilenameIdentifier,
        quietMode,
        debugMode
      });
    } else if (!buildCacheContext.buildCacheProjectLogWritable?.isOpen) {
      // The ProjectLogWritable is closed, re-create one
      buildCacheContext.buildCacheTerminal = this._createBuildCacheTerminal({
        record,
        buildCacheConfiguration,
        rushProject,
        logFilenameIdentifier,
        quietMode,
        debugMode
      });
    }

    return buildCacheContext.buildCacheTerminal;
  }

  private _createBuildCacheTerminal({
    record,
    buildCacheConfiguration,
    rushProject,
    logFilenameIdentifier,
    quietMode,
    debugMode
  }: {
    record: OperationExecutionRecord;
    buildCacheConfiguration: BuildCacheConfiguration | undefined;
    rushProject: RushConfigurationProject;
    logFilenameIdentifier: string;
    quietMode: boolean;
    debugMode: boolean;
  }): ITerminal {
    const silent: boolean = record.runner.silent;
    if (silent) {
      const nullTerminalProvider: NullTerminalProvider = new NullTerminalProvider();
      return new Terminal(nullTerminalProvider);
    }

    let cacheConsoleWritable: TerminalWritable;
    // This creates the writer, only do this if necessary.
    const collatedWriter: CollatedWriter = record.collatedWriter;
    const cacheProjectLogWritable: ProjectLogWritable | undefined = this._tryGetBuildCacheProjectLogWritable({
      record,
      buildCacheConfiguration,
      rushProject,
      collatedTerminal: collatedWriter.terminal,
      logFilenameIdentifier
    });

    if (quietMode) {
      cacheConsoleWritable = new DiscardStdoutTransform({
        destination: collatedWriter
      });
    } else {
      cacheConsoleWritable = collatedWriter;
    }

    let cacheCollatedTerminal: CollatedTerminal;
    if (cacheProjectLogWritable) {
      const cacheSplitterTransform: SplitterTransform = new SplitterTransform({
        destinations: [cacheConsoleWritable, cacheProjectLogWritable]
      });
      cacheCollatedTerminal = new CollatedTerminal(cacheSplitterTransform);
    } else {
      cacheCollatedTerminal = new CollatedTerminal(cacheConsoleWritable);
    }

    const buildCacheTerminalProvider: CollatedTerminalProvider = new CollatedTerminalProvider(
      cacheCollatedTerminal,
      {
        debugEnabled: debugMode
      }
    );
    return new Terminal(buildCacheTerminalProvider);
  }

  private _tryGetBuildCacheProjectLogWritable({
    buildCacheConfiguration,
    rushProject,
    record,
    collatedTerminal,
    logFilenameIdentifier
  }: {
    buildCacheConfiguration: BuildCacheConfiguration | undefined;
    rushProject: RushConfigurationProject;
    record: OperationExecutionRecord;
    collatedTerminal: CollatedTerminal;
    logFilenameIdentifier: string;
  }): ProjectLogWritable | undefined {
    // Only open the *.cache.log file(s) if the cache is enabled.
    if (!buildCacheConfiguration?.buildCacheEnabled) {
      return;
    }
    const buildCacheContext: IOperationBuildCacheContext =
      this._getBuildCacheContextByOperationExecutionRecordOrThrow(record);
    buildCacheContext.buildCacheProjectLogWritable = new ProjectLogWritable(
      rushProject,
      collatedTerminal,
      `${logFilenameIdentifier}.cache`
    );
    return buildCacheContext.buildCacheProjectLogWritable;
  }
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
