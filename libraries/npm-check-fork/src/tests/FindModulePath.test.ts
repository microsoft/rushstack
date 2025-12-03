jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/'))
  // Add other path methods as needed
}));

import findModulePath from '../FindModulePath';
import type { INpmCheckState } from '../interfaces/INpmCheck';
import path from 'node:path';

const Module = require('node:module');

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
    expect(result).toBe(path.join('/test/cwd', 'my-module'));
  });

  it('returns first tried path', () => {
    const state: INpmCheckState = { cwd: '/test/cwd', global: false } as INpmCheckState;
    const result = findModulePath('missing-module', state);
    expect(result).toBe(path.join('/test/cwd', 'missing-module'));
  });
});
