/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

import { assert } from 'chai';
import { LoadThemedStylesLoader } from './LoadThemedStylesLoader';
import LoadThemedStylesMock = require('./testData/LoadThemedStylesMock');

function wrapResult(loaderResult: string): string {
  return `var module = { id: 'testId', exports: undefined };
  ${loaderResult}
  module;`;
}

describe('LoadThemedStylesLoader', () => {
  beforeEach(() => {
    LoadThemedStylesLoader.resetLoadedThemedStylesPath();
    LoadThemedStylesMock.loadedData = [];
  });

  it('follows the Webpack loader interface', () => {
    assert.isDefined(LoadThemedStylesLoader);
    assert.isDefined(LoadThemedStylesLoader.pitch);

    assert.throws(() => new LoadThemedStylesLoader());
  });

  it('it correctly resolves load-themed-styles', () => {
    const expectedPath: string = require.resolve('@microsoft/load-themed-styles');
    assert.equal(LoadThemedStylesLoader.loadedThemedStylesPath, expectedPath);
  });

  it('it inserts the resolved load-themed-styles path', () => {
    const expectedPath: string = require.resolve('@microsoft/load-themed-styles');
    const loaderResult: string = LoadThemedStylesLoader.pitch('');
    assert.isNotNull(loaderResult.indexOf(expectedPath));
  });

  it('it allows for override of load-themed-styles path', () => {
    let expectedPath: string = './testData/LoadThemedStylesMock';
    LoadThemedStylesLoader.loadedThemedStylesPath = expectedPath;
    assert.equal(LoadThemedStylesLoader.loadedThemedStylesPath, expectedPath);

    LoadThemedStylesLoader.resetLoadedThemedStylesPath();
    expectedPath = require.resolve('@microsoft/load-themed-styles');
    assert.equal(LoadThemedStylesLoader.loadedThemedStylesPath, expectedPath);
  });

  it('it inserts the overridden load-themed-styles path', () => {
    const expectedPath: string = './testData/LoadThemedStylesMock';
    const loaderResult: string = LoadThemedStylesLoader.pitch('');
    assert.isNotNull(loaderResult.indexOf(expectedPath));
  });

  it ('correctly calls loadStyles in load-themed-styles with a module reference', () => {
    LoadThemedStylesLoader.loadedThemedStylesPath = './testData/LoadThemedStylesMock';

    let loaderResult: string = LoadThemedStylesLoader.pitch('./testData/MockStyle1');
    loaderResult = loaderResult.replace(/require\(\"!!/, 'require("');
    loaderResult = wrapResult(loaderResult);

    /* tslint:disable:no-eval */
    const returnedModule: {exports: string} = eval(loaderResult);
    /* tslint:enable:no-eval */
    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('STYLE 1') !== -1);
    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('STYLE 2') !== -1);
    assert.equal(LoadThemedStylesMock.loadedData.length, 2);
    assert.equal(returnedModule.exports, 'locals');
  });

  it ('correctly calls loadStyles in load-themed-styles with a string reference', () => {
    LoadThemedStylesLoader.loadedThemedStylesPath = './testData/LoadThemedStylesMock';

    let loaderResult: string = LoadThemedStylesLoader.pitch('./testData/MockStyle2');
    loaderResult = loaderResult.replace(/require\(\"!!/, 'require("');
    loaderResult = wrapResult(loaderResult);

    /* tslint:disable:no-eval */
    const returnedModule: {exports: string} = eval(loaderResult);
    /* tslint:enable:no-eval */
    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('styles') !== -1);
    assert.equal(LoadThemedStylesMock.loadedData.length, 1);
    assert.isUndefined(returnedModule.exports);
  });
});