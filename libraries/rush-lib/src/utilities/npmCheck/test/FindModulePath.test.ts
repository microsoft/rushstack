// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/'))
  // Add other path methods as needed
}));

jest.mock('path-exists', () => ({
  sync: jest.fn((p: string) => {
    // Return true or false based on your test scenario
    return p === '/mock/path/node_modules/my-module';
  })
}));

import findModulePath from '../FindModulePath';
import type { INpmCheckState } from '../interfaces/INpmCheck';
import path from 'path';

const Module = require('module');

describe('findModulePath', () => {
  beforeAll(() => {
    jest
      .spyOn(Module, '_nodeModulePaths')
      .mockImplementation(() => ['/mock/path/node_modules', '/another/mock/path/node_modules']);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('returns found path', () => {
    const state: INpmCheckState = { cwd: '/test/cwd', global: false } as INpmCheckState;
    const result = findModulePath('my-module', state);
    expect(result).toBe(path.join('/mock/path/node_modules', 'my-module'));
  });

  it('returns first tried path', () => {
    const state: INpmCheckState = { cwd: '/test/cwd', global: false } as INpmCheckState;
    const result = findModulePath('missing-module', state);
    expect(result).toBe(path.join('/test/cwd', 'missing-module'));
  });
});
