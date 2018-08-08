// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Consider contributing some these types back to DefinitelyTyped
 */

interface IRange { }
interface ILoc { }

interface IConstDependency {
  loc: ILoc;
  new (value: string, range: IRange, requireWebpackRequire: boolean): IConstDependency;
}

interface IParserHelper {
  evaluateToString(str: string): (...args: any[]) => any;
  toConstantDependency(parser: IParser, str: string): (...args: any[]) => any;
}

interface IV3Chunk {
  name: string;
  id: number;
}

interface IParam {
  string: string;
  isString(): boolean;
}

interface IModule {
  addDependency: (dependency: IConstDependency) => void;
}

interface IExpression {
  arguments: IExpresionArgument[];
  loc: ILoc;
  range: IRange;
}

interface IRange { }

interface IExpresionArgument { }

interface IParser {
  evaluateExpression(expression: IExpresionArgument): IParam;
  state: {
    current: IModule
  };
  hooks: {
    call: {
      for(expressionName: string): ITapable;
    };
    evaluateTypeof: {
      for(expressionName: string): ITapable;
    };
    typeof: {
      for(expressionName: string): ITapable;
    };
  };
}

interface ITapable {
  tap(name: string, fn: (...args: any[]) => any): void;
}
