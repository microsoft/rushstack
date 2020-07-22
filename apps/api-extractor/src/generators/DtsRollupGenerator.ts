// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/* eslint-disable no-bitwise */

import * as ts from 'typescript';
import { FileSystem, NewlineKind, InternalError } from '@rushstack/node-core-library';
import { ReleaseTag } from '@microsoft/api-extractor-model';

import { Collector } from '../collector/Collector';
import { TypeScriptHelpers } from '../analyzer/TypeScriptHelpers';
import { Span, SpanModification } from '../analyzer/Span';
import { AstImport } from '../analyzer/AstImport';
import { CollectorEntity } from '../collector/CollectorEntity';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { ApiItemMetadata } from '../collector/ApiItemMetadata';
import { AstSymbol } from '../analyzer/AstSymbol';
import { SymbolMetadata } from '../collector/SymbolMetadata';
import { StringWriter } from './StringWriter';
import { DtsEmitHelpers } from './DtsEmitHelpers';
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
  public static writeTypingsFile(
    collector: Collector,
    dtsFilename: string,
    dtsKind: DtsRollupKind,
    newlineKind: NewlineKind
  ): void {
    const stringWriter: StringWriter = new StringWriter();

    DtsRollupGenerator._generateTypingsFileContent(collector, stringWriter, dtsKind);

    FileSystem.writeFile(dtsFilename, stringWriter.toString(), {
      convertLineEndings: newlineKind,
      ensureFolderExists: true
    });
  }

  private static _generateTypingsFileContent(
    collector: Collector,
    stringWriter: StringWriter,
    dtsKind: DtsRollupKind
  ): void {
    if (collector.workingPackage.tsdocParserContext) {
      stringWriter.writeLine(collector.workingPackage.tsdocParserContext.sourceRange.toString());
      stringWriter.writeLine();
    }

    // Emit the triple slash directives
    for (const typeDirectiveReference of collector.dtsTypeReferenceDirectives) {
      // https://github.com/microsoft/TypeScript/blob/611ebc7aadd7a44a4c0447698bfda9222a78cb66/src/compiler/declarationEmitter.ts#L162
      stringWriter.writeLine(`/// <reference types="${typeDirectiveReference}" />`);
    }

    for (const libDirectiveReference of collector.dtsLibReferenceDirectives) {
      stringWriter.writeLine(`/// <reference lib="${libDirectiveReference}" />`);
    }

    // Emit the imports
    for (const entity of collector.entities) {
      if (entity.astEntity instanceof AstImport) {
        const astImport: AstImport = entity.astEntity;

        // For example, if the imported API comes from an external package that supports AEDoc,
        // and it was marked as `@internal`, then don't emit it.
        const symbolMetadata: SymbolMetadata | undefined = collector.tryFetchMetadataForAstEntity(astImport);
        const maxEffectiveReleaseTag: ReleaseTag = symbolMetadata
          ? symbolMetadata.maxEffectiveReleaseTag
          : ReleaseTag.None;

        if (this._shouldIncludeReleaseTag(maxEffectiveReleaseTag, dtsKind)) {
          DtsEmitHelpers.emitImport(stringWriter, entity, astImport);
        }
      }
    }

    // Emit the regular declarations
    for (const entity of collector.entities) {
      const symbolMetadata: SymbolMetadata | undefined = collector.tryFetchMetadataForAstEntity(
        entity.astEntity
      );
      const maxEffectiveReleaseTag: ReleaseTag = symbolMetadata
        ? symbolMetadata.maxEffectiveReleaseTag
        : ReleaseTag.None;

      if (!this._shouldIncludeReleaseTag(maxEffectiveReleaseTag, dtsKind)) {
        if (!collector.extractorConfig.omitTrimmingComments) {
          stringWriter.writeLine();
          stringWriter.writeLine(`/* Excluded from this release type: ${entity.nameForEmit} */`);
        }
        continue;
      }

      if (entity.astEntity instanceof AstSymbol) {
        // Emit all the declarations for this entry
        for (const astDeclaration of entity.astEntity.astDeclarations || []) {
          const apiItemMetadata: ApiItemMetadata = collector.fetchApiItemMetadata(astDeclaration);

          if (!this._shouldIncludeReleaseTag(apiItemMetadata.effectiveReleaseTag, dtsKind)) {
            if (!collector.extractorConfig.omitTrimmingComments) {
              stringWriter.writeLine();
              stringWriter.writeLine(
                `/* Excluded declaration from this release type: ${entity.nameForEmit} */`
              );
            }
            continue;
          } else {
            const span: Span = new Span(astDeclaration.declaration);
            DtsRollupGenerator._modifySpan(collector, span, entity, astDeclaration, dtsKind);
            stringWriter.writeLine();
            stringWriter.writeLine(span.getModifiedText());
          }
        }
      }

      if (!entity.shouldInlineExport) {
        for (const exportName of entity.exportNames) {
          DtsEmitHelpers.emitNamedExport(stringWriter, exportName, entity);
        }
      }
    }

    DtsEmitHelpers.emitStarExports(stringWriter, collector);

    // Emit "export { }" which is a special directive that prevents consumers from importing declarations
    // that don't have an explicit "export" modifier.
    stringWriter.writeLine();
    stringWriter.writeLine('export { }');
  }

  /**
   * Before writing out a declaration, _modifySpan() applies various fixups to make it nice.
   */
  private static _modifySpan(
    collector: Collector,
    span: Span,
    entity: CollectorEntity,
    astDeclaration: AstDeclaration,
    dtsKind: DtsRollupKind
  ): void {
    const previousSpan: Span | undefined = span.previousSibling;

    let recurseChildren: boolean = true;
    switch (span.kind) {
      case ts.SyntaxKind.JSDocComment:
        // If the @packageDocumentation comment seems to be attached to one of the regular API items,
        // omit it.  It gets explictly emitted at the top of the file.
        if (span.node.getText().match(/(?:\s|\*)@packageDocumentation(?:\s|\*)/gi)) {
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

        if (entity.shouldInlineExport) {
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
          const list: ts.VariableDeclarationList | undefined = TypeScriptHelpers.matchAncestor(span.node, [
            ts.SyntaxKind.VariableDeclarationList,
            ts.SyntaxKind.VariableDeclaration
          ]);
          if (!list) {
            // This should not happen unless the compiler API changes somehow
            throw new InternalError('Unsupported variable declaration');
          }
          const listPrefix: string = list
            .getSourceFile()
            .text.substring(list.getStart(), list.declarations[0].getStart());
          span.modification.prefix = 'declare ' + listPrefix + span.modification.prefix;
          span.modification.suffix = ';';

          if (entity.shouldInlineExport) {
            span.modification.prefix = 'export ' + span.modification.prefix;
          }

          const declarationMetadata: DeclarationMetadata = collector.fetchDeclarationMetadata(astDeclaration);
          if (declarationMetadata.tsdocParserContext) {
            // Typically the comment for a variable declaration is attached to the outer variable statement
            // (which may possibly contain multiple variable declarations), so it's not part of the Span.
            // Instead we need to manually inject it.
            let originalComment: string = declarationMetadata.tsdocParserContext.sourceRange.toString();
            if (!/\r?\n\s*$/.test(originalComment)) {
              originalComment += '\n';
            }
            span.modification.prefix = originalComment + span.modification.prefix;
          }
        }
        break;

      case ts.SyntaxKind.Identifier:
        const referencedEntity: CollectorEntity | undefined = collector.tryGetEntityForIdentifierNode(
          span.node as ts.Identifier
        );

        if (referencedEntity) {
          if (!referencedEntity.nameForEmit) {
            // This should never happen
            throw new InternalError('referencedEntry.nameForEmit is undefined');
          }

          span.modification.prefix = referencedEntity.nameForEmit;
          // For debugging:
          // span.modification.prefix += '/*R=FIX*/';
        } else {
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
        if (AstDeclaration.isSupportedSyntaxKind(child.kind)) {
          childAstDeclaration = collector.astSymbolTable.getChildAstDeclarationByNode(
            child.node,
            astDeclaration
          );
          const releaseTag: ReleaseTag = collector.fetchApiItemMetadata(childAstDeclaration)
            .effectiveReleaseTag;

          if (!this._shouldIncludeReleaseTag(releaseTag, dtsKind)) {
            let nodeToTrim: Span = child;

            // If we are trimming a variable statement, then we need to trim the outer VariableDeclarationList
            // as well.
            if (child.kind === ts.SyntaxKind.VariableDeclaration) {
              const variableStatement: Span | undefined = child.findFirstParent(
                ts.SyntaxKind.VariableStatement
              );
              if (variableStatement !== undefined) {
                nodeToTrim = variableStatement;
              }
            }

            const modification: SpanModification = nodeToTrim.modification;

            // Yes, trim it and stop here
            const name: string = childAstDeclaration.astSymbol.localName;
            modification.omitChildren = true;

            if (!collector.extractorConfig.omitTrimmingComments) {
              modification.prefix = `/* Excluded from this release type: ${name} */`;
            } else {
              modification.prefix = '';
            }
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
        return (
          releaseTag === ReleaseTag.Beta || releaseTag === ReleaseTag.Public || releaseTag === ReleaseTag.None
        );
      case DtsRollupKind.PublicRelease:
        return releaseTag === ReleaseTag.Public || releaseTag === ReleaseTag.None;
    }

    throw new Error(`${DtsRollupKind[dtsKind]} is not implemented`);
  }
}
