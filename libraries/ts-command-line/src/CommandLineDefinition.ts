// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * For use with CommandLineParser, this interface represents a generic command-line parameter
 *
 * @public
 */
export interface IBaseCommandLineDefinition<TValue> {
  /**
   * The long name of the flag including double dashes, e.g. "--do-something"
   */
  parameterLongName: string;

  /**
   * An optional short name for the flag including the dash, e.g. "-d"
   */
  parameterShortName?: string;

  /**
   * Documentation for the flag, that will be shown when invoking the tool with "--help"
   */
  description: string;

  /**
   * If true and no "getDefaultValue" function is provided, the parameter must be provided.
   */
  required?: boolean;

  /**
   * A default value for the parameter if no value was provided. If this property is undefined and the "required" flag
   *  is set, validation will fail.
   */
  defaultValue?: TValue | undefined;
}

export interface IKeyedCommandLineDefinition<TValue> extends IBaseCommandLineDefinition<TValue> {
  /**
   * The key used to identify the value of this parameter. This must be a unique value. If it is
   * omitted, a unique key is created. This key name appears in the help menu.
   * For certain definitions, the key value is not surfaced in the UI.
   */
  key?: string;
}

/**
 * For use with CommandLineParser, this interface represents a boolean flag command line parameter
 *
 * @public
 */
export interface ICommandLineFlagDefinition extends IBaseCommandLineDefinition<void> { }

/**
 * For use with CommandLineParser, this interface represents a string command line parameter
 *
 * @public
 */
export interface ICommandLineStringDefinition extends IKeyedCommandLineDefinition<string> { }

/**
 * For use with CommandLineParser, this interface represents a string command line parameter
 *
 * @public
 */
export interface ICommandLineStringListDefinition extends IKeyedCommandLineDefinition<string[]> { }

/**
 * For use with CommandLineParser, this interface represents a parameter which is constrained to
 * a list of possible options
 *
 * @public
 */
export interface ICommandLineOptionDefinition extends IBaseCommandLineDefinition<string> {
  /**
   * A list of strings (which contain no spaces), of possible options which can be selected
   */
  options: string[];
}

/**
 * For use with CommandLineParser, this interface represents an integer command line parameter
 *
 * @public
 */
export interface ICommandLineIntegerDefinition extends IKeyedCommandLineDefinition<number> { }
