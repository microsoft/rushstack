// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/node-core-library';

export interface IEvaluateSelectorOptions {
  /**
   * The "value" of a selector (i.e., the part after the colon ":", or the entire string
   * if there is no scope).
   */
  unscopedSelector: string;

  /**
   * The interface for selector scopes requires a terminal, so that selector implementations
   * can interact with other Rush subsystems (which often require a terminal instance).
   *
   * If your selector produces an error, instead of writing it to terminal, consider throwing
   * a SelectorError, so your select is usable both within Rush and in user scripts.
   */
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
