// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, PackageJsonLookup } from '@rushstack/node-core-library';

interface IMap {
  sources?: string[];
  file?: string;
  sourcesContent?: string[];
  names?: string[];
}

interface IMapValue {
  mapFileName: string;
  mapObject: IMap;
}

interface IMapTestEntry {
  name: string;
  mapRegex: RegExp;
  map: IMapValue | undefined;
}

const mapTests: IMapTestEntry[] = [
  {
    name: 'Test-A',
    mapRegex: /^heft-test-A_[\w\d]*\.js.map$/,
    map: undefined
  },
  {
    name: 'Test-B',
    mapRegex: /^heft-test-B_[\w\d]*\.js.map$/,
    map: undefined
  },
  {
    name: 'Chunk',
    mapRegex: /^[\w\d\.]*chunk_[\w\d]*\.js.map$/,
    map: undefined
  }
];

const lookup: PackageJsonLookup = new PackageJsonLookup();
lookup.tryGetPackageFolderFor(__dirname);
const thisProjectFolder: string | undefined = lookup.tryGetPackageFolderFor(__dirname);
if (!thisProjectFolder) {
  throw new Error('Cannot find project folder');
}
const distEntries: string[] = FileSystem.readFolderItemNames(thisProjectFolder + '/dist');
for (const distEntry of distEntries) {
  for (const test of mapTests) {
    if (test.mapRegex.test(distEntry)) {
      const mapText: string = FileSystem.readFile(`${thisProjectFolder}/dist/${distEntry}`);
      const mapObject: IMap = JSON.parse(mapText);
      test.map = {
        mapFileName: distEntry,
        mapObject
      };
    }
  }
}

describe('Source Maps', () => {
  for (const test of mapTests) {
    mapValueCheck(test);
  }
});

function mapValueCheck(entry: IMapTestEntry): void {
  it(`${entry.name} has map value`, () => {
    expect(entry.map).toBeTruthy();
  });

  if (!entry.map) {
    return;
  }

  const map: IMapValue = entry.map;

  it(`${entry.name} has filename matching file attribute`, () => {
    if (map.mapObject.file) {
      expect(map.mapFileName).toMatch(`${map.mapObject.file}.map`);
    }
  });

  const properties: (keyof IMap)[] = ['sources', 'file', 'sourcesContent', 'names'];
  for (const property of properties) {
    it(`${map.mapFileName} has ${property} property`, () => {
      expect(map.mapObject[property]).toBeTruthy();
    });
  }

  it(`${entry.name} has sources and sourcesContent arrays of the same length`, () => {
    if (map.mapObject.sourcesContent && map.mapObject.sources) {
      let numSrcs: number = 0;
      for (const source of map.mapObject.sources) {
        if (source) {
          numSrcs++;
        }
      }

      let numContents: number = 0;
      for (const content of map.mapObject.sourcesContent) {
        if (content) {
          numContents++;
        }
      }
      expect(numSrcs).toEqual(numContents);
    }
  });

  it(`${entry.name} has a source that matches the sourceFileRegex`, () => {
    if (map.mapObject.sources) {
      expect(map.mapObject.sources).toMatchSnapshot();
    }
  });
}
