// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// IMPORTANT: This module must not load the "@rushstack/ts-command-line" package entry point, because doing so
// loads "argparse". Only the parameter classes are loaded (via their own modules, which are the same module
// instances that the package entry point re-exports), so the parameter objects handed to plugins are genuine
// ts-command-line instances.
import type {
  CommandLineChoiceListParameter,
  CommandLineChoiceParameter,
  CommandLineFlagParameter,
  CommandLineIntegerListParameter,
  CommandLineIntegerParameter,
  CommandLineParameter,
  CommandLineParameterProvider,
  CommandLineRemainder,
  CommandLineStringListParameter,
  CommandLineStringParameter,
  ICommandLineChoiceDefinition,
  ICommandLineChoiceListDefinition,
  ICommandLineFlagDefinition,
  ICommandLineIntegerDefinition,
  ICommandLineIntegerListDefinition,
  ICommandLineRemainderDefinition,
  ICommandLineStringDefinition,
  ICommandLineStringListDefinition
} from '@rushstack/ts-command-line';
// The declarations of the package's own modules include the @internal members (such as _setValue()), which the
// package's public API rollup omits.
import {
  CommandLineParameterKind,
  type CommandLineParameter as InternalCommandLineParameter
} from '@rushstack/ts-command-line/lib/parameters/BaseClasses';
import type { CommandLineChoiceParameter as ChoiceParameterClass } from '@rushstack/ts-command-line/lib/parameters/CommandLineChoiceParameter';
import type { CommandLineChoiceListParameter as ChoiceListParameterClass } from '@rushstack/ts-command-line/lib/parameters/CommandLineChoiceListParameter';
import { CommandLineFlagParameter as FlagParameterClass } from '@rushstack/ts-command-line/lib/parameters/CommandLineFlagParameter';
import type { CommandLineIntegerParameter as IntegerParameterClass } from '@rushstack/ts-command-line/lib/parameters/CommandLineIntegerParameter';
import type { CommandLineIntegerListParameter as IntegerListParameterClass } from '@rushstack/ts-command-line/lib/parameters/CommandLineIntegerListParameter';
import type { CommandLineStringParameter as StringParameterClass } from '@rushstack/ts-command-line/lib/parameters/CommandLineStringParameter';
import { CommandLineStringListParameter as StringListParameterClass } from '@rushstack/ts-command-line/lib/parameters/CommandLineStringListParameter';
import type { CommandLineRemainder as RemainderClass } from '@rushstack/ts-command-line/lib/parameters/CommandLineRemainder';
import { SCOPING_PARAMETER_GROUP } from '@rushstack/ts-command-line/lib/Constants';

import {
  HELP_ACTION,
  REMAINDER,
  SUPPRESS,
  ZERO_OR_MORE,
  type IHelpAction,
  type IHelpActionGroup,
  type IHelpParser
} from './HelpModel';

// Heft's built-in parameters are flags and string lists; the classes for the other kinds of parameters (and for
// the remainder) are only loaded if a parameter of that kind is defined.
let _choiceParameterClass: typeof ChoiceParameterClass | undefined;
let _choiceListParameterClass: typeof ChoiceListParameterClass | undefined;
let _integerParameterClass: typeof IntegerParameterClass | undefined;
let _integerListParameterClass: typeof IntegerListParameterClass | undefined;
let _stringParameterClass: typeof StringParameterClass | undefined;
let _remainderClass: typeof RemainderClass | undefined;

const INTEGER_REGEXP: RegExp = /^[0-9]+$/;

let _keyCounter: number = 0;

/**
 * Describes what a single command-line token means to a lean parser.
 * - a parameter: the token is a registered option string of that parameter
 * - 'help': the token is the argparse built-in help option
 * - 'ambiguous': the token is registered only to report an ambiguity error
 */
export type LeanOptionTarget = InternalCommandLineParameter | 'help' | 'ambiguous';

/**
 * A model of the argparse registrations that ts-command-line would perform for a parameter provider.
 */
