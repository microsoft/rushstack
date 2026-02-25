// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IMinifierConnection } from '../types';
import type { minifySingleFileAsync } from '../MinifySingleFile';

let terserVersion: string = '1.0.0';
jest.mock('terser/package.json', () => {
  return {
    get version(): string {
      return terserVersion;
    }
  };
});

const mockMinifySingleFileAsync: jest.MockedFunction<typeof minifySingleFileAsync> = jest.fn();
jest.mock('../MinifySingleFile', () => {
  return {
    minifySingleFileAsync: mockMinifySingleFileAsync
  };
});

describe('LocalMinifier', () => {
  beforeEach(() => {
    mockMinifySingleFileAsync.mockReset().mockImplementation(async (req) => {
      return {
        code: `minified(${req.code})`,
        map: undefined,
        hash: req.hash,
        error: undefined
      };
    });
  });

  it('Includes terserOptions in config hash', async () => {
    const { LocalMinifier } = await import('../LocalMinifier');
    // eslint-disable-next-line @typescript-eslint/no-redeclare
    type LocalMinifier = typeof LocalMinifier.prototype;

    const minifier1: LocalMinifier = new LocalMinifier({
      terserOptions: {
        ecma: 5
      }
    });
    const minifier2: LocalMinifier = new LocalMinifier({
      terserOptions: {
        ecma: 2015
      }
    });

    const connection1: IMinifierConnection = await minifier1.connectAsync();
    await connection1.disconnectAsync();
    const connection2: IMinifierConnection = await minifier2.connectAsync();
    await connection2.disconnectAsync();

    expect(connection1.configHash).toMatchSnapshot('ecma5');
    expect(connection2.configHash).toMatchSnapshot('ecma2015');
    expect(connection1.configHash !== connection2.configHash);
  });

  it('Includes terser package version in config hash', async () => {
    const { LocalMinifier } = await import('../LocalMinifier');
    // eslint-disable-next-line @typescript-eslint/no-redeclare
    type LocalMinifier = typeof LocalMinifier.prototype;

    terserVersion = '5.9.1';
    const minifier1: LocalMinifier = new LocalMinifier({});
    terserVersion = '5.16.2';
    const minifier2: LocalMinifier = new LocalMinifier({});

    const connection1: IMinifierConnection = await minifier1.connectAsync();
    await connection1.disconnectAsync();
    const connection2: IMinifierConnection = await minifier2.connectAsync();
    await connection2.disconnectAsync();

    expect(connection1.configHash).toMatchSnapshot('terser-5.9.1');
    expect(connection2.configHash).toMatchSnapshot('terser-5.16.1');
    expect(connection1.configHash !== connection2.configHash);
  });

  it('Deduplicates when cache is enabled', async () => {
    const { LocalMinifier } = await import('../LocalMinifier');
    // eslint-disable-next-line @typescript-eslint/no-redeclare
    type LocalMinifier = typeof LocalMinifier.prototype;

    const minifier1: LocalMinifier = new LocalMinifier({});

    let completedRequests: number = 0;
    function onRequestComplete(): void {
      completedRequests++;
    }

    const connection1: IMinifierConnection = await minifier1.connectAsync();
    await minifier1.minify(
      { hash: 'hash1', code: 'code1', nameForMap: undefined, externals: undefined },
      onRequestComplete
    );
    await minifier1.minify(
      { hash: 'hash1', code: 'code1', nameForMap: undefined, externals: undefined },
      onRequestComplete
    );
    await connection1.disconnectAsync();

    expect(completedRequests).toBe(2);
    expect(mockMinifySingleFileAsync).toHaveBeenCalledTimes(1);
  });

  it('Does not deduplicate when cache is disabled', async () => {
    const { LocalMinifier } = await import('../LocalMinifier');
    // eslint-disable-next-line @typescript-eslint/no-redeclare
    type LocalMinifier = typeof LocalMinifier.prototype;

    const minifier1: LocalMinifier = new LocalMinifier({ cache: false });

    let completedRequests: number = 0;
    function onRequestComplete(): void {
      completedRequests++;
    }

    const connection1: IMinifierConnection = await minifier1.connectAsync();
    await minifier1.minify(
      { hash: 'hash1', code: 'code1', nameForMap: undefined, externals: undefined },
      onRequestComplete
    );
    await minifier1.minify(
      { hash: 'hash1', code: 'code1', nameForMap: undefined, externals: undefined },
      onRequestComplete
    );
    await connection1.disconnectAsync();

    expect(completedRequests).toBe(2);
    expect(mockMinifySingleFileAsync).toHaveBeenCalledTimes(2);
  });
});
