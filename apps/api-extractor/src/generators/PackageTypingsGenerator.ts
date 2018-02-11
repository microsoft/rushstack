// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as fs from 'fs';
import * as ts from 'typescript';

import { ExtractorContext } from '../ExtractorContext';
import IndentedWriter from '../IndentedWriter';
import TypeScriptHelpers from '../TypeScriptHelpers';
import { Span } from './Span';

/**
 * Constructor parameters for the Entry class
 */
interface IEntryParameters {
  // (see documentation for the corresponding properties in the Entry class)
  localName: string;
  followedSymbol: ts.Symbol;
  importPackagePath: string | undefined;
  importPackageExportName: string | undefined;
}

/**
 * An "Entry" is a type definition that we encounter while traversing the
 * references from the package entry point.  This data structure helps filter,
 * sort, and rename the entries that end up in the output package typings file.
 */
class Entry {
  /**
   * The original name of the symbol, as exported from the module (i.e. source file)
   * containing the original TypeScript definition.
   */
  public readonly localName: string;

  /**
   * The localName, possibly renamed to ensure that all the top-level exports have unique names.
   */
  public get uniqueName(): string | undefined {
    return this._uniqueName;
  }

  public set uniqueName(value: string | undefined) {
    this._uniqueName = value;
    this._sortKey = undefined; // invalidate the cached value
  }

  /**
   * The compiler symbol where this type was defined, after following any aliases.
   */
  public readonly followedSymbol: ts.Symbol;

  /** {@inheritdoc IFollowAliasesResult.importPackagePath} */
  public readonly importPackagePath: string | undefined;

  /** {@inheritdoc IFollowAliasesResult.importPackageExportName} */
  public readonly importPackageExportName: string | undefined;

  /**
   * If true, this entry should be emitted using the "export" keyword instead of the "declare" keyword.
   */
  public exported: boolean = false;

  private _uniqueName: string | undefined = undefined;
  private _sortKey: string|undefined = undefined;

  public constructor(parameters: IEntryParameters) {
    this.localName = parameters.localName;
    this.followedSymbol = parameters.followedSymbol;
    this.importPackagePath = parameters.importPackagePath;
    this.importPackageExportName = parameters.importPackageExportName;
  }

  public getSortKey(): string {
    if (!this._sortKey) {
      const name: string = this.uniqueName || this.localName;
      if (name.substr(0, 1) === '_') {
        // Removes the leading underscore, for example: "_example" --> "example*"
        // This causes internal definitions to sort alphabetically with regular definitions.
        // The star is appended to preserve uniqueness, since "*" is not a legal  identifier character.
        this._sortKey = name.substr(1) + '*';
      } else {
        this._sortKey = name;
      }
    }
    return this._sortKey;
  }
}

/**
 * Return value for PackageTypingsGenerator._followAliases()
 */
interface IFollowAliasesResult {
  /**
   * The original symbol that defined this entry, after following any aliases.
   */
  symbol: ts.Symbol;

  /**
   * The original name used where it was defined.
   */
  localName: string;

  /**
   * True if this is an ambient definition, e.g. from a "typings" folder.
   */
  isAmbient: boolean;

  /**
   * The name of the external package (and possibly module path) that this definition
   * was imported from.  If it was defined in the referencing source file, or if it was
   * imported from a local file, or if it is an ambient definition, then externalPackageName
   * will be undefined.
   */
  importPackagePath: string | undefined;

  /**
   * If importPackagePath is defined, then this specifies the export name for the definition.
   */
  importPackageExportName: string | undefined;
}

export default class PackageTypingsGenerator {
  private _context: ExtractorContext;
  private _typeChecker: ts.TypeChecker;
  private _indentedWriter: IndentedWriter = new IndentedWriter();

  /**
   * A cache that tells us the Entry that is tracking a given symbol.  Because of aliases,
   * two different symbols can map to the same Entry object.
   */
  private readonly _entriesBySymbol: Map<ts.Symbol, Entry> = new Map<ts.Symbol, Entry>();

