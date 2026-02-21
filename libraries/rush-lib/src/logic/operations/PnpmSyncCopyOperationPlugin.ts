// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ILogMessageCallbackOptions, pnpmSyncCopyAsync } from 'pnpm-sync-lib';

import { Async, FileSystem } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { OperationStatus } from './OperationStatus.ts';
import type { IOperationRunnerContext } from './IOperationRunner.ts';
import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks.ts';
import type { OperationExecutionRecord } from './OperationExecutionRecord.ts';
import { PnpmSyncUtilities } from '../../utilities/PnpmSyncUtilities.ts';
import { RushConstants } from '../RushConstants.ts';

const PLUGIN_NAME: 'PnpmSyncCopyOperationPlugin' = 'PnpmSyncCopyOperationPlugin';

export class PnpmSyncCopyOperationPlugin implements IPhasedCommandPlugin {
  private readonly _terminal: ITerminal;

  public constructor(terminal: ITerminal) {
    this._terminal = terminal;
  }
  public apply(hooks: PhasedCommandHooks): void {
    hooks.afterExecuteOperation.tapPromise(
      PLUGIN_NAME,
      async (runnerContext: IOperationRunnerContext): Promise<void> => {
        const record: OperationExecutionRecord = runnerContext as OperationExecutionRecord;
        const {
          status,
          operation: { associatedProject: project }
        } = record;

        //skip if the phase is skipped or no operation
        if (
          status === OperationStatus.Skipped ||
          status === OperationStatus.NoOp ||
          status === OperationStatus.Failure
        ) {
          return;
        }

        const pnpmSyncJsonPath: string = `${project.projectFolder}/${RushConstants.nodeModulesFolderName}/${RushConstants.pnpmSyncFilename}`;
        if (await FileSystem.exists(pnpmSyncJsonPath)) {
          const { PackageExtractor } = await import(
            /* webpackChunkName: 'PackageExtractor' */
            '@rushstack/package-extractor'
          );
          await pnpmSyncCopyAsync({
            pnpmSyncJsonPath,
            ensureFolderAsync: FileSystem.ensureFolderAsync,
            forEachAsyncWithConcurrency: Async.forEachAsync,
            getPackageIncludedFiles: PackageExtractor.getPackageIncludedFilesAsync,
            logMessageCallback: (logMessageOptions: ILogMessageCallbackOptions) =>
              PnpmSyncUtilities.processLogMessage(logMessageOptions, this._terminal)
          });
        }
      }
    );
  }
}
