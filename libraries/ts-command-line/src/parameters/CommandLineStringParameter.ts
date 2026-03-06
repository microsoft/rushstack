// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ICommandLineStringDefinition } from './CommandLineDefinition.ts';
import { CommandLineParameterWithArgument, CommandLineParameterKind } from './BaseClasses.ts';

/**
 * The data type returned by {@link CommandLineParameterProvider.(defineStringParameter:2)}.
 * @public
 */
export interface IRequiredCommandLineStringParameter extends CommandLineStringParameter {
  readonly value: string;
}

/**
 * The data type returned by {@link CommandLineParameterProvider.(defineStringParameter:1)}.
 * @public
 */
export class CommandLineStringParameter extends CommandLineParameterWithArgument {
  /** {@inheritDoc ICommandLineStringDefinition.defaultValue} */
  public readonly defaultValue: string | undefined;

  private _value: string | undefined = undefined;

  /** {@inheritDoc CommandLineParameterBase.kind} */
  public readonly kind: CommandLineParameterKind.String = CommandLineParameterKind.String;

  /** @internal */
  public constructor(definition: ICommandLineStringDefinition) {
    super(definition);

    this.defaultValue = definition.defaultValue;
    this.validateDefaultValue(!!this.defaultValue);
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
   * {@inheritDoc CommandLineParameterBase._getSupplementaryNotes}
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

  /** {@inheritDoc CommandLineParameterBase.appendToArgList} @override */
  public appendToArgList(argList: string[]): void {
    if (this.value !== undefined) {
      argList.push(this.longName);
      argList.push(this.value);
    }
  }
}
