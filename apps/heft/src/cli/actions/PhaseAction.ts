// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineAction } from '@rushstack/ts-command-line';
import { InternalError, ITerminal } from '@rushstack/node-core-library';

import {
  initializeAction,
  defineHeftActionParameters,
  executeHeftAction
} from '../../utilities/HeftActionUtilities';
import { Selection } from '../../utilities/Selection';
import { HeftParameterManager } from '../../pluginFramework/HeftParameterManager';
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
  public readonly internalHeftSession: InternalHeftSession;
  public readonly terminal: ITerminal;
  public readonly loggingManager: LoggingManager;
  public readonly metricsCollector: MetricsCollector;
  public readonly heftConfiguration: HeftConfiguration;
  public readonly phase: HeftPhase;

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
      this._selectedPhases = Selection.recursiveExpand(
        [this.phase],
        (phase: HeftPhase) => phase.dependencyPhases
      );
    }
    return this._selectedPhases;
  }

  public constructor(options: IPhaseActionOptions) {
    super({
      actionName: options.phase.phaseName,
      documentation:
        `Runs to the ${options.phase.phaseName} phase, including all transitive dependencies.` +
        (options.phase.phaseDescription ? `  ${options.phase.phaseDescription}` : ''),
      summary: `Runs to the ${options.phase.phaseName} phase, including all transitive dependencies.`
    });

    this.internalHeftSession = options.internalHeftSession;
    this.terminal = options.terminal;
    this.loggingManager = options.loggingManager;
    this.metricsCollector = options.metricsCollector;
    this.heftConfiguration = options.heftConfiguration;
    this.phase = options.phase;

    initializeAction(this);
  }

  public onDefineParameters(): void {
    defineHeftActionParameters(this);
  }

  protected async onExecute(): Promise<void> {
    await executeHeftAction(this);
  }
}
