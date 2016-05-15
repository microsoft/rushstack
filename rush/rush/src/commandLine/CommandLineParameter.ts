/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

/**
 * For use with CommandLineParser, this interface represents a command-line parameter
 * that is a simple boolean flag.
 */
export interface ICommandLineFlagDefinition {
  /**
   * The long name of the flag, e.g. "--do-something"
   */
  parameterLongName: string;

  /**
   * An optional short name for the flag, e.g. "-d"
   */
  parameterShortName?: string;

  /**
   * Documentation for the flag, that will be shown when invoking the tool with "--help"
   */
  description: string;
}

export class CommandLineFlagParameter {
  // An internal key used to retrieve the value from the parser's dictionary
  public key: string;

  // True if the flag was specified on the command line; false if it was omitted.
  public value: boolean;
}
