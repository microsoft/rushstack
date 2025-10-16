// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';

import type {
  ICommandLineChoiceDefinition,
  ICommandLineChoiceListDefinition,
  ICommandLineIntegerDefinition,
  ICommandLineIntegerListDefinition,
  ICommandLineFlagDefinition,
  ICommandLineStringDefinition,
  ICommandLineStringListDefinition,
  ICommandLineRemainderDefinition
} from '../parameters/CommandLineDefinition';
import type { ICommandLineParserOptions } from './CommandLineParser';
import {
  type CommandLineParameterBase,
  type CommandLineParameterWithArgument,
  CommandLineParameterKind,
  type CommandLineParameter
} from '../parameters/BaseClasses';
import {
  CommandLineChoiceParameter,
  type IRequiredCommandLineChoiceParameter
} from '../parameters/CommandLineChoiceParameter';
import { CommandLineChoiceListParameter } from '../parameters/CommandLineChoiceListParameter';
import {
  CommandLineIntegerParameter,
  type IRequiredCommandLineIntegerParameter
} from '../parameters/CommandLineIntegerParameter';
import { CommandLineIntegerListParameter } from '../parameters/CommandLineIntegerListParameter';
import { CommandLineFlagParameter } from '../parameters/CommandLineFlagParameter';
import {
  CommandLineStringParameter,
  type IRequiredCommandLineStringParameter
} from '../parameters/CommandLineStringParameter';
import { CommandLineStringListParameter } from '../parameters/CommandLineStringListParameter';
import { CommandLineRemainder } from '../parameters/CommandLineRemainder';
import { SCOPING_PARAMETER_GROUP } from '../Constants';
import { CommandLineParserExitError } from './CommandLineParserExitError';
import { escapeSprintf } from '../escapeSprintf';

/**
 * The result containing the parsed parameter long name and scope. Returned when calling
 * {@link CommandLineParameterProvider.parseScopedLongName}.
 *
 * @public
 */
export interface IScopedLongNameParseResult {
  /**
   * The long name parsed from the scoped long name, e.g. "--my-scope:my-parameter" -\> "--my-parameter"
   */
  longName: string;

  /**
   * The scope parsed from the scoped long name or undefined if no scope was found,
   * e.g. "--my-scope:my-parameter" -\> "my-scope"
   */
  scope: string | undefined;
}

/**
 * An object containing the state of the
 *
 * @internal
 */
export interface IRegisterDefinedParametersState {
  /**
   * A set of all defined parameter names registered by parent {@link CommandLineParameterProvider}
   * objects.
   */
  parentParameterNames: Set<string>;
}

/**
 * This is the argparse result data object
 * @internal
 */
export interface ICommandLineParserData {
  action: string;
  aliasAction?: string;
  aliasDocumentation?: string;
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const SCOPE_GROUP_NAME: string = 'scope';
const LONG_NAME_GROUP_NAME: string = 'longName';
const POSSIBLY_SCOPED_LONG_NAME_REGEXP: RegExp =
  /^--((?<scope>[a-z0-9]+(-[a-z0-9]+)*):)?(?<longName>[a-z0-9]+((-[a-z0-9]+)+)?)$/;

interface IExtendedArgumentGroup extends argparse.ArgumentGroup {
  // The types are incorrect - this function returns the constructed argument
  // object, which looks like the argument options type.
  addArgument(nameOrFlags: string | string[], options: argparse.ArgumentOptions): argparse.ArgumentOptions;
}

interface IExtendedArgumentParser extends argparse.ArgumentParser {
  // This function throws
  error(message: string): never;
}

/**
 * This is the common base class for CommandLineAction and CommandLineParser
 * that provides functionality for defining command-line parameters.
 *
 * @public
 */
export abstract class CommandLineParameterProvider {
  private static _keyCounter: number = 0;

  /** @internal */
  public readonly _ambiguousParameterParserKeysByName: Map<string, string>;
  /** @internal */
  protected readonly _registeredParameterParserKeysByName: Map<string, string>;

