// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CobuildLock, ICobuildCompletedState } from '../cobuild/CobuildLock';
import { ProjectBuildCache } from '../buildCache/ProjectBuildCache';
import { IOperationSettings, RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { OperationStatus } from './OperationStatus';
import { ColorValue, InternalError, ITerminal, JsonObject } from '@rushstack/node-core-library';
import { RushConstants } from '../RushConstants';
import { getHashesForGlobsAsync } from '../buildCache/getHashesForGlobsAsync';
import { PrintUtilities } from '@rushstack/terminal';

import type { IOperationRunnerPlugin } from './IOperationRunnerPlugin';
import type {
  IOperationRunnerAfterExecuteContext,
  IOperationRunnerBeforeExecuteContext,
  OperationRunnerLifecycleHooks
} from './OperationLifecycle';
import type { OperationMetadataManager } from './OperationMetadataManager';
import type { IOperationRunner } from './IOperationRunner';
import type { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import type { CobuildConfiguration } from '../../api/CobuildConfiguration';
import type { IPhase } from '../../api/CommandLineConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import type { IRawRepoState, ProjectChangeAnalyzer } from '../ProjectChangeAnalyzer';

const PLUGIN_NAME: 'CacheableOperationRunnerPlugin' = 'CacheableOperationRunnerPlugin';

export interface ICacheableOperationRunnerPluginOptions {
  buildCacheConfiguration: BuildCacheConfiguration;
  cobuildConfiguration: CobuildConfiguration | undefined;
  isIncrementalBuildAllowed: boolean;
}

export interface IOperationBuildCacheContext {
  isCacheWriteAllowed: boolean;
  isCacheReadAllowed: boolean;
  isSkipAllowed: boolean;
  projectBuildCache: ProjectBuildCache | undefined;
  cobuildLock: CobuildLock | undefined;
}

export class CacheableOperationRunnerPlugin implements IOperationRunnerPlugin {
  private static _runnerBuildCacheContextMap: Map<IOperationRunner, IOperationBuildCacheContext> = new Map<
    IOperationRunner,
    IOperationBuildCacheContext
  >();
  private readonly _buildCacheConfiguration: BuildCacheConfiguration;
  private readonly _cobuildConfiguration: CobuildConfiguration | undefined;

  public constructor(options: ICacheableOperationRunnerPluginOptions) {
    this._buildCacheConfiguration = options.buildCacheConfiguration;
    this._cobuildConfiguration = options.cobuildConfiguration;
  }

  public static getBuildCacheContextByRunner(
    runner: IOperationRunner
  ): IOperationBuildCacheContext | undefined {
    const buildCacheContext: IOperationBuildCacheContext | undefined =
      CacheableOperationRunnerPlugin._runnerBuildCacheContextMap.get(runner);
    return buildCacheContext;
  }

  public static getBuildCacheContextByRunnerOrThrow(runner: IOperationRunner): IOperationBuildCacheContext {
    const buildCacheContext: IOperationBuildCacheContext | undefined =
      CacheableOperationRunnerPlugin.getBuildCacheContextByRunner(runner);
    if (!buildCacheContext) {
      // This should not happen
      throw new InternalError(`Build cache context for runner ${runner.name} should be defined`);
    }
    return buildCacheContext;
  }

  public static setBuildCacheContextByRunner(
    runner: IOperationRunner,
    buildCacheContext: IOperationBuildCacheContext
  ): void {
    CacheableOperationRunnerPlugin._runnerBuildCacheContextMap.set(runner, buildCacheContext);
  }

  public static clearAllBuildCacheContexts(): void {
    CacheableOperationRunnerPlugin._runnerBuildCacheContextMap.clear();
  }

  public apply(hooks: OperationRunnerLifecycleHooks): void {
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
            selectedPhases,
            projectChangeAnalyzer,
            commandName,
            commandToRun,
            earlyReturnStatus
          } = beforeExecuteContext;
          if (earlyReturnStatus) {
            // If there is existing early return status, we don't need to do anything
            return earlyReturnStatus;
          }
          const buildCacheContext: IOperationBuildCacheContext =
            CacheableOperationRunnerPlugin.getBuildCacheContextByRunnerOrThrow(runner);

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

          const projectBuildCache: ProjectBuildCache | undefined = await this._tryGetProjectBuildCacheAsync({
            runner,
            rushProject,
            phase,
            selectedPhases,
            projectChangeAnalyzer,
            commandName,
            commandToRun,
            terminal,
            trackedProjectFiles,
            operationMetadataManager: context._operationMetadataManager
          });
          buildCacheContext.projectBuildCache = projectBuildCache;

          // Try to acquire the cobuild lock
          let cobuildLock: CobuildLock | undefined;
          if (this._cobuildConfiguration?.cobuildEnabled) {
            cobuildLock = await this._tryGetCobuildLockAsync({ runner, projectBuildCache });
          }
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
                await cobuildLock.projectBuildCache.tryRestoreFromCacheAsync(terminal, cacheId);

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
              await projectBuildCache?.tryRestoreFromCacheAsync(terminal);

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
              if (context.status === OperationStatus.RemoteExecuting) {
                // This operation is used to marked remote executing, now change it to executing
                context.status = OperationStatus.Executing;
              }
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

    hooks.afterExecute.tapPromise(
      PLUGIN_NAME,
      async (afterExecuteContext: IOperationRunnerAfterExecuteContext) => {
        const { context, runner, terminal, status, taskIsSuccessful } = afterExecuteContext;
        const buildCacheContext: IOperationBuildCacheContext =
          CacheableOperationRunnerPlugin.getBuildCacheContextByRunnerOrThrow(runner);

        const { cobuildLock, projectBuildCache, isCacheWriteAllowed } = buildCacheContext;

        let setCompletedStatePromiseFunction: (() => Promise<void> | undefined) | undefined;
        let setCacheEntryPromise: Promise<boolean> | undefined;
        if (cobuildLock && isCacheWriteAllowed) {
          if (context.error) {
            // In order to preventing the worst case that all cobuild tasks go through the same failure,
            // allowing a failing build to be cached and retrieved, print the error message to the terminal
            // and clear the error in context.
            const message: string | undefined = context.error?.message;
            if (message) {
              context.collatedWriter.terminal.writeStderrLine(message);
            }
            context.error = undefined;
          }
          const cacheId: string | undefined = cobuildLock.projectBuildCache.cacheId;
          const contextId: string = cobuildLock.cobuildConfiguration.contextId;

          if (cacheId) {
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
                  terminal,
                  finalCacheId
                );
              }
            }
          }
        }

        // If the command is successful, we can calculate project hash, and no dependencies were skipped,
        // write a new cache entry.
        if (!setCacheEntryPromise && taskIsSuccessful && isCacheWriteAllowed && projectBuildCache) {
          setCacheEntryPromise = projectBuildCache.trySetCacheEntryAsync(terminal);
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

  private async _tryGetProjectBuildCacheAsync({
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
    const buildCacheContext: IOperationBuildCacheContext =
      CacheableOperationRunnerPlugin.getBuildCacheContextByRunnerOrThrow(runner);
    if (!buildCacheContext.projectBuildCache) {
      if (this._buildCacheConfiguration && this._buildCacheConfiguration.buildCacheEnabled) {
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
                projectConfiguration,
                projectOutputFolderNames,
                additionalProjectOutputFilePaths,
                additionalContext,
                buildCacheConfiguration: this._buildCacheConfiguration,
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

  private async _tryGetCobuildLockAsync({
    runner,
    projectBuildCache
  }: {
    runner: IOperationRunner;
    projectBuildCache: ProjectBuildCache | undefined;
  }): Promise<CobuildLock | undefined> {
    const buildCacheContext: IOperationBuildCacheContext =
      CacheableOperationRunnerPlugin.getBuildCacheContextByRunnerOrThrow(runner);
    if (!buildCacheContext.cobuildLock) {
      buildCacheContext.cobuildLock = undefined;

      if (projectBuildCache && this._cobuildConfiguration && this._cobuildConfiguration.cobuildEnabled) {
        buildCacheContext.cobuildLock = new CobuildLock({
          cobuildConfiguration: this._cobuildConfiguration,
          projectBuildCache: projectBuildCache
        });
      }
    }
    return buildCacheContext.cobuildLock;
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
