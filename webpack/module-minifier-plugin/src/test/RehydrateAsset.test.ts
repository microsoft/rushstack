import { rehydrateAsset } from '../RehydrateAsset';
import { CHUNK_MODULES_TOKEN } from '../Constants';
import { IAssetInfo, IModuleMap } from '../ModuleMinifierPlugin.types';

const modules: IModuleMap = new Map();
modules.set('a', {
  code: 'foo',
  extractedComments: [],
  module: undefined!
});
modules.set('b', {
  code: 'bar',
  extractedComments: [],
  module: undefined!
});
modules.set(0, {
  code: 'fizz',
  extractedComments: [],
  module: undefined!
});
modules.set(2, {
  code: 'buzz',
  extractedComments: [],
  module: undefined!
});
modules.set(25, {
  code: 'bang',
  extractedComments: [],
  module: undefined!
});
for (let i: number = 1000; i < 1010; i++) {
  modules.set(i, {
    code: `b${i}`,
    extractedComments: [],
    module: undefined!
  });
}

const banner: string = `/* fnord */\n`;

describe('rehydrateAsset', () => {
  it('uses an object for non-numeric ids', () => {
    const asset: IAssetInfo = {
      code: `<before>${CHUNK_MODULES_TOKEN}<after>`,
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
      code: `<before>${CHUNK_MODULES_TOKEN}<after>`,
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

  it('uses a concat array for a tight cluster of ids', () => {
    const asset: IAssetInfo = {
      code: `<before>${CHUNK_MODULES_TOKEN}<after>`,
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
      code: `<before>${CHUNK_MODULES_TOKEN}<after>`,
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