// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as ts from 'typescript';
import * as path from 'path';

import { Path } from './Path';
import { PacketAnalyzer } from './PackletAnalyzer';

enum RefFileKind {
  Import,
  ReferenceFile,
  TypeReferenceDirective
}

// TypeScript compiler internal:
// https://github.com/microsoft/TypeScript/blob/5ecdcef4cecfcdc86bd681b377636422447507d7/src/compiler/program.ts#L541
interface RefFile {
  referencedFileName: string;
  kind: RefFileKind;
  index: number;
  file: string;
}

/**
 * Represents a packlet that imports another packlet.
 */
export interface IPackletImport {
  /**
   * The name of the packlet being imported.
   */
  packletName: string;

  /**
   * The absolute path of the file that imports the packlet.
   */
  fromFilePath: string;
}

/**
 * Used to build a linked list of imports that represent a circular dependency.
 */
interface IImportListNode extends IPackletImport {
  /**
   * The previous link in the linked list.
   */
  previousNode: IImportListNode | undefined;
}

export class DependencyAnalyzer {
  private static walkImports(
    packletName: string,
    startingPackletName: string,
    refFileMap: Map<string, RefFile[]>,
    program: ts.Program,
    packletsFolderPath: string,
    visitedPacklets: Set<string>,
    previousNode: IImportListNode | undefined
  ): IImportListNode | undefined {
    const packletEntryPoint: string = path.join(packletsFolderPath, packletName, 'index');

    const tsSourceFile: ts.SourceFile | undefined =
      program.getSourceFile(packletEntryPoint + '.ts') || program.getSourceFile(packletEntryPoint + '.tsx');
    if (!tsSourceFile) {
      return undefined;
    }

    const refFiles: RefFile[] | undefined = refFileMap.get((tsSourceFile as any).path as any);
    if (!refFiles) {
      return undefined;
    }

    for (const refFile of refFiles) {
      if (refFile.kind === RefFileKind.Import) {
        const referencingFilePath: string = refFile.file;

        if (Path.isUnder(referencingFilePath, packletsFolderPath)) {
          const referencingRelativePath: string = path.relative(packletsFolderPath, referencingFilePath);
          const referencingPathParts: string[] = referencingRelativePath.split(/[\/\\]+/);
          const referencingPackletName: string = referencingPathParts[0];

          if (!visitedPacklets.has(packletName)) {
            visitedPacklets.add(packletName);

            const importListNode: IImportListNode = {
              previousNode: previousNode,
              fromFilePath: referencingFilePath,
              packletName: packletName
            };

            if (referencingPackletName === startingPackletName) {
              return importListNode;
            }

            const result: IImportListNode | undefined = DependencyAnalyzer.walkImports(
              referencingPackletName,
              startingPackletName,
              refFileMap,
              program,
              packletsFolderPath,
              visitedPacklets,
              importListNode
            );
            if (result) {
              return result;
            }
          }
        }
      }
    }

    return undefined;
  }

  public static detectCircularImport(
    packetAnalyzer: PacketAnalyzer,
    program: ts.Program
  ): IPackletImport[] | undefined {
    const refFileMap: Map<string, RefFile[]> = (program as any).getRefFileMap();
    const visitedPacklets: Set<string> = new Set();

    const listNode: IImportListNode | undefined = DependencyAnalyzer.walkImports(
      packetAnalyzer.inputFilePackletName!,
      packetAnalyzer.inputFilePackletName!,
      refFileMap,
      program,
      packetAnalyzer.packletsFolderPath!,
      visitedPacklets,
      undefined // previousNode
    );

    if (listNode) {
      const packletImports: IPackletImport[] = [];
      for (let current: IImportListNode | undefined = listNode; current; current = current.previousNode) {
        packletImports.push({ fromFilePath: current.fromFilePath, packletName: current.packletName });
      }
      return packletImports;
    }

    return undefined;
  }
}
