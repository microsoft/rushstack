// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ICommandLineRemainderDefinition } from './CommandLineDefinition.ts';

/**
 * The data type returned by {@link CommandLineParameterProvider.defineCommandLineRemainder}.
 * @public
 */
export class CommandLineRemainder {
  private _values: string[] = [];

  /** {@inheritDoc IBaseCommandLineDefinition.description} */
  public readonly description: string;

  /** @internal */
  public constructor(definition: ICommandLineRemainderDefinition) {
    this.description = definition.description;
  }

  /**
   * Returns any remaining command line arguments after the recognized portion
   * that was parsed from the command line.
   *
   * @remarks
   * The array will be empty if the command-line has not been parsed yet.
   */
  public get values(): ReadonlyArray<string> {
    return this._values;
  }

  /**
   * {@inheritDoc CommandLineParameterBase._setValue}
   * @internal
   */
  public _setValue(data: unknown): void {
    // abstract
    if (!Array.isArray(data) || !data.every((x) => typeof x === 'string')) {
      throw new Error(`Unexpected data object for remainder: ` + JSON.stringify(data));
    }

    this._values.push(...data);
  }

  /** {@inheritDoc CommandLineParameterBase.appendToArgList} @override */
  public appendToArgList(argList: string[]): void {
    if (this.values.length > 0) {
      for (const value of this.values) {
        argList.push(value);
      }
    }
  }
}
