// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';
import { PackageJsonLookup, InternalError } from '@microsoft/node-core-library';

import { AstDeclaration } from './AstDeclaration';
import { TypeScriptHelpers } from './TypeScriptHelpers';
import { AstSymbol } from './AstSymbol';
import { AstModule, AstModuleExportInfo } from './AstModule';
import { PackageMetadataManager } from './PackageMetadataManager';
import { ExportAnalyzer } from './ExportAnalyzer';
import { AstImport } from './AstImport';
import { MessageRouter } from '../collector/MessageRouter';
import { TypeScriptInternals } from './TypeScriptInternals';

export type AstEntity = AstSymbol | AstImport;

/**
 * Options for `AstSymbolTable._fetchAstSymbol()`
 */
export interface IFetchAstSymbolOptions {
  /**
   * The symbol after any symbol aliases have been followed using TypeScriptHelpers.followAliases()
   */
  followedSymbol: ts.Symbol;
  /**
   * True if followedSymbol is not part of the working package
   */
  isExternal: boolean;

  /**
   * If true, symbols with AstSymbol.nominalAnalysis=true will be returned.
   * Otherwise `undefined` will be returned for such symbols.
   */
  includeNominalAnalysis: boolean;

  /**
   * True while populating the `AstSymbolTable`; false if we're doing a passive lookup
   * without adding anything new to the table
   */
  addIfMissing: boolean;

  /**
   * A hint to help `_fetchAstSymbol()` determine the `AstSymbol.localName`.
   */
  localName?: string;
}

