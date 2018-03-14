// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as fs from 'fs';
import * as ts from 'typescript';
import { Text } from '@microsoft/node-core-library';

import { ExtractorContext } from '../../ExtractorContext';
import { IndentedWriter } from '../../utils/IndentedWriter';
import { TypeScriptHelpers } from '../../utils/TypeScriptHelpers';
import { Span } from '../../utils/Span';
import { Entry, EntryRole } from './Entry';
import { ReleaseTag } from '../../aedoc/ReleaseTag';
import { EntryTable } from './EntryTable';

/**
 * Used with PackageTypingsGenerator.writeTypingsFile()
 */
export enum PackageTypingsDtsKind {
  /**
   * Generate a *.d.ts file for an internal release.
   * This output file will contain all definitions that are reachable from the entry point.
   */
  InternalRelease,

  /**
   * Generate a *.d.ts file for a preview release.
   * This output file will contain all definitions that are reachable from the entry point,
   * except definitions marked as \@alpha or \@internal.
   */
  PreviewRelease,

  /**
   * Generate a *.d.ts file for a public release.
   * This output file will contain all definitions that are reachable from the entry point,
   * except definitions marked as \@beta, \@alpha, or \@internal.
   */
  PublicRelease
}

export class PackageTypingsGenerator {
  private _context: ExtractorContext;
  private _typeChecker: ts.TypeChecker;
  private _entryTable: EntryTable;

  public constructor(context: ExtractorContext) {
    this._context = context;
    this._typeChecker = context.typeChecker;
    this._entryTable = new EntryTable(this._context.typeChecker);
  }

  /**
   * Perform the analysis.  This must be called before writeTypingsFile().
   */
  public analyze(): void {
    const packageSymbol: ts.Symbol = this._context.package.getDeclarationSymbol();
    this._entryTable.analyze(packageSymbol);
  }

  /**
   * Generates the typings file and writes it to disk.
   *
   * @param dtsFilename    - The *.d.ts output filename
   */
  public writeTypingsFile(dtsFilename: string, dtsKind: PackageTypingsDtsKind): void {
    const indentedWriter: IndentedWriter = new IndentedWriter();

    this._generateTypingsFileContent(indentedWriter, dtsKind);

    // Normalize to CRLF
    const fileContent: string = Text.convertToCrLf(indentedWriter.toString());

    fs.writeFileSync(dtsFilename, fileContent);
  }

  private _generateTypingsFileContent(indentedWriter: IndentedWriter, dtsKind: PackageTypingsDtsKind): void {
    indentedWriter.spacing = '';
    indentedWriter.clear();

    for (const analyzeWarning of this._entryTable.analyzeWarnings) {
      indentedWriter.writeLine('// Warning: ' + analyzeWarning);
    }

    // If there is a @packagedocumentation header, put it first:
    const packageDocumentation: string = this._context.package.documentation.originalAedoc;
    if (packageDocumentation) {
      indentedWriter.writeLine(TypeScriptHelpers.formatJSDocContent(packageDocumentation));
      indentedWriter.writeLine();
    }

    // Emit the triple slash directives
    for (const typeDirectiveReference of this._entryTable.typeDirectiveReferences) {
      // tslint:disable-next-line:max-line-length
      // https://github.com/Microsoft/TypeScript/blob/611ebc7aadd7a44a4c0447698bfda9222a78cb66/src/compiler/declarationEmitter.ts#L162
      indentedWriter.writeLine(`/// <reference types="${typeDirectiveReference}" />`);
    }

    // Emit the imports
    for (const entry of this._entryTable.entries) {
      if (entry.role === EntryRole.EmittedImport) {
        if (entry.importPackageExportName === '*') {
          indentedWriter.write(`import * as ${entry.uniqueName}`);
        } else if (entry.uniqueName !== entry.importPackageExportName) {
          indentedWriter.write(`import { ${entry.importPackageExportName} as ${entry.uniqueName} }`);
        } else {
          indentedWriter.write(`import { ${entry.importPackageExportName} }`);
        }
        indentedWriter.writeLine(` from '${entry.importPackagePath}';`);
      }
    }

    // Emit the regular declarations
    for (const entry of this._entryTable.entries) {
      if (entry.role === EntryRole.EmittedDefinition) {
        // Emit all the declarations for this entry
        for (const declaration of entry.followedSymbol.declarations || []) {

          indentedWriter.writeLine();

          if (this._shouldIncludeReleaseTag(entry.releaseTag, dtsKind)) {
            const span: Span = new Span(declaration);
            this._modifySpan(span, entry);
            indentedWriter.writeLine(span.getModifiedText());
          } else {
            indentedWriter.writeLine(`// Removed for this release type: ${entry.uniqueName}`);
          }
        }
      }
    }
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
        if (entry.role === EntryRole.EmittedDefinition && !entry.forgottenExport) {
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
          const referencedEntry: Entry | undefined = this._entryTable.getEntryForSymbol(symbol);
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

  private _shouldIncludeReleaseTag(releaseTag: ReleaseTag, dtsKind: PackageTypingsDtsKind): boolean {
    switch (dtsKind) {
      case PackageTypingsDtsKind.InternalRelease:
        return true;
      case PackageTypingsDtsKind.PreviewRelease:
        // NOTE: If the release tag is "None", then we don't have enough information to trim it
        return releaseTag === ReleaseTag.Beta || releaseTag === ReleaseTag.Public || releaseTag === ReleaseTag.None;
      case PackageTypingsDtsKind.PublicRelease:
        return releaseTag === ReleaseTag.Public || releaseTag === ReleaseTag.None;
    }

    throw new Error(`PackageTypingsDtsKind[dtsKind] is not implemented`);
  }
}
