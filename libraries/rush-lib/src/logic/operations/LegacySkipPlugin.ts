// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { FileSystem, JsonFile, type JsonObject } from '@rushstack/node-core-library';
import { PrintUtilities, Colorize, type ITerminal } from '@rushstack/terminal';

import type { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import type {
  IOperationGraphIterationOptions,
  IPhasedCommandPlugin,
  PhasedCommandHooks
} from '../../pluginFramework/PhasedCommandHooks';
import type { IOperationRunnerContext } from './IOperationRunner';
import type { IOperationExecutionResult } from './IOperationExecutionResult';

const PLUGIN_NAME: 'LegacySkipPlugin' = 'LegacySkipPlugin';

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

export interface IProjectDeps {
  files: { [filePath: string]: string };
  arguments: string;
}

interface ILegacySkipRecord {
  allowSkip: boolean;
  packageDeps: IProjectDeps | undefined;
  packageDepsPath: string;
}

export interface ILegacySkipPluginOptions {
  terminal: ITerminal;
  changedProjectsOnly: boolean;
  isIncrementalBuildAllowed: boolean;
  allowWarningsInSuccessfulBuild?: boolean;
}

/**
 * Core phased command plugin that implements the legacy skip detection logic, used when build cache is disabled.
 */
export class LegacySkipPlugin implements IPhasedCommandPlugin {
  private readonly _options: ILegacySkipPluginOptions;

  public constructor(options: ILegacySkipPluginOptions) {
    this._options = options;
  }

  public apply(hooks: PhasedCommandHooks): void {
    const stateMap: WeakMap<Operation, ILegacySkipRecord> = new WeakMap();

    const { terminal, changedProjectsOnly, isIncrementalBuildAllowed, allowWarningsInSuccessfulBuild } =
      this._options;

    hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph) => {
      graph.hooks.beforeExecuteIterationAsync.tap(
        PLUGIN_NAME,
        (
          operations: ReadonlyMap<Operation, IOperationExecutionResult>,
          iterationOptions: IOperationGraphIterationOptions
        ): void => {
          let logGitWarning: boolean = false;
          const { inputsSnapshot } = iterationOptions;

          for (const record of operations.values()) {
            const { operation } = record;
            const { associatedProject, associatedPhase, runner, logFilenameIdentifier } = operation;
            if (!runner) {
              continue;
            }

            if (!runner.cacheable) {
              stateMap.set(operation, {
                allowSkip: true,
                packageDeps: undefined,
                packageDepsPath: ''
              });
              continue;
            }

            const packageDepsFilename: string = `package-deps_${logFilenameIdentifier}.json`;

            const packageDepsPath: string = path.join(
              associatedProject.projectRushTempFolder,
              packageDepsFilename
            );

            let packageDeps: IProjectDeps | undefined;

            try {
              const fileHashes: ReadonlyMap<string, string> | undefined =
                inputsSnapshot?.getTrackedFileHashesForOperation(associatedProject, associatedPhase.name);

              if (!fileHashes) {
                logGitWarning = true;
                continue;
              }

              const files: Record<string, string> = {};
              for (const [filePath, fileHash] of fileHashes) {
                files[filePath] = fileHash;
              }

              packageDeps = {
                files,
                arguments: runner.getConfigHash()
              };
            } catch (error) {
              // To test this code path:
              // Delete a project's ".rush/temp/shrinkwrap-deps.json" then run "rush build --verbose"
              terminal.writeLine(
                `Unable to calculate incremental state for ${record.operation.name}: ` +
                  (error as Error).toString()
              );
              terminal.writeLine(
                Colorize.cyan('Rush will proceed without incremental execution and change detection.')
              );
            }

            stateMap.set(operation, {
              packageDepsPath,
              packageDeps,
              allowSkip: isIncrementalBuildAllowed
            });
          }

          if (logGitWarning) {
            // To test this code path:
            // Remove the `.git` folder then run "rush build --verbose"
            terminal.writeLine(
              Colorize.cyan(
                PrintUtilities.wrapWords(
                  'This workspace does not appear to be tracked by Git. ' +
                    'Rush will proceed without incremental execution, caching, and change detection.'
                )
              )
            );
          }
        }
      );

      graph.hooks.beforeExecuteOperationAsync.tapPromise(
        PLUGIN_NAME,
        async (
          record: IOperationRunnerContext & IOperationExecutionResult
        ): Promise<OperationStatus | undefined> => {
          const { operation } = record;
          const skipRecord: ILegacySkipRecord | undefined = stateMap.get(operation);
          if (!skipRecord) {
            // This operation doesn't support skip detection.
            return;
          }

          if (!operation.runner!.cacheable) {
            // This operation doesn't support skip detection.
            return;
          }

          const { associatedProject } = operation;

          const { packageDepsPath, packageDeps, allowSkip } = skipRecord;

          let lastProjectDeps: IProjectDeps | undefined = undefined;

          try {
            const lastDepsContents: string = await FileSystem.readFileAsync(packageDepsPath);
            lastProjectDeps = JSON.parse(lastDepsContents);
          } catch (e) {
            if (!FileSystem.isNotExistError(e)) {
              // Warn and ignore - treat failing to load the file as the operation being not built.
              // TODO: Update this to be the terminal specific to the operation.
              terminal.writeWarningLine(
                `Warning: error parsing ${packageDepsPath}: ${e}. Ignoring and treating this operation as not run.`
              );
            }
          }

          if (allowSkip) {
            const isPackageUnchanged: boolean = !!(
              lastProjectDeps &&
              packageDeps &&
              packageDeps.arguments === lastProjectDeps.arguments &&
              _areShallowEqual(packageDeps.files, lastProjectDeps.files)
            );

            if (isPackageUnchanged) {
              return OperationStatus.Skipped;
            }
          }

          // TODO: Remove legacyDepsPath with the next major release of Rush
          const legacyDepsPath: string = path.join(associatedProject.projectFolder, 'package-deps.json');

          await Promise.all([
            // Delete the legacy package-deps.json
            FileSystem.deleteFileAsync(legacyDepsPath),

            // If the deps file exists, remove it before starting execution.
            FileSystem.deleteFileAsync(packageDepsPath)
          ]);
        }
      );

      graph.hooks.afterExecuteOperationAsync.tapPromise(
        PLUGIN_NAME,
        async (record: IOperationRunnerContext & IOperationExecutionResult): Promise<void> => {
          const { status, operation } = record;

          const skipRecord: ILegacySkipRecord | undefined = stateMap.get(operation);
          if (!skipRecord) {
            return;
          }

          const blockSkip: boolean =
            !skipRecord.allowSkip ||
            (!changedProjectsOnly &&
              (status === OperationStatus.Success || status === OperationStatus.SuccessWithWarning));
          if (blockSkip) {
            for (const consumer of operation.consumers) {
              const consumerSkipRecord: ILegacySkipRecord | undefined = stateMap.get(consumer);
              if (consumerSkipRecord) {
                consumerSkipRecord.allowSkip = false;
              }
            }
          }

          if (!record.operation.runner!.cacheable) {
            // This operation doesn't support skip detection.
            return;
          }

          const { packageDeps, packageDepsPath } = skipRecord;

          if (
            status === OperationStatus.NoOp ||
            (packageDeps &&
              (status === OperationStatus.Success ||
                (status === OperationStatus.SuccessWithWarning &&
                  record.operation.runner!.warningsAreAllowed &&
                  allowWarningsInSuccessfulBuild)))
          ) {
            // Write deps on success.
            await JsonFile.saveAsync(packageDeps, packageDepsPath, {
              ensureFolderExists: true
            });
          }
        }
      );
    });
  }
}
