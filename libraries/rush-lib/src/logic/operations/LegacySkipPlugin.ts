// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { FileSystem, JsonFile, type JsonObject } from '@rushstack/node-core-library';
import { PrintUtilities, Colorize, type ITerminal } from '@rushstack/terminal';

import type { Operation } from './Operation';
import { OperationStatus } from './OperationStatus';
import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';
import type { IInputsSnapshot } from '../incremental/InputsSnapshot';
import type { IOperationGraphIterationOptions } from './IOperationGraph';
import type { IOperationRunnerContext } from './IOperationRunner';
import type { IOperationExecutionResult } from './IOperationExecutionResult';
import { wasExecutedIncrementally } from './IncrementalExecutionState';
import { captureInputFilesState, type IInputFilesState } from './InputFilesStatSignature';
import {
  createGitPathGetter,
  getSnapshotStartTimeMs,
  haveOperationInputFilesChangedAsync
} from './OperationInputFilesCheck';
import {
  CAPTURE_INPUT_FILES_STAGE,
  isResultUnverifiable,
  markInputFilesChecked,
  markResultUnverifiable
} from './RetainedResultVerification';

const PLUGIN_NAME: 'LegacySkipPlugin' = 'LegacySkipPlugin';
const INVALIDATION_PLUGIN_NAME: 'LegacySkipInvalidationPlugin' = 'LegacySkipInvalidationPlugin';

/**
 * Returns the path of the file in which {@link LegacySkipPlugin} records the inputs of the last successful
 * execution of an operation.
 */
