import { RawSource } from 'webpack-sources';
import { rehydrateAsset } from '../RehydrateAsset';
import { CHUNK_MODULES_TOKEN } from '../Constants';
import { IAssetInfo, IModuleMap } from '../ModuleMinifierPlugin.types';

const modules: IModuleMap = new Map();
modules.set('a', {
  source: new RawSource('foo'),
  extractedComments: [],
  module: undefined!
});
modules.set('b', {
  source: new RawSource('bar'),
  extractedComments: [],
  module: undefined!
});
modules.set(0, {
  source: new RawSource('fizz'),
  extractedComments: [],
  module: undefined!
});
modules.set(2, {
  source: new RawSource('buzz'),
  extractedComments: [],
  module: undefined!
});
for (let i: number = 14; i < 30; i++) {
  if (i !== 25) {
    modules.set(i, {
      source: new RawSource('bozz'),
      extractedComments: [],
      module: undefined!
    });
  }
}
modules.set(25, {
  source: new RawSource('bang'),
  extractedComments: [],
  module: undefined!
});
for (let i: number = 1000; i < 1010; i++) {
  modules.set(i, {
    source: new RawSource(`b${i}`),
    extractedComments: [],
    module: undefined!
  });
}

const banner: string = `/* fnord */\n`;

describe('rehydrateAsset', () => {
  it('uses an object for non-numeric ids', () => {
    const asset: IAssetInfo = {
      source: new RawSource(`<before>${CHUNK_MODULES_TOKEN}<after>`),
      modules: ['a', 'b'],
      extractedComments: [],
      fileName: 'test',
      chunk: undefined!
    };

    const result: string = rehydrateAsset(asset, modules, banner).source();
    const expected: string = `/* fnord */\n<before>{"a":foo,"b":bar}<after>`;

    if (result !== expected) {
      throw new Error(`Expected ${expected} but received ${result}`);
    }
  });

  it('uses an object for widely separated ids', () => {
    const asset: IAssetInfo = {
      source: new RawSource(`<before>${CHUNK_MODULES_TOKEN}<after>`),
      modules: [0, 25],
      extractedComments: [],
      fileName: 'test',
      chunk: undefined!
    };

    const result: string = rehydrateAsset(asset, modules, banner).source();
    const expected: string = `/* fnord */\n<before>{0:fizz,25:bang}<after>`;

    if (result !== expected) {
      throw new Error(`Expected ${expected} but received ${result}`);
    }
  });

  it('uses a regular array for a couple missing leading elements', () => {
    const asset: IAssetInfo = {
      source: new RawSource(`<before>${CHUNK_MODULES_TOKEN}<after>`),
      modules: [2],
      extractedComments: [],
      fileName: 'test',
      chunk: undefined!
    };

    const result: string = rehydrateAsset(asset, modules, banner).source();
    const expected: string = `/* fnord */\n<before>[,,buzz]<after>`;

    if (result !== expected) {
      throw new Error(`Expected ${expected} but received ${result}`);
    }
  });

  it('uses a regular array for several missing leading elements', () => {
    const asset: IAssetInfo = {
      source: new RawSource(`<before>${CHUNK_MODULES_TOKEN}<after>`),
      modules: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
      extractedComments: [],
      fileName: 'test',
      chunk: undefined!
    };

    const result: string = rehydrateAsset(asset, modules, banner).source();
    const expected: string = `/* fnord */\n<before>[,,,,,,,,,,,,,,bozz,bozz,bozz,bozz,bozz,bozz,bozz,bozz,bozz,bozz,bozz,bang,bozz,bozz,bozz,bozz]<after>`;

    if (result !== expected) {
      throw new Error(`Expected ${expected} but received ${result}`);
    }
  });

  it('uses a concat array for a tight cluster of ids', () => {
    const asset: IAssetInfo = {
      source: new RawSource(`<before>${CHUNK_MODULES_TOKEN}<after>`),
      modules: [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009],
      extractedComments: [],
      fileName: 'test',
      chunk: undefined!
    };

    const result: string = rehydrateAsset(asset, modules, banner).source();
    const expected: string = `/* fnord */\n<before>Array(1000).concat([b1000,b1001,b1002,b1003,b1004,b1005,b1006,b1007,b1008,b1009])<after>`;

    if (result !== expected) {
      throw new Error(`Expected ${expected} but received ${result}`);
    }
  });

  it('uses a concat spacer for multiple tight clusters of ids', () => {
    const asset: IAssetInfo = {
      source: new RawSource(`<before>${CHUNK_MODULES_TOKEN}<after>`),
      modules: [0, 2, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009],
      extractedComments: [],
      fileName: 'test',
      chunk: undefined!
    };

    const result: string = rehydrateAsset(asset, modules, banner).source();
    const expected: string = `/* fnord */\n<before>[fizz,,buzz].concat(Array(997),[b1000,b1001,b1002,b1003,b1004,b1005,b1006,b1007,b1008,b1009])<after>`;

    if (result !== expected) {
      throw new Error(`Expected ${expected} but received ${result}`);
    }
  });
});
