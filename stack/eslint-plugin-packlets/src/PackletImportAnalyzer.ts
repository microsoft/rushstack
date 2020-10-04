// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { MessageIds } from './mechanics';

export interface ILintError {
  messageId: MessageIds;
  data?: Readonly<Record<string, unknown>>;
}

/*
export enum PathKind {
  PackletEntryPoint,
  PackletIndex,
  PackageMember,
  ProjectFile,
  SourceFileError
}

export interface IParsedFilePath {
  pathKind: PathKind;
  sourceFileError: ILintError | undefined;
}

export interface IAnalyzeImportOptions {
  sourceFileParsedPath: IParsedFilePath;
  modulePath: string;
}

export class PackletImportAnalyzer {
  public static analyzeSourceFile(sourceFileAbsolutePath: string): IParsedFilePath {
    // file path: c:/one/two/src/packlets/three/four.ts
    //
    // packletsFolder:   c:/one/two/src/packlets
    // srcFolder:  c:/one/two/src/packlets
    return {
      pathKind: PathKind.SourceFileError,
      sourceFileError: {
        messageId:
      }
    };
  }

  public static analyzeImportExportPath(options: IAnalyzeImportOptions): IParsedPath {
    return {
      pathKind: PathKind.SourceFileError,
      sourceFileError: new Error('Oops')
    };
  }
}
*/
