// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as crypto from 'crypto';
import {
  Async,
  ColorValue,
  ConsoleTerminalProvider,
  InternalError,
  ITerminal,
  JsonObject,
  Terminal
} from '@rushstack/node-core-library';
import { CollatedTerminal, CollatedWriter } from '@rushstack/stream-collator';
import { DiscardStdoutTransform, PrintUtilities } from '@rushstack/terminal';
import { SplitterTransform, TerminalWritable } from '@rushstack/terminal';

import { CollatedTerminalProvider } from '../../utilities/CollatedTerminalProvider';
import { ShellOperationRunner } from './ShellOperationRunner';
import { OperationStatus } from './OperationStatus';
import { CobuildLock, ICobuildCompletedState } from '../cobuild/CobuildLock';
import { ProjectBuildCache } from '../buildCache/ProjectBuildCache';
import { RushConstants } from '../RushConstants';
import { IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { getHashesForGlobsAsync } from '../buildCache/getHashesForGlobsAsync';
import { ProjectLogWritable } from './ProjectLogWritable';
import type { Operation } from './Operation';
import type {
  IOperationRunnerAfterExecuteContext,
  IOperationRunnerBeforeExecuteContext
} from './OperationRunnerHooks';
import type { IOperationRunner, IOperationRunnerContext } from './IOperationRunner';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type {
  ICreateOperationsContext,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IPhase } from '../../api/CommandLineConfiguration';
import { IRawRepoState, ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';
import type { OperationMetadataManager } from './OperationMetadataManager';
import type { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { CobuildConfiguration } from '../../api/CobuildConfiguration';
import { DisjointSet } from '../cobuild/DisjointSet';

const PLUGIN_NAME: 'CacheablePhasedOperationPlugin' = 'CacheablePhasedOperationPlugin';

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
}

export class CacheableOperationPlugin implements IPhasedCommandPlugin {
  private _buildCacheContextByOperationRunner: Map<IOperationRunner, IOperationBuildCacheContext> = new Map<
    IOperationRunner,
    IOperationBuildCacheContext
  >();

  public apply(hooks: PhasedCommandHooks): void {
    hooks.createOperations.tapPromise(
      PLUGIN_NAME,
      async (operations: Set<Operation>, context: ICreateOperationsContext): Promise<Set<Operation>> => {
        const { buildCacheConfiguration, isIncrementalBuildAllowed, cobuildConfiguration } = context;
        if (!buildCacheConfiguration) {
          return operations;
        }

        let disjointSet: DisjointSet<Operation> | undefined;
        if (cobuildConfiguration?.cobuildEnabled) {
          disjointSet = new DisjointSet<Operation>();
        }

        for (const operation of operations) {
          disjointSet?.add(operation);
          const { runner } = operation;
          if (runner) {
            const buildCacheContext: IOperationBuildCacheContext = {
              // ShellOperationRunner supports cache writes by default.
              isCacheWriteAllowed: true,
              isCacheReadAllowed: isIncrementalBuildAllowed,
              isSkipAllowed: isIncrementalBuildAllowed,
              projectBuildCache: undefined,
              cobuildLock: undefined,
              cobuildClusterId: undefined,
              buildCacheTerminal: undefined,
              buildCacheProjectLogWritable: undefined
            };
            // Upstream runners may mutate the property of build cache context for downstream runners
            this._buildCacheContextByOperationRunner.set(runner, buildCacheContext);

            if (runner instanceof ShellOperationRunner) {
              this._applyShellOperationRunner(runner, context);
            }
          }
        }

        if (disjointSet) {
          // If disjoint set exists, connect build cache disabled project with its consumers
          await Async.forEachAsync(
            operations,
            async (operation) => {
              const { associatedProject: project, associatedPhase: phase } = operation;
              if (project && phase && operation.runner instanceof ShellOperationRunner) {
                const buildCacheEnabled: boolean = await this._tryGetProjectBuildEnabledAsync({
                  buildCacheConfiguration,
                  rushProject: project,
                  commandName: phase.name
                });
                if (!buildCacheEnabled) {
                  for (const consumer of operation.consumers) {
                    if (consumer.runner instanceof ShellOperationRunner) {
                      disjointSet?.union(operation, consumer);
                    }
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
              // Generates cluster id, cluster id comes from the project folder and phase name of all operations in the same cluster.
              const hash: crypto.Hash = crypto.createHash('sha1');
              for (const operation of set) {
                const { associatedPhase: phase, associatedProject: project } = operation;
                if (project && phase) {
                  hash.update(project.projectRelativeFolder);
                  hash.update(RushConstants.hashDelimiter);
                  hash.update(phase.name);
                  hash.update(RushConstants.hashDelimiter);
                }
              }
              const cobuildClusterId: string = hash.digest('hex');

              // Assign same cluster id to all operations in the same cluster.
              for (const operation of set) {
                const { runner } = operation;
                if (runner instanceof ShellOperationRunner) {
                  const buildCacheContext: IOperationBuildCacheContext =
                    this._getBuildCacheContextByRunnerOrThrow(runner);
                  buildCacheContext.cobuildClusterId = cobuildClusterId;
                }
              }
            }
          }
        }

        return operations;
      }
    );

    hooks.afterExecuteOperation.tapPromise(
      PLUGIN_NAME,
      async (runnerContext: IOperationRunnerContext): Promise<void> => {
        const { runner, status, consumers, changedProjectsOnly } = runnerContext;
        const buildCacheContext: IOperationBuildCacheContext | undefined =
          this._getBuildCacheContextByRunner(runner);

        let blockCacheWrite: boolean = !buildCacheContext?.isCacheWriteAllowed;
        let blockSkip: boolean = !buildCacheContext?.isSkipAllowed;

        switch (status) {
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
        for (const item of consumers) {
          const itemRunnerBuildCacheContext: IOperationBuildCacheContext | undefined =
            this._getBuildCacheContextByRunner(item.runner);
          if (itemRunnerBuildCacheContext) {
            if (blockCacheWrite) {
              itemRunnerBuildCacheContext.isCacheWriteAllowed = false;
            }
            if (blockSkip) {
              itemRunnerBuildCacheContext.isSkipAllowed = false;
            }
          }
        }
      }
    );

    hooks.afterExecuteOperations.tapPromise(PLUGIN_NAME, async () => {
      for (const { buildCacheProjectLogWritable } of this._buildCacheContextByOperationRunner.values()) {
        buildCacheProjectLogWritable?.close();
      }
      this._buildCacheContextByOperationRunner.clear();
    });
  }

  private _applyShellOperationRunner(runner: ShellOperationRunner, context: ICreateOperationsContext): void {
    const {
      buildCacheConfiguration,
      cobuildConfiguration,
      phaseSelection: selectedPhases,
      projectChangeAnalyzer
    } = context;
    const { hooks } = runner;

    const buildCacheContext: IOperationBuildCacheContext = this._getBuildCacheContextByRunnerOrThrow(runner);

    hooks.beforeExecute.tapPromise(
      PLUGIN_NAME,
      async (beforeExecuteContext: IOperationRunnerBeforeExecuteContext) => {
        const earlyReturnStatus: OperationStatus | undefined = await (async () => {
          const {
            context,
            runner,
            terminal,
            lastProjectDeps,
            projectDeps,
            trackedProjectFiles,
            logPath,
            errorLogPath,
            rushProject,
            phase,
            commandName,
            commandToRun,
            earlyReturnStatus
          } = beforeExecuteContext;
          if (earlyReturnStatus) {
            // If there is existing early return status, we don't need to do anything
            return earlyReturnStatus;
          }

          if (!projectDeps && buildCacheContext.isSkipAllowed) {
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

          const buildCacheTerminal: ITerminal = this._getBuildCacheTerminal({
            runner,
            buildCacheConfiguration,
            rushProject,
            collatedWriter: context.collatedWriter,
            logFilenameIdentifier: runner.logFilenameIdentifier,
            quietMode: context.quietMode,
            debugMode: context.debugMode
          });
          buildCacheContext.buildCacheTerminal = buildCacheTerminal;

          let projectBuildCache: ProjectBuildCache | undefined = await this._tryGetProjectBuildCacheAsync({
            buildCacheConfiguration,
            runner,
            rushProject,
            phase,
            selectedPhases,
            projectChangeAnalyzer,
            commandName,
            commandToRun,
            terminal: buildCacheTerminal,
            trackedProjectFiles,
            operationMetadataManager: context._operationMetadataManager
          });

          // Try to acquire the cobuild lock
          let cobuildLock: CobuildLock | undefined;
          if (cobuildConfiguration?.cobuildEnabled) {
            if (
              cobuildConfiguration?.cobuildLeafProjectLogOnlyAllowed &&
              runner.consumers.size === 0 &&
              !projectBuildCache
            ) {
              // When the leaf project log only is allowed and the leaf project is build cache "disabled", try to get
              // a log files only project build cache
              projectBuildCache = await this._tryGetLogOnlyProjectBuildCacheAsync({
                buildCacheConfiguration,
                cobuildConfiguration,
                runner,
                rushProject,
                phase,
                projectChangeAnalyzer,
                commandName,
                commandToRun,
                terminal: buildCacheTerminal,
                trackedProjectFiles,
                operationMetadataManager: context._operationMetadataManager
              });
              if (projectBuildCache) {
                buildCacheTerminal.writeVerboseLine(
                  `Log files only build cache is enabled for the project "${rushProject.packageName}" because the cobuild leaf project log only is allowed`
                );
              } else {
                buildCacheTerminal.writeWarningLine(
                  `Failed to get log files only build cache for the project "${rushProject.packageName}"`
                );
              }
            }

            cobuildLock = await this._tryGetCobuildLockAsync({
              runner,
              projectBuildCache,
              cobuildConfiguration,
              packageName: rushProject.packageName,
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
          //     the process of running dependents, it will be changed by OperationExecutionManager to
          //     false if a dependency wasn't able to be skipped.
          //
          let buildCacheReadAttempted: boolean = false;

          if (cobuildLock) {
            // handling rebuilds. "rush rebuild" or "rush retest" command will save operations to
            // the build cache once completed, but does not retrieve them (since the "incremental"
            // flag is disabled). However, we still need a cobuild to be able to retrieve a finished
            // build from another cobuild in this case.
            const cobuildCompletedState: ICobuildCompletedState | undefined =
              await cobuildLock.getCompletedStateAsync();
            if (cobuildCompletedState) {
              const { status, cacheId } = cobuildCompletedState;

              const restoreFromCacheSuccess: boolean | undefined =
                await cobuildLock.projectBuildCache.tryRestoreFromCacheAsync(buildCacheTerminal, cacheId);

              if (restoreFromCacheSuccess) {
                // Restore the original state of the operation without cache
                await context._operationMetadataManager?.tryRestoreAsync({
                  terminal,
                  logPath,
                  errorLogPath
                });
                if (cobuildCompletedState) {
                  return cobuildCompletedState.status;
                }
                return status;
              }
            }
          } else if (buildCacheContext.isCacheReadAllowed) {
            buildCacheReadAttempted = !!projectBuildCache;
            const restoreFromCacheSuccess: boolean | undefined =
              await projectBuildCache?.tryRestoreFromCacheAsync(buildCacheTerminal);

            if (restoreFromCacheSuccess) {
              // Restore the original state of the operation without cache
              await context._operationMetadataManager?.tryRestoreAsync({
                terminal,
                logPath,
                errorLogPath
              });
              return OperationStatus.FromCache;
            }
          }
          if (buildCacheContext.isSkipAllowed && !buildCacheReadAttempted) {
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
              // The operation may be used to marked remote executing, now change it to executing
              context.status = OperationStatus.Executing;
              runner.periodicCallback.addCallback(async () => {
                await cobuildLock?.renewLockAsync();
              });
            } else {
              // failed to acquire the lock, mark current operation to remote executing
              context.stopwatch.reset();
              return OperationStatus.RemoteExecuting;
            }
          }
        })();
        if (earlyReturnStatus) {
          beforeExecuteContext.earlyReturnStatus = earlyReturnStatus;
        }
        return beforeExecuteContext;
      }
    );

    runner.hooks.afterExecute.tapPromise(
      PLUGIN_NAME,
      async (afterExecuteContext: IOperationRunnerAfterExecuteContext) => {
        const { context, status, taskIsSuccessful, logPath, errorLogPath } = afterExecuteContext;

        const { cobuildLock, projectBuildCache, isCacheWriteAllowed, buildCacheTerminal } = buildCacheContext;

        // Save the metadata to disk
        const { duration: durationInSeconds } = context.stopwatch;
        await context._operationMetadataManager?.saveAsync({
          durationInSeconds,
          cobuildContextId: cobuildLock?.cobuildConfiguration.cobuildContextId,
          cobuildRunnerId: cobuildLock?.cobuildConfiguration.cobuildRunnerId,
          logPath,
          errorLogPath
        });

        if (!buildCacheTerminal) {
          // This should not happen
          throw new InternalError(`Build Cache Terminal is not created`);
        }

        let setCompletedStatePromiseFunction: (() => Promise<void> | undefined) | undefined;
        let setCacheEntryPromise: Promise<boolean> | undefined;
        if (cobuildLock && isCacheWriteAllowed) {
          if (context.error) {
            // In order to prevent the worst case that all cobuild tasks go through the same failure,
            // allowing a failing build to be cached and retrieved, print the error message to the terminal
            // and clear the error in context.
            const message: string | undefined = context.error?.message;
            if (message) {
              context.collatedWriter.terminal.writeStderrLine(message);
            }
            context.error = undefined;
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
              setCacheEntryPromise = cobuildLock.projectBuildCache.trySetCacheEntryAsync(
                buildCacheTerminal,
                finalCacheId
              );
            }
          }
        }

        // If the command is successful, we can calculate project hash, and no dependencies were skipped,
        // write a new cache entry.
        if (!setCacheEntryPromise && taskIsSuccessful && isCacheWriteAllowed && projectBuildCache) {
          setCacheEntryPromise = projectBuildCache.trySetCacheEntryAsync(buildCacheTerminal);
        }
        const cacheWriteSuccess: boolean | undefined = await setCacheEntryPromise;
        await setCompletedStatePromiseFunction?.();

        if (cacheWriteSuccess === false && afterExecuteContext.status === OperationStatus.Success) {
          afterExecuteContext.status = OperationStatus.SuccessWithWarning;
        }

        return afterExecuteContext;
      }
    );
  }

  private _getBuildCacheContextByRunner(runner: IOperationRunner): IOperationBuildCacheContext | undefined {
    const buildCacheContext: IOperationBuildCacheContext | undefined =
      this._buildCacheContextByOperationRunner.get(runner);
    return buildCacheContext;
  }

  private _getBuildCacheContextByRunnerOrThrow(runner: IOperationRunner): IOperationBuildCacheContext {
    const buildCacheContext: IOperationBuildCacheContext | undefined =
      this._getBuildCacheContextByRunner(runner);
    if (!buildCacheContext) {
      // This should not happen
      throw new InternalError(`Build cache context for runner ${runner.name} should be defined`);
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
    const consoleTerminalProvider: ConsoleTerminalProvider = new ConsoleTerminalProvider();
    const terminal: ITerminal = new Terminal(consoleTerminalProvider);
    // This is a silent terminal
    terminal.unregisterProvider(consoleTerminalProvider);

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
    runner,
    rushProject,
    phase,
    selectedPhases,
    projectChangeAnalyzer,
    commandName,
    commandToRun,
    terminal,
    trackedProjectFiles,
    operationMetadataManager
  }: {
    buildCacheConfiguration: BuildCacheConfiguration | undefined;
    runner: IOperationRunner;
    rushProject: RushConfigurationProject;
    phase: IPhase;
    selectedPhases: Iterable<IPhase>;
    projectChangeAnalyzer: ProjectChangeAnalyzer;
    commandName: string;
    commandToRun: string;
    terminal: ITerminal;
    trackedProjectFiles: string[] | undefined;
    operationMetadataManager: OperationMetadataManager | undefined;
  }): Promise<ProjectBuildCache | undefined> {
    const buildCacheContext: IOperationBuildCacheContext = this._getBuildCacheContextByRunnerOrThrow(runner);
    if (!buildCacheContext.projectBuildCache) {
      if (buildCacheConfiguration && buildCacheConfiguration.buildCacheEnabled) {
        // Disable legacy skip logic if the build cache is in play
        buildCacheContext.isSkipAllowed = false;

        const projectConfiguration: RushProjectConfiguration | undefined =
          await RushProjectConfiguration.tryLoadForProjectAsync(rushProject, terminal);
        if (projectConfiguration) {
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
    runner,
    rushProject,
    terminal,
    commandName,
    commandToRun,
    buildCacheConfiguration,
    cobuildConfiguration,
    phase,
    trackedProjectFiles,
    projectChangeAnalyzer,
    operationMetadataManager
  }: {
    buildCacheConfiguration: BuildCacheConfiguration | undefined;
    cobuildConfiguration: CobuildConfiguration;
    runner: IOperationRunner;
    rushProject: RushConfigurationProject;
    phase: IPhase;
    commandToRun: string;
    commandName: string;
    terminal: ITerminal;
    trackedProjectFiles: string[] | undefined;
    projectChangeAnalyzer: ProjectChangeAnalyzer;
    operationMetadataManager: OperationMetadataManager | undefined;
  }): Promise<ProjectBuildCache | undefined> {
    const buildCacheContext: IOperationBuildCacheContext = this._getBuildCacheContextByRunnerOrThrow(runner);
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
    runner,
    projectBuildCache,
    packageName,
    phaseName
  }: {
    cobuildConfiguration: CobuildConfiguration | undefined;
    runner: IOperationRunner;
    projectBuildCache: ProjectBuildCache | undefined;
    packageName: string;
    phaseName: string;
  }): Promise<CobuildLock | undefined> {
    const buildCacheContext: IOperationBuildCacheContext = this._getBuildCacheContextByRunnerOrThrow(runner);
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
          lockExpireTimeInSeconds: ShellOperationRunner.periodicCallbackIntervalInSeconds * 3,
          packageName,
          phaseName
        });
      }
    }
    return buildCacheContext.cobuildLock;
  }

  private _getBuildCacheTerminal({
    runner,
    buildCacheConfiguration,
    rushProject,
    collatedWriter,
    logFilenameIdentifier,
    quietMode,
    debugMode
  }: {
    runner: ShellOperationRunner;
    buildCacheConfiguration: BuildCacheConfiguration | undefined;
    rushProject: RushConfigurationProject;
    collatedWriter: CollatedWriter;
    logFilenameIdentifier: string;
    quietMode: boolean;
    debugMode: boolean;
  }): ITerminal {
    const buildCacheContext: IOperationBuildCacheContext = this._getBuildCacheContextByRunnerOrThrow(runner);
    if (!buildCacheContext.buildCacheTerminal) {
      let cacheConsoleWritable: TerminalWritable;
      const cacheProjectLogWritable: ProjectLogWritable | undefined =
        this._tryGetBuildCacheProjectLogWritable({
          runner,
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
      buildCacheContext.buildCacheTerminal = new Terminal(buildCacheTerminalProvider);
    }

    return buildCacheContext.buildCacheTerminal;
  }

  private _tryGetBuildCacheProjectLogWritable({
    buildCacheConfiguration,
    rushProject,
    runner,
    collatedTerminal,
    logFilenameIdentifier
  }: {
    buildCacheConfiguration: BuildCacheConfiguration | undefined;
    rushProject: RushConfigurationProject;
    runner: ShellOperationRunner;
    collatedTerminal: CollatedTerminal;
    logFilenameIdentifier: string;
  }): ProjectLogWritable | undefined {
    // Only open the *.cache.log file(s) if the cache is enabled.
    if (!buildCacheConfiguration?.buildCacheEnabled) {
      return;
    }
    const buildCacheContext: IOperationBuildCacheContext = this._getBuildCacheContextByRunnerOrThrow(runner);
    if (!buildCacheContext.buildCacheProjectLogWritable) {
      buildCacheContext.buildCacheProjectLogWritable = new ProjectLogWritable(
        rushProject,
        collatedTerminal,
        `${logFilenameIdentifier}.cache`
      );
    }
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
