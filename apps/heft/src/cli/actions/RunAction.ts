// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineFlagParameter,
  CommandLineParameterProvider,
  CommandLineStringListParameter,
  ScopedCommandLineAction
} from '@rushstack/ts-command-line';
import { AlreadyReportedError, InternalError, ITerminal } from '@rushstack/node-core-library';

import {
  createOperations,
  executeInstrumentedAsync,
  initializeAction
} from '../../utilities/HeftActionUtilities';
import { Selection } from '../../utilities/Selection';
import {
  OperationExecutionManager,
  type IOperationExecutionManagerOptions
} from '../../operations/OperationExecutionManager';
import { HeftParameterManager } from '../../configuration/HeftParameterManager';
import type { HeftConfiguration } from '../../configuration/HeftConfiguration';
import type { LoggingManager } from '../../pluginFramework/logging/LoggingManager';
import type { MetricsCollector } from '../../metrics/MetricsCollector';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { IHeftAction, IHeftActionOptions } from './IHeftAction';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';
import type { Operation } from '../../operations/Operation';

export interface IRunActionOptions extends IHeftActionOptions {}

export class RunAction extends ScopedCommandLineAction implements IHeftAction {
  public readonly terminal: ITerminal;
  public readonly loggingManager: LoggingManager;
  public readonly metricsCollector: MetricsCollector;
  public readonly heftConfiguration: HeftConfiguration;

  private _parameterManager: HeftParameterManager;
  private _verboseFlag!: CommandLineFlagParameter;
  private _productionFlag!: CommandLineFlagParameter;
  private _cleanFlag!: CommandLineFlagParameter;
  private _cleanCacheFlag!: CommandLineFlagParameter;
  private _to!: CommandLineStringListParameter;
  private _only!: CommandLineStringListParameter;

  private _internalSession: InternalHeftSession;
  private _selectedPhases: Set<HeftPhase> | undefined;

  public get verbose(): boolean {
    return this._verboseFlag.value;
  }

  public constructor(options: IRunActionOptions) {
    super({
      actionName: 'run',
      documentation: 'Run a provided selection of Heft phases.',
      summary: 'Run a provided selection of Heft phases.'
    });

    this.terminal = options.terminal;
    this.loggingManager = options.loggingManager;
    this.metricsCollector = options.metricsCollector;
    this.heftConfiguration = options.heftConfiguration;

    this._parameterManager = new HeftParameterManager();
    this._internalSession = options.internalHeftSession;

    initializeAction(this);
  }

  protected onDefineUnscopedParameters(): void {
    this._to = this.defineStringListParameter({
      parameterLongName: '--to',
      parameterShortName: '-t',
      description: 'The phase to run to, including all transitive dependencies.',
      argumentName: 'PHASE',
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup
    });
    this._only = this.defineStringListParameter({
      parameterLongName: '--only',
      parameterShortName: '-o',
      description: 'The phase to run.',
      argumentName: 'PHASE',
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup
    });
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    // Define these flags here, since we want them to be available to all scoped actions.
    // It also makes it easier to append these flags when using NPM scripts, for example:
    // "npm run <script> -- --production"
    this._verboseFlag = scopedParameterProvider.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'If specified, log information useful for debugging.'
    });
    this._productionFlag = scopedParameterProvider.defineFlagParameter({
      parameterLongName: '--production',
      description: 'If specified, run Heft in production mode.'
    });
    this._cleanFlag = scopedParameterProvider.defineFlagParameter({
      parameterLongName: '--clean',
      description: 'If specified, clean the outputs before running each phase.'
    });
    this._cleanCacheFlag = scopedParameterProvider.defineFlagParameter({
      parameterLongName: '--clean-cache',
      description:
        'If specified, clean the cache before running each phase. To use this flag, the ' +
        '--clean flag must also be provided.'
    });

    const [toPhases, onlyPhases] = [this._to, this._only].map((listParameter) => {
      return this._evaluatePhaseParameter(listParameter, this.terminal);
    });

    this._selectedPhases = Selection.union(
      Selection.expandAllDependencies(toPhases, (phase: HeftPhase) => phase.dependencyPhases),
      onlyPhases
    );

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
    this._parameterManager.finalizeParameters(scopedParameterProvider);

    // Set the parameter provider on the internal session, which is used to provide the selected
    // parameters to plugins. Set this now since the second phase of parsing for a ScopedCommandLineAction
    // is executed during action execution, so we know this action is being executed, and the session
    // should be populated with the executing parameters.
    this._internalSession.parameterManager = this._parameterManager;
  }

  protected async onExecute(): Promise<void> {
    if (!this._selectedPhases) {
      throw new InternalError('onDefineScopedParameters() must be called before onExecute()');
    }

    await executeInstrumentedAsync({
      action: this,
      executeAsync: async () => {
        const operations: Set<Operation> = createOperations({
          internalHeftSession: this._internalSession,
          selectedPhases: this._selectedPhases!,
          terminal: this.terminal,
          production: this._productionFlag.value,
          verbose: this._verboseFlag.value,
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

  private _evaluatePhaseParameter(
    listParameter: CommandLineStringListParameter,
    terminal: ITerminal
  ): Set<HeftPhase> {
    const parameterName: string = listParameter.longName;
    const selection: Set<HeftPhase> = new Set();

    for (const rawSelector of listParameter.values) {
      const phase: HeftPhase | undefined = this._internalSession.phasesByName.get(rawSelector);
      if (!phase) {
        terminal.writeErrorLine(
          `The phase name "${rawSelector}" passed to "${parameterName}" does not exist in heft.json.`
        );
        throw new AlreadyReportedError();
      }
      selection.add(phase);
    }
    return selection;
  }
}
