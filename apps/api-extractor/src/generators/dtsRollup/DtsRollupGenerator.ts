// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import * as tsdoc from '@microsoft/tsdoc';
import { FileSystem, NewlineKind, Sort } from '@microsoft/node-core-library';

import { ExtractorContext } from '../../ExtractorContext';
import { IndentedWriter } from '../../utils/IndentedWriter';
import { TypeScriptHelpers } from '../../utils/TypeScriptHelpers';
import { Span, SpanModification } from '../../utils/Span';
import { ReleaseTag } from '../../aedoc/ReleaseTag';
import { AstSymbolTable } from './AstSymbolTable';
import { AstEntryPoint } from './AstEntryPoint';
import { AstSymbol } from './AstSymbol';
import { AstImport } from './AstImport';
import { DtsEntry } from './DtsEntry';
import { AstDeclaration } from './AstDeclaration';
import { SymbolAnalyzer } from './SymbolAnalyzer';

/**
 * Used with DtsRollupGenerator.writeTypingsFile()
 */
export enum DtsRollupKind {
  /**
   * Generate a *.d.ts file for an internal release, or for the trimming=false mode.
   * This output file will contain all definitions that are reachable from the entry point.
   */
  InternalRelease,

  /**
   * Generate a *.d.ts file for a preview release.
   * This output file will contain all definitions that are reachable from the entry point,
   * except definitions marked as \@alpha or \@internal.
   */
  BetaRelease,

  /**
   * Generate a *.d.ts file for a public release.
   * This output file will contain all definitions that are reachable from the entry point,
   * except definitions marked as \@beta, \@alpha, or \@internal.
   */
  PublicRelease
}

export class DtsRollupGenerator {
  private _context: ExtractorContext;
  private _typeChecker: ts.TypeChecker;
  private _tsdocParser: tsdoc.TSDocParser;
  private _astSymbolTable: AstSymbolTable;
  private _astEntryPoint: AstEntryPoint | undefined;

  private _dtsEntries: DtsEntry[] = [];
  private _dtsEntriesByAstSymbol: Map<AstSymbol, DtsEntry> = new Map<AstSymbol, DtsEntry>();
  private _dtsEntriesBySymbol: Map<ts.Symbol, DtsEntry> = new Map<ts.Symbol, DtsEntry>();
  private _releaseTagByAstSymbol: Map<AstSymbol, ReleaseTag> = new Map<AstSymbol, ReleaseTag>();

  /**
   * A list of names (e.g. "example-library") that should appear in a reference like this:
   *
   * /// <reference types="example-library" />
   */
  private _dtsTypeReferenceDirectives: Set<string> = new Set<string>();

  /**
   * A list of names (e.g. "runtime-library") that should appear in a reference like this:
   *
   * /// <reference lib="runtime-library" />
   */
  private _dtsLibReferenceDirectives: Set<string> = new Set<string>();

  public constructor(context: ExtractorContext) {
    this._context = context;
    this._typeChecker = context.typeChecker;
    this._tsdocParser = new tsdoc.TSDocParser();
    this._astSymbolTable = new AstSymbolTable(this._context.program, this._context.typeChecker,
      this._context.packageJsonLookup);
  }

  /**
   * Perform the analysis.  This must be called before writeTypingsFile().
   */
  public analyze(): void {
    if (this._astEntryPoint) {
      throw new Error('DtsRollupGenerator.analyze() was already called');
    }

    // Build the entry point
    const sourceFile: ts.SourceFile = this._context.package.getDeclaration().getSourceFile();
    this._astEntryPoint = this._astSymbolTable.fetchEntryPoint(sourceFile);

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

    Sort.sortBy(this._dtsEntries, x => x.getSortKey());
    Sort.sortSet(this._dtsTypeReferenceDirectives);
    Sort.sortSet(this._dtsLibReferenceDirectives);
  }

  /**
   * Generates the typings file and writes it to disk.
   *
   * @param dtsFilename    - The *.d.ts output filename
   */
  public writeTypingsFile(dtsFilename: string, dtsKind: DtsRollupKind): void {
    const indentedWriter: IndentedWriter = new IndentedWriter();

    this._generateTypingsFileContent(indentedWriter, dtsKind);

    FileSystem.writeFile(dtsFilename, indentedWriter.toString(), {
      convertLineEndings: NewlineKind.CrLf,
      ensureFolderExists: true
    });
  }

  private get astEntryPoint(): AstEntryPoint {
    if (!this._astEntryPoint) {
      throw new Error('DtsRollupGenerator.analyze() was not called');
    }
    return this._astEntryPoint;
  }

  private _createDtsEntryForSymbol(astSymbol: AstSymbol, exportedName: string | undefined): void {
    let dtsEntry: DtsEntry | undefined = this._dtsEntriesByAstSymbol.get(astSymbol);

    if (!dtsEntry) {
      dtsEntry = new DtsEntry({
        astSymbol: astSymbol,
        originalName: exportedName || astSymbol.localName,
        exported: !!exportedName
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
          dtsEntry.nameForEmit = `${dtsEntry.originalName}_${++suffix}`;
        }

        usedNames.add(dtsEntry.nameForEmit);
      }
    }
  }

