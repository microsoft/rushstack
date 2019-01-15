// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

import { AstSymbol } from './AstSymbol';

/**
 */
export class AstModule {
  public readonly sourceFile: ts.SourceFile;

  public readonly exportedSymbols: Map<string, AstSymbol>;
  public readonly starExportedModules: Set<AstModule>;

  /**
   * Example:  "@microsoft/node-core-library/lib/FileSystem"
   * but never: "./FileSystem"
   */
  public externalModulePath: string | undefined;

  public constructor(sourceFile: ts.SourceFile) {
    this.sourceFile = sourceFile;
    this.exportedSymbols = new Map<string, AstSymbol>();
    this.starExportedModules = new Set<AstModule>();
    this.externalModulePath = undefined;
  }

  public get isExternal(): boolean {
    return this.externalModulePath !== undefined;
  }

}
