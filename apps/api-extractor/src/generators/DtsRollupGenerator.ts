// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import { FileSystem, NewlineKind } from '@microsoft/node-core-library';

import { ExtractorContext } from './ExtractorContext';
import { IndentedWriter } from './IndentedWriter';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';
import { Span, SpanModification } from '../analyzer/Span';
import { ReleaseTag } from '../aedoc/ReleaseTag';
import { AstImport } from '../analyzer/AstImport';
import { DtsEntry } from './DtsEntry';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { SymbolAnalyzer } from '../analyzer/SymbolAnalyzer';
import { PackageDocComment } from '../aedoc/PackageDocComment';

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
  /**
   * Generates the typings file and writes it to disk.
   *
   * @param dtsFilename    - The *.d.ts output filename
   */
  public static writeTypingsFile(context: ExtractorContext, dtsFilename: string, dtsKind: DtsRollupKind): void {
    const indentedWriter: IndentedWriter = new IndentedWriter();

    DtsRollupGenerator._generateTypingsFileContent(context, indentedWriter, dtsKind);

    FileSystem.writeFile(dtsFilename, indentedWriter.toString(), {
      convertLineEndings: NewlineKind.CrLf,
      ensureFolderExists: true
    });
  }

  private static _generateTypingsFileContent(context: ExtractorContext, indentedWriter: IndentedWriter,
    dtsKind: DtsRollupKind): void {

    indentedWriter.spacing = '';
    indentedWriter.clear();

    const packageDocCommentTextRange: ts.TextRange | undefined = PackageDocComment
      .tryFindInSourceFile(context.entryPointSourceFile, context);

    if (packageDocCommentTextRange) {
      const packageDocComment: string = context.entryPointSourceFile.text.substring(
        packageDocCommentTextRange.pos, packageDocCommentTextRange.end);
      indentedWriter.writeLine(packageDocComment);
      indentedWriter.writeLine();
    }

    // Emit the triple slash directives
    for (const typeDirectiveReference of context.dtsTypeDefinitionReferences) {
      // tslint:disable-next-line:max-line-length
      // https://github.com/Microsoft/TypeScript/blob/611ebc7aadd7a44a4c0447698bfda9222a78cb66/src/compiler/declarationEmitter.ts#L162
      indentedWriter.writeLine(`/// <reference types="${typeDirectiveReference}" />`);
    }

    // Emit the imports
    for (const dtsEntry of context.dtsEntries) {
      if (dtsEntry.astSymbol.astImport) {

        const releaseTag: ReleaseTag = context.getReleaseTagForAstSymbol(dtsEntry.astSymbol);
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
    for (const dtsEntry of context.dtsEntries) {
      if (!dtsEntry.astSymbol.astImport) {

        const releaseTag: ReleaseTag = context.getReleaseTagForAstSymbol(dtsEntry.astSymbol);
        if (this._shouldIncludeReleaseTag(releaseTag, dtsKind)) {

          // Emit all the declarations for this entry
          for (const astDeclaration of dtsEntry.astSymbol.astDeclarations || []) {

            indentedWriter.writeLine();

            const span: Span = new Span(astDeclaration.declaration);
            DtsRollupGenerator._modifySpan(context, span, dtsEntry, astDeclaration, dtsKind);
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
  private static _modifySpan(context: ExtractorContext, span: Span, dtsEntry: DtsEntry, astDeclaration: AstDeclaration,
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
        const identifierSymbol: ts.Symbol | undefined = context.typeChecker.getSymbolAtLocation(span.node);
        if (identifierSymbol) {
          const followedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(identifierSymbol, context.typeChecker);

          const referencedDtsEntry: DtsEntry | undefined = context.tryGetDtsEntryBySymbol(followedSymbol);

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
          childAstDeclaration = context.astSymbolTable.getChildAstDeclarationByNode(child.node, astDeclaration);

          const releaseTag: ReleaseTag = context.getReleaseTagForAstSymbol(childAstDeclaration.astSymbol);
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
          DtsRollupGenerator._modifySpan(context, child, dtsEntry, childAstDeclaration, dtsKind);
        }
      }
    }
  }

  private static _shouldIncludeReleaseTag(releaseTag: ReleaseTag, dtsKind: DtsRollupKind): boolean {

    switch (dtsKind) {
      case DtsRollupKind.InternalRelease:
        return true;
      case DtsRollupKind.BetaRelease:
        // NOTE: If the release tag is "None", then we don't have enough information to trim it
        return releaseTag === ReleaseTag.Beta || releaseTag === ReleaseTag.Public || releaseTag === ReleaseTag.None;
      case DtsRollupKind.PublicRelease:
        return releaseTag === ReleaseTag.Public || releaseTag === ReleaseTag.None;
    }

    throw new Error(`${DtsRollupKind[dtsKind]} is not implemented`);
  }
}
