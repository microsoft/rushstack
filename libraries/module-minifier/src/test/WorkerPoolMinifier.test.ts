// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IMinifierConnection } from '../types.ts';

let terserVersion: string = '1.0.0';
jest.mock('terser/package.json', () => {
  return {
    get version(): string {
      return terserVersion;
    }
  };
});

describe('WorkerPoolMinifier', () => {
  it('Includes terserOptions in config hash', async () => {
    const { WorkerPoolMinifier } = await import('../WorkerPoolMinifier.ts');
    // eslint-disable-next-line @typescript-eslint/no-redeclare
    type WorkerPoolMinifier = typeof WorkerPoolMinifier.prototype;

    const minifier1: WorkerPoolMinifier = new WorkerPoolMinifier({
      terserOptions: {
        ecma: 5
      }
    });
    const minifier2: WorkerPoolMinifier = new WorkerPoolMinifier({
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
    const { WorkerPoolMinifier } = await import('../WorkerPoolMinifier.ts');
    // eslint-disable-next-line @typescript-eslint/no-redeclare
    type WorkerPoolMinifier = typeof WorkerPoolMinifier.prototype;

    terserVersion = '5.9.1';
    const minifier1: WorkerPoolMinifier = new WorkerPoolMinifier({});
    terserVersion = '5.16.2';
    const minifier2: WorkerPoolMinifier = new WorkerPoolMinifier({});

    const connection1: IMinifierConnection = await minifier1.connectAsync();
    await connection1.disconnectAsync();
    const connection2: IMinifierConnection = await minifier2.connectAsync();
    await connection2.disconnectAsync();

    expect(connection1.configHash).toMatchSnapshot('terser-5.9.1');
    expect(connection2.configHash).toMatchSnapshot('terser-5.16.1');
    expect(connection1.configHash !== connection2.configHash);
  });
});
