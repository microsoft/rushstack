// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* tslint:disable:no-bitwise */

import * as ts from 'typescript';
import { FileSystem, NewlineKind } from '@microsoft/node-core-library';

import { Collector } from '../collector/Collector';
import { IndentedWriter } from '../api/IndentedWriter';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';
import { Span, SpanModification } from '../analyzer/Span';
import { ReleaseTag } from '../aedoc/ReleaseTag';
import { AstImport } from '../analyzer/AstImport';
import { CollectorEntity } from '../collector/CollectorEntity';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { SymbolAnalyzer } from '../analyzer/SymbolAnalyzer';
import { DeclarationMetadata } from '../collector/DeclarationMetadata';

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
  public static writeTypingsFile(collector: Collector, dtsFilename: string, dtsKind: DtsRollupKind): void {
    const indentedWriter: IndentedWriter = new IndentedWriter();

    DtsRollupGenerator._generateTypingsFileContent(collector, indentedWriter, dtsKind);

    FileSystem.writeFile(dtsFilename, indentedWriter.toString(), {
      convertLineEndings: NewlineKind.CrLf,
      ensureFolderExists: true
    });
  }

  private static _generateTypingsFileContent(collector: Collector, indentedWriter: IndentedWriter,
    dtsKind: DtsRollupKind): void {

    if (collector.package.tsdocParserContext) {
      indentedWriter.writeLine(collector.package.tsdocParserContext.sourceRange.toString());
      indentedWriter.writeLine();
    }

    // Emit the triple slash directives
    for (const typeDirectiveReference of collector.dtsTypeReferenceDirectives) {
      // tslint:disable-next-line:max-line-length
      // https://github.com/Microsoft/TypeScript/blob/611ebc7aadd7a44a4c0447698bfda9222a78cb66/src/compiler/declarationEmitter.ts#L162
      indentedWriter.writeLine(`/// <reference types="${typeDirectiveReference}" />`);
    }

    for (const libDirectiveReference of collector.dtsLibReferenceDirectives) {
      indentedWriter.writeLine(`/// <reference lib="${libDirectiveReference}" />`);
    }

    // Emit the imports
    for (const entity of collector.entities) {
      if (entity.astSymbol.astImport) {

        const releaseTag: ReleaseTag = collector.fetchMetadata(entity.astSymbol).releaseTag;
        if (this._shouldIncludeReleaseTag(releaseTag, dtsKind)) {
          const astImport: AstImport = entity.astSymbol.astImport;

          if (astImport.exportName === '*') {
            indentedWriter.write(`import * as ${entity.nameForEmit}`);
          } else if (entity.nameForEmit !== astImport.exportName) {
            indentedWriter.write(`import { ${astImport.exportName} as ${entity.nameForEmit} }`);
          } else {
            indentedWriter.write(`import { ${astImport.exportName} }`);
          }
          indentedWriter.writeLine(` from '${astImport.modulePath}';`);

          if (entity.exported) {
            // We write re-export as two lines: `import { Mod } from 'package'; export { Mod };`,
            // instead of a single line `export { Mod } from 'package';`.
            // Because this variable may be used by others, and we cannot know it.
            // so we always keep the `import ...` declaration, for now.
            indentedWriter.writeLine(`export { ${entity.nameForEmit} };`);
          }
        }
      }
    }

    // Emit the regular declarations
    for (const entity of collector.entities) {
      if (!entity.astSymbol.astImport) {

        const releaseTag: ReleaseTag = collector.fetchMetadata(entity.astSymbol).releaseTag;
        if (this._shouldIncludeReleaseTag(releaseTag, dtsKind)) {

          // Emit all the declarations for this entry
          for (const astDeclaration of entity.astSymbol.astDeclarations || []) {

            indentedWriter.writeLine();

            const span: Span = new Span(astDeclaration.declaration);
            DtsRollupGenerator._modifySpan(collector, span, entity, astDeclaration, dtsKind);
            indentedWriter.writeLine(span.getModifiedText());
          }
        } else {
          indentedWriter.writeLine();
          indentedWriter.writeLine(`/* Excluded from this release type: ${entity.nameForEmit} */`);
        }
      }
    }
  }

  /**
   * Before writing out a declaration, _modifySpan() applies various fixups to make it nice.
   */
  private static _modifySpan(collector: Collector, span: Span, entity: CollectorEntity,
    astDeclaration: AstDeclaration, dtsKind: DtsRollupKind): void {

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

        if (entity.exported) {
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
        // Is this a top-level variable declaration?
        // (The logic below does not apply to variable declarations that are part of an explicit "namespace" block,
        // since the compiler prefers not to emit "declare" or "export" keywords for those declarations.)
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

          if (entity.exported) {
            span.modification.prefix = 'export ' + span.modification.prefix;
          }

          const declarationMetadata: DeclarationMetadata = collector.fetchMetadata(astDeclaration);
          if (declarationMetadata.tsdocParserContext) {
            // Typically the comment for a variable declaration is attached to the outer variable statement
            // (which may possibly contain multiple variable declarations), so it's not part of the Span.
            // Instead we need to manually inject it.
            let originalComment: string = declarationMetadata.tsdocParserContext.sourceRange.toString();
            if (!/[\r\n]\s*$/.test(originalComment)) {
              originalComment += '\n';
            }
            span.modification.prefix = originalComment + span.modification.prefix;
          }

          span.modification.suffix = ';';
        }
        break;

      case ts.SyntaxKind.Identifier:
        let nameFixup: boolean = false;
        const identifierSymbol: ts.Symbol | undefined = collector.typeChecker.getSymbolAtLocation(span.node);
        if (identifierSymbol) {
          const followedSymbol: ts.Symbol = TypeScriptHelpers.followAliases(identifierSymbol, collector.typeChecker);

          const referencedEntity: CollectorEntity | undefined = collector.tryGetEntityBySymbol(followedSymbol);

          if (referencedEntity) {
            if (!referencedEntity.nameForEmit) {
              // This should never happen
              throw new Error('referencedEntry.uniqueName is undefined');
            }

            span.modification.prefix = referencedEntity.nameForEmit;
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
          childAstDeclaration = collector.astSymbolTable.getChildAstDeclarationByNode(child.node, astDeclaration);

          const releaseTag: ReleaseTag = collector.fetchMetadata(childAstDeclaration.astSymbol).releaseTag;
          if (!this._shouldIncludeReleaseTag(releaseTag, dtsKind)) {
            let nodeToTrim: Span = child;

            // If we are trimming a variable statement, then we need to trim the outer VariableDeclarationList
            // as well.
            if (child.kind === ts.SyntaxKind.VariableDeclaration) {
              const variableStatement: Span | undefined
                = child.findFirstParent(ts.SyntaxKind.VariableStatement);
              if (variableStatement !== undefined) {
                nodeToTrim = variableStatement;
              }
            }

            const modification: SpanModification = nodeToTrim.modification;

            // Yes, trim it and stop here
            const name: string = childAstDeclaration.astSymbol.localName;
            modification.omitChildren = true;

            modification.prefix = `/* Excluded from this release type: ${name} */`;
            modification.suffix = '';

            if (nodeToTrim.children.length > 0) {
              // If there are grandchildren, then keep the last grandchild's separator,
              // since it often has useful whitespace
              modification.suffix = nodeToTrim.children[nodeToTrim.children.length - 1].separator;
            }

            if (nodeToTrim.nextSibling) {
              // If the thing we are trimming is followed by a comma, then trim the comma also.
              // An example would be an enum member.
              if (nodeToTrim.nextSibling.kind === ts.SyntaxKind.CommaToken) {
                // Keep its separator since it often has useful whitespace
                modification.suffix += nodeToTrim.nextSibling.separator;
                nodeToTrim.nextSibling.modification.skipAll();
              }
            }

            trimmed = true;
          }
        }

        if (!trimmed) {
          DtsRollupGenerator._modifySpan(collector, child, entity, childAstDeclaration, dtsKind);
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
