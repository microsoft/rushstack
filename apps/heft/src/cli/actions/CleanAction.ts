// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineAction,
  type CommandLineFlagParameter,
  type CommandLineStringListParameter
} from '@rushstack/ts-command-line';
import type { ITerminal } from '@rushstack/terminal';
import { OperationStatus } from '@rushstack/operation-graph';

import type { IHeftAction, IHeftActionOptions } from './IHeftAction.ts';
import type { HeftPhase } from '../../pluginFramework/HeftPhase.ts';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession.ts';
import type { MetricsCollector } from '../../metrics/MetricsCollector.ts';
import type { HeftPhaseSession } from '../../pluginFramework/HeftPhaseSession.ts';
import type { HeftTaskSession } from '../../pluginFramework/HeftTaskSession.ts';
import { Constants } from '../../utilities/Constants.ts';
import { definePhaseScopingParameters, expandPhases } from './RunAction.ts';
import { deleteFilesAsync, type IDeleteOperation } from '../../plugins/DeleteFilesPlugin.ts';
import { ensureCliAbortSignal, initializeHeft, runWithLoggingAsync } from '../HeftActionRunner.ts';

export class CleanAction extends CommandLineAction implements IHeftAction {
  public readonly watch: boolean = false;
  private readonly _internalHeftSession: InternalHeftSession;
  private readonly _terminal: ITerminal;
  private readonly _metricsCollector: MetricsCollector;
  private readonly _verboseFlag: CommandLineFlagParameter;
  private readonly _toParameter: CommandLineStringListParameter;
  private readonly _toExceptParameter: CommandLineStringListParameter;
  private readonly _onlyParameter: CommandLineStringListParameter;
  private _selectedPhases: ReadonlySet<HeftPhase> | undefined;

  public constructor(options: IHeftActionOptions) {
    super({
      actionName: 'clean',
      documentation: 'Clean the project, removing temporary task folders and specified clean paths.',
      summary: 'Clean the project, removing temporary task folders and specified clean paths.'
    });

    this._terminal = options.terminal;
    this._metricsCollector = options.metricsCollector;
    this._internalHeftSession = options.internalHeftSession;

    const { toParameter, toExceptParameter, onlyParameter } = definePhaseScopingParameters(this);
    this._toParameter = toParameter;
    this._toExceptParameter = toExceptParameter;
    this._onlyParameter = onlyParameter;

    this._verboseFlag = this.defineFlagParameter({
      parameterLongName: Constants.verboseParameterLongName,
      parameterShortName: Constants.verboseParameterShortName,
      description: 'If specified, log information useful for debugging.'
    });
  }

  public get selectedPhases(): ReadonlySet<HeftPhase> {
    if (!this._selectedPhases) {
      if (
        this._onlyParameter.values.length ||
        this._toParameter.values.length ||
        this._toExceptParameter.values.length
      ) {
        this._selectedPhases = expandPhases(
          this._onlyParameter,
          this._toParameter,
          this._toExceptParameter,
          this._internalHeftSession,
          this._terminal
        );
      } else {
        // No selected phases, clean everything
        this._selectedPhases = this._internalHeftSession.phases;
      }
    }
    return this._selectedPhases;
  }

  protected override async onExecuteAsync(): Promise<void> {
    const { heftConfiguration } = this._internalHeftSession;
    const abortSignal: AbortSignal = ensureCliAbortSignal(this._terminal);

    // Record this as the start of task execution.
    this._metricsCollector.setStartTime();
    initializeHeft(heftConfiguration, this._terminal, this._verboseFlag.value);
    await runWithLoggingAsync(
      this._cleanFilesAsync.bind(this),
      this,
      this._internalHeftSession.loggingManager,
      this._terminal,
      this._metricsCollector,
      abortSignal
    );
  }

  private async _cleanFilesAsync(): Promise<OperationStatus> {
    const deleteOperations: IDeleteOperation[] = [];
    for (const phase of this.selectedPhases) {
      // Add the temp folder and cache folder (if requested) for each task
      const phaseSession: HeftPhaseSession = this._internalHeftSession.getSessionForPhase(phase);
      for (const task of phase.tasks) {
        const taskSession: HeftTaskSession = phaseSession.getSessionForTask(task);
        deleteOperations.push({ sourcePath: taskSession.tempFolderPath });
      }
      // Add the manually specified clean operations
      deleteOperations.push(...phase.cleanFiles);
    }

    // Delete the files
    if (deleteOperations.length) {
      const rootFolderPath: string = this._internalHeftSession.heftConfiguration.buildFolderPath;
      await deleteFilesAsync(rootFolderPath, deleteOperations, this._terminal);
    }

    return deleteOperations.length === 0 ? OperationStatus.NoOp : OperationStatus.Success;
  }
}