  /**
   * This data structure stores the same entries as _entriesBySymbol.values().
   * They are sorted according to Entry.getSortKey().
   */
  private readonly _entries: Entry[] = [];

  private readonly _typeDirectiveReferences: string[] = [];
  private readonly _typeDirectiveReferencesFiles: Set<string> = new Set<string>();

  /**
   * Returns an ancestor of "node", such that the ancestor, any intermediary nodes,
   * and the starting node match a list of expected kinds.  Undefined is returned
   * if there aren't enough ancestors, or if the kinds are incorrect.
   *
   * For example, suppose child "C" has parents A --> B --> C.
   *
   * Calling _matchAncestor(C, [ExportSpecifier, NamedExports, ExportDeclaration])
   * would return A only if A is of kind ExportSpecifier, B is of kind NamedExports,
   * and C is of kind ExportDeclaration.
   *
   * Calling _matchAncestor(C, [ExportDeclaration]) would return C.
   */
  private static _matchAncestor<T extends ts.Node>(node: ts.Node, kindsToMatch: ts.SyntaxKind[]): T | undefined {
    // (slice(0) clones an array)
    const reversedParentKinds: ts.SyntaxKind[] = kindsToMatch.slice(0).reverse();

    let current: ts.Node | undefined = undefined;

    for (const parentKind of reversedParentKinds) {
      if (!current) {
        // The first time through, start with node
        current = node;
      } else {
        // Then walk the parents
        current = current.parent;
      }

      // If we ran out of items, or if the kind doesn't match, then fail
      if (!current || current.kind !== parentKind) {
        return undefined;
      }
    }

    // If we matched everything, then return the node that matched the last parentKinds item
    return current as T;
  }

  /**
   * Does a depth-first search of the children of the specified node.  Returns the first child
   * with the specified kind, or undefined if there is no match.
   */
  private static _findFirstChildNode<T extends ts.Node>(node: ts.Node, kindToMatch: ts.SyntaxKind): T | undefined {
    for (const child of node.getChildren()) {
      if (child.kind === kindToMatch) {
        return child as T;
      }

      const recursiveMatch: T | undefined = this._findFirstChildNode(child, kindToMatch);
      if (recursiveMatch) {
        return recursiveMatch;
      }
    }

    return undefined;
  }

  /**
   * For the given symbol, follow imports and type alias to find the symbol that represents
   * the original definition.
   */
  private static _followAliases(symbol: ts.Symbol, typeChecker: ts.TypeChecker): IFollowAliasesResult {
    let current: ts.Symbol = symbol;

    // Is it ambient?  We will examine all of the declarations we encounter
    // to see if any of them contains the "export" keyword; if not, then it's ambient.
    let isAmbient: boolean = true;

    // We will try to obtain the name from a declaration; otherwise we'll fall back to the symbol name
    let declarationName: string | undefined = undefined;

    while (true) { // tslint:disable-line:no-constant-condition
      for (const declaration of current.declarations || []) {
        // 1. Check for any signs that this is not an ambient definition
        if (declaration.kind === ts.SyntaxKind.ExportSpecifier
          || declaration.kind === ts.SyntaxKind.ExportAssignment) {
          isAmbient = false;
        }

        const modifiers: ts.ModifierFlags = ts.getCombinedModifierFlags(declaration);
        if (modifiers & (ts.ModifierFlags.Export | ts.ModifierFlags.ExportDefault)) {
          isAmbient = false;
        }

        const declarationNameIdentifier: ts.DeclarationName | undefined = ts.getNameOfDeclaration(declaration);
        if (declarationNameIdentifier && ts.isIdentifier(declarationNameIdentifier)) {
          declarationName = declarationNameIdentifier.getText().trim();
        }

        // 2. Check for any signs that this was imported from an external package
        let result: IFollowAliasesResult | undefined;

        result = PackageTypingsGenerator._followAliasesForExportDeclaration(declaration, current);
        if (result) {
          return result;
        }

        result = PackageTypingsGenerator._followAliasesForImportDeclaration(declaration, current);
        if (result) {
          return result;
        }
      }

      if (!(current.flags & ts.SymbolFlags.Alias)) {
        break;
      }

      const currentAlias: ts.Symbol = TypeScriptHelpers.getImmediateAliasedSymbol(current, typeChecker);
      // Stop if we reach the end of the chain
      if (!currentAlias || currentAlias === current) {
        break;
      }

      current = currentAlias;
    }

    return {
      symbol: current,
      localName: declarationName || current.name,
      importPackagePath: undefined,
      importPackageExportName: undefined,
      isAmbient: isAmbient
    };
  }

