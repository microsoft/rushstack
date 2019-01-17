// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { PackageJsonLookup, InternalError } from '@microsoft/node-core-library';

import { AstDeclaration } from './AstDeclaration';
import { TypeScriptHelpers } from './TypeScriptHelpers';
import { AstSymbol } from './AstSymbol';
import { AstImport, IAstImportOptions } from './AstImport';
import { AstModule } from './AstModule';
import { PackageMetadataManager } from './PackageMetadataManager';
import { ILogger } from '../api/ILogger';
import { ExportAnalyzer } from './ExportAnalyzer';

/**
 * AstSymbolTable is the workhorse that builds AstSymbol and AstDeclaration objects.
 * It maintains a cache of already constructed objects.  AstSymbolTable constructs
 * AstModule objects, but otherwise the state that it maintains  is agnostic of
 * any particular entry point.  (For example, it does not track whether a given AstSymbol
 * is "exported" or not.)
 *
 * Internally, AstSymbolTable relies on ExportAnalyzer to crawl import statements and determine where symbols
 * are declared (i.e. the AstImport information needed to import them).
 */
export class AstSymbolTable {
  private readonly _program: ts.Program;
  private readonly _typeChecker: ts.TypeChecker;
  private readonly _packageMetadataManager: PackageMetadataManager;
  private readonly _exportAnalyzer: ExportAnalyzer;

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
   * A mapping from AstImport.key --> AstSymbol.
   *
   * If AstSymbol.astImport is undefined, then it is not included in the map.
   */
  private readonly _astSymbolsByImportKey: Map<string, AstSymbol> = new Map<string, AstSymbol>();

  public constructor(program: ts.Program, typeChecker: ts.TypeChecker, packageJsonLookup: PackageJsonLookup,
    logger: ILogger) {

    this._program = program;
    this._typeChecker = typeChecker;
    this._packageMetadataManager = new PackageMetadataManager(packageJsonLookup, logger);

    this._exportAnalyzer = new ExportAnalyzer(
      this._program,
      this._typeChecker,
      {
        analyze: this.analyze.bind(this),
        fetchAstSymbol: this._fetchAstSymbol.bind(this)
      }
    );
  }

  /**
   * For a given source file, this analyzes all of its exports and produces an AstModule
   * object.
   */
  public fetchEntryPointModule(sourceFile: ts.SourceFile): AstModule {
    return this._exportAnalyzer.fetchAstModuleBySourceFile(sourceFile, undefined);
  }

  public fetchReferencedAstSymbol(symbol: ts.Symbol, sourceFile: ts.SourceFile): AstSymbol | undefined {
    return this._exportAnalyzer.fetchReferencedAstSymbol(symbol, sourceFile);
  }