export interface ILeanRegistration {
  /**
   * Maps every argparse option string of the provider to its meaning.
   */
  readonly optionMap: ReadonlyMap<string, LeanOptionTarget>;
  /**
   * The names that ts-command-line records as registered (used as "parent" names for nested parsers).
   */
  readonly registeredNames: ReadonlySet<string>;
  /**
   * Parameters that ts-command-line would report as ambiguous if they receive a value.
   */
  readonly poisonedParameters: ReadonlySet<InternalCommandLineParameter>;
  /**
   * The argparse registrations, in the order in which ts-command-line would perform them.
   */
  readonly steps: ReadonlyArray<LeanRegistrationStep>;
}

/**
 * A single argparse registration performed by ts-command-line: either a parameter (with the option strings it is
 * registered under, and its undocumented synonyms), or an ambiguous name that is registered only to report errors.
 */
export type LeanRegistrationStep =
  | {
      readonly parameter: InternalCommandLineParameter;
      readonly optionStrings: readonly string[];
      readonly undocumentedSynonyms: readonly string[] | undefined;
    }
  | { readonly ambiguousName: string };


/**
 * The result of a lean parse.
 * - 'ok': the arguments were fully understood; values are ready to be applied
 * - 'help': the arguments request the help text of this provider
 * - 'fallback': the lean parser cannot guarantee identical results; use the full ts-command-line parser
 */
export type LeanParseResult =
  | {
      readonly kind: 'ok';
      readonly data: Map<InternalCommandLineParameter, unknown>;
      readonly remainder?: string[];
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'fallback' };

const FALLBACK: LeanParseResult = { kind: 'fallback' };
const HELP: LeanParseResult = { kind: 'help' };

/**
 * A lightweight stand-in for ts-command-line's `CommandLineParameterProvider` that does not depend on argparse.
 *
 * @remarks
 * The parameter objects it creates are genuine ts-command-line parameter instances, and their values are
 * assigned through the same `_setValue()` entry point, using the same data argparse would produce. This makes
 * environment variable handling, defaults and validation identical to the full parser. Anything that the lean
 * model cannot guarantee to be identical is reported as a "fallback", so the caller can use the full
 * ts-command-line parser instead.
 */
export class LeanParameterProvider {
  readonly #parameters: InternalCommandLineParameter[] = [];
  readonly #parametersByLongName: Map<string, InternalCommandLineParameter[]> = new Map();
  readonly #parametersByShortName: Map<string, InternalCommandLineParameter[]> = new Map();
  #remainder: RemainderClass | undefined;

  public get parameters(): ReadonlyArray<CommandLineParameter> {
    return this.#parameters as unknown as ReadonlyArray<CommandLineParameter>;
  }

  public get remainder(): CommandLineRemainder | undefined {
    return this.#remainder as unknown as CommandLineRemainder | undefined;
  }

  /**
   * Allows this object to be passed to APIs that expect a ts-command-line `CommandLineParameterProvider` and that
   * only call the `define*Parameter()` methods.
   *
   * @remarks
   * The package's public API declarations (dist/ts-command-line.d.ts) and its per-module declarations (lib-dts)
   * describe the same runtime classes, but TypeScript treats them as unrelated types. The casts in this class
   * bridge the two.
   */
  public asCommandLineParameterProvider(): CommandLineParameterProvider {
    return this as unknown as CommandLineParameterProvider;
  }

  public defineChoiceParameter<TChoice extends string = string>(
    definition: ICommandLineChoiceDefinition<TChoice>
  ): CommandLineChoiceParameter<TChoice> {
    if (!_choiceParameterClass) {
      _choiceParameterClass = (
        require('@rushstack/ts-command-line/lib/parameters/CommandLineChoiceParameter') as {
          CommandLineChoiceParameter: typeof ChoiceParameterClass;
        }
      ).CommandLineChoiceParameter;
    }
    const parameter: InternalCommandLineParameter = new _choiceParameterClass(definition as never);
    return this.#defineParameter(parameter) as {} as CommandLineChoiceParameter<TChoice>;
  }

  public defineChoiceListParameter<TChoice extends string = string>(
    definition: ICommandLineChoiceListDefinition<TChoice>
  ): CommandLineChoiceListParameter<TChoice> {
    if (!_choiceListParameterClass) {
      _choiceListParameterClass = (
        require('@rushstack/ts-command-line/lib/parameters/CommandLineChoiceListParameter') as {
          CommandLineChoiceListParameter: typeof ChoiceListParameterClass;
        }
      ).CommandLineChoiceListParameter;
    }
    const parameter: InternalCommandLineParameter = new _choiceListParameterClass(definition as never);
    return this.#defineParameter(parameter) as {} as CommandLineChoiceListParameter<TChoice>;
  }

