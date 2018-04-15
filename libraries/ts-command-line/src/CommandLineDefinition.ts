// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * For use with CommandLineParser, this interface represents a generic command-line parameter
 *
 * @public
 */
export interface IBaseCommandLineDefinition {
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
}

export interface IBaseCommandLineDefinitionWithArgument extends IBaseCommandLineDefinition {
  /**
   * The name of the argument, which will be shown in the command-line help.
   *
   * @remarks
   * Suppose the help shows "--output FILE".  Then "--output' is the parameter name,
   * and "FILE" is the argument name.
   */
  argumentName: string;
}

/**
 * For use with CommandLineParser, this interface represents a parameter which is constrained to
 * a list of possible options
 *
 * @public
 */
export interface ICommandLineChoiceDefinition extends IBaseCommandLineDefinition {
  /**
   * A list of strings (which contain no spaces), of possible options which can be selected
   */
  alternatives: string[];

  /**
   * The default value which will be used if the parameter is omitted from the command line
   */
  defaultValue?: string;
}

/**
 * For use with CommandLineParser, this interface represents a boolean flag command line parameter
 *
 * @public
 */
export interface ICommandLineFlagDefinition extends IBaseCommandLineDefinition { }

/**
 * For use with CommandLineParser, this interface represents an integer command line parameter
 *
 * @public
 */
export interface ICommandLineIntegerDefinition extends IBaseCommandLineDefinitionWithArgument { }

/**
 * For use with CommandLineParser, this interface represents a string command line parameter
 *
 * @public
 */
export interface ICommandLineStringDefinition extends IBaseCommandLineDefinitionWithArgument { }

/**
 * For use with CommandLineParser, this interface represents a string command line parameter
 *
 * @public
 */
export interface ICommandLineStringListDefinition extends IBaseCommandLineDefinitionWithArgument { }
