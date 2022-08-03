// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineParameterProvider,
  CommandLineStringListParameter,
  ScopedCommandLineAction
} from '@rushstack/ts-command-line';
import { AlreadyReportedError, InternalError, ITerminal } from '@rushstack/node-core-library';

import {
  initializeAction,
  defineHeftActionParameters,
  executeHeftAction
} from '../../utilities/HeftActionUtilities';
import { Selection } from '../../utilities/Selection';
import { HeftParameterManager } from '../../pluginFramework/HeftParameterManager';
import type { HeftConfiguration } from '../../configuration/HeftConfiguration';
import type { LoggingManager } from '../../pluginFramework/logging/LoggingManager';
import type { MetricsCollector } from '../../metrics/MetricsCollector';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { IHeftAction, IHeftActionOptions } from './IHeftAction';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';

export class RunAction extends ScopedCommandLineAction implements IHeftAction {
  public readonly internalHeftSession: InternalHeftSession;
  public readonly terminal: ITerminal;
  public readonly loggingManager: LoggingManager;
  public readonly metricsCollector: MetricsCollector;
  public readonly heftConfiguration: HeftConfiguration;

  private _toParameter: CommandLineStringListParameter | undefined;
  private _onlyParameter: CommandLineStringListParameter | undefined;

  private _parameterManager: HeftParameterManager | undefined;
  public get parameterManager(): HeftParameterManager {
    if (!this._parameterManager) {
      throw new InternalError(`onDefineParameters() has not been called.`);
    }
    return this._parameterManager;
  }

  public set parameterManager(parameterManager: HeftParameterManager) {
    this._parameterManager = parameterManager;
  }

  private _selectedPhases: Set<HeftPhase> | undefined;
  public get selectedPhases(): Set<HeftPhase> {
    if (!this._selectedPhases) {
      const toPhases: Set<HeftPhase> = this._evaluatePhaseParameter(this._toParameter!, this.terminal);
      const onlyPhases: Set<HeftPhase> = this._evaluatePhaseParameter(this._onlyParameter!, this.terminal);
      this._selectedPhases = Selection.union(
        Selection.recursiveExpand(toPhases, (phase: HeftPhase) => phase.dependencyPhases),
        onlyPhases
      );

      if (this._selectedPhases.size === 0) {
        throw new Error(
          'No phases were selected. Provide at least one phase to the "--to" or "--only" parameters.'
        );
      }
    }
    return this._selectedPhases;
  }

  public constructor(options: IHeftActionOptions) {
    super({
      actionName: 'run',
      documentation: 'Run a provided selection of Heft phases.',
      summary: 'Run a provided selection of Heft phases.'
    });

    this.internalHeftSession = options.internalHeftSession;
    this.terminal = options.terminal;
    this.loggingManager = options.loggingManager;
    this.metricsCollector = options.metricsCollector;
    this.heftConfiguration = options.heftConfiguration;

    initializeAction(this);
  }

  protected onDefineUnscopedParameters(): void {
    this._toParameter = this.defineStringListParameter({
      parameterLongName: '--to',
      parameterShortName: '-t',
      description: 'The phase to run to, including all transitive dependencies.',
      argumentName: 'PHASE',
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup
    });
    this._onlyParameter = this.defineStringListParameter({
      parameterLongName: '--only',
      parameterShortName: '-o',
      description: 'The phase to run.',
      argumentName: 'PHASE',
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup
    });
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    defineHeftActionParameters(this, scopedParameterProvider);
  }

  protected async onExecute(): Promise<void> {
    await executeHeftAction(this);
  }

  private _evaluatePhaseParameter(
    phaseParameter: CommandLineStringListParameter | undefined,
    terminal: ITerminal
  ): Set<HeftPhase> {
    if (!phaseParameter) {
      throw new InternalError(`onDefineParameters() has not been called.`);
    }

    const parameterName: string = phaseParameter.longName;
    const selection: Set<HeftPhase> = new Set();

    for (const rawSelector of phaseParameter.values) {
      const phase: HeftPhase | undefined = this.internalHeftSession.phasesByName.get(rawSelector);
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
