// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ICommandLineRemainderDefinition } from './CommandLineDefinition';

/**
 * The data type returned by {@link CommandLineParameterProvider.defineCommandLineRemainder}.
 * @public
 */
export class CommandLineRemainder {
  private _values: string[] = [];
  private _hasSeparatorValue: boolean = false;

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
   *
   * When the `--` separator is used to delimit remainder arguments, it is automatically
   * excluded from this array. For example, `my-tool --flag -- arg1 arg2` will result in
   * `values` being `["arg1", "arg2"]`, not `["--", "arg1", "arg2"]`.
   */
  public get values(): ReadonlyArray<string> {
    return this._values;
  }

  /**
   * Returns true if the `--` separator was explicitly provided on the command line to delimit
   * remainder arguments.
   *
   * @remarks
   * This property is useful for scenarios where you need to distinguish between remainder arguments
   * that were explicitly separated with `--` versus those that were captured automatically.
   * For example, `my-tool --flag -- arg1` will have `hasSeparator=true`, while
   * `my-tool --flag arg1` will have `hasSeparator=false` (if arg1 is captured as remainder).
   *
   * @internal
   */
  public get _hasSeparator(): boolean {
    return this._hasSeparatorValue;
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

    // Check if the '--' separator is present in the data
    const hasSeparator: boolean = data.includes('--');
    if (hasSeparator) {
      this._hasSeparatorValue = true;
    }

    // Filter out the '--' separator that argparse includes in the remainder values.
    // Users expect everything AFTER '--' to be passed through, not including '--' itself.
    const filteredData: string[] = data.filter((value: string) => value !== '--');
    this._values.push(...filteredData);
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
