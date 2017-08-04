// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as fs from 'fs';
import * as ts from 'typescript';
import * as dts from '../dts-dom';

import Extractor from '../Extractor';
import IndentedWriter from '../IndentedWriter';
import PrettyPrinter from '../PrettyPrinter';
import TypeScriptHelpers from '../TypeScriptHelpers';
import { Span } from './Span';

class Entry {
  public localName: string;
  public followedSymbol: ts.Symbol;
  public dtsDeclarations: dts.TopLevelDeclaration[] = [];
  private _sortKey: string|undefined = undefined;

  public getSortKey(): string {
    if (!this._sortKey) {
      if (this.localName.substr(0, 1) === '_') {
        // Removes the leading underscore, for example:  "_example" --> "example*"
        // This causes internal definitions to sort alphabetically with regular definitions.
        // The star is appended to preserve uniqueness, since "*" is not a legal  identifier character.
        this._sortKey = this.localName.substr(1) + ' ';
      } else {
        this._sortKey = this.localName;
      }
    }
    return this._sortKey;
  }
}

export default class DtsGenerator {
  private _extractor: Extractor;
  private _typeChecker: ts.TypeChecker;
  private readonly _entriesBySymbol: Map<ts.Symbol, Entry> = new Map<ts.Symbol, Entry>();
  private readonly _entries: Entry[] = [];

  /**
   * Walks up the tree from the given starting node.  If each parent matches the expected kind
   * from parentKinds, then the matching node is returned.  Otherwise, undefined is returned.
   */
  private static _matchParent<T extends ts.Node>(node: ts.Node, parentKinds: ts.SyntaxKind[]): T {
    let current: ts.Node = node;

    for (let  i: number = 0; ; ++i) {
      if (!current || current.kind !== parentKinds[i]) {
        return undefined;
      }

      if (i >= parentKinds.length) {
        break;
      }

      current = current.parent;
    }

    return current as T;
  }

