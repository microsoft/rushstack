// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';

import { AstDeclaration } from './AstDeclaration';
import { SymbolAnalyzer, IFollowAliasesResult } from './SymbolAnalyzer';
import { TypeScriptHelpers } from '../../utils/TypeScriptHelpers';
import { AstSymbol } from './AstSymbol';
import { AstImport } from './AstImport';

export class AstSymbolTable {
  private _typeChecker: ts.TypeChecker;

  /**
   * A mapping from ts.Symbol --> AstSymbol
   * NOTE: The AstSymbol.followedSymbol will always be a lookup key, but additional keys
   * are possible.
   *
   * After following type aliases, we use this map to look up the corresponding AstSymbol.
   */
  private readonly _astSymbolsBySymbol: Map<ts.Symbol, AstSymbol> = new Map<ts.Symbol, AstSymbol>();

  /**
   * A mapping from Entry.importPackageKey --> Entry.
   *
   * If Entry.importPackageKey is undefined, then it is not included in the map.
   */
  private readonly _entriesByImportKey: Map<string, AstSymbol> = new Map<string, AstSymbol>();

  /**
   * A mapping from a source filename to a list of type declaration references.
   *
   * For example, the file path "/project1/lib/example.d.ts" might map to an array
   * such as [ "node", "es6-promise" ].
   */
  private readonly _typeDirectiveReferencesByFilePath: Map<string, ReadonlyArray<string>>
    = new Map<string, ReadonlyArray<string>>();

  public constructor(typeChecker: ts.TypeChecker) {
    this._typeChecker = typeChecker;
  }

  public analyzeEntryPoint(sourceFile: ts.SourceFile): AstDeclaration {
    const rootFileSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(sourceFile);

    if (!rootFileSymbol.declarations || !rootFileSymbol.declarations.length) {
      throw new Error('Unable to find a root declaration for ' + sourceFile.fileName);
    }

    const result: AstSymbol | undefined = this._fetchAstSymbol(rootFileSymbol, true);
    if (!result) {
      throw new Error('Unable to analyze the entry point for ' + sourceFile.fileName);
    }

    return result.mainDeclaration;
  }

  private _fetchAstSymbol(symbol: ts.Symbol, isEntryPoint: boolean): AstSymbol | undefined {
    const followAliasesResult: IFollowAliasesResult = SymbolAnalyzer.followAliases(symbol, this._typeChecker);

    if (followAliasesResult.isAmbient && !isEntryPoint) {
      return undefined; // we don't care about ambient definitions
    }

    const followedSymbol: ts.Symbol = followAliasesResult.followedSymbol;
    if (followedSymbol.flags & (ts.SymbolFlags.TypeParameter | ts.SymbolFlags.TypeLiteral)) {
      return undefined;
    }

    let astSymbol: AstSymbol | undefined = this._astSymbolsBySymbol.get(followedSymbol);

    if (!astSymbol) {

      let astImport: AstImport | undefined = undefined;
      if (followAliasesResult.importPackagePath) {
        astImport = new AstImport({
          modulePath: followAliasesResult.importPackagePath,
          exportName: followAliasesResult.importPackageExportName!
        });
      }

      if (astImport) {
        astSymbol = this._entriesByImportKey.get(astImport.key);

        if (astSymbol) {
          // We didn't find the entry using followedSymbol, but we did using importPackageKey,
          // so add a mapping for followedSymbol; we'll need it later when renaming identifiers
          this._astSymbolsBySymbol.set(followedSymbol, astSymbol);
        }
      }

      if (!astSymbol) {
        // None of the above lookups worked, so create a new entry
        astSymbol = new AstSymbol({
          localName: followAliasesResult.localName,
          followedSymbol: followAliasesResult.followedSymbol,
          astImport: astImport
        });

        this._astSymbolsBySymbol.set(followedSymbol, astSymbol);

        if (astImport) {
          // If it's an import, add it to the lookup
          this._entriesByImportKey.set(astImport.key, astSymbol);
        } else {

          // If it's not an import, then crawl for type references
          for (const declaration of followedSymbol.declarations || []) {
            const typeDirectiveReferences: ReadonlyArray<string>
              = this._getTypeDirectiveReferences(declaration);

            const astDeclaration: AstDeclaration = new AstDeclaration({
              declaration: declaration,
              astSymbol: astSymbol,
              typeDirectiveReferences: typeDirectiveReferences
            });
            astSymbol.attachDeclaration(astDeclaration);

            this._collectTypes(declaration);
          }
        }
      }
    }

    return astSymbol;
  }

  private _collectTypes(node: ts.Node): void {
    switch (node.kind) {
      case ts.SyntaxKind.Block:
        // Don't traverse into code
        return;
      case ts.SyntaxKind.TypeReference: // general type references
      case ts.SyntaxKind.ExpressionWithTypeArguments: // special case for e.g. the "extends" keyword
        {
          // Sometimes the type reference will involve multiple identifiers, e.g. "a.b.C".
          // In this case, we only need to worry about importing the first identifier,
          // so do a depth-first search for it:
          const symbolNode: ts.Node | undefined = TypeScriptHelpers.findFirstChildNode(
            node, ts.SyntaxKind.Identifier);

          if (!symbolNode) {
            break;
          }

          const symbol: ts.Symbol | undefined = this._typeChecker.getSymbolAtLocation(symbolNode);
          if (!symbol) {
            throw new Error('Symbol not found for identifier: ' + symbolNode.getText());
          }

          this._fetchAstSymbol(symbol, false);
        }
        break;  // keep recursing
    }

    for (const child of node.getChildren() || []) {
      this._collectTypes(child);
    }
  }

  private _getTypeDirectiveReferences(node: ts.Node): ReadonlyArray<string> {
    const sourceFile: ts.SourceFile = node.getSourceFile();
    if (!sourceFile || !sourceFile.fileName) {
      return [];
    }

    const cachedList: ReadonlyArray<string> | undefined
      = this._typeDirectiveReferencesByFilePath.get(sourceFile.fileName);
    if (cachedList) {
      return cachedList;
    }

    const list: string[] = [];

    for (const typeReferenceDirective of sourceFile.typeReferenceDirectives) {
      const name: string = sourceFile.text.substring(typeReferenceDirective.pos, typeReferenceDirective.end);
      if (list.indexOf(name) < 0) {
        list.push(name);
      }
    }

    this._typeDirectiveReferencesByFilePath.set(sourceFile.fileName, list);
    return list;
  }

}
