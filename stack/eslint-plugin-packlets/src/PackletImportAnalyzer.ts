// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as fs from 'fs';
import { Path } from './Path';

export type MyMessageIds =
  | 'missing-tsconfig'
  | 'missing-src-folder'
  | 'packlet-folder-case'
  | 'invalid-packlet-name'
  | 'misplaced-packlets-folder';

export type MyMessageIds2 =
  | 'bypassed-entry-point'
  | 'circular-entry-point'
  | 'packlet-importing-project-file';

export interface ILintError {
  messageId: MyMessageIds | MyMessageIds2;
  data?: Readonly<Record<string, unknown>>;
}

export interface IResult {
  inputFilePath: string;
  globalError: ILintError | undefined;
  skip: boolean;
  packletsEnabled: boolean;
  packletsFolderPath: string | undefined;
  packletName: string | undefined;
  isEntryPoint: boolean;
}

const validPackletName: RegExp = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function analyze(inputFilePath: string, tsconfigFilePath: string | undefined): IResult {
  const result: IResult = {
    inputFilePath,
    globalError: undefined,
    skip: false,
    packletsEnabled: false,
    packletsFolderPath: undefined,
    packletName: undefined,
    isEntryPoint: false
  };

  // Example: /path/to/my-project/src
  let srcFolderPath: string | undefined;

  if (!tsconfigFilePath) {
    result.globalError = { messageId: 'missing-tsconfig' };
    return result;
  }

  srcFolderPath = path.join(path.dirname(tsconfigFilePath), 'src');

  if (!fs.existsSync(srcFolderPath)) {
    result.globalError = { messageId: 'missing-src-folder', data: { srcFolderPath } };
    return result;
  }

  if (!Path.isUnder(inputFilePath, srcFolderPath)) {
    // Ignore files outside the "src" folder
    result.skip = true;
    return result;
  }

  // Example: packlets/my-packlet/index.ts
  const inputFilePathRelativeToSrc: string = path.relative(srcFolderPath, inputFilePath);

  // Example: [ 'packlets', 'my-packlet', 'index.ts' ]
  const pathParts: string[] = inputFilePathRelativeToSrc.split(/[\/\\]+/);

  let underPackletsFolder: boolean = false;

  const expectedPackletsFolder: string = path.join(srcFolderPath, 'packlets');

  for (let i = 0; i < pathParts.length; ++i) {
    const pathPart: string = pathParts[i];
    if (pathPart.toUpperCase() === 'PACKLETS') {
      if (pathPart !== 'packlets') {
        // Example: /path/to/my-project/src/PACKLETS
        const packletsFolderPath: string = path.join(srcFolderPath, ...pathParts.slice(0, i + 1));
        result.globalError = { messageId: 'packlet-folder-case', data: { packletsFolderPath } };
        return result;
      }

      if (i !== 0) {
        result.globalError = { messageId: 'misplaced-packlets-folder', data: { expectedPackletsFolder } };
        return result;
      }

      underPackletsFolder = true;
    }
  }

  if (underPackletsFolder || fs.existsSync(expectedPackletsFolder)) {
    // packletsAbsolutePath
    result.packletsEnabled = true;
    result.packletsFolderPath = expectedPackletsFolder;
  }

  if (underPackletsFolder && pathParts.length >= 2) {
    // Example: 'my-packlet'
    const packletName: string = pathParts[1];
    result.packletName = packletName;

    // Example: 'index.ts' or 'index.tsx'
    const thirdPart: string = pathParts[2];

    // Example: 'index'
    const thirdPartWithoutExtension: string = path.parse(thirdPart).name;

    if (thirdPartWithoutExtension.toUpperCase() === 'INDEX') {
      if (!validPackletName.test(packletName)) {
        result.globalError = { messageId: 'invalid-packlet-name', data: { packletName } };
        return result;
      }

      result.isEntryPoint = true;
    }
  }

  if (result.globalError === undefined && !result.packletsEnabled) {
    result.skip = true;
  }

  return result;
}

export function analyze2(modulePath: string, result: IResult): ILintError | undefined {
  if (!result.packletsFolderPath) {
    // This should not happen
    throw new Error('Missing packletsFolderPath');
  }

  // Example: /path/to/my-project/src/packlets/my-packlet
  const inputFileFolder: string = path.dirname(result.inputFilePath);

  // Example: /path/to/my-project/src/other-packlet/index
  const importedPath: string = path.resolve(inputFileFolder, modulePath);

  // Is the imported path referring to a file under the src/packlets folder?
  if (Path.isUnder(importedPath, result.packletsFolderPath)) {
    // Example: other-packlet/index
    const importedPathRelativeToPackletsFolder: string = path.relative(
      result.packletsFolderPath,
      importedPath
    );
    // Example: [ 'other-packlet', 'index' ]
    const importedPathParts: string[] = importedPathRelativeToPackletsFolder.split(/[\/\\]+/);
    if (importedPathParts.length > 0) {
      // Example: 'other-packlet'
      const importedPackletName: string = importedPathParts[0];

      // We are importing from a packlet. Is the input file part of the same packlet?
      if (result.packletName && importedPackletName === result.packletName) {
        // Yes.  Then our import must NOT use the packlet entry point.

        // Example: 'index'
        //
        // We discard the file extension to handle a degenerate case like:
        //   import { X } from "../index.js";
        const lastPart: string = path.parse(importedPathParts[importedPathParts.length - 1]).name;
        let pathToCompare: string;
        if (lastPart.toUpperCase() === 'INDEX') {
          // Example:
          //   importedPath = /path/to/my-project/src/other-packlet/index
          //   pathToCompare = /path/to/my-project/src/other-packlet
          pathToCompare = path.dirname(importedPath);
        } else {
          pathToCompare = importedPath;
        }

        // Example: /path/to/my-project/src/other-packlet
        const entryPointPath: string = path.join(result.packletsFolderPath, importedPackletName);

        if (Path.isEqual(pathToCompare, entryPointPath)) {
          return {
            messageId: 'circular-entry-point'
          };
        }
      } else {
        // No.  If we are not part of the same packlet, then the module path must refer
        // to the index.ts entry point.

        // Example: /path/to/my-project/src/other-packlet
        const entryPointPath: string = path.join(result.packletsFolderPath, importedPackletName);

        if (!Path.isEqual(importedPath, entryPointPath)) {
          const entryPointModulePath: string = path.posix.relative(importedPackletName, inputFileFolder);

          return {
            messageId: 'bypassed-entry-point',
            data: { entryPointModulePath }
          };
        }
      }
    }
  } else {
    // The imported path does NOT refer to a file under the src/packlets folder
    if (result.packletName) {
      return {
        messageId: 'packlet-importing-project-file'
      };
    }
  }
}
