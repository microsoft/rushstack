// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as loader from '../index.ts';
import type { Stats } from 'webpack';
import LoadThemedStylesMock = require('./testData/LoadThemedStylesMock.ts');
import getCompiler from './testData/getCompiler.ts';

const MATCH_GENERATED_LOADER_STRING_REGEXP: RegExp = /var\sloader\s\=\srequire\(["'](.+?)["']\)/;
const MATCH_LOADER_DOT_LOADSTYLES_FUNCTION_ASYNC_VALUE_REGEXP: RegExp = /loader\.loadStyles\(.+?,\s(.+?)\)/;

// During a parallel build, getCompiler() can sometimes exceed Jest's default timeout of 5 seconds
jest.setTimeout(10 * 1000); // 10 seconds

describe('webpack5-load-themed-style-loader', () => {
  beforeEach(() => {
    LoadThemedStylesMock.loadedData = [];
    LoadThemedStylesMock.calledWithAsync = [];
  });

  it('follows the Webpack loader interface', () => {
    expect(loader.pitch).toBeDefined();
  });

  it('it inserts the resolved load-themed-styles path', async () => {
    const stats: Stats | undefined = await getCompiler('./MockStyle1.css');
    if (!stats) {
      throw new Error(`Expected stats`);
    }
    const content = stats.toJson({ source: true }).modules?.[0].source;
    const match = MATCH_GENERATED_LOADER_STRING_REGEXP.exec(content as string);
    // Since this pattern matches source code, on Windows directory separators will be
    // '\\', which will have been JSON-escaped.
    const loadThemedStylesLibPath = JSON.parse(`"${match?.[1]}"`);
    const expectedPath: string = require.resolve('@microsoft/load-themed-styles');

    expect(loadThemedStylesLibPath).toEqual(expectedPath);
  });

  it('it allows for and inserts override of load-themed-styles path', async () => {
    // It would error when I attempt to use the .ts mock in src/test/testData
    // beacuse I'm not setting up default support for webpack to load .ts files.
    const expectedPath: string = '../../../lib-commonjs/test/testData/LoadThemedStylesMock';
    const stats = await getCompiler('./MockStyle1.css', { loadThemedStylesPath: expectedPath });
    if (!stats) {
      throw new Error(`Expected stats`);
    }
    const content = stats.toJson({ source: true }).modules?.[0].source;
    const match = MATCH_GENERATED_LOADER_STRING_REGEXP.exec(content as string);
    const loadThemedStylesLibPath = match?.[1];

    expect(loadThemedStylesLibPath).toEqual(expectedPath);
  });

  it('correctly handles the async option set to "false"', async () => {
    const stats = await getCompiler('./MockStyle1.css', { async: false });
    if (!stats) {
      throw new Error(`Expected stats`);
    }
    const content = stats.toJson({ source: true }).modules?.[0].source;
    const match = MATCH_LOADER_DOT_LOADSTYLES_FUNCTION_ASYNC_VALUE_REGEXP.exec(content as string);
    const asyncValue = match?.[1];

    expect(asyncValue).toEqual('false');
  });

  it('correctly handles and detects the async option not being set', async () => {
    const stats = await getCompiler('./MockStyle1.css');
    if (!stats) {
      throw new Error(`Expected stats`);
    }
    const content = stats.toJson({ source: true }).modules?.[0].source;
    const match = MATCH_LOADER_DOT_LOADSTYLES_FUNCTION_ASYNC_VALUE_REGEXP.exec(content as string);
    const asyncValue = match?.[1];

    expect(asyncValue).toEqual('false');
  });

  it('correctly handles the async option set to "true"', async () => {
    const stats = await getCompiler('./MockStyle1.css', { async: true });
    if (!stats) {
      throw new Error(`Expected stats`);
    }
    const content = stats.toJson({ source: true }).modules?.[0].source;
    const match = MATCH_LOADER_DOT_LOADSTYLES_FUNCTION_ASYNC_VALUE_REGEXP.exec(content as string);
    const asyncValue = match?.[1];

    expect(asyncValue).toEqual('true');
  });

  it('generates desired output for esModule option set to "true" as a snapshot', async () => {
    // We mock the path of the loader because the full resolved path can change between machines
    // IE: Different folder topology, etc. So we just used the mocked module and set it
    // to loadThemedStylesPath option from the loader.
    const expectedPath: string = '../../../lib-commonjs/test/testData/LoadThemedStylesMock';
    const stats = await getCompiler('./MockStyle1.css', {
      loadThemedStylesPath: expectedPath,
      esModule: true
    });
    if (!stats) {
      throw new Error(`Expected stats`);
    }
    const content = stats.toJson({ source: true }).modules?.[0].source;

    expect(content).toMatchSnapshot('LoaderContent ESModule');
  });

  it('generates desired loader output snapshot', async () => {
    const expectedPath: string = '../../../lib-commonjs/test/testData/LoadThemedStylesMock';
    const stats = await getCompiler('./MockStyle1.css', { loadThemedStylesPath: expectedPath });
    if (!stats) {
      throw new Error(`Expected stats`);
    }
    const content = stats.toJson({ source: true }).modules?.[0].source;

    expect(content).toMatchSnapshot('LoaderContent');
  });
});