  /**
   * Ensures that AstSymbol.analyzed is true for the provided symbol.  The operation
   * starts from the root symbol and then fills out all children of all declarations, and
   * also calculates AstDeclaration.referencedAstSymbols for all declarations.
   * If the symbol is not imported, any non-imported references are also analyzed.
   *
   * @remarks
   * This is an expensive operation, so we only perform it for top-level exports of an
   * the AstModule.  For example, if some code references a nested class inside
   * a namespace from another library, we do not analyze any of that class's siblings
   * or members.  (We do always construct its parents however, since AstDefinition.parent
   * is immutable, and needed e.g. to calculate release tag inheritance.)
   */
  public analyze(astSymbol: AstSymbol): void {
    if (astSymbol.analyzed) {
      return;
    }

    if (astSymbol.nominalAnalysis) {
      // We don't analyze nominal symbols
      astSymbol._notifyAnalyzed();
      return;
    }

    // Start at the root of the tree
    const rootAstSymbol: AstSymbol = astSymbol.rootAstSymbol;

    // Calculate the full child tree for each definition
    for (const astDeclaration of rootAstSymbol.astDeclarations) {
      this._analyzeChildTree(astDeclaration.declaration, astDeclaration);
    }

    rootAstSymbol._notifyAnalyzed();

    if (!astSymbol.astImport) {
      // If this symbol is not imported, then we also analyze any referencedAstSymbols
      // that are not imported.  For example, this ensures that forgotten exports get
      // analyzed.
      rootAstSymbol.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
        for (const referencedAstSymbol of astDeclaration.referencedAstSymbols) {
          // Walk up to the root of the tree, looking for any imports along the way
          if (!referencedAstSymbol.imported) {
            this.analyze(referencedAstSymbol);
          }
        }
      });
    }
  }

  /**
   * Looks up the AstSymbol corresponding to the given ts.Symbol.
   * This will not analyze or construct any new AstSymbol objects.
   */
  public tryGetAstSymbol(symbol: ts.Symbol): AstSymbol | undefined {
    return this._fetchAstSymbol(symbol, false, undefined);
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
      throw new InternalError('The found child is not attached to the parent AstDeclaration');
    }

    return childAstDeclaration;
  }

  /**
   * Used by analyze to recursively analyze the entire child tree.
   */
  private _analyzeChildTree(node: ts.Node, governingAstDeclaration: AstDeclaration): void {
    switch (node.kind) {
      case ts.SyntaxKind.JSDocComment: // Skip JSDoc comments - TS considers @param tags TypeReference nodes
        return;

      // is this a reference to another AstSymbol?
      case ts.SyntaxKind.TypeReference: // general type references
      case ts.SyntaxKind.ExpressionWithTypeArguments: // special case for e.g. the "extends" keyword
      case ts.SyntaxKind.ComputedPropertyName:  // used for EcmaScript "symbols", e.g. "[toPrimitive]".
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

          const referencedAstSymbol: AstSymbol | undefined
            = this.fetchReferencedAstSymbol(symbol, symbolNode.getSourceFile());
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
      throw new InternalError('Unable to find constructed AstDeclaration');
    }

    return astDeclaration;
  }

  private _fetchAstSymbolForNode(node: ts.Node): AstSymbol | undefined {
    if (!AstDeclaration.isSupportedSyntaxKind(node.kind)) {
      return undefined;
    }

    const symbol: ts.Symbol | undefined = TypeScriptHelpers.getSymbolForDeclaration(node as ts.Declaration);
    if (!symbol) {
      throw new InternalError('Unable to find symbol for node');
    }

    return this._fetchAstSymbol(symbol, true, undefined);
  }

  private _fetchAstSymbol(followedSymbol: ts.Symbol, addIfMissing: boolean,
    astImportOptions: IAstImportOptions | undefined, localName?: string): AstSymbol | undefined {

    // Filter out symbols representing constructs that we don't care about
    // tslint:disable-next-line:no-bitwise
    if (followedSymbol.flags & (ts.SymbolFlags.TypeParameter | ts.SymbolFlags.TypeLiteral | ts.SymbolFlags.Transient)) {
      return undefined;
    }

    if (TypeScriptHelpers.isAmbient(followedSymbol, this._typeChecker)) {
      // API Extractor doesn't analyze ambient declarations at all
      return undefined;
    }

    let astSymbol: AstSymbol | undefined = this._astSymbolsBySymbol.get(followedSymbol);

    if (!astSymbol) {
      if (!followedSymbol.declarations || followedSymbol.declarations.length < 1) {
        throw new InternalError('Followed a symbol with no declarations');
      }

      const astImport: AstImport | undefined = astImportOptions ? new AstImport(astImportOptions) : undefined;

      if (astImport) {
        if (!astSymbol) {
          astSymbol = this._astSymbolsByImportKey.get(astImport.key);
          if (astSymbol) {
            // We didn't find the entry using followedSymbol, but we did using importPackageKey,
            // so add a mapping for followedSymbol; we'll need it later when renaming identifiers
            this._astSymbolsBySymbol.set(followedSymbol, astSymbol);
          }
        }
      }

      if (!astSymbol) {
        // None of the above lookups worked, so create a new entry...
        let nominalAnalysis: boolean = false;

        // NOTE: In certain circumstances we need an AstSymbol for a source file that is acting
        // as a TypeScript module.  For example, one of the unit tests has this line:
        //
        //   import * as semver1 from 'semver';
        //
        // To handle the expression "semver1.SemVer", we need "semver1" to map to an AstSymbol
        // that causes us to emit the above import.  However we do NOT want it to act as the root
        // of a declaration tree, because in general the *.d.ts generator is trying to roll up
        // definitions and eliminate source files.  So, even though isAstDeclaration() would return
        // false, we do create an AstDeclaration for a ts.SyntaxKind.SourceFile in this special edge case.
        if (followedSymbol.declarations.length === 1
          && followedSymbol.declarations[0].kind === ts.SyntaxKind.SourceFile) {
          nominalAnalysis = true;
        }

        // If the file is from a package that does not support AEDoc, then we process the
        // symbol itself, but we don't attempt to process any parent/children of it.
        const followedSymbolSourceFile: ts.SourceFile = followedSymbol.declarations[0].getSourceFile();
        if (astImport !== undefined) {
          if (!this._packageMetadataManager.isAedocSupportedFor(followedSymbolSourceFile.fileName)) {
            nominalAnalysis = true;
          }
        }

        let parentAstSymbol: AstSymbol | undefined = undefined;

        if (!nominalAnalysis) {
          for (const declaration of followedSymbol.declarations || []) {
            if (!AstDeclaration.isSupportedSyntaxKind(declaration.kind)) {
              throw new InternalError(`The "${followedSymbol.name}" symbol uses the construct`
                + ` "${ts.SyntaxKind[declaration.kind]}" which may be an unimplemented language feature`);
            }
          }

          // We always fetch the entire chain of parents for each declaration.
          // (Children/siblings are only analyzed on demand.)

          // Key assumptions behind this squirrely logic:
          //
          // IF a given symbol has two declarations D1 and D2; AND
          // If D1 has a parent P1, then
          // - D2 will also have a parent P2; AND
          // - P1 and P2's symbol will be the same
          // - but P1 and P2 may be different (e.g. merged namespaces containing merged interfaces)

          // Is there a parent AstSymbol?  First we check to see if there is a parent declaration:
          const arbitaryParentDeclaration: ts.Node | undefined
            = this._tryFindFirstAstDeclarationParent(followedSymbol.declarations[0]);

          if (arbitaryParentDeclaration) {
            const parentSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(
              arbitaryParentDeclaration as ts.Declaration);

            parentAstSymbol = this._fetchAstSymbol(parentSymbol, addIfMissing, undefined);
            if (!parentAstSymbol) {
              throw new InternalError('Unable to construct a parent AstSymbol for '
                + followedSymbol.name);
            }
          }
        }

        if (localName === undefined) {
          // We will try to obtain the name from a declaration; otherwise we'll fall back to the symbol name
          // This handles cases such as "export default class X { }" where the symbol name is "default"
          // but the declaration name is "X".
          localName = followedSymbol.name;
          for (const declaration of followedSymbol.declarations || []) {
            const declarationNameIdentifier: ts.DeclarationName | undefined = ts.getNameOfDeclaration(declaration);
            if (declarationNameIdentifier && ts.isIdentifier(declarationNameIdentifier)) {
              localName = declarationNameIdentifier.getText().trim();
              break;
            }
          }
        }

        astSymbol = new AstSymbol({
          localName: localName,
          followedSymbol: followedSymbol,
          astImport: astImport,
          parentAstSymbol: parentAstSymbol,
          rootAstSymbol: parentAstSymbol ? parentAstSymbol.rootAstSymbol : undefined,
          nominalAnalysis: nominalAnalysis
        });

        this._astSymbolsBySymbol.set(followedSymbol, astSymbol);

        if (astImport) {
          // If it's an import, add it to the lookup
          this._astSymbolsByImportKey.set(astImport.key, astSymbol);
        }

        // Okay, now while creating the declarations we will wire them up to the
        // their corresponding parent declarations
        for (const declaration of followedSymbol.declarations || []) {

          let parentAstDeclaration: AstDeclaration | undefined = undefined;
          if (parentAstSymbol) {
            const parentDeclaration: ts.Node | undefined = this._tryFindFirstAstDeclarationParent(declaration);

            if (!parentDeclaration) {
              throw new InternalError('Missing parent declaration');
            }

            parentAstDeclaration = this._astDeclarationsByDeclaration.get(parentDeclaration);
            if (!parentAstDeclaration) {
              throw new InternalError('Missing parent AstDeclaration');
            }
          }

          const astDeclaration: AstDeclaration = new AstDeclaration({
            declaration, astSymbol, parent: parentAstDeclaration});

          this._astDeclarationsByDeclaration.set(declaration, astDeclaration);
        }
      }
    }

    if (astImportOptions && !astSymbol.imported) {
      // Our strategy for recognizing external declarations is to look for an import statement
      // during SymbolAnalyzer.followAliases().  Although it is sometimes possible to reach a symbol
      // without traversing an import statement, we assume that that the first reference will always
      // involve an import statement.
      //
      // This assumption might be violated if the caller did something unusual like feeding random
      // symbols to AstSymbolTable.analyze() in the middle of the analysis.
      throw new InternalError('The symbol ' + astSymbol.localName + ' is being imported'
        + ' after it was already registered as non-imported');
    }

    return astSymbol;
  }

  /**
   * Returns the first parent satisfying isAstDeclaration(), or undefined if none is found.
   */
  private _tryFindFirstAstDeclarationParent(node: ts.Node): ts.Node | undefined {
    let currentNode: ts.Node | undefined = node.parent;
    while (currentNode) {
      if (AstDeclaration.isSupportedSyntaxKind(currentNode.kind)) {
        return currentNode;
      }
      currentNode = currentNode.parent;
    }
    return undefined;
  }
}