  /**
   * Helper function for _followAliases(), for handling ts.ExportDeclaration patterns
   */
  private static _followAliasesForExportDeclaration(declaration: ts.Declaration,
    symbol: ts.Symbol): IFollowAliasesResult | undefined {

    // EXAMPLE:
    // "export { A } from './file-a';"
    //
    // ExportDeclaration:
    //   ExportKeyword:  pre=[export] sep=[ ]
    //   NamedExports:
    //     FirstPunctuation:  pre=[{] sep=[ ]
    //     SyntaxList:
    //       ExportSpecifier:  <------------- declaration
    //         Identifier:  pre=[A] sep=[ ]
    //     CloseBraceToken:  pre=[}] sep=[ ]
    //   FromKeyword:  pre=[from] sep=[ ]
    //   StringLiteral:  pre=['./file-a']
    //   SemicolonToken:  pre=[;]
    const exportDeclaration: ts.ExportDeclaration | undefined
      = PackageTypingsGenerator._matchAncestor<ts.ExportDeclaration>(declaration,
      [ts.SyntaxKind.ExportDeclaration, ts.SyntaxKind.NamedExports, ts.SyntaxKind.ExportSpecifier]);

    if (exportDeclaration && exportDeclaration.moduleSpecifier) {
      // Examples:
      //    " '@microsoft/sp-lodash-subset'"
      //    " "lodash/has""
      const packagePath: string | undefined = PackageTypingsGenerator._getPackagePathFromModuleSpecifier(
        exportDeclaration.moduleSpecifier);

      if (packagePath) {
        // Example: " ExportName as RenamedName"
        const exportSpecifier: ts.ExportSpecifier = declaration as ts.ExportSpecifier;

        const importPackageExportName: string =
          (exportSpecifier.propertyName || exportSpecifier.name).getText().trim();

        return {
          symbol: symbol,
          localName: importPackageExportName,
          importPackagePath: packagePath,
          importPackageExportName: importPackageExportName,
          isAmbient: false
        };
      }
    }

    return undefined;
  }

  /**
   * Helper function for _followAliases(), for handling ts.ImportDeclaration patterns
   */
  private static _followAliasesForImportDeclaration(declaration: ts.Declaration,
    symbol: ts.Symbol): IFollowAliasesResult | undefined {

    // EXAMPLE:
    // "import * as theLib from 'the-lib';"
    //
    // ImportDeclaration:
    //   ImportKeyword:  pre=[import] sep=[ ]
    //   ImportClause:
    //     NamespaceImport:  <------------- declaration
    //       AsteriskToken:  pre=[*] sep=[ ]
    //       AsKeyword:  pre=[as] sep=[ ]
    //       Identifier:  pre=[theLib] sep=[ ]
    //   FromKeyword:  pre=[from] sep=[ ]
    //   StringLiteral:  pre=['the-lib']
    //   SemicolonToken:  pre=[;]
    const importDeclaration: ts.ImportDeclaration | undefined
      = PackageTypingsGenerator._matchAncestor<ts.ImportDeclaration>(declaration,
      [ts.SyntaxKind.ImportDeclaration, ts.SyntaxKind.ImportClause, ts.SyntaxKind.NamespaceImport]);

    if (importDeclaration && importDeclaration.moduleSpecifier) {
      // Examples:
      //    " '@microsoft/sp-lodash-subset'"
      //    " "lodash/has""
      const packagePath: string | undefined = PackageTypingsGenerator._getPackagePathFromModuleSpecifier(
        importDeclaration.moduleSpecifier);

      if (packagePath) {
        return {
          symbol: symbol,
          localName: symbol.name,
          importPackagePath: packagePath,
          importPackageExportName: '*',
          isAmbient: false
        };
      }
    }
  }

