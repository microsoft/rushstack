// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ICommandLineRemainderDefinition } from './CommandLineDefinition';

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
   *
   * When the `--` separator is used to delimit remainder arguments, it is automatically
   * excluded from this array. For example, `my-tool --flag -- arg1 arg2` will result in
   * `values` being `["arg1", "arg2"]`, not `["--", "arg1", "arg2"]`.
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

    // Filter out the first '--' separator that argparse includes in the remainder values.
    // Users expect everything AFTER '--' to be passed through, not including '--' itself.
    // However, if '--' appears again later, it should be preserved in case the underlying
    // tool needs it for its own purposes.
    const firstSeparatorIndex: number = data.indexOf('--');
    if (firstSeparatorIndex !== -1) {
      // Remove the first '--' and keep everything after it
      this._values.push(...data.slice(firstSeparatorIndex + 1));
    } else {
      // No separator found, push all data
      this._values.push(...data);
    }
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