  private static _followAliases(symbol: ts.Symbol, typeChecker: ts.TypeChecker): ts.Symbol {
    let current: ts.Symbol = symbol;

    while (true) { // tslint:disable-line:no-constant-condition
      if (!(current.flags & ts.SymbolFlags.Alias)) {
        break;
      }
      const currentAlias: ts.Symbol = TypeScriptHelpers.getImmediateAliasedSymbol(current, typeChecker);
      // Stop if we reach the end of the chain
      if (!currentAlias || currentAlias === current) {
        break;
      }

      // Is it an export declaration?
      if (currentAlias.declarations) {
        const exportDeclaration: ts.ExportDeclaration = DtsGenerator._matchParent<ts.ExportDeclaration>(
          currentAlias.declarations[0],
          [ts.SyntaxKind.ExportSpecifier, ts.SyntaxKind.NamedExports, ts.SyntaxKind.ExportDeclaration]);

        if (exportDeclaration) {
          // Example: " '@microsoft/sp-lodash-subset'" or " './MyClass'"
          const moduleSpecifier: string = exportDeclaration.moduleSpecifier.getFullText();

          // Does it start with something like "'./"?
          // If not, then assume it's an import from an external package
          if (!/^['"\s]+\.[\/\\]/.test(moduleSpecifier)) {
            break;
          }
        }
      }

      current = currentAlias;
    }

    return current;
  }

  public constructor(extractor: Extractor) {
    this._extractor = extractor;
    this._typeChecker = extractor.typeChecker;
  }

  /**
   * Generates the report and writes it to disk.
   *
   * @param reportFilename - The output filename
   * @param analyzer       - An Analyzer object representing the input project.
   */
  public writeDtsFile(reportFilename: string): void {
    const fileContent: string = this.generateDtsFileContent();
    fs.writeFileSync(reportFilename, fileContent);
  }

  public generateDtsFileContent(): string {
    const packageSymbol: ts.Symbol = this._extractor.package.getDeclarationSymbol();

    const exportSymbols: ts.Symbol[] = this._typeChecker.getExportsOfModule(packageSymbol) || [];
    for (const exportSymbol of exportSymbols) {

      const entry: Entry = this._fetchEntryForSymbol(exportSymbol);
      for (const dtsDeclaration of entry.dtsDeclarations) {
        dtsDeclaration.flags |= dts.DeclarationFlags.Export;
      }
    }

    this._entries.sort((a, b) => a.getSortKey().localeCompare(b.getSortKey()));

    let content: string = '';
    for (const entry of this._entries) {
      for (const dtsDeclaration of entry.dtsDeclarations) {
        content += dts.emit(dtsDeclaration);
      }
    }

    // Normalize to CRLF
    const fileContent: string = content.toString().replace(/\r?\n/g, '\r\n');
    return fileContent;
  }

  private _fetchEntryForSymbol(symbol: ts.Symbol): Entry {
    const followedSymbol: ts.Symbol = DtsGenerator._followAliases(symbol, this._typeChecker);

    let entry: Entry = this._entriesBySymbol.get(followedSymbol);
    if (entry) {
      return entry;
    }

    entry = this._createEntry(symbol.name, followedSymbol);

    for (const declaration of followedSymbol.declarations) {
      console.log(PrettyPrinter.dumpTree(declaration));
      console.log('-------------------------------------');
      const span: Span = new Span(declaration);
      console.log(span.getText());
      console.log('=====================================');

      switch (declaration.kind) {
        case ts.SyntaxKind.ClassDeclaration:
          this._processClassDeclaration(entry, declaration as ts.ClassDeclaration);
          break;
        case ts.SyntaxKind.InterfaceDeclaration:
          this._processInterfaceDeclaration(entry, declaration as ts.InterfaceDeclaration);
          break;
      }

    }

    return entry;
  }

  private _processClassDeclaration(entry: Entry, declaration: ts.ClassDeclaration): void {
    const classDts: dts.ClassDeclaration = dts.create.class(entry.localName);
    entry.dtsDeclarations.push(classDts);
  }

  private _processInterfaceDeclaration(entry: Entry, declaration: ts.InterfaceDeclaration): void {
    const interfaceDts: dts.InterfaceDeclaration = dts.create.interface(entry.localName);
    entry.dtsDeclarations.push(interfaceDts);

    for (const heritageClause of declaration.heritageClauses || []) {
      for (const baseTypeDeclaration of heritageClause.types || []) {
        const baseType: ts.TypeReference = this._typeChecker.getTypeAtLocation(
          baseTypeDeclaration) as ts.TypeReference;
        const baseDts: dts.NamedTypeReference = this._getTypeReferenceDts(baseType);
        interfaceDts.baseTypes.push(baseDts);
      }
    }
  }

  private _getTypeReferenceDts(typeReference: ts.TypeReference): dts.NamedTypeReference {
    if (!typeReference.symbol) {
      const intrinsicName: string = typeReference['intrinsicName']; // tslint:disable-line:no-string-literal
      if (intrinsicName) {
        // It is a simple primitive type
        return dts.create.namedTypeReference(intrinsicName);
      } else {
        throw new Error('Unimplemented type reference:\r\n' + this._typeChecker.typeToString(typeReference));
      }
    } else {
      const entry: Entry = this._fetchEntryForSymbol(typeReference.symbol);
      const referenceDts: dts.NamedTypeReference = dts.create.namedTypeReference(entry.localName);

      for (const argument of typeReference.typeArguments || []) {
        const renderedArgument: dts.NamedTypeReference = this._getTypeReferenceDts(argument as ts.TypeReference);
        referenceDts.typeArguments.push(renderedArgument);
      }

      return referenceDts;
    }
  }

  private _createEntry(localName: string, followedSymbol: ts.Symbol): Entry {
    const entry: Entry = new Entry();
    entry.localName = localName;
    entry.followedSymbol = followedSymbol;
    this._entries.push(entry);
    this._entriesBySymbol.set(followedSymbol, entry);
    return entry;
  }
}
