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

  /**
   * If true, then an error occurs if the parameter was not included on the command-line
   * or provided via an environment variable.
   */
  required?: boolean;
}

/**
 * The common base interface for parameter types that accept an argument.
 *
 * @remarks
 * An argument is an accompanying command-line token, such as "123" in the
 * example "--max-count 123".
 * @public
 */
export interface IBaseCommandLineDefinitionWithArgument extends IBaseCommandLineDefinition {
  /**
   * The name of the argument, which will be shown in the command-line help.
   *
   * @remarks
   * For example, if the parameter name is '--count" and the argument name is "NUMBER",
   * then the command-line help would display "--count NUMBER".  The argument name must
   * be comprised of upper-case letters, numbers, and underscores.  It should be kept short.
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
   * {@inheritdoc ICommandLineStringDefinition.defaultValue}
   */
  defaultValue?: string;
}

/**
 * For use with CommandLineParser, this interface represents a command line parameter
 * that is a boolean flag.
 *
 * @public
 */
export interface ICommandLineFlagDefinition extends IBaseCommandLineDefinition { }

/**
 * For use with CommandLineParser, this interface represents a command line parameter
 * whose argument is an integer value.
 *
 * @public
 */
export interface ICommandLineIntegerDefinition extends IBaseCommandLineDefinitionWithArgument {
  /**
   * {@inheritdoc ICommandLineStringDefinition.defaultValue}
   */
  defaultValue?: number;
}

/**
 * For use with CommandLineParser, this interface represents a command line parameter
 * whose argument is a string value.
 *
 * @public
 */
export interface ICommandLineStringDefinition extends IBaseCommandLineDefinitionWithArgument {
  /**
   * The default value which will be used if the parameter is omitted from the command line.
   *
   * @remarks
   * If a default value is specified, then {@link IBaseCommandLineDefinition.required}
   * must not be true.  Instead, a custom error message should be used to report cases
   * where the value could not be determined.
   */
  defaultValue?: string;
}

/**
 * For use with CommandLineParser, this interface represents a command line parameter
 * whose argument is a list of strings.
 *
 * @public
 */
export interface ICommandLineStringListDefinition extends IBaseCommandLineDefinitionWithArgument { }
