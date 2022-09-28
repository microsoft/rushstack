// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { workerData, parentPort } from 'worker_threads';

import { AlreadyReportedError, Import, JsonFile, Path } from '@rushstack/node-core-library';

import { RushCommandLineParser } from '../cli/RushCommandLineParser';
import { IBuiltInPluginConfiguration } from '../pluginFramework/PluginLoader/BuiltInPluginLoader';
import { IPhasedCommand } from '../pluginFramework/RushLifeCycle';
import { Operation } from '../logic/operations/Operation';
import { OperationExecutionRecord } from '../logic/operations/OperationExecutionRecord';
import {
  IExecuteOperationsOptions as IExecuteOperationsOptions,
  PhasedScriptAction
} from '../cli/scriptActions/PhasedScriptAction';
import { IOperationExecutionManagerOptions } from '../logic/operations/OperationExecutionManager';
import { getOperationKey } from '../logic/operations/PhasedOperationPlugin';
import { ProjectChangeAnalyzer } from '../logic/ProjectChangeAnalyzer';
import { ICreateOperationsContext } from '../pluginFramework/PhasedCommandHooks';
import { NullOperationRunner } from '../logic/operations/NullOperationRunner';
import { OperationStatus } from '../logic/operations/OperationStatus';
import { PackageNameParsers } from '../api/PackageNameParsers';
import { RushConstants } from '../logic/RushConstants';
import {
  ITransferableOperation,
  IRushWorkerGraphMessage,
  IRushWorkerRequest,
  IRushWorkerReadyMessage,
  IRushWorkerOperationsMessage,
  ITransferableOperationStatus
} from './RushWorker.types';
import { IAbortSignal } from '../logic/operations/AsyncOperationQueue';

const builtInPluginConfigurations: IBuiltInPluginConfiguration[] = [];

const posixDirname: string = Path.convertToSlashes(__dirname);
const pluginOrigin: string = posixDirname.endsWith('@microsoft/rush-lib/lib/worker')
  ? posixDirname
  : path.resolve(__dirname, '../../../../apps/rush');

function includePlugin(pluginName: string, pluginPackageName?: string): void {
  if (!pluginPackageName) {
    pluginPackageName = `@rushstack/${pluginName}`;
  }
  const pluginPackageFolder: string = Import.resolvePackage({
    packageName: pluginPackageName,
    baseFolderPath: pluginOrigin
  });
  builtInPluginConfigurations.push({
    packageName: pluginPackageName,
    pluginName: pluginName,
    pluginPackageFolder
  });
}

includePlugin('rush-amazon-s3-build-cache-plugin');
includePlugin('rush-azure-storage-build-cache-plugin');
// Including this here so that developers can reuse it without installing the plugin a second time
includePlugin('rush-azure-interactive-auth-plugin', '@rushstack/rush-azure-storage-build-cache-plugin');

if (!workerData || !parentPort) {
  console.error(`This worker must be run in a worker context!`);
  process.exit(1);
}

const parser: RushCommandLineParser = new RushCommandLineParser({
  alreadyReportedNodeTooNewError: true,
  builtInPluginConfigurations,
  excludeDefaultActions: true,
  cwd: workerData.cwd
});

interface IStateRecord {
  status: OperationStatus;
  stateHash: string | undefined;
  mtimes: Record<string, string>;
  duration: number;
}

