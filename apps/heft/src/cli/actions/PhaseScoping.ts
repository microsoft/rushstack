// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  CommandLineStringListParameter,
  ICommandLineStringListDefinition,
  ScopedCommandLineAction
} from '@rushstack/ts-command-line';
// Same module (and therefore the same symbol) as `ScopedCommandLineAction.ScopingParameterGroup`, without loading
// the ts-command-line entry point (which loads argparse).
import { SCOPING_PARAMETER_GROUP as SCOPING_PARAMETER_GROUP_SYMBOL } from '@rushstack/ts-command-line/lib/Constants';
import { AlreadyReportedError } from '@rushstack/node-core-library';
import type { ITerminal } from '@rushstack/terminal';

import { Selection } from '../../utilities/Selection';
import type { InternalHeftSession } from '../../pluginFramework/InternalHeftSession';
import type { HeftPhase } from '../../pluginFramework/HeftPhase';
import { Constants } from '../../utilities/Constants';

// The package's public API declarations and its per-module declarations declare distinct types for this symbol.
const SCOPING_PARAMETER_GROUP: typeof ScopedCommandLineAction.ScopingParameterGroup =
  SCOPING_PARAMETER_GROUP_SYMBOL as unknown as typeof ScopedCommandLineAction.ScopingParameterGroup;

/**
 * The subset of a parameter provider that is needed to define the phase scoping parameters.
 */
export interface IPhaseScopingParameterProvider {
  readonly actionName: string;
  defineStringListParameter(definition: ICommandLineStringListDefinition): CommandLineStringListParameter;
}

export interface IScopingParameters {
  toParameter: CommandLineStringListParameter;
  toExceptParameter: CommandLineStringListParameter;
  onlyParameter: CommandLineStringListParameter;
}

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

export function definePhaseScopingParameters(action: IPhaseScopingParameterProvider): IScopingParameters {
  return {
    toParameter: action.defineStringListParameter({
      parameterLongName: Constants.toParameterLongName,
      description: `The phase to ${action.actionName} to, including all transitive dependencies.`,
      argumentName: 'PHASE',
      parameterGroup: SCOPING_PARAMETER_GROUP
    }),
    toExceptParameter: action.defineStringListParameter({
      parameterLongName: Constants.toExceptParameterLongName,
      description: `The phase to ${action.actionName} to (but not include), including all transitive dependencies.`,
      argumentName: 'PHASE',
      parameterGroup: SCOPING_PARAMETER_GROUP
    }),
    onlyParameter: action.defineStringListParameter({
      parameterLongName: Constants.onlyParameterLongName,
      description: `The phase to ${action.actionName}.`,
      argumentName: 'PHASE',
      parameterGroup: SCOPING_PARAMETER_GROUP
    })
  };
}

/**
 * The phases selected by the "clean" action: the scoped selection if any scoping parameter was provided,
 * otherwise all phases.
 */
export function getCleanSelectedPhases(
  scopingParameters: IScopingParameters,
  internalHeftSession: InternalHeftSession,
  terminal: ITerminal
): ReadonlySet<HeftPhase> {
  const { onlyParameter, toParameter, toExceptParameter } = scopingParameters;
  if (onlyParameter.values.length || toParameter.values.length || toExceptParameter.values.length) {
    return expandPhases(onlyParameter, toParameter, toExceptParameter, internalHeftSession, terminal);
  } else {
    // No selected phases, clean everything
    return internalHeftSession.phases;
  }
}

/**
 * The phases selected by a phase action: the phase and all of its transitive dependencies.
 */
export function getPhaseActionSelectedPhases(phase: HeftPhase): Set<HeftPhase> {
  return Selection.recursiveExpand([phase], (p: HeftPhase) => p.dependencyPhases);
}
