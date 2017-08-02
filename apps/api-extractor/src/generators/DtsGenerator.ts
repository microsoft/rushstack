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

class Entry {
  public localName: string;
  public followedSymbol: ts.Symbol;
  public dtsDeclarations: dts.TopLevelDeclaration[] = [];
}

export default class DtsGenerator {
  private _extractor: Extractor;
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

    const exportSymbols: ts.Symbol[] = this._extractor.typeChecker.getExportsOfModule(packageSymbol) || [];
    for (const exportSymbol of exportSymbols) {

      const entry: Entry = this._fetchEntryForSymbol(exportSymbol);
      for (const dtsDeclaration of entry.dtsDeclarations) {
        dtsDeclaration.flags |= dts.DeclarationFlags.Export;
      }
    }

    this._entries.sort((a, b) => a.localName.localeCompare(b.localName));

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
    const followedSymbol: ts.Symbol = DtsGenerator._followAliases(symbol, this._extractor.typeChecker);

    const entry: Entry = this._createEntry(symbol.name, followedSymbol);

    for (const declaration of followedSymbol.declarations) {
      console.log(PrettyPrinter.dumpTree(declaration));
      console.log('-------------------------------------');
      console.log(declaration.getText());
      console.log('=====================================');

      switch (declaration.kind) {
        case ts.SyntaxKind.ClassDeclaration:
          this._processClassDeclaration(entry, declaration as ts.ClassDeclaration);
      }
    }

    return entry;
  }

  private _processClassDeclaration(entry: Entry, declaration: ts.ClassDeclaration): void {
    const classDts: dts.ClassDeclaration = dts.create.class(entry.localName);
    entry.dtsDeclarations.push(classDts);
    // classDts.implements.push(interfaceDts);
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
