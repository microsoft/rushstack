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

export interface ILintError {
  messageId: MyMessageIds;
  data?: Readonly<Record<string, unknown>>;
}

export interface IResult {
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
