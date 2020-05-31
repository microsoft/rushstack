// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IBaseCommandLineDefinition,
  IBaseCommandLineDefinitionWithArgument
} from './CommandLineDefinition';

/**
 * Identifies the kind of a CommandLineParameter.
 * @public
 */
export enum CommandLineParameterKind {
  /** Indicates a CommandLineChoiceParameter */
  Choice,
  /** Indicates a CommandLineFlagParameter */
  Flag,
  /** Indicates a CommandLineIntegerParameter */
  Integer,
  /** Indicates a CommandLineStringParameter */
  String,
  /** Indicates a CommandLineStringListParameter */
  StringList
}

/**
 * The base class for the various command-line parameter types.
 * @public
 */
export abstract class CommandLineParameter {
  // Example: "--do-something"
  private static _longNameRegExp: RegExp = /^-(-[a-z0-9]+)+$/;

  // Example: "-d"
  private static _shortNameRegExp: RegExp = /^-[a-zA-Z]$/;

  // "Environment variable names used by the utilities in the Shell and Utilities volume of
  // IEEE Std 1003.1-2001 consist solely of uppercase letters, digits, and the '_' (underscore)
  // from the characters defined in Portable Character Set and do not begin with a digit."
  // Example: "THE_SETTING"
  private static _environmentVariableRegExp: RegExp = /^[A-Z_][A-Z0-9_]*$/;

  /**
   * A unique internal key used to retrieve the value from the parser's dictionary.
   * @internal
   */
  public _parserKey: string;

  /** {@inheritDoc IBaseCommandLineDefinition.parameterLongName} */
  public readonly longName: string;

  /** {@inheritDoc IBaseCommandLineDefinition.parameterShortName} */
  public readonly shortName: string | undefined;

  /** {@inheritDoc IBaseCommandLineDefinition.description} */
  public readonly description: string;

  /** {@inheritDoc IBaseCommandLineDefinition.required} */
  public readonly required: boolean;

  /** {@inheritDoc IBaseCommandLineDefinition.environmentVariable} */
  public readonly environmentVariable: string | undefined;

  /** @internal */
  public constructor(definition: IBaseCommandLineDefinition) {
    this.longName = definition.parameterLongName;
    this.shortName = definition.parameterShortName;
    this.description = definition.description;
    this.required = !!definition.required;
    this.environmentVariable = definition.environmentVariable;

    if (!CommandLineParameter._longNameRegExp.test(this.longName)) {
      throw new Error(`Invalid name: "${this.longName}". The parameter long name must be`
        + ` lower-case and use dash delimiters (e.g. "--do-a-thing")`);
    }

    if (this.shortName) {
      if (!CommandLineParameter._shortNameRegExp.test(this.shortName)) {
        throw new Error(`Invalid name: "${this.shortName}". The parameter short name must be`
          + ` a dash followed by a single upper-case or lower-case letter (e.g. "-a")`);
      }
    }

    if (this.environmentVariable) {
      if (this.required) {
        // TODO: This constraint is imposed only because argparse enforces "required" parameters, but
        // it does not know about ts-command-line environment variable mappings.  We should fix this.
        throw new Error(`An "environmentVariable" cannot be specified for "${this.longName}"`
          + ` because it is a required parameter`);
      }

      if (!CommandLineParameter._environmentVariableRegExp.test(this.environmentVariable)) {
        throw new Error(`Invalid environment variable name: "${this.environmentVariable}". The name must`
          + ` consist only of upper-case letters, numbers, and underscores. It may not start with a number.`);
      }
    }
  }

  /**
   * Called internally by CommandLineParameterProvider._processParsedData()
   * @internal
   */
  public abstract _setValue(data: any): void; // eslint-disable-line @typescript-eslint/no-explicit-any

  /**
   * Returns additional text used by the help formatter.
   * @internal
   */
  public _getSupplementaryNotes(supplementaryNotes: string[]): void { // virtual
    if (this.environmentVariable !== undefined) {
      supplementaryNotes.push('This parameter may alternatively be specified via the ' + this.environmentVariable
      + ' environment variable.');
    }
  }

  /**
   * Indicates the type of parameter.
   */
  public abstract get kind(): CommandLineParameterKind;

  /**
   * Append the parsed values to the provided string array.
   * @remarks
   * Sometimes a command line parameter is not used directly, but instead gets passed through to another
   * tool that will use it.  For example if our parameter comes in as "--max-count 3", then we might want to
   * call `child_process.spawn()` and append ["--max-count", "3"] to the args array for that tool.
   * appendToArgList() appends zero or more strings to the provided array, based on the input command-line
   * that we parsed.
   *
   * If the parameter was omitted from our command-line and has no default value, then
   * nothing will be appended.  If the short name was used, the long name will be appended instead.
   * @param argList - the parsed strings will be appended to this string array
   */
  public abstract appendToArgList(argList: string[]): void;

  /**
   * Internal usage only.  Used to report unexpected output from the argparse library.
   */
  protected reportInvalidData(data: any): never { // eslint-disable-line @typescript-eslint/no-explicit-any
    throw new Error(`Unexpected data object for parameter "${this.longName}": `
      + JSON.stringify(data));
  }

  protected validateDefaultValue(hasDefaultValue: boolean): void {
    if (this.required && hasDefaultValue) {
      // If a parameter is "required", then the user understands that they always need to
      // specify a value for this parameter (either via the command line or via an environment variable).
      // It would be confusing to allow a default value that sometimes allows the "required" parameter
      // to be omitted.  If you sometimes don't have a suitable default value, then the better approach
      // is to throw a custom error explaining why the parameter is required in that case.
      throw new Error(`A default value cannot be specified for "${this.longName}"`
        + ` because it is a "required" parameter`);
    }
  }
}

/**
 * The common base class for parameters types that receive an argument.
 *
 * @remarks
 * An argument is an accompanying command-line token, such as "123" in the
 * example "--max-count 123".
 * @public
 */
export abstract class CommandLineParameterWithArgument extends CommandLineParameter {
  // Matches the first character that *isn't* part of a valid upper-case argument name such as "URL_2"
  private static _invalidArgumentNameRegExp: RegExp = /[^A-Z_0-9]/;

  /** {@inheritDoc IBaseCommandLineDefinitionWithArgument.argumentName} */
  public readonly argumentName: string;

  /** @internal */
  public constructor(definition: IBaseCommandLineDefinitionWithArgument) {
    super(definition);

    if (definition.argumentName === '') {
      throw new Error('The argument name cannot be an empty string. (For the default name, specify undefined.)');
    }
    if (definition.argumentName.toUpperCase() !== definition.argumentName) {
      throw new Error(`Invalid name: "${definition.argumentName}". The argument name must be all upper case.`);
    }
    const match: RegExpMatchArray | null = definition.argumentName.match(
      CommandLineParameterWithArgument._invalidArgumentNameRegExp);
    if (match) {
      throw new Error(`The argument name "${definition.argumentName}" contains an invalid character "${match[0]}".`
        + ` Only upper-case letters, numbers, and underscores are allowed.`);
    }
    this.argumentName = definition.argumentName;
  }
}





