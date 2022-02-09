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