  public defineFlagParameter(definition: ICommandLineFlagDefinition): CommandLineFlagParameter {
    const parameter: InternalCommandLineParameter = new FlagParameterClass(definition as never);
    return this.#defineParameter(parameter) as {} as CommandLineFlagParameter;
  }

  public defineIntegerParameter(definition: ICommandLineIntegerDefinition): CommandLineIntegerParameter {
    if (!_integerParameterClass) {
      _integerParameterClass = (
        require('@rushstack/ts-command-line/lib/parameters/CommandLineIntegerParameter') as {
          CommandLineIntegerParameter: typeof IntegerParameterClass;
        }
      ).CommandLineIntegerParameter;
    }
    const parameter: InternalCommandLineParameter = new _integerParameterClass(definition as never);
    return this.#defineParameter(parameter) as {} as CommandLineIntegerParameter;
  }

  public defineIntegerListParameter(
    definition: ICommandLineIntegerListDefinition
  ): CommandLineIntegerListParameter {
    if (!_integerListParameterClass) {
      _integerListParameterClass = (
        require('@rushstack/ts-command-line/lib/parameters/CommandLineIntegerListParameter') as {
          CommandLineIntegerListParameter: typeof IntegerListParameterClass;
        }
      ).CommandLineIntegerListParameter;
    }
    const parameter: InternalCommandLineParameter = new _integerListParameterClass(definition as never);
    return this.#defineParameter(parameter) as {} as CommandLineIntegerListParameter;
  }

  public defineStringParameter(definition: ICommandLineStringDefinition): CommandLineStringParameter {
    if (!_stringParameterClass) {
      _stringParameterClass = (
        require('@rushstack/ts-command-line/lib/parameters/CommandLineStringParameter') as {
          CommandLineStringParameter: typeof StringParameterClass;
        }
      ).CommandLineStringParameter;
    }
    const parameter: InternalCommandLineParameter = new _stringParameterClass(definition as never);
    return this.#defineParameter(parameter) as {} as CommandLineStringParameter;
  }

  public defineStringListParameter(
    definition: ICommandLineStringListDefinition
  ): CommandLineStringListParameter {
    const parameter: InternalCommandLineParameter = new StringListParameterClass(definition as never);
    return this.#defineParameter(parameter) as {} as CommandLineStringListParameter;
  }

  public defineCommandLineRemainder(definition: ICommandLineRemainderDefinition): CommandLineRemainder {
    if (this.#remainder) {
      throw new Error('defineRemainingArguments() has already been called for this provider');
    }
    if (!_remainderClass) {
      _remainderClass = (
        require('@rushstack/ts-command-line/lib/parameters/CommandLineRemainder') as {
          CommandLineRemainder: typeof RemainderClass;
        }
      ).CommandLineRemainder;
    }
    this.#remainder = new _remainderClass(definition as never);
    return this.#remainder as unknown as CommandLineRemainder;
  }

  /**
   * Identical to ts-command-line's `CommandLineParameterProvider.getParameterStringMap()`.
   */
  public getParameterStringMap(): Record<string, string> {
    return getParameterStringMap(this.parameters);
  }

