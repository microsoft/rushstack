// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';
import { OperationStatus } from '@rushstack/operation-graph/lib/OperationStatus';

import type { IHeftAction } from './IHeftAction';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { MetricsCollector } from '../../metrics/MetricsCollector';
import type { HeftPhaseSession } from '../../pluginFramework/HeftPhaseSession';
import type { HeftTaskSession } from '../../pluginFramework/HeftTaskSession';
import { deleteFilesAsync, type IDeleteOperation } from '../../plugins/DeleteFilesPlugin';
import { ensureCliAbortSignal, initializeHeft, runWithLoggingAsync } from '../HeftActionRunner';

export interface ICleanActionExecutionOptions {
  readonly action: IHeftAction;
  readonly internalHeftSession: InternalHeftSession;
  readonly terminal: ITerminal;
  readonly metricsCollector: MetricsCollector;
  readonly isVerbose: boolean;
}

/**
 * Implements the "clean" action. Shared by the full and the lean command-line implementations.
 */
export async function executeCleanActionAsync(options: ICleanActionExecutionOptions): Promise<void> {
  const { action, internalHeftSession, terminal, metricsCollector, isVerbose } = options;
  const { heftConfiguration } = internalHeftSession;
  const abortSignal: AbortSignal = ensureCliAbortSignal(terminal);

  // Record this as the start of task execution.
  metricsCollector.setStartTime();
  initializeHeft(heftConfiguration, terminal, isVerbose);
  await runWithLoggingAsync(
    () => cleanFilesAsync(action, internalHeftSession, terminal),
    action,
    internalHeftSession.loggingManager,
    terminal,
    metricsCollector,
    abortSignal
  );
}

async function cleanFilesAsync(
  action: IHeftAction,
  internalHeftSession: InternalHeftSession,
  terminal: ITerminal
): Promise<OperationStatus> {
  const deleteOperations: IDeleteOperation[] = [];
  for (const phase of action.selectedPhases) {
    // Add the temp folder and cache folder (if requested) for each task
    const phaseSession: HeftPhaseSession = internalHeftSession.getSessionForPhase(phase);
    for (const task of phase.tasks) {
      const taskSession: HeftTaskSession = phaseSession.getSessionForTask(task);
      deleteOperations.push({ sourcePath: taskSession.tempFolderPath });
    }
    // Add the manually specified clean operations
    deleteOperations.push(...phase.cleanFiles);
  }

  // Delete the files
  if (deleteOperations.length) {
    const rootFolderPath: string = internalHeftSession.heftConfiguration.buildFolderPath;
    await deleteFilesAsync(rootFolderPath, deleteOperations, terminal);
  }

  return deleteOperations.length === 0 ? OperationStatus.NoOp : OperationStatus.Success;
}
