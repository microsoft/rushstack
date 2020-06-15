// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ICommandLineChoiceDefinition } from './CommandLineDefinition';
import { CommandLineParameter, CommandLineParameterKind } from './BaseClasses';

/**
 * The data type returned by {@link CommandLineParameterProvider.defineChoiceParameter}.
 * @public
 */
export class CommandLineChoiceParameter extends CommandLineParameter {
  /** {@inheritDoc ICommandLineChoiceDefinition.alternatives} */
  public readonly alternatives: ReadonlyArray<string>;

  /** {@inheritDoc ICommandLineStringDefinition.defaultValue} */
  public readonly defaultValue: string | undefined;

  private _value: string | undefined = undefined;

  /** @internal */
  public constructor(definition: ICommandLineChoiceDefinition) {
    super(definition);

    if (definition.alternatives.length < 1) {
      throw new Error(
        `When defining a choice parameter, the alternatives list must contain at least one value.`
      );
    }
    if (definition.defaultValue && definition.alternatives.indexOf(definition.defaultValue) === -1) {
      throw new Error(
        `The specified default value "${definition.defaultValue}"` +
          ` is not one of the available options: ${definition.alternatives.toString()}`
      );
    }

    this.alternatives = definition.alternatives;
    this.defaultValue = definition.defaultValue;
    this.validateDefaultValue(!!this.defaultValue);
  }

  /** {@inheritDoc CommandLineParameter.kind} */
  public get kind(): CommandLineParameterKind {
    return CommandLineParameterKind.Choice;
  }

  /**
   * {@inheritDoc CommandLineParameter._setValue}
   * @internal
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public _setValue(data: any): void {
    // abstract
    if (data !== null && data !== undefined) {
      if (typeof data !== 'string') {
        this.reportInvalidData(data);
      }
      this._value = data;
      return;
    }

    if (this.environmentVariable !== undefined) {
      // Try reading the environment variable
      const environmentValue: string | undefined = process.env[this.environmentVariable];
      if (environmentValue !== undefined && environmentValue !== '') {
        if (this.alternatives.indexOf(environmentValue) < 0) {
          const choices: string = '"' + this.alternatives.join('", "') + '"';
          throw new Error(
            `Invalid value "${environmentValue}" for the environment variable` +
              ` ${this.environmentVariable}.  Valid choices are: ${choices}`
          );
        }
        this._value = environmentValue;
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
   * {@inheritDoc CommandLineParameter._getSupplementaryNotes}
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
  public get value(): string | undefined {
    return this._value;
  }

  /** {@inheritDoc CommandLineParameter.appendToArgList} @override */
  public appendToArgList(argList: string[]): void {
    if (this.value !== undefined) {
      argList.push(this.longName);
      argList.push(this.value);
    }
  }
}