  /**
   * Models ts-command-line's `_registerDefinedParameters()` followed by the resulting argparse `addArgument()`
   * calls. Returns `undefined` if ts-command-line or argparse would throw, or if the definitions use a feature that
   * the lean parser does not model.
   *
   * @param parentParameterNames - the names registered by the parent parser(s), which ts-command-line registers
   * as ambiguous in this provider.
   */
  public tryGetRegistration(parentParameterNames: Iterable<string>): ILeanRegistration | undefined {
    const optionMap: Map<string, LeanOptionTarget> = new Map();
    const registeredParametersByName: Map<string, InternalCommandLineParameter> = new Map();
    const ambiguousNames: Set<string> = new Set();
    const steps: LeanRegistrationStep[] = [];

    for (const helpOptionString of HELP_ACTION.optionStrings) {
      optionMap.set(helpOptionString, 'help');
    }

    // argparse throws if an option string is registered more than once ("conflictHandler: error")
    function tryAddOptionStrings(optionStrings: readonly string[], target: LeanOptionTarget): boolean {
      for (const optionString of optionStrings) {
        if (optionMap.has(optionString)) {
          return false;
        }
      }
      for (const optionString of optionStrings) {
        optionMap.set(optionString, target);
      }
      return true;
    }

    const parametersWithDuplicateShortNames: Set<InternalCommandLineParameter> = new Set();
    for (const [shortName, shortNameParameters] of this.#parametersByShortName) {
      if (shortNameParameters.length > 1) {
        ambiguousNames.add(shortName);
        for (const parameter of shortNameParameters) {
          parametersWithDuplicateShortNames.add(parameter);
        }
      }
    }

    for (const longNameParameters of this.#parametersByLongName.values()) {
      const useScopedLongName: boolean = longNameParameters.length > 1;
      for (const parameter of longNameParameters) {
        if (useScopedLongName) {
          if (!parameter.parameterScope) {
            // ts-command-line throws "The parameter ... is defined multiple times with the same long name."
            return undefined;
          }
          ambiguousNames.add(parameter.longName);
        }

        if (parameter.required && parameter.environmentVariable) {
          // ts-command-line patches the parameter's parse hooks for this case; not modeled.
          return undefined;
        }

        const { parameterGroup } = parameter;
        if (parameterGroup !== undefined && typeof parameterGroup !== 'string') {
          if ((parameterGroup as unknown) !== SCOPING_PARAMETER_GROUP) {
            // ts-command-line throws "Unexpected parameter group"
            return undefined;
          }
        }

        const { shortName, longName, scopedLongName, undocumentedSynonyms } = parameter;
        const names: string[] = [];
        if (shortName && !parametersWithDuplicateShortNames.has(parameter)) {
          names.push(shortName);
        }
        if (!useScopedLongName) {
          names.push(longName);
        }
        if (scopedLongName) {
          names.push(scopedLongName);
        }

        if (!tryAddOptionStrings(names, parameter)) {
          return undefined;
        }

        if (undocumentedSynonyms?.length) {
          if (!tryAddOptionStrings(undocumentedSynonyms, parameter)) {
            return undefined;
          }
        }

        steps.push({ parameter, optionStrings: names, undocumentedSynonyms });

        for (const name of names) {
          registeredParametersByName.set(name, parameter);
        }
        if (undocumentedSynonyms) {
          for (const name of undocumentedSynonyms) {
            registeredParametersByName.set(name, parameter);
          }
        }
      }
    }

    for (const parentParameterName of parentParameterNames) {
      ambiguousNames.add(parentParameterName);
    }

    const poisonedParameters: Set<InternalCommandLineParameter> = new Set();
    for (const ambiguousName of ambiguousNames) {
      const registeredParameter: InternalCommandLineParameter | undefined =
        registeredParametersByName.get(ambiguousName);
      if (registeredParameter) {
        // ts-command-line reports "Ambiguous option" whenever this parameter receives a truthy value
        poisonedParameters.add(registeredParameter);
      } else if (!tryAddOptionStrings([ambiguousName], 'ambiguous')) {
        return undefined;
      } else {
        steps.push({ ambiguousName });
      }
    }

    return {
      optionMap,
      registeredNames: new Set(registeredParametersByName.keys()),
      poisonedParameters,
      steps
    };
  }

