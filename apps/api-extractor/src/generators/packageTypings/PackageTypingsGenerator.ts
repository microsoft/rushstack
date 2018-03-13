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
import { ReleaseTag } from '../../aedoc/ReleaseTag';
import { AstSymbolTable } from './AstSymbolTable';
import { AstEntryPoint } from './AstEntryPoint';
import { AstSymbol } from './AstSymbol';
import { AstImport } from './AstImport';
import { DtsEntry } from './DtsEntry';
import { AstDeclaration } from './AstDeclaration';

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
  private _astSymbolTable: AstSymbolTable;
  private _astEntryPoint: AstEntryPoint | undefined;

  private _dtsEntries: DtsEntry[] = [];
  private _dtsEntriesByAstSymbol: Map<AstSymbol, DtsEntry> = new Map<AstSymbol, DtsEntry>();
  private _dtsEntriesBySymbol: Map<ts.Symbol, DtsEntry> = new Map<ts.Symbol, DtsEntry>();

  /**
   * A list of names (e.g. "example-library") that should appear in a reference like this:
   *
   * /// <reference types="example-library" />
   */
  private _dtsTypeDefinitionReferences: string[] = [];

  public constructor(context: ExtractorContext) {
    this._context = context;
    this._typeChecker = context.typeChecker;
    this._astSymbolTable = new AstSymbolTable(this._context.typeChecker);
  }

  /**
   * Perform the analysis.  This must be called before writeTypingsFile().
   */
  public analyze(): void {
    if (this._astEntryPoint) {
      throw new Error('PackageTypingsGenerator.analyze() was already called');
    }

    // Build the entry point
    this._astEntryPoint = this._astSymbolTable.fetchEntryPoint(this._context.package.getDeclaration().getSourceFile());

    const exportedAstSymbols: AstSymbol[] = [];

    // Create a DtsEntry for each top-level export
    for (const exportedMember of this._astEntryPoint.exportedMembers) {
      const astSymbol: AstSymbol = exportedMember.astSymbol;

      this._createDtsEntryForSymbol(exportedMember.astSymbol, exportedMember.name);

      exportedAstSymbols.push(astSymbol);
    }

    // Create a DtsEntry for each indirectly referenced export.
    // Note that we do this *after* the above loop, so that references to exported AstSymbols
    // are encountered first as exports.
    const alreadySeenAstSymbols: Set<AstSymbol> = new Set<AstSymbol>();
    for (const exportedAstSymbol of exportedAstSymbols) {
      this._createDtsEntryForIndirectReferences(exportedAstSymbol, alreadySeenAstSymbols);
    }

    this._makeUniqueNames();

    this._dtsEntries.sort((a, b) => a.getSortKey().localeCompare(b.getSortKey()));
    this._dtsTypeDefinitionReferences.sort();
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

  private get astEntryPoint(): AstEntryPoint {
    if (!this._astEntryPoint) {
      throw new Error('PackageTypingsGenerator.analyze() was not called');
    }
    return this._astEntryPoint;
  }

  private _createDtsEntryForSymbol(astSymbol: AstSymbol, exportedName: string | undefined): void {
    let dtsEntry: DtsEntry | undefined = this._dtsEntriesByAstSymbol.get(astSymbol);

    if (!dtsEntry) {
      const releaseTag: ReleaseTag = this._getReleaseTagForSymbol(astSymbol.followedSymbol);

      dtsEntry = new DtsEntry({
        astSymbol: astSymbol,
        originalName: exportedName || astSymbol.localName,
        exported: !!exportedName,
        releaseTag: releaseTag
      });

      this._dtsEntriesByAstSymbol.set(astSymbol, dtsEntry);
      this._dtsEntriesBySymbol.set(astSymbol.followedSymbol, dtsEntry);
      this._dtsEntries.push(dtsEntry);

      this._collectTypeDefinitionReferences(astSymbol);
    } else {
      if (exportedName) {
        if (!dtsEntry.exported) {
          throw new Error('Program Bug: DtsEntry should have been marked as exported');
        }
        if (dtsEntry.originalName !== exportedName) {
          throw new Error(`The symbol ${exportedName} was also exported as ${dtsEntry.originalName};`
            + ` this is not supported yet`);
        }
      }
    }
  }

  private _createDtsEntryForIndirectReferences(astSymbol: AstSymbol, alreadySeenAstSymbols: Set<AstSymbol>): void {
    if (alreadySeenAstSymbols.has(astSymbol)) {
      return;
    }
    alreadySeenAstSymbols.add(astSymbol);

    astSymbol.forEachDeclarationRecursive((astDeclaration: AstDeclaration) => {
      for (const referencedAstSymbol of astDeclaration.referencedAstSymbols) {
        this._createDtsEntryForSymbol(referencedAstSymbol, undefined);
        this._createDtsEntryForIndirectReferences(referencedAstSymbol, alreadySeenAstSymbols);
      }
    });
  }

  /**
   * Ensures a unique name for each item in the package typings file.
   */
  private _makeUniqueNames(): void {
    const usedNames: Set<string> = new Set<string>();

    // First collect the explicit package exports
    for (const dtsEntry of this._dtsEntries) {
      if (dtsEntry.exported) {

        if (usedNames.has(dtsEntry.originalName)) {
          // This should be impossible
          throw new Error(`Program bug: a package cannot have two exports with the name ${dtsEntry.originalName}`);
        }

        dtsEntry.nameForEmit = dtsEntry.originalName;

        usedNames.add(dtsEntry.nameForEmit);
      }
    }

    // Next generate unique names for the non-exports that will be emitted
    for (const dtsEntry of this._dtsEntries) {
      if (!dtsEntry.exported) {
        let suffix: number = 1;
        dtsEntry.nameForEmit = dtsEntry.originalName;

        while (usedNames.has(dtsEntry.nameForEmit)) {
          dtsEntry.nameForEmit = dtsEntry.originalName + '_' + ++suffix;
        }

        usedNames.add(dtsEntry.nameForEmit);
      }
    }
  }

  private _generateTypingsFileContent(indentedWriter: IndentedWriter, dtsKind: PackageTypingsDtsKind): void {

    indentedWriter.spacing = '';
    indentedWriter.clear();

    // If there is a @packagedocumentation header, put it first:
    const packageDocumentation: string = this._context.package.documentation.originalAedoc;
    if (packageDocumentation) {
      indentedWriter.writeLine(TypeScriptHelpers.formatJSDocContent(packageDocumentation));
      indentedWriter.writeLine();
    }

    // Emit the triple slash directives
    for (const typeDirectiveReference of this._dtsTypeDefinitionReferences) {
      // tslint:disable-next-line:max-line-length
      // https://github.com/Microsoft/TypeScript/blob/611ebc7aadd7a44a4c0447698bfda9222a78cb66/src/compiler/declarationEmitter.ts#L162
      indentedWriter.writeLine(`/// <reference types="${typeDirectiveReference}" />`);
    }

    // Emit the imports
    for (const dtsEntry of this._dtsEntries) {
      if (dtsEntry.astSymbol.astImport) {
        const astImport: AstImport = dtsEntry.astSymbol.astImport;

        if (astImport.exportName === '*') {
          indentedWriter.write(`import * as ${dtsEntry.nameForEmit}`);
        } else if (dtsEntry.nameForEmit !== astImport.exportName) {
          indentedWriter.write(`import { ${astImport.exportName} as ${dtsEntry.nameForEmit} }`);
        } else {
          indentedWriter.write(`import { ${astImport.exportName} }`);
        }
        indentedWriter.writeLine(` from '${astImport.modulePath}';`);
      }
    }

    // Emit the regular declarations
    for (const dtsEntry of this._dtsEntries) {
      if (!dtsEntry.astSymbol.astImport) {

        if (this._shouldIncludeReleaseTag(dtsEntry.releaseTag, dtsKind)) {

          // Emit all the declarations for this entry
          for (const astDeclaration of dtsEntry.astSymbol.astDeclarations || []) {

            indentedWriter.writeLine();

            const span: Span = new Span(astDeclaration.declaration);
            this._modifySpan(span, dtsEntry);
            indentedWriter.writeLine(span.getModifiedText());
          }
        } else {
          indentedWriter.writeLine();
          indentedWriter.writeLine(`// Removed for this release type: ${dtsEntry.nameForEmit}`);
        }
      }
    }
  }

  /**
   * Before writing out a declaration, _modifySpan() applies various fixups to make it nice.
   */
  private _modifySpan(span: Span, dtsEntry: DtsEntry): void {
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

        if (dtsEntry.exported) {
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
        let nameFixup: boolean = false;
        const identifierSymbol: ts.Symbol | undefined = this._typeChecker.getSymbolAtLocation(span.node);
        if (identifierSymbol) {
          const followedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(identifierSymbol, this._typeChecker);

          const referencedDtsEntry: DtsEntry | undefined = this._dtsEntriesBySymbol.get(followedSymbol);

          if (referencedDtsEntry) {
            if (!referencedDtsEntry.nameForEmit) {
              // This should never happen
              throw new Error('referencedEntry.uniqueName is undefined');
            }

            span.modification.prefix = referencedDtsEntry.nameForEmit;
            nameFixup = true;
            // For debugging:
            // span.modification.prefix += '/*R=FIX*/';
          }

        }

        if (!nameFixup) {
          // For debugging:
          // span.modification.prefix += '/*R=KEEP*/';
        }

        break;
    }

    if (recurseChildren) {
      for (const child of span.children) {
        this._modifySpan(child, dtsEntry);
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
            // this._analyzeWarnings.push('WARNING: Conflicting release tags found for ' + symbol.name);
            return releaseTag;
          }

          releaseTag = foundReleaseTag;
        }
      }
    }

    return releaseTag;
  }

  private _collectTypeDefinitionReferences(astSymbol: AstSymbol): void {
    // Are we emitting declarations?
    if (astSymbol.astImport) {
      return; // no, it's an import
    }

    const seenFilenames: Set<string> = new Set<string>();

    for (const astDeclaration of astSymbol.astDeclarations) {
      const sourceFile: ts.SourceFile = astDeclaration.declaration.getSourceFile();
      if (sourceFile && sourceFile.fileName) {
        if (!seenFilenames.has(sourceFile.fileName)) {
          seenFilenames.add(sourceFile.fileName);

          for (const typeReferenceDirective of sourceFile.typeReferenceDirectives) {
            const name: string = sourceFile.text.substring(typeReferenceDirective.pos, typeReferenceDirective.end);
            if (this._dtsTypeDefinitionReferences.indexOf(name) < 0) {
              this._dtsTypeDefinitionReferences.push(name);
            }
          }

        }
      }
    }
  }
}
