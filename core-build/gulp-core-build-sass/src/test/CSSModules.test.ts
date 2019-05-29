// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import * as path from 'path';
import { expect } from 'chai';

import CSSModules from '../CSSModules';

interface IScopedNameArgs {
  name: string;
  fileName: string;
  css: string;
}

interface ITestCSSModules {
  testGenerateScopedName: (name: string, fileName: string, css: string) => string;
}

class TestCSSModules extends CSSModules {
  public testGenerateScopedName = (name: string, fileName: string, css: string)
      : string => {
    return this.generateScopedName(name, fileName, css);
  }
}

describe('class name hashing', () => {
  it('will generate different hashes for different content', (done) => {
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
    const output1: string = cssModules.testGenerateScopedName(
      version1.name, version1.fileName, version1.css
    );
    const output2: string = cssModules.testGenerateScopedName(
      version2.name, version2.fileName, version2.css
    );
    expect(output1).to.not.equal(output2);
    done();
  });

  it('will generate the same hash in a different path', (done) => {
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
    const cssModules: ITestCSSModules = new TestCSSModules();
    const output1: string = cssModules.testGenerateScopedName(
      version1.name, version1.fileName, version1.css
    );
    const output2: string = cssModules.testGenerateScopedName(
      version2.name, version2.fileName, version2.css
    );
    expect(output1).to.equal(output2);
    done();
  });
});
