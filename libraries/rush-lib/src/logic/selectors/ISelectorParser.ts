// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/node-core-library';

export interface IEvaluateSelectorOptions {
  unscopedSelector: string;
  terminal: ITerminal;
  parameterName: string;
}

export interface ISelectorParser<T> {
  evaluateSelectorAsync(options: IEvaluateSelectorOptions): Promise<Iterable<T>>;
  getCompletions(): Iterable<string>;
}
