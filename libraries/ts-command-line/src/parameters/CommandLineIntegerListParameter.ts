// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ICommandLineIntegerListDefinition } from './CommandLineDefinition.ts';
import { CommandLineParameterWithArgument, CommandLineParameterKind } from './BaseClasses.ts';
import { EnvironmentVariableParser } from './EnvironmentVariableParser.ts';

/**
 * The data type returned by {@link CommandLineParameterProvider.defineIntegerListParameter}.
 * @public
 */
export class CommandLineIntegerListParameter extends CommandLineParameterWithArgument {
  private _values: number[] = [];

  /** {@inheritDoc CommandLineParameterBase.kind} */
  public readonly kind: CommandLineParameterKind.IntegerList = CommandLineParameterKind.IntegerList;

  /** @internal */
  public constructor(definition: ICommandLineIntegerListDefinition) {
    super(definition);
  }

  /**
   * {@inheritDoc CommandLineParameterBase._setValue}
   * @internal
   */
  public _setValue(data: unknown): void {
    // If argparse passed us a value, confirm it is valid
    if (data !== null && data !== undefined) {
      if (!Array.isArray(data)) {
        this.reportInvalidData(data);
      }
      for (const arrayItem of data) {
        if (typeof arrayItem !== 'number') {
          this.reportInvalidData(data);
        }
      }
      this._values = data;
      return;
    }

    // If an environment variable exists, attempt to parse it as a list
    if (this.environmentVariable !== undefined) {
      const values: string[] | undefined = EnvironmentVariableParser.parseAsList(this.environmentVariable);
      if (values) {
        const parsedValues: number[] = [];
        for (const value of values) {
          const parsed: number = parseInt(value, 10);
          if (isNaN(parsed) || value.indexOf('.') >= 0) {
            throw new Error(
              `Invalid value "${value}" for the environment variable` +
                ` ${this.environmentVariable}.  It must be an integer value.`
            );
          }
          parsedValues.push(parsed);
        }
        this._values = parsedValues;
        return;
      }
    }

    // (No default value for integer lists)

    this._values = [];
  }

  /**
   * Returns the integer arguments for an integer list parameter that was parsed from the command line.
   *
   * @remarks
   * The array will be empty if the command-line has not been parsed yet,
   * or if the parameter was omitted and has no default value.
   */
  public get values(): ReadonlyArray<number> {
    return this._values;
  }

  /** {@inheritDoc CommandLineParameterBase.appendToArgList} @override */
  public appendToArgList(argList: string[]): void {
    if (this.values.length > 0) {
      for (const value of this.values) {
        argList.push(this.longName);
        argList.push(value.toString());
      }
    }
  }
}
