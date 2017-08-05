// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as fs from 'fs';
import * as ts from 'typescript';

import Extractor from '../Extractor';
import IndentedWriter from '../IndentedWriter';
import PrettyPrinter from '../PrettyPrinter';
import TypeScriptHelpers from '../TypeScriptHelpers';
import { Span } from './Span';

class Entry {
  public localName: string;
  public uniqueName: string | undefined = undefined;
  public followedSymbol: ts.Symbol;
  public exported: boolean = false;

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

interface IFollowAliasesResult {
  symbol: ts.Symbol;
  external: boolean;
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

  private static _followAliases(symbol: ts.Symbol, typeChecker: ts.TypeChecker): IFollowAliasesResult {
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
            return { symbol: current, external: true };
          }
        }
      }

      current = currentAlias;
    }

    return { symbol: current, external: false };
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
      const entry: Entry | undefined = this._fetchEntryForSymbol(exportSymbol);

      if (!entry) {
        throw new Error('Unsupported export type');
      }

      entry.exported = true;
    }

    this._makeUniqueNames();

    this._entries.sort((a, b) => a.getSortKey().localeCompare(b.getSortKey()));

    let content: string = '';
    for (const entry of this._entries) {
      for (const declaration of entry.followedSymbol.declarations) {
        content += '// ====> ' + entry.uniqueName + '\n';
        content += declaration.getText() + '\n';
      }
    }

    // Normalize to CRLF
    const fileContent: string = content.toString().replace(/\r?\n/g, '\r\n');
    return fileContent;
  }

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

  private _fetchEntryForSymbol(symbol: ts.Symbol): Entry | undefined {
    const result: IFollowAliasesResult = DtsGenerator._followAliases(symbol, this._typeChecker);
    if (result.external) {
      return; // external definition
    }

    const followedSymbol: ts.Symbol = result.symbol;
    if (followedSymbol.flags & (
      ts.SymbolFlags.TypeParameter | ts.SymbolFlags.TypeLiteral
      )) {
      return undefined;
    }

    let entry: Entry = this._entriesBySymbol.get(followedSymbol);
    if (entry) {
      return entry;
    }

    entry = new Entry();
    entry.localName = symbol.name;
    entry.followedSymbol = followedSymbol;
    this._entries.push(entry);
    this._entriesBySymbol.set(followedSymbol, entry);
    console.log('======> ' + entry.localName);

    for (const declaration of followedSymbol.declarations) {
      // console.log(PrettyPrinter.dumpTree(declaration));
      console.log('-------------------------------------');
      const span: Span = new Span(declaration);
      console.log(span.getText());
      console.log('=====================================');

      this._collectTypes(declaration);
    }

    return entry;
  }

  private _collectTypes(node: ts.Node): void {
    switch (node.kind) {
      case ts.SyntaxKind.Block:
        // Don't traverse into code
        return;

      case ts.SyntaxKind.Identifier:
        if (node.parent) {
          switch (node.parent.kind) {
            case ts.SyntaxKind.ExpressionWithTypeArguments:
            case ts.SyntaxKind.TypeReference:
              this._processTypeReference(node);
              break;
          }
        }
        return;
    }
    for (const child of node.getChildren() || []) {
      this._collectTypes(child);
    }
  }

  private _processTypeReference(identifier: ts.Node): void {
    const symbol: ts.Symbol = this._typeChecker.getSymbolAtLocation(identifier);
    if (!symbol) {
      throw new Error('Symbol not found');
    }

    this._fetchEntryForSymbol(symbol);
  }
}