/**
 * AstSymbolTable is the workhorse that builds AstSymbol and AstDeclaration objects.
 * It maintains a cache of already constructed objects.  AstSymbolTable constructs
 * AstModule objects, but otherwise the state that it maintains is agnostic of
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

  // Note that this is a mapping from specific AST nodes that we analyzed, based on the underlying symbol
  // for that node.
  private readonly _entitiesByIdentifierNode: Map<ts.Identifier, AstEntity | undefined>
    = new Map<ts.Identifier, AstEntity | undefined>();

  public constructor(program: ts.Program, typeChecker: ts.TypeChecker, packageJsonLookup: PackageJsonLookup,
    messageRouter: MessageRouter) {

    this._program = program;
    this._typeChecker = typeChecker;
    this._packageMetadataManager = new PackageMetadataManager(packageJsonLookup, messageRouter);

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
   * Used to analyze an entry point that belongs to the working package.
   */
  public fetchAstModuleFromWorkingPackage(sourceFile: ts.SourceFile): AstModule {
    return this._exportAnalyzer.fetchAstModuleFromSourceFile(sourceFile, undefined);
  }

  /**
   * This crawls the specified entry point and collects the full set of exported AstSymbols.
   */
  public fetchAstModuleExportInfo(astModule: AstModule): AstModuleExportInfo {
    return this._exportAnalyzer.fetchAstModuleExportInfo(astModule);
  }

  /**
   * Attempts to retrieve an export by name from the specified `AstModule`.
   * Returns undefined if no match was found.
   */
  public tryGetExportOfAstModule(exportName: string, astModule: AstModule): AstEntity | undefined {
    return this._exportAnalyzer.tryGetExportOfAstModule(exportName, astModule);
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

    if (!astSymbol.isExternal) {
      // If this symbol is non-external (i.e. it belongs to the working package), then we also analyze any
      // referencedAstSymbols that are non-external.  For example, this ensures that forgotten exports
      // get analyzed.
      rootAstSymbol.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
        for (const referencedAstEntity of astDeclaration.referencedAstEntities) {

          // Walk up to the root of the tree, looking for any imports along the way
          if (referencedAstEntity instanceof AstSymbol) {
            if (!referencedAstEntity.isExternal) {
              this.analyze(referencedAstEntity);
            }
          }

        }
      });
    }
  }

  /**
   * For a given astDeclaration, this efficiently finds the child corresponding to the
   * specified ts.Node.  It is assumed that AstDeclaration.isSupportedSyntaxKind() would return true for
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
   * For a given ts.Identifier that is part of an AstSymbol that we analyzed, return the AstEntity that
   * it refers to.  Returns undefined if it doesn't refer to anything interesting.
   * @remarks
   * Throws an Error if the ts.Identifier is not part of node tree that was analyzed.
   */
  public tryGetEntityForIdentifierNode(identifier: ts.Identifier): AstEntity | undefined {
    if (!this._entitiesByIdentifierNode.has(identifier)) {
      throw new InternalError('tryGetEntityForIdentifier() called for an identifier that was not analyzed');
    }
    return this._entitiesByIdentifierNode.get(identifier);
  }

  /**
   * Used by analyze to recursively analyze the entire child tree.
   */
  private _analyzeChildTree(node: ts.Node, governingAstDeclaration: AstDeclaration): void {
    switch (node.kind) {
      case ts.SyntaxKind.JSDocComment: // Skip JSDoc comments - TS considers @param tags TypeReference nodes
        return;

      // Is this a reference to another AstSymbol?
      case ts.SyntaxKind.TypeReference: // general type references
      case ts.SyntaxKind.ExpressionWithTypeArguments: // special case for e.g. the "extends" keyword
      case ts.SyntaxKind.ComputedPropertyName:  // used for EcmaScript "symbols", e.g. "[toPrimitive]".
      case ts.SyntaxKind.TypeQuery: // represents for "typeof X" as a type
        {
          // Sometimes the type reference will involve multiple identifiers, e.g. "a.b.C".
          // In this case, we only need to worry about importing the first identifier,
          // so do a depth-first search for it:
          const identifierNode: ts.Identifier | undefined = TypeScriptHelpers.findFirstChildNode(
            node, ts.SyntaxKind.Identifier);

          if (identifierNode) {
            let referencedAstEntity: AstEntity | undefined = this._entitiesByIdentifierNode.get(identifierNode);
            if (!referencedAstEntity) {
              const symbol: ts.Symbol | undefined = this._typeChecker.getSymbolAtLocation(identifierNode);
              if (!symbol) {
                throw new Error('Symbol not found for identifier: ' + identifierNode.getText());
              }

              referencedAstEntity = this._exportAnalyzer.fetchReferencedAstEntity(symbol,
                governingAstDeclaration.astSymbol.isExternal);

              this._entitiesByIdentifierNode.set(identifierNode, referencedAstEntity);
            }

            if (referencedAstEntity) {
              governingAstDeclaration._notifyReferencedAstEntity(referencedAstEntity);
            }
          }
        }
        break;

      // Is this the identifier for the governingAstDeclaration?
      case ts.SyntaxKind.Identifier:
        {
          const identifierNode: ts.Identifier = node as ts.Identifier;
          if (!this._entitiesByIdentifierNode.has(identifierNode)) {
            const symbol: ts.Symbol | undefined = this._typeChecker.getSymbolAtLocation(identifierNode);

            let referencedAstEntity: AstEntity | undefined = undefined;

            if (symbol === governingAstDeclaration.astSymbol.followedSymbol) {
              referencedAstEntity = this._fetchEntityForIdentifierNode(identifierNode, governingAstDeclaration);
            }

            this._entitiesByIdentifierNode.set(identifierNode, referencedAstEntity);
          }
        }
        break;
    }

    // Is this node declaring a new AstSymbol?
    const newGoverningAstDeclaration: AstDeclaration | undefined = this._fetchAstDeclaration(node,
      governingAstDeclaration.astSymbol.isExternal);

    for (const childNode of node.getChildren()) {
      this._analyzeChildTree(childNode, newGoverningAstDeclaration || governingAstDeclaration);
    }
  }

  private _fetchEntityForIdentifierNode(identifierNode: ts.Identifier,
    governingAstDeclaration: AstDeclaration): AstEntity | undefined {

    let referencedAstEntity: AstEntity | undefined = this._entitiesByIdentifierNode.get(identifierNode);
    if (!referencedAstEntity) {
      const symbol: ts.Symbol | undefined = this._typeChecker.getSymbolAtLocation(identifierNode);
      if (!symbol) {
        throw new Error('Symbol not found for identifier: ' + identifierNode.getText());
      }

      referencedAstEntity = this._exportAnalyzer.fetchReferencedAstEntity(symbol,
        governingAstDeclaration.astSymbol.isExternal);

      this._entitiesByIdentifierNode.set(identifierNode, referencedAstEntity);
    }
    return referencedAstEntity;
  }

  // tslint:disable-next-line:no-unused-variable
  private _fetchAstDeclaration(node: ts.Node, isExternal: boolean): AstDeclaration | undefined {
    if (!AstDeclaration.isSupportedSyntaxKind(node.kind)) {
      return undefined;
    }

    const symbol: ts.Symbol | undefined = TypeScriptHelpers.getSymbolForDeclaration(node as ts.Declaration,
      this._typeChecker);
    if (!symbol) {
      throw new InternalError('Unable to find symbol for node');
    }

    const astSymbol: AstSymbol | undefined = this._fetchAstSymbol({
      followedSymbol: symbol,
      isExternal: isExternal,
      includeNominalAnalysis: true,
      addIfMissing: true
    });

    if (!astSymbol) {
      return undefined;
    }

    const astDeclaration: AstDeclaration | undefined = this._astDeclarationsByDeclaration.get(node);

    if (!astDeclaration) {
      throw new InternalError('Unable to find constructed AstDeclaration');
    }

    return astDeclaration;
  }

  private _fetchAstSymbol(options: IFetchAstSymbolOptions): AstSymbol | undefined {
    const followedSymbol: ts.Symbol = options.followedSymbol;

    // Filter out symbols representing constructs that we don't care about
    if (!TypeScriptHelpers.hasAnyDeclarations(followedSymbol)) {
      return undefined;
    }

    const arbitraryDeclaration: ts.Declaration = followedSymbol.declarations[0];

    // tslint:disable-next-line:no-bitwise
    if (followedSymbol.flags & (ts.SymbolFlags.TypeParameter | ts.SymbolFlags.TypeLiteral | ts.SymbolFlags.Transient)
      && !TypeScriptInternals.isLateBoundSymbol(followedSymbol)) {
      return undefined;
    }

    // API Extractor doesn't analyze ambient declarations at all
    if (TypeScriptHelpers.isAmbient(followedSymbol, this._typeChecker)) {
      // We make a special exemption for ambient declarations that appear in a source file containing
      // an "export=" declaration that allows them to be imported as non-ambient.
      if (!this._exportAnalyzer.isImportableAmbientSourceFile(arbitraryDeclaration.getSourceFile())) {
        return undefined;
      }
    }

    // Make sure followedSymbol isn't an alias for something else
    if (TypeScriptHelpers.isFollowableAlias(followedSymbol, this._typeChecker)) {
      // We expect the caller to have already followed any aliases
      throw new InternalError('AstSymbolTable._fetchAstSymbol() cannot be called with a symbol alias');
    }

    let astSymbol: AstSymbol | undefined = this._astSymbolsBySymbol.get(followedSymbol);

    if (!astSymbol) {
      // None of the above lookups worked, so create a new entry...
      let nominalAnalysis: boolean = false;

      if (options.isExternal) {
        // If the file is from an external package that does not support AEDoc, normally we ignore it completely.
        // But in some cases (e.g. checking star exports of an external package) we need an AstSymbol to
        // represent it, but we don't need to analyze its sibling/children.
        const followedSymbolSourceFileName: string = arbitraryDeclaration.getSourceFile().fileName;

        if (!this._packageMetadataManager.isAedocSupportedFor(followedSymbolSourceFileName)) {
          nominalAnalysis = true;

          if (!options.includeNominalAnalysis) {
            return undefined;
          }
        }
      }

      let parentAstSymbol: AstSymbol | undefined = undefined;

      if (!nominalAnalysis) {
        for (const declaration of followedSymbol.declarations || []) {
          if (!AstDeclaration.isSupportedSyntaxKind(declaration.kind)) {
            throw new InternalError(`The "${followedSymbol.name}" symbol has a`
              + ` ts.SyntaxKind.${ts.SyntaxKind[declaration.kind]} declaration which is not (yet?)`
              + ` supported by API Extractor`);
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
        const arbitraryParentDeclaration: ts.Node | undefined
          = this._tryFindFirstAstDeclarationParent(followedSymbol.declarations[0]);

        if (arbitraryParentDeclaration) {
          const parentSymbol: ts.Symbol = TypeScriptHelpers.getSymbolForDeclaration(
            arbitraryParentDeclaration as ts.Declaration,
            this._typeChecker);

          parentAstSymbol = this._fetchAstSymbol({
            followedSymbol: parentSymbol,
            isExternal: options.isExternal,
            includeNominalAnalysis: false,
            addIfMissing: true
          });
          if (!parentAstSymbol) {
            throw new InternalError('Unable to construct a parent AstSymbol for '
              + followedSymbol.name);
          }
        }
      }

      let localName: string | undefined = options.localName;

      if (localName === undefined) {
        // We will try to obtain the name from a declaration; otherwise we'll fall back to the symbol name
        // This handles cases such as "export default class X { }" where the symbol name is "default"
        // but the declaration name is "X".
        localName = followedSymbol.name;
        if (TypeScriptHelpers.isWellKnownSymbolName(localName)) {
          // TypeScript binds well-known ECMAScript symbols like "Symbol.iterator" as "__@iterator".
          // This converts a string like "__@iterator" into the property name "[Symbol.iterator]".
          localName = `[Symbol.${localName.slice(3)}]`;
        } else {
          const isUniqueSymbol: boolean = TypeScriptHelpers.isUniqueSymbolName(localName);
          for (const declaration of followedSymbol.declarations || []) {
            const declarationName: ts.DeclarationName | undefined = ts.getNameOfDeclaration(declaration);
            if (declarationName && ts.isIdentifier(declarationName)) {
              localName = declarationName.getText().trim();
              break;
            }
            if (isUniqueSymbol && declarationName && ts.isComputedPropertyName(declarationName)) {
              const lateBoundName: string | undefined = TypeScriptHelpers.tryGetLateBoundName(declarationName);
              if (lateBoundName) {
                localName = lateBoundName;
                break;
              }
            }
          }
        }
      }

      astSymbol = new AstSymbol({
        followedSymbol: followedSymbol,
        localName: localName,
        isExternal: options.isExternal,
        nominalAnalysis: nominalAnalysis,
        parentAstSymbol: parentAstSymbol,
        rootAstSymbol: parentAstSymbol ? parentAstSymbol.rootAstSymbol : undefined
      });

      this._astSymbolsBySymbol.set(followedSymbol, astSymbol);

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

    if (options.isExternal !== astSymbol.isExternal) {
      throw new InternalError(`Cannot assign isExternal=${options.isExternal} for`
        + ` the symbol ${astSymbol.localName} because it was previously registered`
        + ` with isExternal=${astSymbol.isExternal}`);
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
