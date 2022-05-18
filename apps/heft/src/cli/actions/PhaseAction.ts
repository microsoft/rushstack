// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction, CommandLineFlagParameter } from '@rushstack/ts-command-line';
import type { ITerminal } from '@rushstack/node-core-library';

import {
  createOperations,
  initializeAction,
  executeInstrumentedAsync
} from '../../utilities/HeftActionUtilities';
import {
  IOperationExecutionManagerOptions,
  OperationExecutionManager
} from '../../operations/OperationExecutionManager';
import { Operation } from '../../operations/Operation';
import { Selection } from '../../utilities/Selection';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { HeftConfiguration } from '../../configuration/HeftConfiguration';
import type { LoggingManager } from '../../pluginFramework/logging/LoggingManager';
import type { MetricsCollector } from '../../metrics/MetricsCollector';
import type { IHeftAction, IHeftActionOptions } from './IHeftAction';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';

export interface IPhaseActionOptions extends IHeftActionOptions {
  phase: HeftPhase;
}

export class PhaseAction extends CommandLineAction implements IHeftAction {
  public readonly terminal: ITerminal;
  public readonly loggingManager: LoggingManager;
  public readonly metricsCollector: MetricsCollector;
  public readonly heftConfiguration: HeftConfiguration;

  private _verboseFlag!: CommandLineFlagParameter;
  private _productionFlag!: CommandLineFlagParameter;
  private _cleanFlag!: CommandLineFlagParameter;

  private _internalSession: InternalHeftSession;
  private _selectedPhases: Set<HeftPhase>;

  public get verbose(): boolean {
    return this._verboseFlag.value;
  }

  public constructor(options: IPhaseActionOptions) {
    super({
      actionName: options.phase.phaseName,
      documentation:
        `Runs to the ${options.phase.phaseName} phase, including all transitive dependencies.` +
        (options.phase.phaseDescription ? `  ${options.phase.phaseDescription}` : ''),
      summary: `Runs to the ${options.phase.phaseName} phase, including all transitive dependencies.`
    });

    this.terminal = options.terminal;
    this.loggingManager = options.loggingManager;
    this.metricsCollector = options.metricsCollector;
    this.heftConfiguration = options.heftConfiguration;

    this._internalSession = options.internalHeftSession;

    this._selectedPhases = Selection.expandAllDependencies(
      [options.phase],
      (phase: HeftPhase) => phase.dependencyPhases
    );

    initializeAction(this);
  }

  public onDefineParameters(): void {
    this._verboseFlag = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'If specified, log information useful for debugging.'
    });
    this._productionFlag = this.defineFlagParameter({
      parameterLongName: '--production',
      description: 'If specified, run Heft in production mode.'
    });
    this._cleanFlag = this.defineFlagParameter({
      parameterLongName: '--clean',
      description: 'If specified, clean the package before running.'
    });

    for (const phase of this._selectedPhases) {
      for (const task of phase.tasks) {
        task.pluginDefinition.defineParameters(this);
      }
    }
  }

  protected async onExecute(): Promise<void> {
    await executeInstrumentedAsync({
      action: this,
      executeAsync: async () => {
        const operations: Set<Operation> = createOperations({
          internalHeftSession: this._internalSession,
          terminal: this.terminal,
          production: this._productionFlag.value,
          clean: this._cleanFlag.value
        });
        const operationExecutionManagerOptions: IOperationExecutionManagerOptions = {
          loggingManager: this.loggingManager,
          terminal: this.terminal,
          debugMode: this._internalSession.debugMode,
          // TODO: Allow for running non-parallelized operations.
          parallelism: undefined
        };
        const executionManager: OperationExecutionManager = new OperationExecutionManager(
          operations,
          operationExecutionManagerOptions
        );
        await executionManager.executeAsync();
      }
    });
  }
}
