// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  ScopedCommandLineAction,
  type CommandLineParameterProvider,
  type CommandLineStringListParameter
} from '@rushstack/ts-command-line';
import { AlreadyReportedError } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { Selection } from '../../utilities/Selection';
import { HeftActionRunner } from '../HeftActionRunner';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { IHeftAction, IHeftActionOptions } from './IHeftAction';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';
import { Constants } from '../../utilities/Constants';

export function expandPhases(
  onlyParameter: CommandLineStringListParameter,
  toParameter: CommandLineStringListParameter,
  toExceptParameter: CommandLineStringListParameter,
  internalHeftSession: InternalHeftSession,
  terminal: ITerminal
): Set<HeftPhase> {
  const onlyPhases: Set<HeftPhase> = evaluatePhaseParameter(onlyParameter, internalHeftSession, terminal);
  const toPhases: Set<HeftPhase> = evaluatePhaseParameter(toParameter, internalHeftSession, terminal);
  const toExceptPhases: Set<HeftPhase> = evaluatePhaseParameter(
    toExceptParameter,
    internalHeftSession,
    terminal
  );

  const expandFn: (phase: HeftPhase) => ReadonlySet<HeftPhase> = (phase: HeftPhase) => phase.dependencyPhases;
  const selectedPhases: Set<HeftPhase> = Selection.union(
    Selection.recursiveExpand(toPhases, expandFn),
    Selection.recursiveExpand(Selection.directDependenciesOf(toExceptPhases, expandFn), expandFn),
    onlyPhases
  );
  if (selectedPhases.size === 0) {
    throw new Error(
      'No phases were selected. Provide at least one phase to the ' +
        `${JSON.stringify(Constants.toParameterLongName)}, ` +
        `${JSON.stringify(Constants.toExceptParameterLongName)}, or ` +
        `${JSON.stringify(Constants.onlyParameterLongName)} parameters.`
    );
  }
  return selectedPhases;
}

function evaluatePhaseParameter(
  phaseParameter: CommandLineStringListParameter,
  internalHeftSession: InternalHeftSession,
  terminal: ITerminal
): Set<HeftPhase> {
  const parameterName: string = phaseParameter.longName;
  const selection: Set<HeftPhase> = new Set();
  for (const rawSelector of phaseParameter.values) {
    const phase: HeftPhase | undefined = internalHeftSession.phasesByName.get(rawSelector);
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

export interface IScopingParameters {
  toParameter: CommandLineStringListParameter;
  toExceptParameter: CommandLineStringListParameter;
  onlyParameter: CommandLineStringListParameter;
}

export function definePhaseScopingParameters(action: IHeftAction): IScopingParameters {
  return {
    toParameter: action.defineStringListParameter({
      parameterLongName: Constants.toParameterLongName,
      description: `The phase to ${action.actionName} to, including all transitive dependencies.`,
      argumentName: 'PHASE',
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup
    }),
    toExceptParameter: action.defineStringListParameter({
      parameterLongName: Constants.toExceptParameterLongName,
      description: `The phase to ${action.actionName} to (but not include), including all transitive dependencies.`,
      argumentName: 'PHASE',
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup
    }),
    onlyParameter: action.defineStringListParameter({
      parameterLongName: Constants.onlyParameterLongName,
      description: `The phase to ${action.actionName}.`,
      argumentName: 'PHASE',
      parameterGroup: ScopedCommandLineAction.ScopingParameterGroup
    })
  };
}

export class RunAction extends ScopedCommandLineAction implements IHeftAction {
  public readonly watch: boolean;

  readonly #internalHeftSession: InternalHeftSession;
  readonly #terminal: ITerminal;
  readonly #actionRunner: HeftActionRunner;
  readonly #toParameter: CommandLineStringListParameter;
  readonly #toExceptParameter: CommandLineStringListParameter;
  readonly #onlyParameter: CommandLineStringListParameter;
  #selectedPhases: Set<HeftPhase> | undefined;

  public constructor(options: IHeftActionOptions) {
    super({
      actionName: `run${options.watch ? '-watch' : ''}`,
      documentation: `Run a provided selection of Heft phases${options.watch ? ' in watch mode.' : ''}.`,
      summary: `Run a provided selection of Heft phases${options.watch ? ' in watch mode.' : ''}.`
    });

    this.watch = options.watch ?? false;
    this.#terminal = options.terminal;
    this.#internalHeftSession = options.internalHeftSession;

    const { toParameter, toExceptParameter, onlyParameter } = definePhaseScopingParameters(this);
    this.#toParameter = toParameter;
    this.#toExceptParameter = toExceptParameter;
    this.#onlyParameter = onlyParameter;

    this.#actionRunner = new HeftActionRunner({ action: this, ...options });
  }

  public get selectedPhases(): ReadonlySet<HeftPhase> {
    if (!this.#selectedPhases) {
      this.#selectedPhases = expandPhases(
        this.#onlyParameter,
        this.#toParameter,
        this.#toExceptParameter,
        this.#internalHeftSession,
        this.#terminal
      );
    }
    return this.#selectedPhases;
  }

  protected onDefineScopedParameters(scopedParameterProvider: CommandLineParameterProvider): void {
    this.#actionRunner.defineParameters(scopedParameterProvider);
  }

  protected override async onExecuteAsync(): Promise<void> {
    await this.#actionRunner.executeAsync();
  }
}