  private readonly _parameters: CommandLineParameter[];
  private readonly _parametersByLongName: Map<string, CommandLineParameter[]>;
  private readonly _parametersByShortName: Map<string, CommandLineParameter[]>;
  private readonly _parameterGroupsByName: Map<
    string | typeof SCOPING_PARAMETER_GROUP,
    argparse.ArgumentGroup
  >;
  private _parametersHaveBeenRegistered: boolean;
  private _parametersHaveBeenProcessed: boolean;
  private _remainder: CommandLineRemainder | undefined;

  /** @internal */
  // Third party code should not inherit subclasses or call this constructor
  public constructor() {
    this._parameters = [];
    this._parametersByLongName = new Map();
    this._parametersByShortName = new Map();
    this._parameterGroupsByName = new Map();
    this._ambiguousParameterParserKeysByName = new Map();
    this._registeredParameterParserKeysByName = new Map();
    this._parametersHaveBeenRegistered = false;
    this._parametersHaveBeenProcessed = false;
  }

  /**
   * Returns a collection of the parameters that were defined for this object.
   */
  public get parameters(): ReadonlyArray<CommandLineParameter> {
    return this._parameters;
  }

  /**
   * Informs the caller if the argparse data has been processed into parameters.
   */
  public get parametersProcessed(): boolean {
    return this._parametersHaveBeenProcessed;
  }

  /**
   * If {@link CommandLineParameterProvider.defineCommandLineRemainder} was called,
   * this object captures any remaining command line arguments after the recognized portion.
   */
  public get remainder(): CommandLineRemainder | undefined {
    return this._remainder;
  }

  /**
   * Defines a command-line parameter whose value must be a string from a fixed set of
   * allowable choices (similar to an enum).
   *
   * @remarks
   * Example of a choice parameter:
   * ```
   * example-tool --log-level warn
   * ```
   */
  public defineChoiceParameter<TChoice extends string = string>(
    definition: ICommandLineChoiceDefinition<TChoice> & {
      required: false | undefined;
      defaultValue: undefined;
    }
  ): CommandLineChoiceParameter<TChoice>;
  /**
   * {@inheritdoc CommandLineParameterProvider.(defineChoiceParameter:1)}
   */
  public defineChoiceParameter<TChoice extends string = string>(
    definition: ICommandLineChoiceDefinition<TChoice> & { required: true }
  ): IRequiredCommandLineChoiceParameter<TChoice>;
  /**
   * {@inheritdoc CommandLineParameterProvider.(defineChoiceParameter:1)}
   */
  public defineChoiceParameter<TChoice extends string = string>(
    definition: ICommandLineChoiceDefinition<TChoice> & { defaultValue: TChoice }
  ): IRequiredCommandLineChoiceParameter<TChoice>;
  /**
   * {@inheritdoc CommandLineParameterProvider.(defineChoiceParameter:1)}
   */
  public defineChoiceParameter<TChoice extends string = string>(
    definition: ICommandLineChoiceDefinition<TChoice>
  ): CommandLineChoiceParameter<TChoice>;
  public defineChoiceParameter<TChoice extends string = string>(
    definition: ICommandLineChoiceDefinition<TChoice>
  ): CommandLineChoiceParameter<TChoice> {
    const parameter: CommandLineChoiceParameter<TChoice> = new CommandLineChoiceParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineChoiceParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getChoiceParameter(parameterLongName: string, parameterScope?: string): CommandLineChoiceParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Choice, parameterScope);
  }