parser.rushSession.hooks.runAnyPhasedCommand.tapPromise(
  'RushWorkerPlugin',
  async (command: IPhasedCommand) => {
    const stateFilePath: string = `${parser.rushConfiguration.commonTempFolder}/operation-states.json`;
    const operationStates: Map<Operation, IStateRecord> = new Map();
    const oldOperationStates: Map<string, IStateRecord> = new Map();
    try {
      const statesFromFile: [string, IStateRecord][] = await JsonFile.loadAsync(stateFilePath);
      for (const [key, record] of statesFromFile) {
        oldOperationStates.set(key, record);
      }
    } catch (err) {
      console.log(`Failed to load state file: ${err}`);
    }
    const includedOperations: Set<Operation> = new Set();

    const rawCommand: PhasedScriptAction = command as PhasedScriptAction;

    const abortSignal: IAbortSignal = { aborted: false };

    let originalOptions: IExecuteOperationsOptions | undefined;
    const originalExecuteOperations: typeof PhasedScriptAction.prototype._executeOperations =
      rawCommand._executeOperations;

    const operationByKey: Map<string, Operation> = new Map();
    const transferOperationForOperation: Map<Operation, ITransferableOperation> = new Map();
    const unassociatedOperations: Set<Operation> = new Set();

    const { taps: afterExecuteOperationsTaps } = command.hooks.afterExecuteOperations;
    for (let i: number = afterExecuteOperationsTaps.length - 1; i >= 0; i--) {
      // Hack out the summary for now, since it doesn't handle aborting and is wasted work.
      if (afterExecuteOperationsTaps[i].name === 'OperationResultSummarizerPlugin') {
        afterExecuteOperationsTaps.splice(i, 1);
      }
    }

    async function interceptExecuteOperations(
      this: PhasedScriptAction,
      options: IExecuteOperationsOptions
    ): Promise<void> {
      originalOptions = options;
      options.stopwatch.stop();
      options.ignoreHooks = true;

      const { operations } = options;

      for (const operation of operations) {
        const { associatedPhase, associatedProject } = operation;
        let logFilePath: string | undefined;
        if (associatedPhase && associatedProject) {
          const operationKey: string = getOperationKey(associatedPhase, associatedProject);

          operationByKey.set(operationKey, operation);

          const oldState: IStateRecord | undefined = oldOperationStates.get(operationKey);
          if (oldState) {
            operationStates.set(operation, oldState);
          }

          const unscopedProjectName: string = PackageNameParsers.permissive.getUnscopedName(
            associatedProject.packageName
          );

          logFilePath = `${Path.convertToSlashes(associatedProject.projectFolder)}/${
            RushConstants.rushLogsFolderName
          }/${unscopedProjectName}.${associatedPhase.logFilenameIdentifier}.log`;
        } else {
          unassociatedOperations.add(operation);
        }

        const transferableOperation: ITransferableOperation = {
          name: operation.name,
          phase: associatedPhase?.name,
          project: associatedProject?.packageName,

          logFilePath
        };
        transferOperationForOperation.set(operation, transferableOperation);
      }

      const graphMessage: IRushWorkerGraphMessage = {
        type: 'graph',
        value: {
          operations: Array.from(transferOperationForOperation.values())
        }
      };

      parentPort?.postMessage(graphMessage);

      // Wait until aborted
      await runLoop();
    }

    async function runLoop(): Promise<void> {
      let willShutdown: boolean = false;
      let ready: boolean = true;

      let resolveTargets: (targets: string[]) => void;
      let targetsPromise: Promise<string[]> = new Promise<string[]>((resolve) => {
        resolveTargets = resolve;
      });

      const messageHandler: (message: IRushWorkerRequest) => void = (message: IRushWorkerRequest) => {
        abortSignal.aborted = true;

        switch (message.type) {
          case 'shutdown':
            console.error(`Worker is shutting down.`);
            willShutdown = true;
            return resolveTargets([]);
          case 'build':
            ready = false;
            return resolveTargets(message.value.targets);
        }
      };

      parentPort?.on('message', messageHandler);

      const readyMessage: IRushWorkerReadyMessage = {
        type: 'ready',
        value: {}
      };

      // eslint-disable-next-line no-unmodified-loop-condition
      while (!willShutdown) {
        if (ready) {
          parentPort?.postMessage(readyMessage);
        }

        const targets: string[] = await targetsPromise;
        // eslint-disable-next-line require-atomic-updates
        ready = true;
        targetsPromise = new Promise<string[]>((resolve) => {
          resolveTargets = resolve;
        });

        abortSignal.aborted = false;

        if (targets.length) {
          await executeOperations(targets);
        }

        const statesByName: [string, IStateRecord][] = [];
        for (const [operation, record] of operationStates) {
          const { associatedPhase, associatedProject } = operation;
          if (associatedPhase && associatedProject) {
            const operationKey: string = getOperationKey(associatedPhase, associatedProject);
            statesByName.push([operationKey, record]);
          }
        }
        await JsonFile.saveAsync(statesByName, stateFilePath);
      }

      parentPort?.off('message', messageHandler);
      parentPort?.close();

      // Terminate
      process.exit(0);
    }

    function onOperationStatusChanged(record: OperationExecutionRecord): void {
      operationStates.set(record.operation, {
        stateHash: record.stateHash,
        status: record.status,
        duration: record.stopwatch.duration,
        mtimes: {}
      });

      if (!record.silent) {
        const transferOperation: ITransferableOperation = transferOperationForOperation.get(
          record.operation
        )!;
        console.log(
          `Status update: ${record.operation.name} (active) -> ${record.status} (${record.stateHash})`
        );

        const operationMessage: IRushWorkerOperationsMessage = {
          type: 'operations',
          value: {
            operations: [
              {
                operation: transferOperation,

                status: record.status,
                hash: record.stateHash,
                duration: record.stopwatch.duration,
                active: true
              }
            ]
          }
        };

        parentPort?.postMessage(operationMessage);
      }
    }

    function afterOperationHashes(records: Map<Operation, OperationExecutionRecord>): void {
      const activeOperations: ITransferableOperationStatus[] = [];

      // Filter out skippable operations
      for (const [operation, record] of records) {
        const oldRecord: IStateRecord | undefined = operationStates.get(operation);
        const oldHash: string | undefined = oldRecord?.stateHash;

        const transferOperation: ITransferableOperation = transferOperationForOperation.get(operation)!;

        const status: OperationStatus | undefined = oldRecord?.status;
        const skip: boolean =
          status === OperationStatus.NoOp ||
          status === OperationStatus.FromCache ||
          status === OperationStatus.Skipped ||
          status === OperationStatus.Success ||
          status === OperationStatus.SuccessWithWarning;

        if (oldHash && status && skip && oldHash === record.stateHash) {
          // Skip things whose inputs haven't changed
          const silent: boolean = status !== OperationStatus.SuccessWithWarning;
          record.runner = new NullOperationRunner({
            name: record.runner.name,
            result: status,
            silent
          });
          record.silent = silent;

          activeOperations.push({
            operation: transferOperation,
            status: status,
            duration: oldRecord!.duration,
            hash: oldHash,
            active: true
          });
        } else {
          operationStates.set(operation, {
            stateHash: record.stateHash,
            status: record.status,
            duration: record.stopwatch.duration,
            mtimes: {}
          });

          activeOperations.push({
            operation: transferOperation,
            status: record.status,
            duration: record.stopwatch.duration,
            hash: oldHash,
            active: true
          });
        }
      }

      const activeGraphMessage: IRushWorkerOperationsMessage = {
        type: 'operations',
        value: { operations: activeOperations }
      };
      parentPort?.postMessage(activeGraphMessage);
    }

    async function executeOperations(targets: string[]): Promise<void> {
      if (!originalOptions) {
        return;
      }

      console.log(`Scoping build to targets:\n - ${targets.join('\n - ')}`);

      const { executionManagerOptions: originalExecutionManagerOptions } = originalOptions;

      const previousOperations: Set<Operation> = new Set(includedOperations);
      includedOperations.clear();

      for (const operation of unassociatedOperations) {
        includedOperations.add(operation);
      }

      for (const target of targets) {
        const operation: Operation | undefined = operationByKey.get(target);
        if (!operation) {
          console.error(`No such operation ${target}`);
        } else {
          includedOperations.add(operation);
        }
      }

      for (const operation of includedOperations) {
        for (const dependency of operation.dependencies) {
          includedOperations.add(dependency);
        }
      }

      const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(
        parser.rushConfiguration
      );
      const executionManagerOptions: IOperationExecutionManagerOptions = {
        ...originalExecutionManagerOptions,
        afterOperationHashes,
        onOperationStatusChanged
      };

      const createOperationsContext: ICreateOperationsContext = {
        ...originalOptions.createOperationsContext,
        projectChangeAnalyzer
      };

      const newExecuteOperationOptions: IExecuteOperationsOptions = {
        ...originalOptions,
        executionManagerOptions,
        operations: includedOperations,
        createOperationsContext,
        abortSignal
      };

      newExecuteOperationOptions.stopwatch.reset();
      newExecuteOperationOptions.stopwatch.start();

      const removedOperations: ITransferableOperationStatus[] = [];
      for (const operation of previousOperations) {
        if (!includedOperations.has(operation)) {
          const record: IStateRecord | undefined = operationStates.get(operation);
          const transferOperation: ITransferableOperation = transferOperationForOperation.get(operation)!;

          removedOperations.push({
            operation: transferOperation,
            status: record?.status || OperationStatus.Ready,
            duration: record?.duration ?? 0,
            hash: record?.stateHash ?? '',
            active: false
          });
        }
      }

      if (removedOperations.length > 0) {
        const removedMessage: IRushWorkerOperationsMessage = {
          type: 'operations',
          value: {
            operations: removedOperations
          }
        };
        parentPort?.postMessage(removedMessage);
      }

      try {
        await originalExecuteOperations.call(rawCommand, newExecuteOperationOptions);
      } catch (e) {
        if (!(e instanceof AlreadyReportedError)) {
          throw e;
        }
      }
    }

    rawCommand._executeOperations = interceptExecuteOperations;
  }
);

parser.execute(workerData.argv).catch(console.error);
