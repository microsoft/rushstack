// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async, FileSystem } from '@rushstack/node-core-library';
import { pnpmSyncCopyAsync } from 'pnpm-sync-lib';

import { OperationStatus } from './OperationStatus';
import type { IOperationRunnerContext } from './IOperationRunner';
import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';
import type { OperationExecutionRecord } from './OperationExecutionRecord';

const PLUGIN_NAME: 'PnpmSyncCopyOperationPlugin' = 'PnpmSyncCopyOperationPlugin';

export class PnpmSyncCopyOperationPlugin implements IPhasedCommandPlugin {
  public apply(hooks: PhasedCommandHooks): void {
    hooks.afterExecuteOperation.tapPromise(
      PLUGIN_NAME,
      async (runnerContext: IOperationRunnerContext): Promise<void> => {
        const record: OperationExecutionRecord = runnerContext as OperationExecutionRecord;
        const {
          status,
          operation: { associatedProject: project }
        } = record;

        //skip if the phase is skipped, from cache or no operation
        if (
          status === OperationStatus.Skipped ||
          status === OperationStatus.FromCache ||
          status === OperationStatus.NoOp
        ) {
          return;
        }

        if (project) {
          const pnpmSyncJsonPath: string = `${project.projectFolder}/node_modules/.pnpm-sync.json`;
          if (await FileSystem.exists(pnpmSyncJsonPath)) {
            const { PackageExtractor } = await import(
              /* webpackChunkName: 'PackageExtractor' */
              '@rushstack/package-extractor'
            );
            await pnpmSyncCopyAsync({
              pnpmSyncJsonPath,
              ensureFolder: FileSystem.ensureFolderAsync,
              forEachAsyncWithConcurrency: Async.forEachAsync,
              getPackageIncludedFiles: PackageExtractor.getPackageIncludedFilesAsync
            });
          }
        }
      }
    );
  }
}
