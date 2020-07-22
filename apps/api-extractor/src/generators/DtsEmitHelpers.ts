// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as ts from 'typescript';

import { InternalError } from '@rushstack/node-core-library';
import { CollectorEntity } from '../collector/CollectorEntity';
import { AstImport, AstImportKind } from '../analyzer/AstImport';
import { StringWriter } from './StringWriter';
import { Collector } from '../collector/Collector';

/**
 * Some common code shared between DtsRollupGenerator and ApiReportGenerator.
 */
export class DtsEmitHelpers {
  public static emitImport(stringWriter: StringWriter, collectorEntity: CollectorEntity, astImport: AstImport): void {
    switch (astImport.importKind) {
      case AstImportKind.DefaultImport:
        if (collectorEntity.nameForEmit !== astImport.exportName) {
          stringWriter.write(`import { default as ${collectorEntity.nameForEmit} }`);
        } else {
          stringWriter.write(`import ${astImport.exportName}`);
        }
        stringWriter.writeLine(` from '${astImport.modulePath}';`);
        break;
      case AstImportKind.NamedImport:
        if (collectorEntity.nameForEmit !== astImport.exportName) {
          stringWriter.write(`import { ${astImport.exportName} as ${collectorEntity.nameForEmit} }`);
        } else {
          stringWriter.write(`import { ${astImport.exportName} }`);
        }
        stringWriter.writeLine(` from '${astImport.modulePath}';`);
        break;
      case AstImportKind.StarImport:
        stringWriter.writeLine(`import * as ${collectorEntity.nameForEmit} from '${astImport.modulePath}';`);
        break;
      case AstImportKind.EqualsImport:
        stringWriter.writeLine(`import ${collectorEntity.nameForEmit} = require('${astImport.modulePath}');`);
        break;
      default:
        throw new InternalError('Unimplemented AstImportKind');
    }
  }

  public static emitNamedExport(stringWriter: StringWriter, exportName: string,
    collectorEntity: CollectorEntity): void {

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
}
