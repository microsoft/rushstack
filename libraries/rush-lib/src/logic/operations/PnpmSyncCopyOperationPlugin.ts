// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';

import { OperationStatus } from './OperationStatus';
import type { IOperationRunnerContext } from './IOperationRunner';
import type { IPhasedCommandPlugin, PhasedCommandHooks } from '../../pluginFramework/PhasedCommandHooks';
import type { OperationExecutionRecord } from './OperationExecutionRecord';
import { pnpmSyncCopy } from 'pnpm-sync-lib';

const PLUGIN_NAME: 'PnpmSyncCopyOperationPlugin' = 'PnpmSyncCopyOperationPlugin';

export class PnpmSyncCopyOperationPlugin implements IPhasedCommandPlugin {
  public constructor() {}

  public apply(hooks: PhasedCommandHooks): void {
    hooks.afterExecuteOperation.tapPromise(
      PLUGIN_NAME,
      async (runnerContext: IOperationRunnerContext): Promise<void> => {
        const record: OperationExecutionRecord = runnerContext as OperationExecutionRecord;
        const {
          status,
          operation: { associatedProject: project, associatedPhase: phase }
        } = record;

        //skip if phase is not build
        if (phase?.name !== 'build') {
          return;
        }

        //skip if `rush build` is skipped, from cache or no operation
        if (
          status === OperationStatus.Skipped ||
          status === OperationStatus.FromCache ||
          status === OperationStatus.NoOp
        ) {
          return;
        }

        const pnpmSyncJsonPath: string = project?.projectFolder + '/node_modules/.pnpm-sync.json';
        if (FileSystem.exists(pnpmSyncJsonPath)) {
          await pnpmSyncCopy(pnpmSyncJsonPath);
        }
      }
    );
  }
}
