// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

import { InternalError } from '@rushstack/node-core-library';

import type { CollectorEntity } from '../collector/CollectorEntity';
import { AstImport, AstImportKind } from '../analyzer/AstImport';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import type { Collector } from '../collector/Collector';
import type { Span } from '../analyzer/Span';
import type { IndentedWriter } from './IndentedWriter';
import { SourceFileLocationFormatter } from '../analyzer/SourceFileLocationFormatter';

/**
 * Some common code shared between DtsRollupGenerator and ApiReportGenerator.
 */
export class DtsEmitHelpers {
  public static emitImport(
    writer: IndentedWriter,
    collectorEntity: CollectorEntity,
    astImport: AstImport
  ): void {
    const importPrefix: string = astImport.isTypeOnlyEverywhere ? 'import type' : 'import';

    switch (astImport.importKind) {
      case AstImportKind.DefaultImport:
        if (collectorEntity.nameForEmit !== astImport.exportName) {
          writer.write(`${importPrefix} { default as ${collectorEntity.nameForEmit} }`);
        } else {
          writer.write(`${importPrefix} ${astImport.exportName}`);
        }
        writer.writeLine(` from '${astImport.modulePath}';`);
        break;
      case AstImportKind.NamedImport:
        if (collectorEntity.nameForEmit === astImport.exportName) {
          writer.write(`${importPrefix} { ${astImport.exportName} }`);
        } else {
          writer.write(`${importPrefix} { ${astImport.exportName} as ${collectorEntity.nameForEmit} }`);
        }
        writer.writeLine(` from '${astImport.modulePath}';`);
        break;
      case AstImportKind.StarImport:
        writer.writeLine(
          `${importPrefix} * as ${collectorEntity.nameForEmit} from '${astImport.modulePath}';`
        );
        break;
      case AstImportKind.EqualsImport:
        writer.writeLine(
          `${importPrefix} ${collectorEntity.nameForEmit} = require('${astImport.modulePath}');`
        );
        break;
      case AstImportKind.ImportType:
        if (!astImport.exportName) {
          writer.writeLine(
            `${importPrefix} * as ${collectorEntity.nameForEmit} from '${astImport.modulePath}';`
          );
        } else {
          const topExportName: string = astImport.exportName.split('.')[0];
          if (collectorEntity.nameForEmit === topExportName) {
            writer.write(`${importPrefix} { ${topExportName} }`);
          } else {
            writer.write(`${importPrefix} { ${topExportName} as ${collectorEntity.nameForEmit} }`);
          }
          writer.writeLine(` from '${astImport.modulePath}';`);
        }
        break;
      default:
        throw new InternalError('Unimplemented AstImportKind');
    }
  }

  public static emitNamedExport(
    writer: IndentedWriter,
    exportName: string,
    collectorEntity: CollectorEntity
  ): void {
    if (exportName === ts.InternalSymbolName.Default) {
      writer.writeLine(`export default ${collectorEntity.nameForEmit};`);
    } else if (collectorEntity.nameForEmit !== exportName) {
      writer.writeLine(`export { ${collectorEntity.nameForEmit} as ${exportName} }`);
    } else {
      writer.writeLine(`export { ${exportName} }`);
    }
  }

  public static emitStarExports(writer: IndentedWriter, collector: Collector): void {
    if (collector.starExportedExternalModulePaths.length > 0) {
      writer.writeLine();
      for (const starExportedExternalModulePath of collector.starExportedExternalModulePaths) {
        writer.writeLine(`export * from "${starExportedExternalModulePath}";`);
      }
    }
  }

  public static modifyImportTypeSpan(
    collector: Collector,
    span: Span,
    astDeclaration: AstDeclaration,
    modifyNestedSpan: (childSpan: Span, childAstDeclaration: AstDeclaration) => void
  ): void {
    const node: ts.ImportTypeNode = span.node as ts.ImportTypeNode;
    const referencedEntity: CollectorEntity | undefined = collector.tryGetEntityForNode(node);

    if (referencedEntity) {
      if (!referencedEntity.nameForEmit) {
        // This should never happen

        throw new InternalError('referencedEntry.nameForEmit is undefined');
      }

      let typeArgumentsText: string = '';

      if (node.typeArguments && node.typeArguments.length > 0) {
        // Type arguments have to be processed and written to the document
        const lessThanTokenPos: number = span.children.findIndex(
          (childSpan) => childSpan.node.kind === ts.SyntaxKind.LessThanToken
        );
        const greaterThanTokenPos: number = span.children.findIndex(
          (childSpan) => childSpan.node.kind === ts.SyntaxKind.GreaterThanToken
        );

        if (lessThanTokenPos < 0 || greaterThanTokenPos <= lessThanTokenPos) {
          throw new InternalError(
            `Invalid type arguments: ${node.getText()}\n` +
              SourceFileLocationFormatter.formatDeclaration(node)
          );
        }

        const typeArgumentsSpans: Span[] = span.children.slice(lessThanTokenPos + 1, greaterThanTokenPos);

        // Apply modifications to Span elements of typeArguments
        typeArgumentsSpans.forEach((childSpan) => {
          const childAstDeclaration: AstDeclaration = AstDeclaration.isSupportedSyntaxKind(childSpan.kind)
            ? collector.astSymbolTable.getChildAstDeclarationByNode(childSpan.node, astDeclaration)
            : astDeclaration;

          modifyNestedSpan(childSpan, childAstDeclaration);
        });

        const typeArgumentsStrings: string[] = typeArgumentsSpans.map((childSpan) =>
          childSpan.getModifiedText()
        );
        typeArgumentsText = `<${typeArgumentsStrings.join(', ')}>`;
      }

      const separatorAfter: string = /(\s*)$/.exec(span.getText())?.[1] ?? '';

      if (
        referencedEntity.astEntity instanceof AstImport &&
        referencedEntity.astEntity.importKind === AstImportKind.ImportType &&
        referencedEntity.astEntity.exportName
      ) {
        // For an ImportType with a namespace chain, only the top namespace is imported.
        // Must add the original nested qualifiers to the rolled up import.
        const qualifiersText: string = node.qualifier?.getText() ?? '';
        const nestedQualifiersStart: number = qualifiersText.indexOf('.');
        // Including the leading "."
        const nestedQualifiersText: string =
          nestedQualifiersStart >= 0 ? qualifiersText.substring(nestedQualifiersStart) : '';

        const replacement: string = `${referencedEntity.nameForEmit}${nestedQualifiersText}${typeArgumentsText}${separatorAfter}`;

        span.modification.skipAll();
        span.modification.prefix = replacement;
      } else {
        // Replace with internal symbol or AstImport
        span.modification.skipAll();
        span.modification.prefix = `${referencedEntity.nameForEmit}${typeArgumentsText}${separatorAfter}`;
      }
    }
  }
}
