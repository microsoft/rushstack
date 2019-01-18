// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

import { AstSymbol } from './AstSymbol';

export class AstModuleExportInfo {
  public readonly exportedLocalSymbols: Map<string, AstSymbol> = new Map<string, AstSymbol>();
  public readonly starExportedExternalModules: Set<AstModule> = new Set<AstModule>();
}

/**
 * An internal data structure that represents a source file that is analyzed by AstSymbolTable.
 */
export class AstModule {
  public readonly sourceFile: ts.SourceFile;
  public readonly moduleSymbol: ts.Symbol;

  /**
   * Example:  "@microsoft/node-core-library/lib/FileSystem"
   * but never: "./FileSystem"
   */
  public readonly externalModulePath: string | undefined;

  public readonly starExportedModules: Set<AstModule>;

  public readonly cachedExportedSymbols: Map<string, AstSymbol>;

  public astModuleExportInfo: AstModuleExportInfo | undefined;

  public constructor(sourceFile: ts.SourceFile, moduleSymbol: ts.Symbol, externalModulePath: string | undefined) {
    this.sourceFile = sourceFile;
    this.moduleSymbol = moduleSymbol;
    this.externalModulePath = externalModulePath;

    this.starExportedModules = new Set<AstModule>();

    this.cachedExportedSymbols = new Map<string, AstSymbol>();

    this.astModuleExportInfo = undefined;
  }

  public get isExternal(): boolean {
    return this.externalModulePath !== undefined;
  }
}
