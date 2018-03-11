// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';

import { TypeScriptHelpers } from '../../utils/TypeScriptHelpers';
import { ReleaseTag } from '../../aedoc/ReleaseTag';
import { Entry, EntryRole } from './Entry';
import { SymbolAnalyzer, IFollowAliasesResult } from './SymbolAnalyzer';

export class EntryTable {
  private _typeChecker: ts.TypeChecker;

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

  private _analyzed: boolean = false;

  private readonly _analyzeWarnings: string[] = [];

  public constructor(typeChecker: ts.TypeChecker) {
    this._typeChecker = typeChecker;
  }

  /**
   * Warnings encountered during the analyze() stage
   */
  public get analyzeWarnings(): ReadonlyArray<string> {
    return this._analyzeWarnings;
  }

  /**
   * A list of package names that should appear in a reference like this:
   *
   * /// <reference types="package-name" />
   */
  public get typeDirectiveReferences(): ReadonlyArray<string> {
    return this._typeDirectiveReferences;
  }

  public get entries(): ReadonlyArray<Entry> {
    return this._entries;
  }

  /**
   * Perform the analysis.  This must be called before writeTypingsFile().
   */
  public analyze(packageSymbol: ts.Symbol): void {
    this._analyzed = true;

    const exportSymbols: ts.Symbol[] = this._typeChecker.getExportsOfModule(packageSymbol) || [];

    for (const exportSymbol of exportSymbols) {
      const entry: Entry | undefined = this._fetchEntryForSymbol(exportSymbol, true);

      if (!entry) {
        // This is an export of the current package, but for some reason _fetchEntryForSymbol()
        // can't analyze it.
        this._analyzeWarnings.push('Unsupported re-export: ' + exportSymbol.name);
      }
    }

    this._makeUniqueNames();
    this._entries.sort((a, b) => a.getSortKey().localeCompare(b.getSortKey()));
    this._typeDirectiveReferences.sort();
  }

  /**
   * Looks up the corresponding Entry for the requested symbol.
   */
  public getEntryForSymbol(symbol: ts.Symbol): Entry | undefined {
    const followAliasesResult: IFollowAliasesResult = SymbolAnalyzer.followAliases(symbol, this._typeChecker);
    return this._entriesBySymbol.get(followAliasesResult.followedSymbol);
  }

  /**
   * Ensures a unique name for each item in the package typings file.
   */
  private _makeUniqueNames(): void {
    const usedNames: Set<string> = new Set<string>();

    // First collect the explicit package exports
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

    // Next generate unique names for the non-exports that will be emitted
    for (const entry of this._entries) {
      if (!entry.packageExportName) {
        if (entry.role === EntryRole.EmittedImport || entry.role === EntryRole.EmittedDefinition) {
          let suffix: number = 1;
          entry.uniqueName = entry.localName;
          while (usedNames.has(entry.uniqueName)) {
            entry.uniqueName = entry.localName + '_' + ++suffix;
          }

          usedNames.add(entry.uniqueName);
        }
      }
    }
  }

  // NOTE: THIS IS A TEMPORARY WORKAROUND.
  // In the near future we will overhaul the AEDoc parser to separate syntactic/semantic analysis,
  // at which point this will be wired up to the same ApiDocumentation layer used for the API Review files
  private _getReleaseTagForSymbol(symbol: ts.Symbol): ReleaseTag {
    const fullyFollowedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(symbol, this._typeChecker);

    let releaseTag: ReleaseTag = ReleaseTag.None;

    // We don't want to match "bill@example.com".  But we do want to match "/**@public*/".
    // So for now we require whitespace or a star before/after the string.
    const releaseTagRegExp: RegExp = /(?:\s|\*)@(internal|alpha|beta|public)(?:\s|\*)/g;

    for (const declaration of fullyFollowedSymbol.declarations || []) {
      const sourceFileText: string = declaration.getSourceFile().text;

      for (const commentRange of TypeScriptHelpers.getJSDocCommentRanges(declaration, sourceFileText) || []) {
        // NOTE: This string includes "/**"
        const comment: string = sourceFileText.substring(commentRange.pos, commentRange.end);

        let match: RegExpMatchArray | null;
        while (match = releaseTagRegExp.exec(comment)) {
          let foundReleaseTag: ReleaseTag = ReleaseTag.None;
          switch (match[1]) {
            case 'internal':
              foundReleaseTag = ReleaseTag.Internal; break;
            case 'alpha':
              foundReleaseTag = ReleaseTag.Alpha; break;
            case 'beta':
              foundReleaseTag = ReleaseTag.Beta; break;
            case 'public':
              foundReleaseTag = ReleaseTag.Public; break;
          }

          if (releaseTag !== ReleaseTag.None && foundReleaseTag !== releaseTag) {
            this._analyzeWarnings.push('WARNING: Conflicting release tags found for ' + symbol.name);
            return releaseTag;
          }

          releaseTag = foundReleaseTag;
        }
      }
    }

    return releaseTag;
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
        const releaseTag: ReleaseTag = this._getReleaseTagForSymbol(symbol);

        // None of the above lookups worked, so create a new entry
        entry = new Entry({
          localName: followAliasesResult.localName,
          followedSymbol: followAliasesResult.followedSymbol,
          importPackagePath: followAliasesResult.importPackagePath,
          importPackageExportName: followAliasesResult.importPackageExportName,
          importPackageKey: importPackageKey,
          releaseTag: releaseTag
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
