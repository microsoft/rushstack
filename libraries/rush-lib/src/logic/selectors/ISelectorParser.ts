// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/node-core-library';

export interface IEvaluateSelectorOptions {
  unscopedSelector: string;
  terminal: ITerminal;

  /**
   * A short, human-readable description of the context where this selector was encountered.
   * Often used in an error message reading: "<Error> happened in <context>." For example,
   * "parameter --from" would be a good context for a CLI.
   */
  context: string;
}

export interface ISelectorParser<T> {
  evaluateSelectorAsync(options: IEvaluateSelectorOptions): Promise<Iterable<T>>;
  getCompletions(): Iterable<string>;
}