  private static _getPackagePathFromModuleSpecifier(moduleSpecifier: ts.Expression): string | undefined {
    // Examples:
    //    " '@microsoft/sp-lodash-subset'"
    //    " "lodash/has""
    //    " './MyClass'"
    const moduleSpecifierText: string = moduleSpecifier.getFullText();

    // Remove quotes/whitespace
    const path: string = moduleSpecifierText
      .replace(/^\s*['"]/, '')
      .replace(/['"]\s*$/, '');

    // Does it start with something like "./"?
    // If not, then assume it's an import from an external package
    if (!/^\.\//.test(path)) {
      return path;
    }

    return undefined;
  }

  public constructor(context: ExtractorContext) {
    this._context = context;
    this._typeChecker = context.typeChecker;
  }

  /**
   * Generates the typings file and writes it to disk.
   *
   * @param dtsFilename    - The *.d.ts output filename
   */
  public writeTypingsFile(dtsFilename: string): void {
    const fileContent: string = this.generateTypingsFileContent();
    fs.writeFileSync(dtsFilename, fileContent);
  }

  public generateTypingsFileContent(): string {
    this._indentedWriter.spacing = '';
    this._indentedWriter.clear();

    const packageSymbol: ts.Symbol = this._context.package.getDeclarationSymbol();

    const exportSymbols: ts.Symbol[] = this._typeChecker.getExportsOfModule(packageSymbol) || [];

    for (const exportSymbol of exportSymbols) {
      const entry: Entry | undefined = this._fetchEntryForSymbol(exportSymbol, true);

      if (!entry) {
        // This is an export of the current package, but for some reason _fetchEntryForSymbol()
        // can't analyze it.
        this._indentedWriter.writeLine('// Unsupported re-export: ' + exportSymbol.name);
      } else {
        entry.exported = true;
      }
    }

    this._makeUniqueNames();

    this._entries.sort((a, b) => a.getSortKey().localeCompare(b.getSortKey()));

    // If there is a @packagedocumentation header, put it first:
    const packageDocumentation: string = this._context.package.documentation.originalAedoc;
    if (packageDocumentation) {
      this._indentedWriter.writeLine(TypeScriptHelpers.formatJSDocContent(packageDocumentation));
      this._indentedWriter.writeLine();
    }

    // Emit the triple slash directives
    this._typeDirectiveReferences.sort();
    for (const typeDirectiveReference of this._typeDirectiveReferences) {
      // tslint:disable-next-line:max-line-length
      // https://github.com/Microsoft/TypeScript/blob/611ebc7aadd7a44a4c0447698bfda9222a78cb66/src/compiler/declarationEmitter.ts#L162
      this._indentedWriter.writeLine(`/// <reference types="${typeDirectiveReference}" />`);
    }

    // Emit the imports
    for (const entry of this._entries) {
      if (entry.importPackagePath) {
        if (entry.importPackageExportName === '*') {
          this._indentedWriter.write(`import * as ${entry.uniqueName}`);
        } else if (entry.uniqueName !== entry.importPackageExportName) {
          this._indentedWriter.write(`import { ${entry.importPackageExportName} as ${entry.uniqueName} }`);
        } else {
          this._indentedWriter.write(`import { ${entry.importPackageExportName} }`);
        }
        this._indentedWriter.writeLine(` from '${entry.importPackagePath}';`);
      }
    }

    // Emit the regular declarations
    for (const entry of this._entries) {
      if (!entry.importPackagePath) {
        // If it's local, then emit all the declarations
        for (const declaration of entry.followedSymbol.declarations || []) {
          const span: Span = new Span(declaration);

          this._modifySpan(span, entry);

          this._indentedWriter.writeLine();
          this._indentedWriter.writeLine(span.getModifiedText());
        }
      }
    }

    // Normalize to CRLF
    const fileContent: string = this._indentedWriter.toString().replace(/\r?\n/g, '\r\n');
    return fileContent;
  }

  /**
   * Before writing out a declaration, _modifySpan() applies various fixups to make it nice.
   */
  private _modifySpan(rootSpan: Span, entry: Entry): void {
    rootSpan.modify((span: Span, previousSpan: Span | undefined, parentSpan: Span | undefined) => {
      switch (span.kind) {
        case ts.SyntaxKind.ExportKeyword:
        case ts.SyntaxKind.DefaultKeyword:
        case ts.SyntaxKind.DeclareKeyword:
          // Delete any explicit "export" or "declare" keywords -- we will re-add them below
          span.modification.skipAll();
          break;

        case ts.SyntaxKind.InterfaceKeyword:
        case ts.SyntaxKind.ClassKeyword:
        case ts.SyntaxKind.EnumKeyword:
        case ts.SyntaxKind.NamespaceKeyword:
        case ts.SyntaxKind.ModuleKeyword:
        case ts.SyntaxKind.TypeKeyword:
        case ts.SyntaxKind.FunctionKeyword:
          // Replace the stuff we possibly deleted above
          let replacedModifiers: string = 'declare ';
          if (entry.exported) {
            replacedModifiers = 'export ' + replacedModifiers;
          }

          if (previousSpan && previousSpan.kind === ts.SyntaxKind.SyntaxList) {
            // If there is a previous span of type SyntaxList, then apply it before any other modifiers
            // (e.g. "abstract") that appear there.
            previousSpan.modification.prefix = replacedModifiers + previousSpan.modification.prefix;
          } else {
            // Otherwise just stick it in front of this span
            span.modification.prefix = replacedModifiers + span.modification.prefix;
          }
          break;

        case ts.SyntaxKind.VariableDeclaration:
          if (!parentSpan) {
            // The VariableDeclaration node is part of a VariableDeclarationList, however
            // the Entry.followedSymbol points to the VariableDeclaration part because
            // multiple definitions might share the same VariableDeclarationList.
            //
            // Since we are emitting a separate declaration for each one, we need to look upwards
            // in the ts.Node tree and write a copy of the enclosing VariableDeclarationList
            // content (e.g. "var" from "var x=1, y=2").
            const list: ts.VariableDeclarationList | undefined = PackageTypingsGenerator._matchAncestor(span.node,
              [ts.SyntaxKind.VariableDeclarationList, ts.SyntaxKind.VariableDeclaration]);
            if (!list) {
              throw new Error('Unsupported variable declaration');
            }
            const listPrefix: string = list.getSourceFile().text
              .substring(list.getStart(), list.declarations[0].getStart());
            span.modification.prefix = 'declare ' + listPrefix + span.modification.prefix;
            span.modification.suffix = ';';
          }
          break;

        case ts.SyntaxKind.Identifier:
          if (parentSpan) {
            switch (parentSpan.kind) {
              case ts.SyntaxKind.ExpressionWithTypeArguments:
              case ts.SyntaxKind.TypeReference:

              case ts.SyntaxKind.ClassDeclaration:
              case ts.SyntaxKind.InterfaceDeclaration:
              case ts.SyntaxKind.EnumDeclaration:
              case ts.SyntaxKind.TypeAliasDeclaration:
              case ts.SyntaxKind.ModuleDeclaration:  // (namespaces are a type of module declaration)
                {
                  const symbol: ts.Symbol | undefined = this._typeChecker.getSymbolAtLocation(span.node);
                  if (!symbol) {
                    throw new Error('Symbol not found');
                  }

                  const referencedEntry: Entry | undefined = this._getEntryForSymbol(symbol);
                  if (referencedEntry) {
                    if (!referencedEntry.uniqueName) {
                      // This should never happen
                      throw new Error('referencedEntry.uniqueName is undefined');
                    }

                    span.modification.prefix = referencedEntry.uniqueName;
                    // span.modification.prefix += '/**/';
                  }
                }
                break;
            }
          }
          break;
        }
      }
    );
  }

  /**
   * Ensures a unique name for each item in the package typings file.
   */
  private _makeUniqueNames(): void {
    const usedNames: Set<string> = new Set<string>();
    for (const entry of this._entries) {
      let suffix: number = 1;
      entry.uniqueName = entry.localName;
      while (usedNames.has(entry.uniqueName)) {
        entry.uniqueName = entry.localName + '_' + ++suffix;
      }
      usedNames.add(entry.uniqueName);
    }
  }

  /**
   * Looks up the corresponding Entry for the requested symbol.
   */
  private _getEntryForSymbol(symbol: ts.Symbol): Entry | undefined {
    const followAliasesResult: IFollowAliasesResult
      = PackageTypingsGenerator._followAliases(symbol, this._typeChecker);
    return this._entriesBySymbol.get(followAliasesResult.symbol);
  }

  /**
   * Looks up the corresponding Entry for the requested symbol.  If it doesn't exist,
   * then it tries to create one.
   */
  private _fetchEntryForSymbol(symbol: ts.Symbol, symbolIsExported: boolean): Entry | undefined {
    const followAliasesResult: IFollowAliasesResult
      = PackageTypingsGenerator._followAliases(symbol, this._typeChecker);

    if (followAliasesResult.isAmbient) {
      return undefined; // we don't care about ambient definitions
    }

    const followedSymbol: ts.Symbol = followAliasesResult.symbol;
    if (followedSymbol.flags & (
      ts.SymbolFlags.TypeParameter | ts.SymbolFlags.TypeLiteral
      )) {
      return undefined;
    }

    let entry: Entry | undefined = this._entriesBySymbol.get(followedSymbol);
    if (entry) {
      return entry;
    }

    entry = new Entry({
      // If the symbol is exported, then we use the exported name.  Otherwise, since
      // there can be many possible names, we use the name from the original definition.
      localName: symbolIsExported ? symbol.name : followAliasesResult.localName,
      followedSymbol: followAliasesResult.symbol,
      importPackagePath: followAliasesResult.importPackagePath,
      importPackageExportName: followAliasesResult.importPackageExportName
    });

    this._entries.push(entry);
    this._entriesBySymbol.set(followedSymbol, entry);

    for (const declaration of followedSymbol.declarations || []) {
      this._collectTypes(declaration);
      this._collectTypeReferenceDirectives(declaration);
    }

    return entry;
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
          const symbolNode: ts.Node | undefined = PackageTypingsGenerator._findFirstChildNode(
            node, ts.SyntaxKind.Identifier);

          if (!symbolNode) {
            break;
          }

          const symbol: ts.Symbol | undefined = this._typeChecker.getSymbolAtLocation(symbolNode);
          if (!symbol) {
            throw new Error('Symbol not found for identifier: ' + symbolNode.getText());
          }

          this._fetchEntryForSymbol(symbol, false);
        }
        break;  // keep recursing
    }

    for (const child of node.getChildren() || []) {
      this._collectTypes(child);
    }
  }

  private _collectTypeReferenceDirectives(node: ts.Node): void {
    const sourceFile: ts.SourceFile = node.getSourceFile();
    if (!sourceFile || !sourceFile.fileName) {
      return;
    }

    if (this._typeDirectiveReferencesFiles.has(sourceFile.fileName)) {
      return;
    }

    this._typeDirectiveReferencesFiles.add(sourceFile.fileName);

    for (const typeReferenceDirective of sourceFile.typeReferenceDirectives) {
      const name: string = sourceFile.text.substring(typeReferenceDirective.pos, typeReferenceDirective.end);
      if (this._typeDirectiveReferences.indexOf(name) < 0) {
        this._typeDirectiveReferences.push(name);
      }
    }
  }
}
