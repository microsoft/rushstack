// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as ts from 'typescript';

import { Path } from './Path';
import { PackletAnalyzer } from './PackletAnalyzer';

enum RefFileKind {
  Import,
  ReferenceFile,
  TypeReferenceDirective
}

// TypeScript compiler internal:
// https://github.com/microsoft/TypeScript/blob/5ecdcef4cecfcdc86bd681b377636422447507d7/src/compiler/program.ts#L541
interface RefFile {
  // The absolute path of the module that was imported.
  // (Normalized to an all lowercase ts.Path string.)
  referencedFileName: string;
  // The kind of reference.
  kind: RefFileKind;
  // An index indicating the order in which items occur in a compound expression
  index: number;

  // The absolute path of the source file containing the import statement.
  // (Normalized to an all lowercase ts.Path string.)
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
  /**
   * @param packletName - the packlet to be checked next in our traversal
   * @param startingPackletName - the packlet that we started with; if the traversal reaches this packlet,
   *   then a circular dependency has been detected
   * @param refFileMap - the compiler's `refFileMap` data structure describing import relationships
   * @param program - the compiler's `ts.Program` object
   * @param packletsFolderPath - the absolute path of the "src/packlets" folder.
   * @param visitedPacklets - the set of packlets that have already been visited in this traversal
   * @param previousNode - a linked list of import statements that brought us to this step in the traversal
   */
  private static _walkImports(
    packletName: string,
    startingPackletName: string,
    refFileMap: Map<string, RefFile[]>,
    program: ts.Program,
    packletsFolderPath: string,
    visitedPacklets: Set<string>,
    previousNode: IImportListNode | undefined
  ): IImportListNode | undefined {
    visitedPacklets.add(packletName);

    const packletEntryPoint: string = Path.join(packletsFolderPath, packletName, 'index');

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

        // Is it a reference to a packlet?
        if (Path.isUnder(referencingFilePath, packletsFolderPath)) {
          const referencingRelativePath: string = Path.relative(packletsFolderPath, referencingFilePath);
          const referencingPathParts: string[] = referencingRelativePath.split(/[\/\\]+/);
          const referencingPackletName: string = referencingPathParts[0];

          // Did we return to where we started from?
          if (referencingPackletName === startingPackletName) {
            // Ignore the degenerate case where the starting node imports itself,
            // since @rushstack/packlets/mechanics will already report that.
            if (previousNode) {
              // Make a new linked list node to record this step of the traversal
              const importListNode: IImportListNode = {
                previousNode: previousNode,
                fromFilePath: referencingFilePath,
                packletName: packletName
              };

              // The traversal has returned to the packlet that we started from;
              // this means we have detected a circular dependency
              return importListNode;
            }
          }

          // Have we already analyzed this packlet?
          if (!visitedPacklets.has(referencingPackletName)) {
            // Make a new linked list node to record this step of the traversal
            const importListNode: IImportListNode = {
              previousNode: previousNode,
              fromFilePath: referencingFilePath,
              packletName: packletName
            };

            const result: IImportListNode | undefined = DependencyAnalyzer._walkImports(
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

  /**
   * For the specified packlet, trace all modules that import it, looking for a circular dependency
   * between packlets.  If found, an array is returned describing the import statements that cause
   * the problem.
   *
   * @remarks
   * For example, suppose we have files like this:
   *
   * ```
   * src/packlets/logging/index.ts
   * src/packlets/logging/Logger.ts --> imports "../data-model"
   * src/packlets/data-model/index.ts
   * src/packlets/data-model/DataModel.ts --> imports "../logging"
   * ```
   *
   * The returned array would be:
   * ```ts
   * [
   *   { packletName: "logging",    fromFilePath: "/path/to/src/packlets/data-model/DataModel.ts" },
   *   { packletName: "data-model", fromFilePath: "/path/to/src/packlets/logging/Logger.ts" },
   * ]
   * ```
   *
   * If there is more than one circular dependency chain, only the first one that is encountered
   * will be returned.
   */
  public static checkEntryPointForCircularImport(
    packletName: string,
    packletAnalyzer: PackletAnalyzer,
    program: ts.Program
  ): IPackletImport[] | undefined {
    const refFileMap: Map<string, RefFile[]> = (program as any).getRefFileMap();
    const visitedPacklets: Set<string> = new Set();

    const listNode: IImportListNode | undefined = DependencyAnalyzer._walkImports(
      packletName,
      packletName,
      refFileMap,
      program,
      packletAnalyzer.packletsFolderPath!,
      visitedPacklets,
      undefined // previousNode
    );

    if (listNode) {
      // Convert the linked list to an array
      const packletImports: IPackletImport[] = [];
      for (let current: IImportListNode | undefined = listNode; current; current = current.previousNode) {
        packletImports.push({ fromFilePath: current.fromFilePath, packletName: current.packletName });
      }
      return packletImports;
    }

    return undefined;
  }
}