function _getPackageDepsPath(operation: Operation): string {
  return path.join(
    operation.associatedProject.projectRushTempFolder,
    `package-deps_${operation.logFilenameIdentifier}.json`
  );
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

// Runs after the default-stage taps that can mark the result of an operation as unverifiable, e.g. the input file
// check of this plugin, which checks whether the input files changed while the operation executed.
const RECORD_PACKAGE_DEPS_STAGE: number = 1;

export interface IProjectDeps {
  files: { [filePath: string]: string };
  arguments: string;
}

interface IInputFilesCheck {
  readonly inputsSnapshot: IInputsSnapshot;
  // See getSnapshotStartTimeMs
  readonly snapshotStartTimeMs: number;
  // The hashes of the tracked input files in the inputs snapshot
  readonly fileHashes: ReadonlyMap<string, string>;
  // Captured right before the operation executes
  inputFilesState?: IInputFilesState;
}

interface ILegacySkipRecord {
  allowSkip: boolean;
  /**
   * Whether an operation that this operation depends on, directly or indirectly, changed its outputs in this
   * iteration, so that the outputs of this operation were built against outputs that have since changed.
   */
  dependencyChanged: boolean;
  /**
   * Whether the record of this operation matched its inputs when it started. If it executes anyway, e.g. in a
   * rebuild, it reproduces the outputs that it recorded, so the records of its consumers stay valid, unless
   * its result is unverifiable.
   */
  inputsUnchanged: boolean;
  packageDeps: IProjectDeps | undefined;
  packageDepsPath: string;
  // Set if this plugin checks whether the input files of the operation change until it has executed
  inputFilesCheck?: IInputFilesCheck;
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
  readonly #options: ILegacySkipPluginOptions;

  public constructor(options: ILegacySkipPluginOptions) {
    this.#options = options;
  }

  public apply(hooks: PhasedCommandHooks): void {
    const stateMap: WeakMap<Operation, ILegacySkipRecord> = new WeakMap();

    const { terminal, changedProjectsOnly, isIncrementalBuildAllowed, allowWarningsInSuccessfulBuild } =
      this.#options;

    hooks.onGraphCreatedAsync.tap(PLUGIN_NAME, (graph) => {
      const getGitPath: () => string | undefined = createGitPathGetter();
      graph.hooks.beforeDeleteResults.tap(PLUGIN_NAME, (operations) => {
        for (const operation of operations) stateMap.delete(operation);
      });
      graph.hooks.beforeExecuteIterationAsync.tap(
        PLUGIN_NAME,
        (
          operations: ReadonlyMap<Operation, IOperationExecutionResult>,
          iterationOptions: IOperationGraphIterationOptions
        ): void => {
          let logGitWarning: boolean = false;
          const { inputsSnapshot } = iterationOptions;
          const allowSkip: boolean =
            isIncrementalBuildAllowed && iterationOptions.isIncrementalBuildAllowed !== false;
          const snapshotStartTimeMs: number | undefined = inputsSnapshot
            ? getSnapshotStartTimeMs(inputsSnapshot)
            : undefined;

          for (const record of operations.values()) {
            const { operation } = record;
            const { runner } = operation;
            if (!runner) {
              continue;
            }

            if (!runner.cacheable) {
              stateMap.set(operation, {
                allowSkip: true,
                dependencyChanged: false,
                inputsUnchanged: false,
                packageDeps: undefined,
                packageDepsPath: ''
              });
              continue;
            }

            const packageDepsPath: string = _getPackageDepsPath(operation);

            if (!inputsSnapshot || snapshotStartTimeMs === undefined) {
              logGitWarning = true;
              continue;
            }

            stateMap.set(operation, {
              packageDepsPath,
              allowSkip,
              dependencyChanged: false,
              inputsUnchanged: false,
              ...readInputs(record, inputsSnapshot, snapshotStartTimeMs)
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

      graph.hooks.extendIteration.tap(
        PLUGIN_NAME,
        (
          changedRecords: ReadonlyMap<Operation, IOperationExecutionResult>,
          iterationOptions: IOperationGraphIterationOptions
        ): void => {
          const { inputsSnapshot } = iterationOptions;
          if (!inputsSnapshot) {
            return;
          }
          const snapshotStartTimeMs: number = getSnapshotStartTimeMs(inputsSnapshot);
          for (const record of changedRecords.values()) {
            const skipRecord: ILegacySkipRecord | undefined = stateMap.get(record.operation);
            if (skipRecord && record.operation.runner?.cacheable) {
              // What upstream operations recorded in the entry still holds. The record was not dispatched yet, so the
              // tap at CAPTURE_INPUT_FILES_STAGE captures its input files later, for the newer snapshot.
              Object.assign(skipRecord, readInputs(record, inputsSnapshot, snapshotStartTimeMs));
            }
          }
        }
      );

      /**
       * Reads the inputs of a cacheable operation that its skip record holds from the inputs snapshot.
       */
      function readInputs(
        record: IOperationExecutionResult,
        inputsSnapshot: IInputsSnapshot,
        snapshotStartTimeMs: number
      ): Pick<ILegacySkipRecord, 'packageDeps' | 'inputFilesCheck'> {
        const { associatedProject, associatedPhase, runner } = record.operation;
        try {
          const fileHashes: ReadonlyMap<string, string> = inputsSnapshot.getTrackedFileHashesForOperation(
            associatedProject,
            associatedPhase.name
          );

          const files: Record<string, string> = {};
          for (const [filePath, fileHash] of fileHashes) {
            files[filePath] = fileHash;
          }

          const packageDeps: IProjectDeps = {
            files,
            arguments: runner!.getConfigHash()
          };

          return {
            packageDeps,
            inputFilesCheck:
              record.enabled && !runner!.isNoOp
                ? { inputsSnapshot, snapshotStartTimeMs, fileHashes }
                : undefined
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
          return { packageDeps: undefined, inputFilesCheck: undefined };
        }
      }

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

          const { packageDepsPath, packageDeps, allowSkip, dependencyChanged } = skipRecord;

          if (!record.enabled && !dependencyChanged) {
            // The command doesn't execute this operation, e.g. because of "--only" or because the graph of a
            // daemon's engine contains every operation in the repo. No dependency changed its outputs in this
            // iteration either, so the outputs of this operation still match its record.
            return;
          }

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

          const isPackageUnchanged: boolean = !!(
            lastProjectDeps &&
            packageDeps &&
            packageDeps.arguments === lastProjectDeps.arguments &&
            _areShallowEqual(packageDeps.files, lastProjectDeps.files)
          );

          if (allowSkip && isPackageUnchanged) {
            return OperationStatus.Skipped;
          }

          skipRecord.inputsUnchanged = isPackageUnchanged;

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

      // Captured in a late tap, after the taps that can skip the operation, so that the input files of an operation
      // that does not execute are not read.
      graph.hooks.beforeExecuteOperationAsync.tap(
        { name: PLUGIN_NAME, stage: CAPTURE_INPUT_FILES_STAGE },
        (record: IOperationRunnerContext & IOperationExecutionResult): undefined => {
          const inputFilesCheck: IInputFilesCheck | undefined = stateMap.get(
            record.operation
          )?.inputFilesCheck;
          if (!inputFilesCheck || !record.enabled) {
            return;
          }
          // A later command skips the operation if its input files match the recorded ones, so the file is only
          // written if the input files do not change from the inputs snapshot until the operation has executed.
          const { inputsSnapshot, snapshotStartTimeMs, fileHashes } = inputFilesCheck;
          inputFilesCheck.inputFilesState = captureInputFilesState(
            inputsSnapshot.rootDirectory,
            fileHashes.keys(),
            snapshotStartTimeMs
          );
          // So that IncrementalExecutionGuardPlugin does not check them as well
          markInputFilesChecked(record);
        }
      );

      graph.hooks.afterExecuteOperationAsync.tapPromise(
        PLUGIN_NAME,
        async (record: IOperationRunnerContext & IOperationExecutionResult): Promise<void> => {
          const skipRecord: ILegacySkipRecord | undefined = stateMap.get(record.operation);
          if (!skipRecord?.inputFilesCheck) {
            return;
          }
          const { inputsSnapshot, inputFilesState } = skipRecord.inputFilesCheck;
          skipRecord.inputFilesCheck = undefined;
          const { status } = record;
          if (
            inputFilesState &&
            (status === OperationStatus.Success || status === OperationStatus.SuccessWithWarning) &&
            !isResultUnverifiable(record) &&
            (await haveOperationInputFilesChangedAsync(record, inputsSnapshot, inputFilesState, getGitPath))
          ) {
            markResultUnverifiable(record);
          }
        }
      );

      graph.hooks.afterExecuteOperationAsync.tapPromise(
        { name: PLUGIN_NAME, stage: RECORD_PACKAGE_DEPS_STAGE },
        async (record: IOperationRunnerContext & IOperationExecutionResult): Promise<void> => {
          const { status, operation } = record;

          const skipRecord: ILegacySkipRecord | undefined = stateMap.get(operation);
          if (!skipRecord) {
            return;
          }

          // With "--changed-projects-only", consumers ignore changes to the outputs of their dependencies. An
          // operation that executed although its inputs were unchanged, e.g. in a rebuild, reproduced its
          // outputs, unless its result is unverifiable, e.g. because its inputs changed while it executed.
          const outputsChanged: boolean =
            !changedProjectsOnly &&
            (!skipRecord.inputsUnchanged || isResultUnverifiable(record)) &&
            (status === OperationStatus.Success || status === OperationStatus.SuccessWithWarning);
          const blockSkip: boolean = !skipRecord.allowSkip || outputsChanged;
          // Unlike allowSkip, this doesn't depend on whether the iteration allows skipping, e.g. in a rebuild.
          const dependencyChanged: boolean = skipRecord.dependencyChanged || outputsChanged;
          if (blockSkip) {
            for (const consumer of operation.consumers) {
              const consumerSkipRecord: ILegacySkipRecord | undefined = stateMap.get(consumer);
              if (consumerSkipRecord) {
                consumerSkipRecord.allowSkip = false;
                if (dependencyChanged) {
                  consumerSkipRecord.dependencyChanged = true;
                }
              }
            }
          }

          if (!record.operation.runner!.cacheable) {
            // This operation doesn't support skip detection.
            return;
          }

          const { packageDeps, packageDepsPath } = skipRecord;

          if (wasExecutedIncrementally(record) || isResultUnverifiable(record)) {
            // The outputs of an incremental command can differ from those of the initial command, and the outputs of
            // a run whose input files changed while it ran may not match the recorded inputs, so a later command must
            // not skip the operation.
            return;
          }

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

/**
 * Core phased command plugin for the incremental strategies other than {@link LegacySkipPlugin}, such as
 * build cache restoration. Before an operation executes or restores its outputs, it deletes the record of
 * inputs that {@link LegacySkipPlugin} saved after the operation last succeeded. The outputs may afterwards
 * belong to other inputs, so a later command without the build cache must execute the operation instead of
 * skipping it.
 */
export class LegacySkipInvalidationPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.onGraphCreatedAsync.tap(INVALIDATION_PLUGIN_NAME, (graph) => {
      graph.hooks.beforeExecuteOperationAsync.tapPromise(
        // Ahead of every plugin that may restore the outputs and then bail, such as the build cache plugin
        { name: INVALIDATION_PLUGIN_NAME, stage: -Infinity },
        async (
          record: IOperationRunnerContext & IOperationExecutionResult
        ): Promise<OperationStatus | undefined> => {
          const { operation } = record;
          // A disabled operation neither executes nor restores its outputs.
          if (record.enabled && operation.runner?.cacheable) {
            await FileSystem.deleteFileAsync(_getPackageDepsPath(operation));
          }
          return undefined;
        }
      );
    });
  }
}
