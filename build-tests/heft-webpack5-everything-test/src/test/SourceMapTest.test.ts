// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';

interface IMap {
  sources?: string[];
  file?: string;
  sourcesContent?: string[];
  names?: string[];
}

let testAMapText: string = '';
let testAMapObject: IMap = {};
let testBMapText: string = '';
let testBMapObject: IMap = {};

describe('Source Maps', () => {
  beforeAll(() => {
    const lookup = new PackageJsonLookup();
    lookup.tryGetPackageFolderFor(__dirname);
    const thisProjectFolder = lookup.tryGetPackageFolderFor(__dirname);
    if (!thisProjectFolder) {
      throw new Error('Cannot find project folder');
    }
    const distEntries = FileSystem.readFolderItemNames(thisProjectFolder + '/dist');
    for (const distEntry of distEntries) {
      if (/^heft-test-A_[\w\d]*\.js.map/.test(distEntry)) {
        testAMapText = FileSystem.readFile(`${thisProjectFolder}/dist/${distEntry}`);
        testAMapObject = JSON.parse(testAMapText);
      }
      if (/^heft-test-B_[\w\d]*\.js.map/.test(distEntry)) {
        testBMapText = FileSystem.readFile(`${thisProjectFolder}/dist/${distEntry}`);
        testBMapObject = JSON.parse(testBMapText);
      }
    }
  });
  it('Maps exist', () => {
    expect(testAMapText).toBeTruthy();
    expect(testBMapText).toBeTruthy();
  });

  it('Test-A Map has indexA.ts file', () => {
    expect(testAMapObject.sources).toContain(/indexA.ts$/);
    expect(testBMapObject.sources).toContain(/indexB.ts$/);
  });
});