  /**
   * Models the argparse parser that ts-command-line would build for this provider, for rendering its help.
   */
  public getHelpParser(
    registration: ILeanRegistration,
    prog: string,
    description: string | undefined,
    epilog: string | undefined
  ): IHelpParser {
    const actions: IHelpAction[] = [HELP_ACTION];
    const positionals: IHelpAction[] = [];
    const optionals: IHelpAction[] = [HELP_ACTION];
    const groups: IHelpActionGroup[] = [
      { title: 'Positional arguments', actions: positionals },
      { title: 'Optional arguments', actions: optionals }
    ];
    const customGroupActionsByName: Map<string | symbol, IHelpAction[]> = new Map();

    for (const step of registration.steps) {
      if ('ambiguousName' in step) {
        const ambiguousAction: IHelpAction = {
          optionStrings: [step.ambiguousName],
          dest: SUPPRESS,
          nargs: ZERO_OR_MORE,
          help: SUPPRESS
        };
        actions.push(ambiguousAction);
        optionals.push(ambiguousAction);
        continue;
      }

      const { parameter, optionStrings, undocumentedSynonyms } = step;
      let groupActions: IHelpAction[] = optionals;
      const { parameterGroup } = parameter;
      if (parameterGroup !== undefined) {
        let customGroupActions: IHelpAction[] | undefined = customGroupActionsByName.get(parameterGroup);
        if (!customGroupActions) {
          customGroupActions = [];
          customGroupActionsByName.set(parameterGroup, customGroupActions);
          const parameterGroupName: string = typeof parameterGroup === 'string' ? parameterGroup : 'scoping';
          groups.push({ title: `Optional ${parameterGroupName} arguments`, actions: customGroupActions });
        }
        groupActions = customGroupActions;
      }

      const parameterAction: IHelpAction = {
        optionStrings,
        dest: parameter._parserKey!,
        nargs: parameter.kind === CommandLineParameterKind.Flag ? 0 : undefined,
        metavar: (parameter as { argumentName?: string }).argumentName,
        help: getParameterHelp(parameter),
        choices:
          parameter.kind === CommandLineParameterKind.Choice ||
          parameter.kind === CommandLineParameterKind.ChoiceList
            ? Array.from(parameter.alternatives)
            : undefined,
        required: parameter.required
      };
      actions.push(parameterAction);
      groupActions.push(parameterAction);

      if (undocumentedSynonyms?.length) {
        const synonymsAction: IHelpAction = {
          ...parameterAction,
          optionStrings: undocumentedSynonyms,
          help: SUPPRESS
        };
        actions.push(synonymsAction);
        groupActions.push(synonymsAction);
      }
    }

    if (this.#remainder) {
      const remainderAction: IHelpAction = {
        optionStrings: [],
        dest: REMAINDER,
        nargs: REMAINDER,
        metavar: '"..."',
        help: this.#remainder.description,
        required: true
      };
      actions.push(remainderAction);
      positionals.push(remainderAction);
    }

    return { prog, description, epilog, actions, groups };
  }

  /**
   * Parses the arguments for this provider, accepting only a conservative subset of the syntax that argparse
   * accepts: exact option strings, and option values that do not start with "-".
   *
   * @param allowRemainder - if true, a "--" token starts the remainder, which is returned including the "--"
   */
  public parseArguments(
    registration: ILeanRegistration,
    args: readonly string[],
    allowRemainder: boolean
  ): LeanParseResult {
    const { optionMap, poisonedParameters } = registration;
    const data: Map<InternalCommandLineParameter, unknown> = new Map();
    let remainder: string[] | undefined;

    for (let i: number = 0; i < args.length; i++) {
      const arg: string = args[i];
      if (allowRemainder && arg === '--') {
        remainder = args.slice(i);
        break;
      }

      const target: LeanOptionTarget | undefined = optionMap.get(arg);
      if (target === undefined || target === 'ambiguous') {
        return FALLBACK;
      } else if (target === 'help') {
        return HELP;
      } else if (poisonedParameters.has(target)) {
        return FALLBACK;
      }

      if (target.kind === CommandLineParameterKind.Flag) {
        data.set(target, true);
        continue;
      }

      const rawValue: string | undefined = args[++i];
      if (rawValue === undefined || rawValue.startsWith('-')) {
        return FALLBACK;
      }

      let value: string | number;
      switch (target.kind) {
        case CommandLineParameterKind.Choice:
        case CommandLineParameterKind.ChoiceList:
          if (!target.alternatives.has(rawValue)) {
            return FALLBACK;
          }
          value = rawValue;
          break;
        case CommandLineParameterKind.Integer:
        case CommandLineParameterKind.IntegerList:
          if (!INTEGER_REGEXP.test(rawValue)) {
            return FALLBACK;
          }
          value = parseInt(rawValue, 10);
          break;
        default:
          value = rawValue;
          break;
      }

      switch (target.kind) {
        case CommandLineParameterKind.ChoiceList:
        case CommandLineParameterKind.IntegerList:
        case CommandLineParameterKind.StringList: {
          const values: (string | number)[] | undefined = data.get(target) as (string | number)[] | undefined;
          if (values) {
            values.push(value);
          } else {
            data.set(target, [value]);
          }
          break;
        }
        default:
          if (data.has(target)) {
            return FALLBACK;
          }
          data.set(target, value);
          break;
      }
    }

    for (const parameter of this.#parameters) {
      if (parameter.required && !data.has(parameter)) {
        return FALLBACK;
      }
    }

    return { kind: 'ok', data, remainder };
  }

