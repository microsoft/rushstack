// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';

import { AstDeclaration } from './AstDeclaration';
import { SymbolAnalyzer, IFollowAliasesResult } from './SymbolAnalyzer';
import { TypeScriptHelpers } from '../../utils/TypeScriptHelpers';
import { AstSymbol } from './AstSymbol';
import { AstImport } from './AstImport';
import { AstEntryPoint, IExportedMember } from './AstEntryPoint';

/**
 * AstSymbolTable is the workhorse that builds AstSymbol and AstDeclaration objects.
 * It maintains a cache of already constructed objects.  AstSymbolTable constructs
 * AstEntryPoint objects, but otherwise the state that it maintains  is agnostic of
 * any particular entry point.  (For example, it does not track whether a given AstSymbol
 * is "exported" or not.)
 */
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
   * A mapping from ts.Declaration --> AstDeclaration
   */
  private readonly _astDeclarationsByDeclaration: Map<ts.Node, AstDeclaration>
    = new Map<ts.Node, AstDeclaration>();

  /**
   * A mapping from Entry.importPackageKey --> Entry.
   *
   * If Entry.importPackageKey is undefined, then it is not included in the map.
   */
  private readonly _astSymbolsByImportKey: Map<string, AstSymbol> = new Map<string, AstSymbol>();

  /**
   * Cache of fetchEntryPoint() results.
   */
  private readonly _astEntryPointsBySourceFile: Map<ts.SourceFile, AstEntryPoint>
    = new Map<ts.SourceFile, AstEntryPoint>();

  public constructor(typeChecker: ts.TypeChecker) {
    this._typeChecker = typeChecker;
  }

  /**
   * For a given source file, this analyzes all of its exports and produces an AstEntryPoint
   * object.
   */
  public fetchEntryPoint(sourceFile: ts.SourceFile): AstEntryPoint {
    let astEntryPoint: AstEntryPoint | undefined = this._astEntryPointsBySourceFile.get(sourceFile);
    if (!astEntryPoint) {
      const rootFileSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(sourceFile);

      if (!rootFileSymbol.declarations || !rootFileSymbol.declarations.length) {
        throw new Error('Unable to find a root declaration for ' + sourceFile.fileName);
      }

      const exportSymbols: ts.Symbol[] = this._typeChecker.getExportsOfModule(rootFileSymbol) || [];

      const exportedMembers: IExportedMember[] = [];

      for (const exportSymbol of exportSymbols) {
        const astSymbol: AstSymbol | undefined = this._fetchAstSymbol(exportSymbol, true);

        if (!astSymbol) {
          throw new Error('Unsupported export: ' + exportSymbol.name);
        }

        this.analyze(astSymbol);

        exportedMembers.push({ name: exportSymbol.name, astSymbol: astSymbol });
      }

      astEntryPoint = new AstEntryPoint({ exportedMembers });
      this._astEntryPointsBySourceFile.set(sourceFile, astEntryPoint);
    }
    return astEntryPoint;
  }

  /**
   * Ensures that AstSymbol.analyzed is true for the provided symbol.  The operation
   * locates the root symbol and then fetches all children of all declarations, and
   * also calculates AstDeclaration.referencedAstSymbols for all declarations.
   * @remarks
   * This is an expensive operation, so we only perform it for top-level exports of an
   * the AstEntryPoint.  For example, if some code references a nested class inside
   * a namespace from another library, we do not analyze any of that class's siblings
   * or members.  (We do always construct its parents however, since AstDefinition.parent
   * is immutable, and needed e.g. to calculate release tag inheritance.)
   */
  public analyze(astSymbol: AstSymbol): void {
    if (astSymbol.analyzed) {
      return;
    }

    // Walk up to the root of the tree
    let rootAstSymbol: AstSymbol = astSymbol;
    while (rootAstSymbol.mainDeclaration.parent) {
      rootAstSymbol = rootAstSymbol.mainDeclaration.parent.astSymbol;
    }

    // Calculate the full child tree for each definition
    for (const astDeclaration of rootAstSymbol.astDeclarations) {
      this._analyzeChildTree(astDeclaration.declaration, astDeclaration);
    }

    astSymbol._notifyAnalyzed();
  }

  /**
   * Looks up the AstSymbol corresponding to the given ts.Symbol.
   * This will not analyze or construct any new AstSymbol objects.
   */
  public tryGetAstSymbol(symbol: ts.Symbol): AstSymbol | undefined {
    return this._fetchAstSymbol(symbol, false);
  }

  /**
   * For a given astDeclaration, this efficiently finds the child corresponding to the
   * specified ts.Node.  It is assumed that isAstDeclaration() would return true for
   * that node type, and that the node is an immediate child of the provided AstDeclaration.
   */
  // NOTE: This could be a method of AstSymbol if it had a backpointer to its AstSymbolTable.
  public getChildAstDeclarationByNode(node: ts.Node, parentAstDeclaration: AstDeclaration): AstDeclaration {
    if (!parentAstDeclaration.astSymbol.analyzed) {
      throw new Error('getChildDeclarationByNode() cannot be used for an AstSymbol that was not analyzed');
    }

    const childAstDeclaration: AstDeclaration | undefined = this._astDeclarationsByDeclaration.get(node);
    if (!childAstDeclaration) {
      throw new Error('Child declaration not found for the specified node');
    }
    if (childAstDeclaration.parent !== parentAstDeclaration) {
      throw new Error('Program Bug: The found child is not attached to the parent AstDeclaration');
    }

    return childAstDeclaration;
  }

  /**
   * Used by analyze to recursively analyze the entire child tree.
   */
  private _analyzeChildTree(node: ts.Node, governingAstDeclaration: AstDeclaration): void {
    // is this a reference to another AstSymbol?
    switch (node.kind) {
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

          const referencedAstSymbol: AstSymbol | undefined = this._fetchAstSymbol(symbol, true);
          if (referencedAstSymbol) {
            governingAstDeclaration._notifyReferencedAstSymbol(referencedAstSymbol);
          }
        }
        break;
    }

    // Is this node declaring a new AstSymbol?
    const newGoverningAstDeclaration: AstDeclaration | undefined = this._fetchAstDeclaration(node);

    for (const childNode of node.getChildren()) {
      this._analyzeChildTree(childNode, newGoverningAstDeclaration || governingAstDeclaration);
    }

    if (newGoverningAstDeclaration) {
      newGoverningAstDeclaration.astSymbol._notifyAnalyzed();
    }
  }

  // tslint:disable-next-line:no-unused-variable
  private _fetchAstDeclaration(node: ts.Node): AstDeclaration | undefined {
    const astSymbol: AstSymbol | undefined = this._fetchAstSymbolForNode(node);
    if (!astSymbol) {
      return undefined;
    }

    const astDeclaration: AstDeclaration | undefined
      = this._astDeclarationsByDeclaration.get(node);
    if (!astDeclaration) {
      throw new Error('Program Bug: Unable to find constructed AstDeclaration');
    }

    return astDeclaration;
  }

  private _fetchAstSymbolForNode(node: ts.Node): AstSymbol | undefined {
    if (!SymbolAnalyzer.isAstDeclaration(node.kind)) {
      return undefined;
    }

    const symbol: ts.Symbol | undefined = TypeScriptHelpers.getSymbolForDeclaration(node as ts.Declaration);
    if (!symbol) {
      throw new Error('Program Bug: Unable to find symbol for node');
    }

    return this._fetchAstSymbol(symbol, true);
  }

  private _fetchAstSymbol(symbol: ts.Symbol, addIfMissing: boolean): AstSymbol | undefined {
    const followAliasesResult: IFollowAliasesResult = SymbolAnalyzer.followAliases(symbol, this._typeChecker);

    const followedSymbol: ts.Symbol = followAliasesResult.followedSymbol;
    if (followedSymbol.flags & (ts.SymbolFlags.TypeParameter | ts.SymbolFlags.TypeLiteral | ts.SymbolFlags.Transient)) {
      return undefined;
    }

    if (followAliasesResult.isAmbient) {
      return undefined;
    }

    let astSymbol: AstSymbol | undefined = this._astSymbolsBySymbol.get(followedSymbol);

    if (!astSymbol) {
      if (!followedSymbol.declarations || followedSymbol.declarations.length < 1) {
        throw new Error('Program Bug: Followed a symbol with no declarations');
      }

      for (const declaration of followedSymbol.declarations || []) {
        if (!SymbolAnalyzer.isAstDeclaration(declaration.kind)) {
          throw new Error(`Program Bug: The "${followedSymbol.name}" symbol uses the construct`
            + ` "${ts.SyntaxKind[declaration.kind]}" which may be an unimplemented language feature`);
        }
      }

      const astImport: AstImport | undefined = followAliasesResult.astImport;

      if (astImport) {
        astSymbol = this._astSymbolsByImportKey.get(astImport.key);

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
          this._astSymbolsByImportKey.set(astImport.key, astSymbol);
        }

        // We always fetch the entire chain of parents for each declaration.
        // (Children/siblings are only analyzed on demand.)

        // Is there a parent AstSymbol?
        const arbitaryParent: ts.Node | undefined
          = this._tryFindFirstAstDeclarationParent(followedSymbol.declarations[0]);

        let parentAstSymbol: AstSymbol | undefined = undefined;

        if (arbitaryParent) {
          const parentSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(arbitaryParent as ts.Declaration);

          parentAstSymbol = this._fetchAstSymbol(parentSymbol, addIfMissing);
        }

        // Okay, now while creating the declarations we will wire them up to the
        // their corresponding parent declarations
        for (const declaration of followedSymbol.declarations || []) {

          let parentAstDeclaration: AstDeclaration | undefined = undefined;
          if (parentAstSymbol) {
            const parentDeclaration: ts.Node | undefined = this._tryFindFirstAstDeclarationParent(declaration);

            if (!parentDeclaration) {
              throw new Error('Program bug: Missing parent declaration');
            }

            parentAstDeclaration = this._astDeclarationsByDeclaration.get(parentDeclaration);
            if (!parentAstDeclaration) {
              throw new Error('Program bug: Missing parent AstDeclaration');
            }
          }

          const astDeclaration: AstDeclaration = new AstDeclaration({
            declaration, astSymbol, parent: parentAstDeclaration});

          this._astDeclarationsByDeclaration.set(declaration, astDeclaration);
        }
      }
    }

    return astSymbol;
  }

  /**
   * Returns the first parent satisfying isAstDeclaration(), or undefined if none is found.
   */
  private _tryFindFirstAstDeclarationParent(node: ts.Node): ts.Node | undefined {
    let currentNode: ts.Node | undefined = node.parent;
    while (currentNode) {
      if (SymbolAnalyzer.isAstDeclaration(currentNode.kind)) {
        return currentNode;
      }
      currentNode = currentNode.parent;
    }
    return undefined;
  }
}
