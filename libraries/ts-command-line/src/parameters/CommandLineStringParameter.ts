// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ICommandLineStringDefinition } from './CommandLineDefinition';
import { CommandLineParameterWithArgument, CommandLineParameterKind } from './BaseClasses';

/**
 * The data type returned by {@link CommandLineParameterProvider.defineStringParameter}.
 * @public
 */
export class CommandLineStringParameter extends CommandLineParameterWithArgument {
  /** {@inheritDoc ICommandLineStringDefinition.defaultValue} */
  public readonly defaultValue: string | undefined;

  private _value: string | undefined = undefined;

  /** @internal */
  public constructor(definition: ICommandLineStringDefinition) {
    super(definition);

    this.defaultValue = definition.defaultValue;
    this.validateDefaultValue(!!this.defaultValue);
  }

  /** {@inheritDoc CommandLineParameter.kind} */
  public get kind(): CommandLineParameterKind {
    return CommandLineParameterKind.String;
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
      if (environmentValue !== undefined) {
        // NOTE: If the environment variable is defined as an empty string,
        // here we will accept the empty string as our value.  (For number/flag we don't do that.)
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
      if (this.defaultValue.length < 160) {
        supplementaryNotes.push(`The default value is ${JSON.stringify(this.defaultValue)}.`);
      }
    }
  }

  /**
   * Returns the argument value for a string parameter that was parsed from the command line.
   *
   * @remarks
   * The return value will be undefined if the command-line has not been parsed yet,
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
