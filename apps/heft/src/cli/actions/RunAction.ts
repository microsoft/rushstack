// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ScopedCommandLineAction,
  type CommandLineParameterProvider,
  type CommandLineStringListParameter
} from '@rushstack/ts-command-line';
import { AlreadyReportedError, InternalError, type ITerminal } from '@rushstack/node-core-library';

import { Selection } from '../../utilities/Selection';
import { HeftActionRunner } from '../HeftActionRunner';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { IHeftAction, IHeftActionOptions } from './IHeftAction';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';

export class RunAction extends ScopedCommandLineAction implements IHeftAction {
  public readonly watch: boolean;

  private readonly _internalHeftSession: InternalHeftSession;
  private readonly _terminal: ITerminal;
  private readonly _actionRunner: HeftActionRunner;
  private _toParameter: CommandLineStringListParameter | undefined;
  private _onlyParameter: CommandLineStringListParameter | undefined;
  private _selectedPhases: Set<HeftPhase> | undefined;

  public constructor(options: IHeftActionOptions) {
    super({
      actionName: `run${options.watch ? '-watch' : ''}`,
      documentation: `Run a provided selection of Heft phases${options.watch ? ' in watch mode.' : ''}.`,
      summary: `Run a provided selection of Heft phases${options.watch ? ' in watch mode.' : ''}.`
    });

    this.watch = options.watch ?? false;
    this._terminal = options.terminal;
    this._internalHeftSession = options.internalHeftSession;
    this._actionRunner = new HeftActionRunner({ action: this, ...options });
  }

  public get selectedPhases(): Set<HeftPhase> {
    if (!this._selectedPhases) {
      const toPhases: Set<HeftPhase> = this._evaluatePhaseParameter(this.toParameter, this._terminal);
      const onlyPhases: Set<HeftPhase> = this._evaluatePhaseParameter(this.onlyParameter, this._terminal);
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

  protected get toParameter(): CommandLineStringListParameter {
    if (!this._toParameter) {
      throw new InternalError(`onDefineUnscopedParameters() has not been called.`);
    }
    return this._toParameter;
  }

  protected get onlyParameter(): CommandLineStringListParameter {
    if (!this._onlyParameter) {
      throw new InternalError(`onDefineUnscopedParameters() has not been called.`);
    }
    return this._onlyParameter;
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
    this._actionRunner.defineParameters(scopedParameterProvider);
  }

  protected async onExecute(): Promise<void> {
    await this._actionRunner.executeAsync();
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
      const phase: HeftPhase | undefined = this._internalHeftSession.phasesByName.get(rawSelector);
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
