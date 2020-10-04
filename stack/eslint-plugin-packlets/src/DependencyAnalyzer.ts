// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type * as ts from 'typescript';
import * as path from 'path';

import { Path } from './Path';
import { IResult } from './PackletAnalyzer';

export enum RefFileKind {
  Import,
  ReferenceFile,
  TypeReferenceDirective
}

interface RefFile {
  referencedFileName: string;
  kind: RefFileKind;
  index: number;
  file: string;
}

export interface ILink {
  previous: ILink | undefined;
  packletName: string;
  fromFilePath: string;
}

export function loop(
  packletName: string,
  startingPackletName: string,
  refFileMap: Map<string, RefFile[]>,
  program: ts.Program,
  packletsFolderPath: string,
  visitedPacklets: Set<string>,
  previousLink: ILink | undefined
): ILink | undefined {
  const packletEntryPoint: string = path.join(packletsFolderPath, packletName, 'index');

  const tsSourceFile: ts.SourceFile | undefined =
    program.getSourceFile(packletEntryPoint + '.ts') || program.getSourceFile(packletEntryPoint + '.tsx');
  if (tsSourceFile) {
    const refFiles: RefFile[] | undefined = refFileMap.get((tsSourceFile as any).path as any);
    if (refFiles) {
      for (const refFile of refFiles) {
        if (refFile.kind === RefFileKind.Import) {
          const referencingFilePath: string = refFile.file;

          if (Path.isUnder(referencingFilePath, packletsFolderPath)) {
            const referencingRelativePath: string = path.relative(packletsFolderPath, referencingFilePath);
            const referencingPathParts: string[] = referencingRelativePath.split(/[\/\\]+/);
            const referencingPackletName: string = referencingPathParts[0];

            if (!visitedPacklets.has(packletName)) {
              visitedPacklets.add(packletName);

              const link2: ILink = {
                previous: previousLink,
                fromFilePath: referencingFilePath,
                packletName: packletName
              };

              if (referencingPackletName === startingPackletName) {
                return link2;
              }

              const result: ILink | undefined = loop(
                referencingPackletName,
                startingPackletName,
                refFileMap,
                program,
                packletsFolderPath,
                visitedPacklets,
                link2
              );
              if (result) {
                return result;
              }
            }
          }
        }
      }
    }
  }
  return undefined;
}

export function loopp(result: IResult, program: ts.Program): ILink | undefined {
  const refFileMap: Map<string, RefFile[]> = (program as any).getRefFileMap();
  const visitedPacklets: Set<string> = new Set();
  return loop(
    result.packletName!,
    result.packletName!,
    refFileMap,
    program,
    result.packletsFolderPath!,
    visitedPacklets,
    undefined
  );
}
