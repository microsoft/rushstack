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
import { HeftParameterManager } from '../../configuration/HeftParameterManager';

export interface IPhaseActionOptions extends IHeftActionOptions {
  phase: HeftPhase;
}

export class PhaseAction extends CommandLineAction implements IHeftAction {
  public readonly terminal: ITerminal;
  public readonly loggingManager: LoggingManager;
  public readonly metricsCollector: MetricsCollector;
  public readonly heftConfiguration: HeftConfiguration;

  private _parameterManager: HeftParameterManager;
  private _verboseFlag!: CommandLineFlagParameter;
  private _productionFlag!: CommandLineFlagParameter;
  private _cleanFlag!: CommandLineFlagParameter;
  private _cleanCacheFlag!: CommandLineFlagParameter;

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

    this._parameterManager = new HeftParameterManager();
    this._internalSession = options.internalHeftSession;

    this._selectedPhases = Selection.recursiveExpand(
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
      description: 'If specified, clean the outputs before running each phase.'
    });
    this._cleanCacheFlag = this.defineFlagParameter({
      parameterLongName: '--clean-cache',
      description:
        'If specified, clean the cache before running each phase. To use this flag, the ' +
        '--clean flag must also be provided.'
    });

    // Add all the parameters for the action
    for (const lifecyclePluginDefinition of this._internalSession.lifecycle.pluginDefinitions) {
      this._parameterManager.addPluginParameters(lifecyclePluginDefinition);
    }
    for (const phase of this._selectedPhases) {
      for (const task of phase.tasks) {
        this._parameterManager.addPluginParameters(task.pluginDefinition);
      }
    }

    // Finalize and apply to the CommandLineParameterProvider
    this._parameterManager.finalizeParameters(this);
  }

  protected async onExecute(): Promise<void> {
    // Set the parameter manager on the internal session, which is used to provide the selected
    // parameters to plugins. Set this in onExecute() instead of onDefineParameters() since
    // we now know that this action is being executed, and the session should be populated with
    // the executing parameters.
    this._internalSession.parameterManager = this._parameterManager;

    // Execute the selected phases
    await executeInstrumentedAsync({
      action: this,
      executeAsync: async () => {
        const operations: Set<Operation> = createOperations({
          internalHeftSession: this._internalSession,
          selectedPhases: this._selectedPhases,
          terminal: this.terminal,
          production: this._productionFlag.value,
          verbose: this.verbose,
          clean: this._cleanFlag.value,
          cleanCache: this._cleanCacheFlag.value
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
