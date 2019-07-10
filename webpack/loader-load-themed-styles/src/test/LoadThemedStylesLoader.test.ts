// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="mocha" />

import { assert } from 'chai';
import { LoadThemedStylesLoader } from './../LoadThemedStylesLoader';
import LoadThemedStylesMock = require('./testData/LoadThemedStylesMock');

function wrapResult(loaderResult: string): string {
  return `var module = { id: 'testId', exports: {} };
  ${loaderResult}
  module;`;
}

describe('LoadThemedStylesLoader', () => {
  beforeEach(() => {
    LoadThemedStylesLoader.resetLoadedThemedStylesPath();
    LoadThemedStylesMock.loadedData = [];
    LoadThemedStylesMock.calledWithAsync = [];
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
    const loaderResult: string = LoadThemedStylesLoader.pitch.call({}, '');
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
    const loaderResult: string = LoadThemedStylesLoader.pitch.call({}, '');
    assert.isNotNull(loaderResult.indexOf(expectedPath));
  });

  it('correctly calls loadStyles in load-themed-styles with a module reference', () => {
    LoadThemedStylesLoader.loadedThemedStylesPath = './testData/LoadThemedStylesMock';

    let loaderResult: string = LoadThemedStylesLoader.pitch.call({}, './testData/MockStyle1');
    loaderResult = loaderResult.replace(/require\(\"!!/, 'require("');
    loaderResult = wrapResult(loaderResult);

    const returnedModule: { exports: string } = eval(loaderResult); // tslint:disable-line:no-eval

    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('STYLE 1') !== -1);
    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('STYLE 2') !== -1);
    assert.equal(LoadThemedStylesMock.loadedData.length, 2);
    assert.isFalse(LoadThemedStylesMock.calledWithAsync[0]);
    assert.isFalse(LoadThemedStylesMock.calledWithAsync[1]);
    assert.equal(LoadThemedStylesMock.calledWithAsync.length, 2);
    assert.equal(returnedModule.exports, 'locals');
  });

  it('correctly calls loadStyles in load-themed-styles with a string reference', () => {
    LoadThemedStylesLoader.loadedThemedStylesPath = './testData/LoadThemedStylesMock';

    let loaderResult: string = LoadThemedStylesLoader.pitch.call({}, './testData/MockStyle2');
    loaderResult = loaderResult.replace(/require\(\"!!/, 'require("');
    loaderResult = wrapResult(loaderResult);

    const returnedModule: { exports: string } = eval(loaderResult); // tslint:disable-line:no-eval

    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('styles') !== -1);
    assert.equal(LoadThemedStylesMock.loadedData.length, 1);
    assert.deepEqual(returnedModule.exports, {});
  });

  it('correctly handles the namedExport option', () => {
    LoadThemedStylesLoader.loadedThemedStylesPath = './testData/LoadThemedStylesMock';

    const query: {} = { namedExport: 'default' };
    let loaderResult: string = LoadThemedStylesLoader.pitch.call({ query }, './testData/MockStyle1');
    loaderResult = loaderResult.replace(/require\(\"!!/, 'require("');
    loaderResult = wrapResult(loaderResult);

    const returnedModule: { exports: string } = eval(loaderResult); // tslint:disable-line:no-eval

    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('STYLE 1') !== -1);
    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('STYLE 2') !== -1);
    assert.equal(LoadThemedStylesMock.loadedData.length, 2);
    assert.isFalse(LoadThemedStylesMock.calledWithAsync[0]);
    assert.isFalse(LoadThemedStylesMock.calledWithAsync[1]);
    assert.equal(LoadThemedStylesMock.calledWithAsync.length, 2);
    assert.deepEqual(returnedModule.exports, { default: 'locals' });
  });

  it('correctly handles the async option set to "true"', () => {
    LoadThemedStylesLoader.loadedThemedStylesPath = './testData/LoadThemedStylesMock';

    const query: {} = { async: true };
    let loaderResult: string = LoadThemedStylesLoader.pitch.call({ query }, './testData/MockStyle1');
    loaderResult = loaderResult.replace(/require\(\"!!/, 'require("');
    loaderResult = wrapResult(loaderResult);

    const returnedModule: { exports: string } = eval(loaderResult); // tslint:disable-line:no-eval

    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('STYLE 1') !== -1);
    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('STYLE 2') !== -1);
    assert.equal(LoadThemedStylesMock.loadedData.length, 2);
    assert.isTrue(LoadThemedStylesMock.calledWithAsync[0]);
    assert.isTrue(LoadThemedStylesMock.calledWithAsync[1]);
    assert.equal(LoadThemedStylesMock.calledWithAsync.length, 2);
    assert.equal(returnedModule.exports, 'locals');
  });

  it('correctly handles the async option set to a non-boolean', () => {
    LoadThemedStylesLoader.loadedThemedStylesPath = './testData/LoadThemedStylesMock';

    let loaderResult: string = LoadThemedStylesLoader.pitch.call({}, './testData/MockStyle1');
    loaderResult = loaderResult.replace(/require\(\"!!/, 'require("');
    loaderResult = wrapResult(loaderResult);

    const returnedModule: { exports: string } = eval(loaderResult); // tslint:disable-line:no-eval

    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('STYLE 1') !== -1);
    assert.isTrue(LoadThemedStylesMock.loadedData.indexOf('STYLE 2') !== -1);
    assert.equal(LoadThemedStylesMock.loadedData.length, 2);
    assert.isFalse(LoadThemedStylesMock.calledWithAsync[0]);
    assert.isFalse(LoadThemedStylesMock.calledWithAsync[1]);
    assert.equal(LoadThemedStylesMock.calledWithAsync.length, 2);
    assert.equal(returnedModule.exports, 'locals');
  });
});
