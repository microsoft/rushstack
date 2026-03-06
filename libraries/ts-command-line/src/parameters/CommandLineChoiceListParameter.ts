// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ICommandLineChoiceListDefinition } from './CommandLineDefinition.ts';
import { CommandLineParameterBase, CommandLineParameterKind } from './BaseClasses.ts';
import { EnvironmentVariableParser } from './EnvironmentVariableParser.ts';

/**
 * The data type returned by {@link CommandLineParameterProvider.defineChoiceListParameter}.
 * @public
 */
export class CommandLineChoiceListParameter<
  TChoice extends string = string
> extends CommandLineParameterBase {
  /** {@inheritDoc ICommandLineChoiceListDefinition.alternatives} */
  public readonly alternatives: ReadonlySet<TChoice>;

  private _values: TChoice[] = [];

  /** {@inheritDoc ICommandLineChoiceListDefinition.completions} */
  public readonly completions: (() => Promise<ReadonlyArray<TChoice> | ReadonlySet<TChoice>>) | undefined;

  /** {@inheritDoc CommandLineParameterBase.kind} */
  public readonly kind: CommandLineParameterKind.ChoiceList = CommandLineParameterKind.ChoiceList;

  /** @internal */
  public constructor(definition: ICommandLineChoiceListDefinition<TChoice>) {
    super(definition);
    const { alternatives, completions } = definition;

    const alternativesSet: Set<TChoice> = alternatives instanceof Set ? alternatives : new Set(alternatives);
    if (alternativesSet.size < 1) {
      throw new Error(
        `When defining a choice list parameter, the alternatives list must contain at least one value.`
      );
    }

    this.alternatives = alternativesSet;
    this.completions = completions;
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
        if (typeof arrayItem !== 'string') {
          this.reportInvalidData(data);
        }
      }
      this._values = data;
      return;
    }

    if (this.environmentVariable !== undefined) {
      const values: string[] | undefined = EnvironmentVariableParser.parseAsList(this.environmentVariable);
      if (values) {
        for (const value of values) {
          if (!this.alternatives.has(value as TChoice)) {
            const choices: string = '"' + Array.from(this.alternatives).join('", "') + '"';
            throw new Error(
              `Invalid value "${value}" for the environment variable` +
                ` ${this.environmentVariable}.  Valid choices are: ${choices}`
            );
          }
        }

        this._values = values as TChoice[];
        return;
      }
    }

    // (No default value for choice lists)

    this._values = [];
  }

  /**
   * Returns the string arguments for a choice list parameter that was parsed from the command line.
   *
   * @remarks
   * The array will be empty if the command-line has not been parsed yet,
   * or if the parameter was omitted and has no default value.
   */
  public get values(): ReadonlyArray<TChoice> {
    return this._values;
  }

  /** {@inheritDoc CommandLineParameterBase.appendToArgList} @override */
  public appendToArgList(argList: string[]): void {
    if (this.values.length > 0) {
      for (const value of this.values) {
        argList.push(this.longName);
        argList.push(value);
      }
    }
  }
}
