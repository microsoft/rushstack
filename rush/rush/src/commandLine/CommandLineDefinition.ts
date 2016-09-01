/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

/**
 * For use with CommandLineParser, this interface represents a generic command-line parameter
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

/**
 * For use with CommandLineParser, this interface represents a boolean flag command line parameter
 */
export interface ICommandLineFlagDefinition extends IBaseCommandLineDefinition { }

/**
 * For use with CommandLineParser, this interface represents a string command line parameter
 */
export interface ICommandLineStringDefinition extends IBaseCommandLineDefinition { }