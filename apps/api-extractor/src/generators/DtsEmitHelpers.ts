// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

import { InternalError } from '@rushstack/node-core-library';
import { CollectorEntity } from '../collector/CollectorEntity';
import { AstImport, AstImportKind } from '../analyzer/AstImport';
import { AstDeclaration } from '../analyzer/AstDeclaration';
import { StringWriter } from './StringWriter';
import { Collector } from '../collector/Collector';
import { Span } from '../analyzer/Span';

/**
 * Some common code shared between DtsRollupGenerator and ApiReportGenerator.
 */
export class DtsEmitHelpers {
  public static emitImport(
    stringWriter: StringWriter,
    collectorEntity: CollectorEntity,
    astImport: AstImport
  ): void {
    const importPrefix: string = astImport.isTypeOnlyEverywhere ? 'import type' : 'import';

    switch (astImport.importKind) {
      case AstImportKind.DefaultImport:
        if (collectorEntity.nameForEmit !== astImport.exportName) {
          stringWriter.write(`${importPrefix} { default as ${collectorEntity.nameForEmit} }`);
        } else {
          stringWriter.write(`${importPrefix} ${astImport.exportName}`);
        }
        stringWriter.writeLine(` from '${astImport.modulePath}';`);
        break;
      case AstImportKind.NamedImport:
        if (collectorEntity.nameForEmit === astImport.exportName) {
          stringWriter.write(`${importPrefix} { ${astImport.exportName} }`);
        } else {
          stringWriter.write(`${importPrefix} { ${astImport.exportName} as ${collectorEntity.nameForEmit} }`);
        }
        stringWriter.writeLine(` from '${astImport.modulePath}';`);
        break;
      case AstImportKind.StarImport:
        stringWriter.writeLine(
          `${importPrefix} * as ${collectorEntity.nameForEmit} from '${astImport.modulePath}';`
        );
        break;
      case AstImportKind.EqualsImport:
        stringWriter.writeLine(
          `${importPrefix} ${collectorEntity.nameForEmit} = require('${astImport.modulePath}');`
        );
        break;
      case AstImportKind.ImportType:
        if (!astImport.exportName) {
          stringWriter.writeLine(
            `${importPrefix} * as ${collectorEntity.nameForEmit} from '${astImport.modulePath}';`
          );
        } else {
          const topExportName: string = astImport.exportName.split('.')[0];
          if (collectorEntity.nameForEmit === topExportName) {
            stringWriter.write(`${importPrefix} { ${topExportName} }`);
          } else {
            stringWriter.write(`${importPrefix} { ${topExportName} as ${collectorEntity.nameForEmit} }`);
          }
          stringWriter.writeLine(` from '${astImport.modulePath}';`);
        }
        break;
      default:
        throw new InternalError('Unimplemented AstImportKind');
    }
  }

  public static emitNamedExport(
    stringWriter: StringWriter,
    exportName: string,
    collectorEntity: CollectorEntity
  ): void {
    if (exportName === ts.InternalSymbolName.Default) {
      stringWriter.writeLine(`export default ${collectorEntity.nameForEmit};`);
    } else if (collectorEntity.nameForEmit !== exportName) {
      stringWriter.writeLine(`export { ${collectorEntity.nameForEmit} as ${exportName} }`);
    } else {
      stringWriter.writeLine(`export { ${exportName} }`);
    }
  }

  public static emitStarExports(stringWriter: StringWriter, collector: Collector): void {
    if (collector.starExportedExternalModulePaths.length > 0) {
      stringWriter.writeLine();
      for (const starExportedExternalModulePath of collector.starExportedExternalModulePaths) {
        stringWriter.writeLine(`export * from "${starExportedExternalModulePath}";`);
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
          throw new InternalError('Invalid type arguments:\n' + node.getText());
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

        const replacement: string = `${referencedEntity.nameForEmit}${nestedQualifiersText}${typeArgumentsText}`;

        span.modification.skipAll();
        span.modification.prefix = replacement;
      } else {
        // Replace with internal symbol or AstImport

        span.modification.skipAll();
        span.modification.prefix = `${referencedEntity.nameForEmit}${typeArgumentsText}`;
      }
    }
  }
}
