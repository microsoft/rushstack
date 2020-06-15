// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as TTypescript from 'typescript';
import { FileSystem } from '@rushstack/node-core-library';

/**
 * Used as a helper to parse tsconfig.json files.
 */
export class TsParseConfigHost implements TTypescript.ParseConfigHost {
  public useCaseSensitiveFileNames: boolean = false;

  public readDirectory(
    rootDir: string,
    extensions: string[],
    excludes: string[],
    includes: string[]
  ): string[] {
    return FileSystem.readFolder(rootDir);
  }

  public fileExists(path: string): boolean {
    return FileSystem.exists(path);
  }

  public readFile(path: string): string {
    return FileSystem.readFile(path);
  }
}
