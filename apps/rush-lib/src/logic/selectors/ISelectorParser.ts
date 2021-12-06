import type { ITerminal } from '@rushstack/node-core-library';

export enum EvaluateSelectorMode {
  RushChange,
  IncrementalBuild
}

export interface IEvaluateSelectorOptions {
  unscopedSelector: string;
  terminal: ITerminal;
  parameterName: string;
  mode: EvaluateSelectorMode;
}

export interface ISelectorParser<T> {
  evaluateSelectorAsync(options: IEvaluateSelectorOptions): Promise<Iterable<T>>;
  getCompletions(): Iterable<string>;
}