  /**
   * Defines a command-line parameter whose value must be a string from a fixed set of
   * allowable choices (similar to an enum). The parameter can be specified multiple times to
   * build a list.
   *
   * @remarks
   * Example of a choice list parameter:
   * ```
   * example-tool --allow-color red --allow-color green
   * ```
   */
  public defineChoiceListParameter<TChoice extends string = string>(
    definition: ICommandLineChoiceListDefinition<TChoice>
  ): CommandLineChoiceListParameter<TChoice> {
    const parameter: CommandLineChoiceListParameter<TChoice> = new CommandLineChoiceListParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineChoiceListParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getChoiceListParameter(
    parameterLongName: string,
    parameterScope?: string
  ): CommandLineChoiceListParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.ChoiceList, parameterScope);
  }

  /**
   * Defines a command-line switch whose boolean value is true if the switch is provided,
   * and false otherwise.
   *
   * @remarks
   * Example usage of a flag parameter:
   * ```
   * example-tool --debug
   * ```
   */
  public defineFlagParameter(definition: ICommandLineFlagDefinition): CommandLineFlagParameter {
    const parameter: CommandLineFlagParameter = new CommandLineFlagParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineFlagParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getFlagParameter(parameterLongName: string, parameterScope?: string): CommandLineFlagParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Flag, parameterScope);
  }

  /**
   * Defines a command-line parameter whose argument is an integer.
   *
   * @remarks
   * Example usage of an integer parameter:
   * ```
   * example-tool --max-attempts 5
   * ```
   */
  public defineIntegerParameter(
    definition: ICommandLineIntegerDefinition & { required: false | undefined; defaultValue: undefined }
  ): CommandLineIntegerParameter;
  /**
   * {@inheritdoc CommandLineParameterProvider.(defineIntegerParameter:1)}
   */
  public defineIntegerParameter(
    definition: ICommandLineIntegerDefinition & { required: true }
  ): IRequiredCommandLineIntegerParameter;
  /**
   * {@inheritdoc CommandLineParameterProvider.(defineIntegerParameter:1)}
   */
  public defineIntegerParameter(
    definition: ICommandLineIntegerDefinition & { defaultValue: number }
  ): IRequiredCommandLineIntegerParameter;
  /**
   * {@inheritdoc CommandLineParameterProvider.(defineIntegerParameter:1)}
   */
  public defineIntegerParameter(definition: ICommandLineIntegerDefinition): CommandLineIntegerParameter;
  public defineIntegerParameter(definition: ICommandLineIntegerDefinition): CommandLineIntegerParameter {
    const parameter: CommandLineIntegerParameter = new CommandLineIntegerParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineIntegerParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getIntegerParameter(
    parameterLongName: string,
    parameterScope?: string
  ): CommandLineIntegerParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.Integer, parameterScope);
  }

  /**
   * Defines a command-line parameter whose argument is an integer. The parameter can be specified
   * multiple times to build a list.
   *
   * @remarks
   * Example usage of an integer list parameter:
   * ```
   * example-tool --avoid 4 --avoid 13
   * ```
   */
  public defineIntegerListParameter(
    definition: ICommandLineIntegerListDefinition
  ): CommandLineIntegerListParameter {
    const parameter: CommandLineIntegerListParameter = new CommandLineIntegerListParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineIntegerParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getIntegerListParameter(
    parameterLongName: string,
    parameterScope?: string
  ): CommandLineIntegerListParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.IntegerList, parameterScope);
  }

  /**
   * Defines a command-line parameter whose argument is a single text string.
   *
   * @remarks
   * Example usage of a string parameter:
   * ```
   * example-tool --message "Hello, world!"
   * ```
   */
  public defineStringParameter(
    definition: ICommandLineStringDefinition & { required: false | undefined; defaultValue: undefined }
  ): CommandLineStringParameter;
  /**
   * {@inheritdoc CommandLineParameterProvider.(defineStringParameter:1)}
   */
  public defineStringParameter(
    definition: ICommandLineStringDefinition & { required: true }
  ): IRequiredCommandLineStringParameter;
  /**
   * {@inheritdoc CommandLineParameterProvider.(defineStringParameter:1)}
   */
  public defineStringParameter(
    definition: ICommandLineStringDefinition & { defaultValue: string }
  ): IRequiredCommandLineStringParameter;
  /**
   * {@inheritdoc CommandLineParameterProvider.(defineStringParameter:1)}
   */
  public defineStringParameter(definition: ICommandLineStringDefinition): CommandLineStringParameter;
  public defineStringParameter(definition: ICommandLineStringDefinition): CommandLineStringParameter {
    const parameter: CommandLineStringParameter = new CommandLineStringParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Returns the CommandLineStringParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getStringParameter(parameterLongName: string, parameterScope?: string): CommandLineStringParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.String, parameterScope);
  }

  /**
   * Defines a command-line parameter whose argument is a single text string.  The parameter can be
   * specified multiple times to build a list.
   *
   * @remarks
   * Example usage of a string list parameter:
   * ```
   * example-tool --add file1.txt --add file2.txt --add file3.txt
   * ```
   */
  public defineStringListParameter(
    definition: ICommandLineStringListDefinition
  ): CommandLineStringListParameter {
    const parameter: CommandLineStringListParameter = new CommandLineStringListParameter(definition);
    this._defineParameter(parameter);
    return parameter;
  }

  /**
   * Defines a rule that captures any remaining command line arguments after the recognized portion.
   *
   * @remarks
   * This feature is useful for commands that pass their arguments along to an external tool, relying on
   * that tool to perform validation.  (It could also be used to parse parameters without any validation
   * or documentation, but that is not recommended.)
   *
   * Example of capturing the remainder after an optional flag parameter.
   * ```
   * example-tool --my-flag this is the remainder
   * ```
   *
   * In the "--help" documentation, the remainder rule will be represented as "...".
   */
  public defineCommandLineRemainder(definition: ICommandLineRemainderDefinition): CommandLineRemainder {
    if (this._remainder) {
      throw new Error('defineRemainingArguments() has already been called for this provider');
    }
    this._remainder = new CommandLineRemainder(definition);
    return this._remainder;
  }

  /**
   * Returns the CommandLineStringListParameter with the specified long name.
   * @remarks
   * This method throws an exception if the parameter is not defined.
   */
  public getStringListParameter(
    parameterLongName: string,
    parameterScope?: string
  ): CommandLineStringListParameter {
    return this._getParameter(parameterLongName, CommandLineParameterKind.StringList, parameterScope);
  }

  /**
   * Generates the command-line help text.
   */
  public renderHelpText(): string {
    const initialState: IRegisterDefinedParametersState = {
      parentParameterNames: new Set()
    };
    this._registerDefinedParameters(initialState);
    return this._getArgumentParser().formatHelp();
  }

  /**
   * Generates the command-line usage text.
   */
  public renderUsageText(): string {
    const initialState: IRegisterDefinedParametersState = {
      parentParameterNames: new Set()
    };
    this._registerDefinedParameters(initialState);
    return this._getArgumentParser().formatUsage();
  }

  /**
   * Returns a object which maps the long name of each parameter in this.parameters
   * to the stringified form of its value. This is useful for logging telemetry, but
   * it is not the proper way of accessing parameters or their values.
   */
  public getParameterStringMap(): Record<string, string> {
    const parameterMap: Record<string, string> = {};
    for (const parameter of this.parameters) {
      const parameterName: string = parameter.scopedLongName || parameter.longName;
      switch (parameter.kind) {
        case CommandLineParameterKind.Flag:
        case CommandLineParameterKind.Choice:
        case CommandLineParameterKind.String:
        case CommandLineParameterKind.Integer:
          parameterMap[parameterName] = JSON.stringify(
            (
              parameter as
                | CommandLineFlagParameter
                | CommandLineIntegerParameter
                | CommandLineChoiceParameter
                | CommandLineStringParameter
            ).value
          );
          break;
        case CommandLineParameterKind.StringList:
        case CommandLineParameterKind.IntegerList:
        case CommandLineParameterKind.ChoiceList:
          const arrayValue: ReadonlyArray<string | number> | undefined = (
            parameter as
              | CommandLineIntegerListParameter
              | CommandLineStringListParameter
              | CommandLineChoiceListParameter
          ).values;
          parameterMap[parameterName] = arrayValue ? arrayValue.join(',') : '';
          break;
      }
    }
    return parameterMap;
  }

  /**
   * Returns an object with the parsed scope (if present) and the long name of the parameter.
   */
  public parseScopedLongName(scopedLongName: string): IScopedLongNameParseResult {
    const result: RegExpExecArray | null = POSSIBLY_SCOPED_LONG_NAME_REGEXP.exec(scopedLongName);
    if (!result || !result.groups) {
      throw new Error(`The parameter long name "${scopedLongName}" is not valid.`);
    }
    return {
      longName: `--${result.groups[LONG_NAME_GROUP_NAME]}`,
      scope: result.groups[SCOPE_GROUP_NAME]
    };
  }

  /** @internal */
  public _registerDefinedParameters(state: IRegisterDefinedParametersState): void {
    if (this._parametersHaveBeenRegistered) {
      // We prevent new parameters from being defined after the first call to _registerDefinedParameters,
      // so we can already ensure that all parameters were registered.
      return;
    }

    // First, loop through all parameters with short names. If there are any duplicates, disable the short names
    // since we can't prefix scopes to short names in order to deduplicate them. The duplicate short names will
    // be reported as errors if the user attempts to use them.
    const parametersWithDuplicateShortNames: Set<CommandLineParameterBase> = new Set();
    for (const [shortName, shortNameParameters] of this._parametersByShortName.entries()) {
      if (shortNameParameters.length > 1) {
        for (const parameter of shortNameParameters) {
          this._defineAmbiguousParameter(shortName);
          parametersWithDuplicateShortNames.add(parameter);
        }
      }
    }

    // Then, loop through all parameters and register them. If there are any duplicates, ensure that they have
    // provided a scope and register them with the scope. The duplicate long names will be reported as an error
    // if the user attempts to use them.
    for (const longNameParameters of this._parametersByLongName.values()) {
      const useScopedLongName: boolean = longNameParameters.length > 1;
      for (const parameter of longNameParameters) {
        if (useScopedLongName) {
          if (!parameter.parameterScope) {
            throw new Error(
              `The parameter "${parameter.longName}" is defined multiple times with the same long name. ` +
                'Parameters with the same long name must define a scope.'
            );
          }
          this._defineAmbiguousParameter(parameter.longName);
        }

        const ignoreShortName: boolean = parametersWithDuplicateShortNames.has(parameter);
        this._registerParameter(parameter, useScopedLongName, ignoreShortName);
      }
    }

    // Register the existing parameters as ambiguous parameters. These are generally provided by the
    // parent action.
    const { parentParameterNames } = state;
    for (const parentParameterName of parentParameterNames) {
      this._defineAmbiguousParameter(parentParameterName);
    }

    // We also need to loop through the defined ambiguous parameters and register them. These will be reported
    // as errors if the user attempts to use them.
    for (const [ambiguousParameterName, parserKey] of this._ambiguousParameterParserKeysByName) {
      // Only register the ambiguous parameter if it hasn't already been registered. We will still handle these
      // already-registered parameters as ambiguous, but by avoiding registering again, we will defer errors
      // until the user actually attempts to use the parameter.
      if (!this._registeredParameterParserKeysByName.has(ambiguousParameterName)) {
        this._registerAmbiguousParameter(ambiguousParameterName, parserKey);
      }
    }

    // Need to add the remainder parameter last
    if (this._remainder) {
      const argparseOptions: argparse.ArgumentOptions = {
        help: this._remainder.description,
        nargs: argparse.Const.REMAINDER,
        metavar: '"..."'
      };

      // Using argparse.Const.REMAINDER as the argument name creates circular references
      // Use a different name to avoid this
      this._getArgumentParser().addArgument('remainder', argparseOptions);
    }

    this._parametersHaveBeenRegistered = true;
  }

  /**
   * Retrieves the argparse object.
   * @internal
   */
  protected abstract _getArgumentParser(): argparse.ArgumentParser;

  /**
   * This is called internally by {@link CommandLineParser.executeAsync}
   * @internal
   */
  public _preParse(): void {
    for (const parameter of this._parameters) {
      parameter._preParse?.();
    }
  }

  /**
   * This is called internally by {@link CommandLineParser.executeAsync} before `printUsage` is called
   * @internal
   */
  public _postParse(): void {
    for (const parameter of this._parameters) {
      parameter._postParse?.();
    }
  }

  /**
   * This is called internally by {@link CommandLineParser.executeAsync}
   * @internal
   */
  public _processParsedData(parserOptions: ICommandLineParserOptions, data: ICommandLineParserData): void {
    if (!this._parametersHaveBeenRegistered) {
      throw new Error('Parameters have not been registered');
    }

    if (this._parametersHaveBeenProcessed) {
      throw new Error('Command Line Parser Data was already processed');
    }

    // Search for any ambiguous parameters and throw an error if any are found
    for (const [parameterName, parserKey] of this._ambiguousParameterParserKeysByName) {
      if (data[parserKey]) {
        // When the parser key matches the actually registered parameter, we know that this is an ambiguous
        // parameter sourced from the parent action or tool
        if (this._registeredParameterParserKeysByName.get(parameterName) === parserKey) {
          this._throwParserExitError(parserOptions, data, 1, `Ambiguous option: "${parameterName}".`);
        }

        // Determine if the ambiguous parameter is a short name or a long name, since the process of finding
        // the non-ambiguous name is different for each.
        const duplicateShortNameParameters: CommandLineParameterBase[] | undefined =
          this._parametersByShortName.get(parameterName);
        if (duplicateShortNameParameters) {
          // We also need to make sure we get the non-ambiguous long name for the parameter, since it is
          // possible for that the long name is ambiguous as well.
          const nonAmbiguousLongNames: string[] = [];
          for (const parameter of duplicateShortNameParameters) {
            const matchingLongNameParameters: CommandLineParameterBase[] | undefined =
              this._parametersByLongName.get(parameter.longName);
            if (!matchingLongNameParameters?.length) {
              // This should never happen
              throw new Error(
                `Unable to find long name parameters for ambiguous short name parameter "${parameterName}".`
              );
            }
            // If there is more than one matching long name parameter, then we know that we need to use the
            // scoped long name for the parameter. The scoped long name should always be provided.
            if (matchingLongNameParameters.length > 1) {
              if (!parameter.scopedLongName) {
                // This should never happen
                throw new Error(
                  `Unable to find scoped long name for ambiguous short name parameter "${parameterName}".`
                );
              }
              nonAmbiguousLongNames.push(parameter.scopedLongName);
            } else {
              nonAmbiguousLongNames.push(parameter.longName);
            }
          }

          // Throw an error including the non-ambiguous long names for the parameters that have the ambiguous
          // short name, ex.
          // Error: Ambiguous option "-p" could match "--param1", "--param2"
          this._throwParserExitError(
            parserOptions,
            data,
            1,
            `Ambiguous option: "${parameterName}" could match ${nonAmbiguousLongNames.join(', ')}.`
          );
        }

        const duplicateLongNameParameters: CommandLineParameterBase[] | undefined =
          this._parametersByLongName.get(parameterName);
        if (duplicateLongNameParameters) {
          const nonAmbiguousLongNames: string[] = duplicateLongNameParameters.map(
            (p: CommandLineParameterBase) => {
              // The scoped long name should always be provided
              if (!p.scopedLongName) {
                // This should never happen
                throw new Error(
                  `Unable to find scoped long name for ambiguous long name parameter "${parameterName}".`
                );
              }
              return p.scopedLongName;
            }
          );

          // Throw an error including the non-ambiguous scoped long names for the parameters that have the
          // ambiguous long name, ex.
          // Error: Ambiguous option: "--param" could match --scope1:param, --scope2:param
          this._throwParserExitError(
            parserOptions,
            data,
            1,
            `Ambiguous option: "${parameterName}" could match ${nonAmbiguousLongNames.join(', ')}.`
          );
        }

        // This shouldn't happen, but we also shouldn't allow the user to use the ambiguous parameter
        this._throwParserExitError(parserOptions, data, 1, `Ambiguous option: "${parameterName}".`);
      }
    }

    // Fill in the values for the parameters
    for (const parameter of this._parameters) {
      const value: unknown = data[parameter._parserKey!];
      parameter._setValue(value);
      parameter._validateValue?.();
    }

    if (this.remainder) {
      this.remainder._setValue(data.remainder);
    }

    this._parametersHaveBeenProcessed = true;
  }

  /** @internal */
  protected _defineParameter(parameter: CommandLineParameter): void {
    if (this._parametersHaveBeenRegistered) {
      throw new Error('Parameters have already been registered for this provider');
    }

    // Generate and set the parser key at definition time
    parameter._parserKey = this._generateKey();

    this._parameters.push(parameter);

    // Collect all parameters with the same long name. We will perform conflict resolution at registration.
    let longNameParameters: CommandLineParameter[] | undefined = this._parametersByLongName.get(
      parameter.longName
    );
    if (!longNameParameters) {
      longNameParameters = [];
      this._parametersByLongName.set(parameter.longName, longNameParameters);
    }
    longNameParameters.push(parameter);

    // Collect all parameters with the same short name. We will perform conflict resolution at registration.
    if (parameter.shortName) {
      let shortNameParameters: CommandLineParameter[] | undefined = this._parametersByShortName.get(
        parameter.shortName
      );
      if (!shortNameParameters) {
        shortNameParameters = [];
        this._parametersByShortName.set(parameter.shortName, shortNameParameters);
      }
      shortNameParameters.push(parameter);
    }
  }

  /** @internal */
  protected _defineAmbiguousParameter(name: string): string {
    if (this._parametersHaveBeenRegistered) {
      throw new Error('Parameters have already been registered for this provider');
    }

    // Only generate a new parser key if the ambiguous parameter hasn't been defined yet,
    // either as an existing parameter or as another ambiguous parameter
    let existingParserKey: string | undefined =
      this._registeredParameterParserKeysByName.get(name) ||
      this._ambiguousParameterParserKeysByName.get(name);
    if (!existingParserKey) {
      existingParserKey = this._generateKey();
    }

    this._ambiguousParameterParserKeysByName.set(name, existingParserKey);
    return existingParserKey;
  }

  /** @internal */
  protected _registerParameter(
    parameter: CommandLineParameter,
    useScopedLongName: boolean,
    ignoreShortName: boolean
  ): void {
    const {
      shortName,
      longName,
      scopedLongName,
      description,
      kind,
      required,
      environmentVariable,
      parameterGroup,
      undocumentedSynonyms,
      _parserKey: parserKey
    } = parameter;

    const names: string[] = [];
    if (shortName && !ignoreShortName) {
      names.push(shortName);
    }

    // Use the original long name unless otherwise requested
    if (!useScopedLongName) {
      names.push(longName);
    }

    // Add the scoped long name if it exists
    if (scopedLongName) {
      names.push(scopedLongName);
    }

    let finalDescription: string = description;

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

    let choices: string[] | undefined;
    let action: string | undefined;
    let type: string | undefined;
    switch (kind) {
      case CommandLineParameterKind.Choice: {
        choices = Array.from(parameter.alternatives);
        break;
      }
      case CommandLineParameterKind.ChoiceList: {
        choices = Array.from(parameter.alternatives);
        action = 'append';
        break;
      }
      case CommandLineParameterKind.Flag:
        action = 'storeTrue';
        break;
      case CommandLineParameterKind.Integer:
        type = 'int';
        break;
      case CommandLineParameterKind.IntegerList:
        type = 'int';
        action = 'append';
        break;
      case CommandLineParameterKind.String:
        break;
      case CommandLineParameterKind.StringList:
        action = 'append';
        break;
    }

    // NOTE: Our "environmentVariable" feature takes precedence over argparse's "defaultValue",
    // so we have to reimplement that feature.
    const argparseOptions: argparse.ArgumentOptions = {
      help: escapeSprintf(finalDescription),
      dest: parserKey,
      metavar: (parameter as CommandLineParameterWithArgument).argumentName,
      required,
      choices,
      action,
      type
    };

    const argumentParser: IExtendedArgumentParser = this._getArgumentParser() as IExtendedArgumentParser;
    let argumentGroup: argparse.ArgumentGroup | undefined;
    if (parameterGroup) {
      argumentGroup = this._parameterGroupsByName.get(parameterGroup);
      if (!argumentGroup) {
        let parameterGroupName: string;
        if (typeof parameterGroup === 'string') {
          parameterGroupName = parameterGroup;
        } else if (parameterGroup === SCOPING_PARAMETER_GROUP) {
          parameterGroupName = 'scoping';
        } else {
          throw new Error('Unexpected parameter group: ' + parameterGroup);
        }

        argumentGroup = argumentParser.addArgumentGroup({
          title: `Optional ${parameterGroupName} arguments`
        });
        this._parameterGroupsByName.set(parameterGroup, argumentGroup);
      }
    } else {
      argumentGroup = argumentParser;
    }

    const argparseArgument: argparse.ArgumentOptions = (argumentGroup as IExtendedArgumentGroup).addArgument(
      names,
      argparseOptions
    );
    if (required && environmentVariable) {
      // Add some special-cased logic to handle required parameters with environment variables

      const originalPreParse: (() => void) | undefined = parameter._preParse?.bind(parameter);
      parameter._preParse = () => {
        originalPreParse?.();
        // Set the value as non-required before parsing. We'll validate it explicitly
        argparseArgument.required = false;
      };

      const originalPostParse: (() => void) | undefined = parameter._postParse?.bind(parameter);
      parameter._postParse = () => {
        // Reset the required value to make the usage text correct
        argparseArgument.required = true;
        originalPostParse?.();
      };

      function throwMissingParameterError(): never {
        argumentParser.error(`Argument "${longName}" is required`);
      }

      const originalValidateValue: (() => void) | undefined = parameter._validateValue?.bind(parameter);
      // For these values, we have to perform explicit validation because they're requested
      // as required, but we disabled argparse's required flag to allow the environment variable
      // to potentially fill the value.
      switch (kind) {
        case CommandLineParameterKind.Choice:
        case CommandLineParameterKind.Integer:
        case CommandLineParameterKind.String:
          parameter._validateValue = function () {
            if (this.value === undefined || this.value === null) {
              throwMissingParameterError();
            }

            originalValidateValue?.();
          };
          break;
        case CommandLineParameterKind.ChoiceList:
        case CommandLineParameterKind.IntegerList:
        case CommandLineParameterKind.StringList:
          parameter._validateValue = function () {
            if (this.values.length === 0) {
              throwMissingParameterError();
            }

            originalValidateValue?.();
          };
          break;
      }
    }

    if (undocumentedSynonyms?.length) {
      argumentGroup.addArgument(undocumentedSynonyms, {
        ...argparseOptions,
        help: argparse.Const.SUPPRESS
      });
    }

    // Register the parameter names so that we can detect ambiguous parameters
    for (const name of [...names, ...(undocumentedSynonyms || [])]) {
      this._registeredParameterParserKeysByName.set(name, parserKey!);
    }
  }

  protected _registerAmbiguousParameter(name: string, parserKey: string): void {
    this._getArgumentParser().addArgument(name, {
      dest: parserKey,
      // We don't know if this argument takes parameters or not, so we need to accept any number of args
      nargs: '*',
      // Ensure that the argument is not shown in the help text, since these parameters are only included
      // to inform the user that ambiguous parameters are present
      help: argparse.Const.SUPPRESS
    });
  }

  private _generateKey(): string {
    return 'key_' + (CommandLineParameterProvider._keyCounter++).toString();
  }

  private _getParameter<T extends CommandLineParameterBase>(
    parameterLongName: string,
    expectedKind: CommandLineParameterKind,
    parameterScope?: string
  ): T {
    // Support the parameter long name being prefixed with the scope
    const { scope, longName } = this.parseScopedLongName(parameterLongName);
    parameterLongName = longName;
    parameterScope = scope || parameterScope;

    const parameters: CommandLineParameterBase[] | undefined =
      this._parametersByLongName.get(parameterLongName);
    if (!parameters) {
      throw new Error(`The parameter "${parameterLongName}" is not defined`);
    }

    let parameter: CommandLineParameterBase | undefined = parameters.find(
      (p) => p.parameterScope === parameterScope
    );
    if (!parameter) {
      if (parameterScope !== undefined) {
        throw new Error(
          `The parameter "${parameterLongName}" with scope "${parameterScope}" is not defined.`
        );
      }
      if (parameters.length !== 1) {
        throw new Error(`The parameter "${parameterLongName}" is ambiguous. You must specify a scope.`);
      }
      parameter = parameters[0];
    }

    if (parameter.kind !== expectedKind) {
      throw new Error(
        `The parameter "${parameterLongName}" is of type "${CommandLineParameterKind[parameter.kind]}"` +
          ` whereas the caller was expecting "${CommandLineParameterKind[expectedKind]}".`
      );
    }

    return parameter as T;
  }

  private _throwParserExitError(
    parserOptions: ICommandLineParserOptions,
    data: ICommandLineParserData,
    errorCode: number,
    message: string
  ): never {
    // Write out the usage text to make it easier for the user to find the correct parameter name
    const targetActionName: string = data.aliasAction || data.action || '';
    const errorPrefix: string =
      `Error: ${parserOptions.toolFilename}` +
      // Handle aliases, actions, and actionless parameter providers
      `${targetActionName ? ' ' : ''}${targetActionName}: error: `;

    // eslint-disable-next-line no-console
    console.log(this.renderUsageText());
    throw new CommandLineParserExitError(errorCode, `${errorPrefix}${message.trimStart().trimEnd()}\n`);
  }
}