  private _generateTypingsFileContent(indentedWriter: IndentedWriter, dtsKind: DtsRollupKind): void {

    indentedWriter.spacing = '';
    indentedWriter.clear();

    // If there is a @packagedocumentation header, put it first:
    const packageDocumentation: string = this._context.package.documentation.emitNormalizedComment();
    if (packageDocumentation) {
      indentedWriter.writeLine(packageDocumentation);
      indentedWriter.writeLine();
    }

    // Emit the triple slash directives
    for (const typeDirectiveReference of this._dtsTypeReferenceDirectives) {
      // tslint:disable-next-line:max-line-length
      // https://github.com/Microsoft/TypeScript/blob/611ebc7aadd7a44a4c0447698bfda9222a78cb66/src/compiler/declarationEmitter.ts#L162
      indentedWriter.writeLine(`/// <reference types="${typeDirectiveReference}" />`);
    }

    for (const libDirectiveReference of this._dtsLibReferenceDirectives) {
      indentedWriter.writeLine(`/// <reference lib="${libDirectiveReference}" />`);
    }

    // Emit the imports
    for (const dtsEntry of this._dtsEntries) {
      if (dtsEntry.astSymbol.astImport) {

        const releaseTag: ReleaseTag = this._getReleaseTagForAstSymbol(dtsEntry.astSymbol);
        if (this._shouldIncludeReleaseTag(releaseTag, dtsKind)) {
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
    }

    // Emit the regular declarations
    for (const dtsEntry of this._dtsEntries) {
      if (!dtsEntry.astSymbol.astImport) {

        const releaseTag: ReleaseTag = this._getReleaseTagForAstSymbol(dtsEntry.astSymbol);
        if (this._shouldIncludeReleaseTag(releaseTag, dtsKind)) {

          // Emit all the declarations for this entry
          for (const astDeclaration of dtsEntry.astSymbol.astDeclarations || []) {

            indentedWriter.writeLine();

            const span: Span = new Span(astDeclaration.declaration);
            this._modifySpan(span, dtsEntry, astDeclaration, dtsKind);
            indentedWriter.writeLine(span.getModifiedText());
          }
        } else {
          indentedWriter.writeLine();
          indentedWriter.writeLine(`/* Excluded from this release type: ${dtsEntry.nameForEmit} */`);
        }
      }
    }
  }

  /**
   * Before writing out a declaration, _modifySpan() applies various fixups to make it nice.
   */
  private _modifySpan(span: Span, dtsEntry: DtsEntry, astDeclaration: AstDeclaration,
    dtsKind: DtsRollupKind): void {

    const previousSpan: Span | undefined = span.previousSibling;

    let recurseChildren: boolean = true;
    switch (span.kind) {
      case ts.SyntaxKind.JSDocComment:
        // If the @packagedocumentation comment seems to be attached to one of the regular API items,
        // omit it.  It gets explictly emitted at the top of the file.
        if (span.node.getText().match(/(?:\s|\*)@packagedocumentation(?:\s|\*)/g)) {
          span.modification.skipAll();
        }

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
        let replacedModifiers: string = '';

        // Add a declare statement for root declarations (but not for nested declarations)
        if (!astDeclaration.parent) {
          replacedModifiers += 'declare ';
        }

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

          if (dtsEntry.exported) {
            span.modification.prefix = 'export ' + span.modification.prefix;
          }

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
        let childAstDeclaration: AstDeclaration = astDeclaration;

        // Should we trim this node?
        let trimmed: boolean = false;
        if (SymbolAnalyzer.isAstDeclaration(child.kind)) {
          childAstDeclaration = this._astSymbolTable.getChildAstDeclarationByNode(child.node, astDeclaration);

          const releaseTag: ReleaseTag = this._getReleaseTagForAstSymbol(childAstDeclaration.astSymbol);
          if (!this._shouldIncludeReleaseTag(releaseTag, dtsKind)) {
            const modification: SpanModification = child.modification;

            // Yes, trim it and stop here
            const name: string = childAstDeclaration.astSymbol.localName;
            modification.omitChildren = true;

            modification.prefix = `/* Excluded from this release type: ${name} */`;
            modification.suffix = '';

            if (child.children.length > 0) {
              // If there are grandchildren, then keep the last grandchild's separator,
              // since it often has useful whitespace
              modification.suffix = child.children[child.children.length - 1].separator;
            }

            if (child.nextSibling) {
              // If the thing we are trimming is followed by a comma, then trim the comma also.
              // An example would be an enum member.
              if (child.nextSibling.kind === ts.SyntaxKind.CommaToken) {
                // Keep its separator since it often has useful whitespace
                modification.suffix += child.nextSibling.separator;
                child.nextSibling.modification.skipAll();
              }
            }

            trimmed = true;
          }
        }

        if (!trimmed) {
          this._modifySpan(child, dtsEntry, childAstDeclaration, dtsKind);
        }
      }
    }
  }

  private _shouldIncludeReleaseTag(releaseTag: ReleaseTag, dtsKind: DtsRollupKind): boolean {
    switch (dtsKind) {
      case DtsRollupKind.InternalRelease:
        return true;
      case DtsRollupKind.BetaRelease:
        // NOTE: If the release tag is "None", then we don't have enough information to trim it
        return releaseTag === ReleaseTag.Beta || releaseTag === ReleaseTag.Public || releaseTag === ReleaseTag.None;
      case DtsRollupKind.PublicRelease:
        return releaseTag === ReleaseTag.Public || releaseTag === ReleaseTag.None;
    }

    throw new Error(`DtsRollupKind[dtsKind] is not implemented`);
  }

  private _getReleaseTagForAstSymbol(astSymbol: AstSymbol): ReleaseTag {
    let releaseTag: ReleaseTag | undefined = this._releaseTagByAstSymbol.get(astSymbol);
    if (releaseTag) {
      return releaseTag;
    }

    releaseTag = ReleaseTag.None;

    let current: AstSymbol | undefined = astSymbol;
    while (current) {
      for (const astDeclaration of current.astDeclarations) {
        const declarationReleaseTag: ReleaseTag = this._getReleaseTagForDeclaration(astDeclaration.declaration);
        if (releaseTag !== ReleaseTag.None && declarationReleaseTag !== releaseTag) {
          // this._analyzeWarnings.push('WARNING: Conflicting release tags found for ' + symbol.name);
          break;
        }

        releaseTag = declarationReleaseTag;
      }

      if (releaseTag !== ReleaseTag.None) {
        break;
      }

      current = current.parentAstSymbol;
    }

    if (releaseTag === ReleaseTag.None) {
      releaseTag = ReleaseTag.Public; // public by default
    }

    this._releaseTagByAstSymbol.set(astSymbol, releaseTag);

    return releaseTag;
  }

  // NOTE: THIS IS A TEMPORARY WORKAROUND.
  // In the near future we will overhaul the AEDoc parser to separate syntactic/semantic analysis,
  // at which point this will be wired up to the same ApiDocumentation layer used for the API Review files
  private _getReleaseTagForDeclaration(declaration: ts.Node): ReleaseTag {
    let nodeForComment: ts.Node = declaration;

    if (ts.isVariableDeclaration(declaration)) {
      // Variable declarations are special because they can be combined into a list.  For example:
      //
      // /** A */ export /** B */ const /** C */ x = 1, /** D **/ [ /** E */ y, z] = [3, 4];
      //
      // The compiler will only emit comments A and C in the .d.ts file, so in general there isn't a well-defined
      // way to document these parts.  API Extractor requires you to break them into separate exports like this:
      //
      // /** A */ export const x = 1;
      //
      // But _getReleaseTagForDeclaration() still receives a node corresponding to "x", so we need to walk upwards
      // and find the containing statement in order for getJSDocCommentRanges() to read the comment that we expect.
      const statement: ts.VariableStatement | undefined = TypeScriptHelpers.findFirstParent(declaration,
        ts.SyntaxKind.VariableStatement) as ts.VariableStatement | undefined;
      if (statement !== undefined) {
        // For a compound declaration, fall back to looking for C instead of A
        if (statement.declarationList.declarations.length === 1) {
          nodeForComment = statement;
        }
      }
    }

    const sourceFileText: string = declaration.getSourceFile().text;

    for (const commentRange of TypeScriptHelpers.getJSDocCommentRanges(nodeForComment, sourceFileText) || []) {
      // NOTE: This string includes "/**"
      const commentTextRange: tsdoc.TextRange = tsdoc.TextRange.fromStringRange(
        sourceFileText, commentRange.pos, commentRange.end);

      const parserContext: tsdoc.ParserContext = this._tsdocParser.parseRange(commentTextRange);
      const modifierTagSet: tsdoc.StandardModifierTagSet = parserContext.docComment.modifierTagSet;

      if (modifierTagSet.isPublic()) {
        return ReleaseTag.Public;
      }
      if (modifierTagSet.isBeta()) {
        return ReleaseTag.Beta;
      }
      if (modifierTagSet.isAlpha()) {
        return ReleaseTag.Alpha;
      }
      if (modifierTagSet.isInternal()) {
        return ReleaseTag.Internal;
      }
    }

    return ReleaseTag.None;
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
            this._dtsTypeReferenceDirectives.add(name);
          }

          for (const libReferenceDirective of sourceFile.libReferenceDirectives) {
            const name: string = sourceFile.text.substring(libReferenceDirective.pos, libReferenceDirective.end);
            this._dtsLibReferenceDirectives.add(name);
          }

        }
      }
    }
  }
}
