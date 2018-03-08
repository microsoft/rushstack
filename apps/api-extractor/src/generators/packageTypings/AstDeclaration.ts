// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { AstSymbol } from './AstSymbol';

export interface IAstDeclarationParameters {
  declaration: ts.Declaration;
  astSymbol: AstSymbol;
  typeDirectiveReferences: ReadonlyArray<string>;
}

export class AstDeclaration {
  public readonly declaration: ts.Declaration;

  public readonly astSymbol: AstSymbol;

  /**
   * A list of names (e.g. "example-library") that should appear in a reference like this:
   *
   * /// <reference types="example-library" />
   */
  public readonly typeDirectiveReferences: ReadonlyArray<string>;

  public constructor(parameters: IAstDeclarationParameters) {
    this.declaration = parameters.declaration;
    this.astSymbol = parameters.astSymbol;
    this.typeDirectiveReferences = parameters.typeDirectiveReferences;
  }
}
