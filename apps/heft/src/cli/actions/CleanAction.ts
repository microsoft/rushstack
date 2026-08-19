// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineAction,
  type CommandLineFlagParameter,
  type CommandLineStringListParameter
} from '@rushstack/ts-command-line';
import type { ITerminal } from '@rushstack/terminal';
import { OperationStatus } from '@rushstack/operation-graph';

import type { IHeftAction, IHeftActionOptions } from './IHeftAction';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { MetricsCollector } from '../../metrics/MetricsCollector';
import type { HeftPhaseSession } from '../../pluginFramework/HeftPhaseSession';
import type { HeftTaskSession } from '../../pluginFramework/HeftTaskSession';
import { Constants } from '../../utilities/Constants';
import { definePhaseScopingParameters, expandPhases } from './RunAction';
import { deleteFilesAsync, type IDeleteOperation } from '../../plugins/DeleteFilesPlugin';
import { ensureCliAbortSignal, initializeHeft, runWithLoggingAsync } from '../HeftActionRunner';

export class CleanAction extends CommandLineAction implements IHeftAction {
  public readonly watch: boolean = false;
  readonly #internalHeftSession: InternalHeftSession;
  readonly #terminal: ITerminal;
  readonly #metricsCollector: MetricsCollector;
  readonly #verboseFlag: CommandLineFlagParameter;
  readonly #toParameter: CommandLineStringListParameter;
  readonly #toExceptParameter: CommandLineStringListParameter;
  readonly #onlyParameter: CommandLineStringListParameter;
  #selectedPhases: ReadonlySet<HeftPhase> | undefined;

  public constructor(options: IHeftActionOptions) {
    super({
      actionName: 'clean',
      documentation: 'Clean the project, removing temporary task folders and specified clean paths.',
      summary: 'Clean the project, removing temporary task folders and specified clean paths.'
    });

    this.#terminal = options.terminal;
    this.#metricsCollector = options.metricsCollector;
    this.#internalHeftSession = options.internalHeftSession;

    const { toParameter, toExceptParameter, onlyParameter } = definePhaseScopingParameters(this);
    this.#toParameter = toParameter;
    this.#toExceptParameter = toExceptParameter;
    this.#onlyParameter = onlyParameter;

    this.#verboseFlag = this.defineFlagParameter({
      parameterLongName: Constants.verboseParameterLongName,
      parameterShortName: Constants.verboseParameterShortName,
      description: 'If specified, log information useful for debugging.'
    });
  }

  public get selectedPhases(): ReadonlySet<HeftPhase> {
    if (!this.#selectedPhases) {
      if (
        this.#onlyParameter.values.length ||
        this.#toParameter.values.length ||
        this.#toExceptParameter.values.length
      ) {
        this.#selectedPhases = expandPhases(
          this.#onlyParameter,
          this.#toParameter,
          this.#toExceptParameter,
          this.#internalHeftSession,
          this.#terminal
        );
      } else {
        // No selected phases, clean everything
        this.#selectedPhases = this.#internalHeftSession.phases;
      }
    }
    return this.#selectedPhases;
  }

  protected override async onExecuteAsync(): Promise<void> {
    const { heftConfiguration } = this.#internalHeftSession;
    const abortSignal: AbortSignal = ensureCliAbortSignal(this.#terminal);

    // Record this as the start of task execution.
    this.#metricsCollector.setStartTime();
    initializeHeft(heftConfiguration, this.#terminal, this.#verboseFlag.value);
    await runWithLoggingAsync(
      this._cleanFilesAsync.bind(this),
      this,
      this.#internalHeftSession.loggingManager,
      this.#terminal,
      this.#metricsCollector,
      abortSignal
    );
  }

  private async _cleanFilesAsync(): Promise<OperationStatus> {
    const deleteOperations: IDeleteOperation[] = [];
    for (const phase of this.selectedPhases) {
      // Add the temp folder and cache folder (if requested) for each task
      const phaseSession: HeftPhaseSession = this.#internalHeftSession.getSessionForPhase(phase);
      for (const task of phase.tasks) {
        const taskSession: HeftTaskSession = phaseSession.getSessionForTask(task);
        deleteOperations.push({ sourcePath: taskSession.tempFolderPath });
      }
      // Add the manually specified clean operations
      deleteOperations.push(...phase.cleanFiles);
    }

    // Delete the files
    if (deleteOperations.length) {
      const rootFolderPath: string = this.#internalHeftSession.heftConfiguration.buildFolderPath;
      await deleteFilesAsync(rootFolderPath, deleteOperations, this.#terminal);
    }

    return deleteOperations.length === 0 ? OperationStatus.NoOp : OperationStatus.Success;
  }
}