  /**
   * Assigns the parsed values the same way ts-command-line's `_processParsedData()` does. Returns false if
   * ts-command-line would throw.
   */
  public tryApplyValues(
    data: ReadonlyMap<InternalCommandLineParameter, unknown>,
    remainder?: string[]
  ): boolean {
    try {
      for (const parameter of this.#parameters) {
        // argparse provides `false` for omitted flags and `null` for other omitted options
        const value: unknown = data.has(parameter)
          ? data.get(parameter)
          : parameter.kind === CommandLineParameterKind.Flag
            ? false
            : null;
        parameter._setValue(value);
        parameter._validateValue?.();
      }

      if (this.#remainder) {
        this.#remainder._setValue(remainder ?? []);
      }
    } catch (e) {
      return false;
    }

    return true;
  }

  #defineParameter(parameter: InternalCommandLineParameter): InternalCommandLineParameter {
    parameter._parserKey = 'key_' + (_keyCounter++).toString();

    this.#parameters.push(parameter);

    let longNameParameters: InternalCommandLineParameter[] | undefined = this.#parametersByLongName.get(
      parameter.longName
    );
    if (!longNameParameters) {
      longNameParameters = [];
      this.#parametersByLongName.set(parameter.longName, longNameParameters);
    }
    longNameParameters.push(parameter);

    if (parameter.shortName) {
      let shortNameParameters: InternalCommandLineParameter[] | undefined = this.#parametersByShortName.get(
        parameter.shortName
      );
      if (!shortNameParameters) {
        shortNameParameters = [];
        this.#parametersByShortName.set(parameter.shortName, shortNameParameters);
      }
      shortNameParameters.push(parameter);
    }

    return parameter;
  }
}

/**
 * Identical to ts-command-line's `CommandLineParameterProvider.getParameterStringMap()`.
 */
export function getParameterStringMap(parameters: Iterable<CommandLineParameter>): Record<string, string> {
  const parameterMap: Record<string, string> = {};
  for (const parameter of parameters as Iterable<InternalCommandLineParameter>) {
    const parameterName: string = parameter.scopedLongName || parameter.longName;
    switch (parameter.kind) {
      case CommandLineParameterKind.Flag:
      case CommandLineParameterKind.Choice:
      case CommandLineParameterKind.String:
      case CommandLineParameterKind.Integer:
        parameterMap[parameterName] = JSON.stringify(parameter.value);
        break;
      case CommandLineParameterKind.StringList:
      case CommandLineParameterKind.IntegerList:
      case CommandLineParameterKind.ChoiceList:
        const arrayValue: ReadonlyArray<string | number> | undefined = parameter.values;
        parameterMap[parameterName] = arrayValue ? arrayValue.join(',') : '';
        break;
    }
  }
  return parameterMap;
}

/**
 * The help text of a parameter, as computed by ts-command-line's `_registerParameter()`.
 */
function getParameterHelp(parameter: InternalCommandLineParameter): string {
  let finalDescription: string = parameter.description;

  const supplementaryNotes: string[] = [];
  parameter._getSupplementaryNotes(supplementaryNotes);
  if (supplementaryNotes.length > 0) {
    // If they left the period off the end of their sentence, then add one.
    if (finalDescription.match(/[a-z0-9]"?\s*$/i)) {
      finalDescription = finalDescription.trimEnd() + '.';
    }
    // Append the supplementary text
    finalDescription += ' ' + supplementaryNotes.join(' ');
  }

  return finalDescription;
}
