import type { ITerminal } from '@rushstack/node-core-library';

export interface ISelectorParser<T> {
  evaluateSelectorAsync(
    unscopedSpecifier: string,
    terminal: ITerminal,
    parameterName: string,
    forIncrementalBuild: boolean
  ): Promise<Iterable<T>>;
  getCompletions(): Iterable<string>;
}
