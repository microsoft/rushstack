// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as ts from 'typescript';

import { Path } from './Path.ts';
import type { PackletAnalyzer } from './PackletAnalyzer.ts';

enum RefFileKind {
  Import,
  ReferenceFile,
  TypeReferenceDirective
}

// TypeScript compiler internal:
// Version range: >= 3.6.0, <= 4.2.0
// https://github.com/microsoft/TypeScript/blob/5ecdcef4cecfcdc86bd681b377636422447507d7/src/compiler/program.ts#L541
interface IRefFile {
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

// TypeScript compiler internal:
// Version range: > 4.2.0
// https://github.com/microsoft/TypeScript/blob/2eca17d7c1a3fb2b077f3a910d5019d74b6f07a0/src/compiler/types.ts#L3693
enum FileIncludeKind {
  RootFile,
  SourceFromProjectReference,
  OutputFromProjectReference,
  Import,
  ReferenceFile,
  TypeReferenceDirective,
  LibFile,
  LibReferenceDirective,
  AutomaticTypeDirectiveFile
}

// TypeScript compiler internal:
// Version range: > 4.2.0
// https://github.com/microsoft/TypeScript/blob/2eca17d7c1a3fb2b077f3a910d5019d74b6f07a0/src/compiler/types.ts#L3748
interface IFileIncludeReason {
  kind: FileIncludeKind;
  file: string | undefined;
}

interface ITsProgramInternals extends ts.Program {
  // TypeScript compiler internal:
  // Version range: >= 3.6.0, <= 4.2.0
  // https://github.com/microsoft/TypeScript/blob/5ecdcef4cecfcdc86bd681b377636422447507d7/src/compiler/types.ts#L3723
  getRefFileMap?: () => Map<string, IRefFile[]> | undefined;

  // TypeScript compiler internal:
  // Version range: > 4.2.0
  // https://github.com/microsoft/TypeScript/blob/2eca17d7c1a3fb2b077f3a910d5019d74b6f07a0/src/compiler/types.ts#L3871
  getFileIncludeReasons?: () => Map<string, IFileIncludeReason[]>;
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
   * @param fileIncludeReasonsMap - the compiler's data structure describing import relationships
   * @param program - the compiler's `ts.Program` object
   * @param packletsFolderPath - the absolute path of the "src/packlets" folder.
   * @param visitedPacklets - the set of packlets that have already been visited in this traversal
   * @param previousNode - a linked list of import statements that brought us to this step in the traversal
   */
  private static _walkImports(
    packletName: string,
    startingPackletName: string,
    refFileMap: Map<string, IRefFile[]> | undefined,
    fileIncludeReasonsMap: Map<string, IFileIncludeReason[]> | undefined,
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

    const referencingFilePaths: string[] = [];

    if (refFileMap) {
      // TypeScript version range: >= 3.6.0, <= 4.2.0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const refFiles: IRefFile[] | undefined = refFileMap.get((tsSourceFile as any).path);
      if (refFiles) {
        for (const refFile of refFiles) {
          if (refFile.kind === RefFileKind.Import) {
            referencingFilePaths.push(refFile.file);
          }
        }
      }
    } else if (fileIncludeReasonsMap) {
      // Typescript version range: > 4.2.0
      const fileIncludeReasons: IFileIncludeReason[] | undefined = fileIncludeReasonsMap.get(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tsSourceFile as any).path
      );
      if (fileIncludeReasons) {
        for (const fileIncludeReason of fileIncludeReasons) {
          if (fileIncludeReason.kind === FileIncludeKind.Import) {
            if (fileIncludeReason.file) {
              referencingFilePaths.push(fileIncludeReason.file);
            }
          }
        }
      }
    }

    for (const referencingFilePath of referencingFilePaths) {
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
            fileIncludeReasonsMap,
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
    const programInternals: ITsProgramInternals = program;

    let refFileMap: Map<string, IRefFile[]> | undefined;
    let fileIncludeReasonsMap: Map<string, IFileIncludeReason[]> | undefined;

    if (programInternals.getRefFileMap) {
      // TypeScript version range: >= 3.6.0, <= 4.2.0
      refFileMap = programInternals.getRefFileMap();
    } else if (programInternals.getFileIncludeReasons) {
      // Typescript version range: > 4.2.0
      fileIncludeReasonsMap = programInternals.getFileIncludeReasons();
    } else {
      // If you encounter this error, please report a bug
      throw new Error(
        'Your TypeScript compiler version is not supported; please upgrade @rushstack/eslint-plugin-packlets' +
          ' or report a GitHub issue'
      );
    }

    const visitedPacklets: Set<string> = new Set();

    const listNode: IImportListNode | undefined = DependencyAnalyzer._walkImports(
      packletName,
      packletName,
      refFileMap,
      fileIncludeReasonsMap,
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
