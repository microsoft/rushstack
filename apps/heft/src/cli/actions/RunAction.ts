// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ScopedCommandLineAction,
  type CommandLineParameterProvider,
  type CommandLineStringListParameter
} from '@rushstack/ts-command-line';
import { AlreadyReportedError, type ITerminal } from '@rushstack/node-core-library';

import { Selection } from '../../utilities/Selection';
import { HeftActionRunner } from '../HeftActionRunner';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { IHeftAction, IHeftActionOptions } from './IHeftAction';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';
import { Constants } from '../../utilities/Constants';

export class RunAction extends ScopedCommandLineAction implements IHeftAction {
  public readonly watch: boolean;

  private readonly _internalHeftSession: InternalHeftSession;
  private readonly _terminal: ITerminal;
  private readonly _actionRunner: HeftActionRunner;
  private readonly _toParameter: CommandLineStringListParameter;
  private readonly _toExceptParameter: CommandLineStringListParameter;
  private readonly _onlyParameter: CommandLineStringListParameter;
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
    this._toParameter = this.defineStringListParameter({
      parameterLongName: Constants.toParameterLongName,
      parameterShortName: Constants.toParameterShortName,
      description: 'The phase to run to, including all transitive dependencies.',
      argumentName: 'PHASE',
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup
    });
    this._toExceptParameter = this.defineStringListParameter({
      parameterLongName: Constants.toExceptParameterLongName,
      parameterShortName: Constants.toExceptParameterShortName,
      description: 'The phase to run to (but not include), including all transitive dependencies.',
      argumentName: 'PHASE',
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup
    });
    this._onlyParameter = this.defineStringListParameter({
      parameterLongName: Constants.onlyParameterLongName,
      parameterShortName: Constants.onlyParameterShortName,
      description: 'The phase to run.',
      argumentName: 'PHASE',
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup
    });
  }

  public get selectedPhases(): Set<HeftPhase> {
    if (!this._selectedPhases) {
      const toPhases: Set<HeftPhase> = this._evaluatePhaseParameter(this._toParameter, this._terminal);
      const toExceptPhases: Set<HeftPhase> = this._evaluatePhaseParameter(
        this._toExceptParameter,
        this._terminal
      );
      const onlyPhases: Set<HeftPhase> = this._evaluatePhaseParameter(this._onlyParameter, this._terminal);

      const expandFn: (phase: HeftPhase) => ReadonlySet<HeftPhase> = (phase: HeftPhase) =>
        phase.dependencyPhases;
      this._selectedPhases = Selection.union(
        Selection.recursiveExpand(toPhases, expandFn),
        Selection.recursiveExpand(Selection.directDependenciesOf(toExceptPhases, expandFn), expandFn),
        onlyPhases
      );
      if (this._selectedPhases.size === 0) {
        throw new Error(
          'No phases were selected. Provide at least one phase to the ' +
            `${JSON.stringify(Constants.toParameterLongName)}, ` +
            `${JSON.stringify(Constants.toExceptParameterLongName)}, or ` +
            `${JSON.stringify(Constants.onlyParameterLongName)} parameters.`
        );
      }
    }
    return this._selectedPhases;
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    this._actionRunner.defineParameters(scopedParameterProvider);
  }

  protected async onExecute(): Promise<void> {
    await this._actionRunner.executeAsync();
  }

  private _evaluatePhaseParameter(
    phaseParameter: CommandLineStringListParameter,
    terminal: ITerminal
  ): Set<HeftPhase> {
    const parameterName: string = phaseParameter.longName;
    const selection: Set<HeftPhase> = new Set();
    for (const rawSelector of phaseParameter.values) {
      const phase: HeftPhase | undefined = this._internalHeftSession.phasesByName.get(rawSelector);
      if (!phase) {
        terminal.writeErrorLine(
          `The phase name ${JSON.stringify(rawSelector)} passed to ${JSON.stringify(parameterName)} does ` +
            'not exist in heft.json.'
        );
        throw new AlreadyReportedError();
      }
      selection.add(phase);
    }
    return selection;
  }
}
