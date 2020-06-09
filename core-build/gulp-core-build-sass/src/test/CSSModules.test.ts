// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import * as path from 'path';

import CSSModules from '../CSSModules';

interface IScopedNameArgs {
  name: string;
  fileName: string;
  css: string;
}

interface ITestCSSModules {
  testGenerateScopedName(name: string, fileName: string, css: string): string;
}

class TestCSSModules extends CSSModules {
  public testGenerateScopedName(name: string, fileName: string, css: string): string {
    return this.generateScopedName(name, fileName, css);
  }
}

test('will generate different hashes for different content', () => {
  const version1: IScopedNameArgs = {
    name: 'Button',
    fileName: path.join(__dirname, 'Sally', 'src', 'main.sass'),
    css: 'color: blue;'
  };
  const version2: IScopedNameArgs = {
    name: 'Button',
    fileName: path.join(__dirname, 'Sally', 'src', 'main.sass'),
    css: 'color: pink;'
  };
  const cssModules: ITestCSSModules = new TestCSSModules();
  const output1: string = cssModules.testGenerateScopedName(version1.name, version1.fileName, version1.css);
  const output2: string = cssModules.testGenerateScopedName(version2.name, version2.fileName, version2.css);
  expect(output1).not.toBe(output2);
});

test('will generate the same hash in a different root path', () => {
  const version1: IScopedNameArgs = {
    name: 'Button',
    fileName: path.join(__dirname, 'Sally', 'src', 'main.sass'),
    css: 'color: blue;'
  };
  const version2: IScopedNameArgs = {
    name: 'Button',
    fileName: path.join(__dirname, 'Suzan', 'workspace', 'src', 'main.sass'),
    css: 'color: blue;'
  };
  const cssModules: ITestCSSModules = new TestCSSModules(path.join(__dirname, 'Sally'));
  const output1: string = cssModules.testGenerateScopedName(version1.name, version1.fileName, version1.css);
  const cssModules2: ITestCSSModules = new TestCSSModules(path.join(__dirname, 'Suzan', 'workspace'));
  const output2: string = cssModules2.testGenerateScopedName(version2.name, version2.fileName, version2.css);
  expect(output1).toBe(output2);
});

test('will generate a different hash in a different src path', () => {
  const version1: IScopedNameArgs = {
    name: 'Button',
    fileName: path.join(__dirname, 'Sally', 'src', 'main.sass'),
    css: 'color: blue;'
  };
  const version2: IScopedNameArgs = {
    name: 'Button',
    fileName: path.join(__dirname, 'Sally', 'src', 'lib', 'main.sass'),
    css: 'color: blue;'
  };
  const cssModules: ITestCSSModules = new TestCSSModules();
  const output1: string = cssModules.testGenerateScopedName(version1.name, version1.fileName, version1.css);
  const output2: string = cssModules.testGenerateScopedName(version2.name, version2.fileName, version2.css);
  expect(output1).not.toBe(output2);
});
