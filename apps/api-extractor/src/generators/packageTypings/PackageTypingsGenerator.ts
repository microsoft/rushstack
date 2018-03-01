// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as fs from 'fs';
import * as ts from 'typescript';

import { ExtractorContext } from '../../ExtractorContext';
import { IndentedWriter } from '../../utils/IndentedWriter';
import { TypeScriptHelpers } from '../../utils/TypeScriptHelpers';
import { Span } from '../../utils/Span';
import { Entry } from './Entry';
import { SymbolAnalyzer, IFollowAliasesResult } from './SymbolAnalyzer';

export class PackageTypingsGenerator {
  private _context: ExtractorContext;
  private _typeChecker: ts.TypeChecker;
  private _indentedWriter: IndentedWriter = new IndentedWriter();

  /**
   * A mapping from Entry.followedSymbol --> Entry.
   * NOTE: Two different keys may map to the same value.
   *
   * After following type aliases, we use this map to look up the corresponding Entry.
   */
  private readonly _entriesBySymbol: Map<ts.Symbol, Entry> = new Map<ts.Symbol, Entry>();

  /**
   * A mapping from Entry.importPackageKey --> Entry.
   *
   * If Entry.importPackageKey is undefined, then it is not included in the map.
   */
  private readonly _entriesByImportKey: Map<string, Entry> = new Map<string, Entry>();

  /**
   * This data structure stores the same entries as _entriesBySymbol.values().
   * They are sorted according to Entry.getSortKey().
   */
  private readonly _entries: Entry[] = [];

  private readonly _typeDirectiveReferences: string[] = [];
  private readonly _typeDirectiveReferencesFiles: Set<string> = new Set<string>();

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
  private _modifySpan(span: Span, entry: Entry): void {
    const previousSpan: Span | undefined = span.previousSibling;

    let recurseChildren: boolean = true;

    switch (span.kind) {
      case ts.SyntaxKind.JSDocComment:
        // For now, we don't transform JSDoc comment nodes at all
        recurseChildren = false;
        break;

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
        if (!span.parent) {
          // The VariableDeclaration node is part of a VariableDeclarationList, however
          // the Entry.followedSymbol points to the VariableDeclaration part because
          // multiple definitions might share the same VariableDeclarationList.
          //
          // Since we are emitting a separate declaration for each one, we need to look upwards
          // in the ts.Node tree and write a copy of the enclosing VariableDeclarationList
          // content (e.g. "var" from "var x=1, y=2").
          const list: ts.VariableDeclarationList | undefined = TypeScriptHelpers.matchAncestor(span.node,
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
        const symbol: ts.Symbol | undefined = this._typeChecker.getSymbolAtLocation(span.node);
        if (symbol) {
          const referencedEntry: Entry | undefined = this._getEntryForSymbol(symbol);
          if (referencedEntry) {
            if (!referencedEntry.uniqueName) {
              // This should never happen
              throw new Error('referencedEntry.uniqueName is undefined');
            }

            span.modification.prefix = referencedEntry.uniqueName;
            // For debugging:
            // span.modification.prefix += '/*R=FIX*/';
          } else {
            // For debugging:
            // span.modification.prefix += '/*R=KEEP*/';
          }
        } else {
          // For debugging:
          // span.modification.prefix += '/*R=NA*/';
        }
        break;
    }

    if (recurseChildren) {
      for (const child of span.children) {
        this._modifySpan(child, entry);
      }
    }
  }

  /**
   * Ensures a unique name for each item in the package typings file.
   */
  private _makeUniqueNames(): void {
    const usedNames: Set<string> = new Set<string>();

    // First collect the package exports
    for (const entry of this._entries) {
      if (entry.packageExportName) {
        if (usedNames.has(entry.packageExportName)) {
          // This should be impossible
          throw new Error('Program bug: a package cannot have two exports with the same name');
        }

        entry.uniqueName = entry.packageExportName;

        usedNames.add(entry.packageExportName);
      }
    }

    // Next generate unique names for the non-exports
    for (const entry of this._entries) {
      if (!entry.packageExportName) {

        let suffix: number = 1;
        entry.uniqueName = entry.localName;
        while (usedNames.has(entry.uniqueName)) {
          entry.uniqueName = entry.localName + '_' + ++suffix;
        }

        usedNames.add(entry.uniqueName);
      }
    }
  }

  /**
   * Looks up the corresponding Entry for the requested symbol.
   */
  private _getEntryForSymbol(symbol: ts.Symbol): Entry | undefined {
    const followAliasesResult: IFollowAliasesResult = SymbolAnalyzer.followAliases(symbol, this._typeChecker);
    return this._entriesBySymbol.get(followAliasesResult.followedSymbol);
  }

  /**
   * Looks up the corresponding Entry for the requested symbol.  If it doesn't exist,
   * then it tries to create one.
   */
  private _fetchEntryForSymbol(symbol: ts.Symbol, symbolIsExported: boolean): Entry | undefined {
    const followAliasesResult: IFollowAliasesResult = SymbolAnalyzer.followAliases(symbol, this._typeChecker);

    if (followAliasesResult.isAmbient) {
      return undefined; // we don't care about ambient definitions
    }

    const followedSymbol: ts.Symbol = followAliasesResult.followedSymbol;
    if (followedSymbol.flags & (ts.SymbolFlags.TypeParameter | ts.SymbolFlags.TypeLiteral)) {
      return undefined;
    }

    let entry: Entry | undefined = this._entriesBySymbol.get(followedSymbol);

    if (!entry) {
      const importPackageKey: string | undefined = followAliasesResult.importPackagePath
        ? followAliasesResult.importPackagePath + ':' + followAliasesResult.importPackageExportName
        : undefined;

      if (importPackageKey) {
        entry = this._entriesByImportKey.get(importPackageKey);

        if (entry) {
          // We didn't find the entry using  followedSymbol, but we did using importPackageKey,
          // so add a mapping for followedSymbol; we'll need it later when renaming identifiers
          this._entriesBySymbol.set(followedSymbol, entry);
        }
      }

      if (!entry) {
        // None of the above lookups worked, so create a new entry
        entry = new Entry({
          localName: followAliasesResult.localName,
          followedSymbol: followAliasesResult.followedSymbol,
          importPackagePath: followAliasesResult.importPackagePath,
          importPackageExportName: followAliasesResult.importPackageExportName,
          importPackageKey: importPackageKey
        });

        this._entries.push(entry);
        this._entriesBySymbol.set(followedSymbol, entry);

        if (importPackageKey) {
          // If it's an import, add it to the lookup
          this._entriesByImportKey.set(importPackageKey, entry);
        } else {
          // If it's not an import, then crawl for type references
          for (const declaration of followedSymbol.declarations || []) {
            this._collectTypes(declaration);
            this._collectTypeReferenceDirectives(declaration);
          }
        }
      }
    }

    if (symbolIsExported) {
      if (entry.packageExportName && entry.packageExportName !== symbol.name) {
        // TODO: If the same symbol is exported more than once, we need to emit an alias;
        // We cannot simply export two definitions.
        throw new Error(`${symbol.name} is exported twice`);
      }

      entry.packageExportName = symbol.name;
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
          const symbolNode: ts.Node | undefined = TypeScriptHelpers.findFirstChildNode(
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
