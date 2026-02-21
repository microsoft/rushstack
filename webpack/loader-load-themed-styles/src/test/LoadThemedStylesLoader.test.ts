// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import webpack = require('webpack');

import { LoadThemedStylesLoader } from '../LoadThemedStylesLoader.ts';
import LoadThemedStylesMock = require('./testData/LoadThemedStylesMock.ts');

function wrapResult(loaderResult: string): string {
  return `var module = { id: 'testId', exports: {} };
  ${loaderResult}
  module;`;
}

describe(LoadThemedStylesLoader.name, () => {
  beforeEach(() => {
    LoadThemedStylesLoader.resetLoadedThemedStylesPath();
    LoadThemedStylesMock.loadedData = [];
    LoadThemedStylesMock.calledWithAsync = [];
  });

  it('follows the Webpack loader interface', () => {
    expect(LoadThemedStylesLoader).toBeDefined();
    expect(LoadThemedStylesLoader.pitch).toBeDefined();

    expect(() => new LoadThemedStylesLoader()).toThrow();
  });

  it('it correctly resolves load-themed-styles', () => {
    const expectedPath: string = require.resolve('@microsoft/load-themed-styles');
    expect(LoadThemedStylesLoader.loadedThemedStylesPath).toEqual(expectedPath);
  });

  it('it inserts the resolved load-themed-styles path', () => {
    const expectedPath: string = require.resolve('@microsoft/load-themed-styles');
    const loaderResult: string = LoadThemedStylesLoader.pitch.call({} as webpack.loader.LoaderContext, '');
    expect(loaderResult.indexOf(expectedPath)).not.toBeNull();
  });

  it('it allows for override of load-themed-styles path', () => {
    let expectedPath: string = './testData/LoadThemedStylesMock';
    LoadThemedStylesLoader.loadedThemedStylesPath = expectedPath;
    expect(LoadThemedStylesLoader.loadedThemedStylesPath).toEqual(expectedPath);

    LoadThemedStylesLoader.resetLoadedThemedStylesPath();
    expectedPath = require.resolve('@microsoft/load-themed-styles');
    expect(LoadThemedStylesLoader.loadedThemedStylesPath).toEqual(expectedPath);
  });

  it('it inserts the overridden load-themed-styles path', () => {
    const expectedPath: string = './testData/LoadThemedStylesMock';
    const loaderResult: string = LoadThemedStylesLoader.pitch.call({} as webpack.loader.LoaderContext, '');
    expect(loaderResult.indexOf(expectedPath)).not.toBeNull();
  });

  it('correctly calls loadStyles in load-themed-styles with a module reference', () => {
    LoadThemedStylesLoader.loadedThemedStylesPath = './testData/LoadThemedStylesMock';

    let loaderResult: string = LoadThemedStylesLoader.pitch.call(
      {} as webpack.loader.LoaderContext,
      './testData/MockStyle1'
    );
    loaderResult = loaderResult.replace(/require\(\"!!/, 'require("');
    loaderResult = wrapResult(loaderResult);

    const returnedModule: { exports: string } = eval(loaderResult); // eslint-disable-line no-eval

    expect(LoadThemedStylesMock.loadedData.indexOf('STYLE 1') !== -1).toEqual(true);
    expect(LoadThemedStylesMock.loadedData.indexOf('STYLE 2') !== -1).toEqual(true);
    expect(LoadThemedStylesMock.loadedData).toHaveLength(2);
    expect(LoadThemedStylesMock.calledWithAsync[0]).toEqual(false);
    expect(LoadThemedStylesMock.calledWithAsync[1]).toEqual(false);
    expect(LoadThemedStylesMock.calledWithAsync).toHaveLength(2);
    expect(returnedModule.exports).toEqual('locals');
  });

  it('correctly calls loadStyles in load-themed-styles with a string reference', () => {
    LoadThemedStylesLoader.loadedThemedStylesPath = './testData/LoadThemedStylesMock';

    let loaderResult: string = LoadThemedStylesLoader.pitch.call(
      {} as webpack.loader.LoaderContext,
      './testData/MockStyle2'
    );
    loaderResult = loaderResult.replace(/require\(\"!!/, 'require("');
    loaderResult = wrapResult(loaderResult);

    const returnedModule: { exports: string } = eval(loaderResult); // eslint-disable-line no-eval

    expect(LoadThemedStylesMock.loadedData.indexOf('styles') !== -1).toEqual(true);
    expect(LoadThemedStylesMock.loadedData).toHaveLength(1);
    expect(returnedModule.exports).toEqual({});
  });

  it('correctly handles the async option set to "true"', () => {
    LoadThemedStylesLoader.loadedThemedStylesPath = './testData/LoadThemedStylesMock';

    const query: {} = { async: true };
    let loaderResult: string = LoadThemedStylesLoader.pitch.call(
      { query } as webpack.loader.LoaderContext,
      './testData/MockStyle1'
    );
    loaderResult = loaderResult.replace(/require\(\"!!/, 'require("');
    loaderResult = wrapResult(loaderResult);

    const returnedModule: { exports: string } = eval(loaderResult); // eslint-disable-line no-eval

    expect(LoadThemedStylesMock.loadedData.indexOf('STYLE 1') !== -1).toEqual(true);
    expect(LoadThemedStylesMock.loadedData.indexOf('STYLE 2') !== -1).toEqual(true);
    expect(LoadThemedStylesMock.loadedData).toHaveLength(2);
    expect(LoadThemedStylesMock.calledWithAsync[0]).toEqual(true);
    expect(LoadThemedStylesMock.calledWithAsync[1]).toEqual(true);
    expect(LoadThemedStylesMock.calledWithAsync).toHaveLength(2);
    expect(returnedModule.exports).toEqual('locals');
  });

  it('correctly handles the async option set to a non-boolean', () => {
    LoadThemedStylesLoader.loadedThemedStylesPath = './testData/LoadThemedStylesMock';

    let loaderResult: string = LoadThemedStylesLoader.pitch.call(
      {} as webpack.loader.LoaderContext,
      './testData/MockStyle1'
    );
    loaderResult = loaderResult.replace(/require\(\"!!/, 'require("');
    loaderResult = wrapResult(loaderResult);

    const returnedModule: { exports: string } = eval(loaderResult); // eslint-disable-line no-eval

    expect(LoadThemedStylesMock.loadedData.indexOf('STYLE 1') !== -1).toEqual(true);
    expect(LoadThemedStylesMock.loadedData.indexOf('STYLE 2') !== -1).toEqual(true);
    expect(LoadThemedStylesMock.loadedData).toHaveLength(2);
    expect(LoadThemedStylesMock.calledWithAsync[0]).toEqual(false);
    expect(LoadThemedStylesMock.calledWithAsync[1]).toEqual(false);
    expect(LoadThemedStylesMock.calledWithAsync).toHaveLength(2);
    expect(returnedModule.exports).toEqual('locals');
  });
});
