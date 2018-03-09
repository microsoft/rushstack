// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AstSymbol } from './AstSymbol';

export interface IAstNamedExport {
  readonly name: string;
  readonly astSymbol: AstSymbol;
}

export interface IAstEntryPointParameters {
  readonly exports: ReadonlyArray<IAstNamedExport>;
}

export class AstEntryPoint {
  public readonly exports: ReadonlyArray<IAstNamedExport>;

  public constructor(parameters: IAstEntryPointParameters) {
    this.exports = parameters.exports;
  }
}
