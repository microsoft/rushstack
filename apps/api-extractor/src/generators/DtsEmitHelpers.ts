// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

import { InternalError } from '@rushstack/node-core-library';
import { CollectorEntity } from '../collector/CollectorEntity';
import { AstImport, AstImportKind } from '../analyzer/AstImport';
import { IndentedWriter } from './IndentedWriter';
import { Collector } from '../collector/Collector';

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
        if (collectorEntity.nameForEmit !== astImport.exportName) {
          writer.write(`${importPrefix} { ${astImport.exportName} as ${collectorEntity.nameForEmit} }`);
        } else {
          writer.write(`${importPrefix} { ${astImport.exportName} }`);
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
}
