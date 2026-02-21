// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ICommandLineChoiceDefinition } from './CommandLineDefinition.ts';
import { CommandLineParameterBase, CommandLineParameterKind } from './BaseClasses.ts';

/**
 * The data type returned by {@link CommandLineParameterProvider.(defineChoiceParameter:2)}.
 * @public
 */
export interface IRequiredCommandLineChoiceParameter<TChoice extends string = string>
  extends CommandLineChoiceParameter<TChoice> {
  readonly value: TChoice;
}

/**
 * The data type returned by {@link CommandLineParameterProvider.(defineChoiceParameter:1)}.
 * @public
 */
export class CommandLineChoiceParameter<TChoice extends string = string> extends CommandLineParameterBase {
  /** {@inheritDoc ICommandLineChoiceDefinition.alternatives} */
  public readonly alternatives: ReadonlySet<TChoice>;

  /** {@inheritDoc ICommandLineStringDefinition.defaultValue} */
  public readonly defaultValue: TChoice | undefined;

  private _value: TChoice | undefined = undefined;

  /** {@inheritDoc ICommandLineChoiceDefinition.completions} */
  public readonly completions: (() => Promise<ReadonlyArray<TChoice> | ReadonlySet<TChoice>>) | undefined;

  /** {@inheritDoc CommandLineParameterBase.kind} */
  public readonly kind: CommandLineParameterKind.Choice = -CommandLineParameterKind.Choice;

  /** @internal */
  public constructor(definition: ICommandLineChoiceDefinition<TChoice>) {
    super(definition);
    const { alternatives, defaultValue, completions } = definition;

    const alternativesSet: Set<TChoice> = alternatives instanceof Set ? alternatives : new Set(alternatives);
    if (alternativesSet.size < 1) {
      throw new Error(
        `When defining a choice parameter, the alternatives list must contain at least one value.`
      );
    }
    if (defaultValue && !alternativesSet.has(defaultValue)) {
      throw new Error(
        `The specified default value "${defaultValue}"` +
          ` is not one of the available options: ${alternatives.toString()}`
      );
    }

    this.alternatives = alternativesSet;
    this.defaultValue = defaultValue;
    this.validateDefaultValue(!!this.defaultValue);
    this.completions = completions;
  }

  /**
   * {@inheritDoc CommandLineParameterBase._setValue}
   * @internal
   */
  public _setValue(data: unknown): void {
    // abstract
    if (data !== null && data !== undefined) {
      if (typeof data !== 'string') {
        this.reportInvalidData(data);
      }
      this._value = data as TChoice;
      return;
    }

    if (this.environmentVariable !== undefined) {
      // Try reading the environment variable
      const environmentValue: string | undefined = process.env[this.environmentVariable];
      if (environmentValue !== undefined && environmentValue !== '') {
        if (!this.alternatives.has(environmentValue as TChoice)) {
          const choices: string = '"' + Array.from(this.alternatives).join('", "') + '"';
          throw new Error(
            `Invalid value "${environmentValue}" for the environment variable` +
              ` ${this.environmentVariable}.  Valid choices are: ${choices}`
          );
        }

        this._value = environmentValue as TChoice;
        return;
      }
    }

    if (this.defaultValue !== undefined) {
      this._value = this.defaultValue;
      return;
    }

    this._value = undefined;
  }

  /**
   * {@inheritDoc CommandLineParameterBase._getSupplementaryNotes}
   * @internal
   */
  public _getSupplementaryNotes(supplementaryNotes: string[]): void {
    // virtual
    super._getSupplementaryNotes(supplementaryNotes);
    if (this.defaultValue !== undefined) {
      supplementaryNotes.push(`The default value is "${this.defaultValue}".`);
    }
  }

  /**
   * Returns the argument value for a choice parameter that was parsed from the command line.
   *
   * @remarks
   * The return value will be `undefined` if the command-line has not been parsed yet,
   * or if the parameter was omitted and has no default value.
   */
  public get value(): TChoice | undefined {
    return this._value;
  }

  /** {@inheritDoc CommandLineParameterBase.appendToArgList} @override */
  public appendToArgList(argList: string[]): void {
    if (this.value !== undefined) {
      argList.push(this.longName);
      argList.push(this.value);
    }
  }
}
