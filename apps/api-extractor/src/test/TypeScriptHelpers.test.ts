// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TypeScriptHelpers } from '../utils/TypeScriptHelpers';

interface ITestCase {
  input: string;
  output: string;
}

describe('TypeScriptHelpers tests', () => {

  describe('splitStringWithRegEx()', () => {
    it('simple case', () => {
      expect(TypeScriptHelpers.splitStringWithRegEx('ABCDaFG', /A/gi))
        .toEqual(['A', 'BCD', 'a', 'FG']);
    });

    it('empty match', () => {
      expect(TypeScriptHelpers.splitStringWithRegEx('', /A/gi))
        .toEqual([]);
    });

  });

  describe('extractJSDocContent()', () => {

    const testCases: ITestCase[] = [
      { // 0
        input: '/*A*/',
        output: '' // error
      },
      { // 1
        input: '/****A****/',
        output: 'A'
      },
      { // 2
        input: '/**A */',
        output: 'A'
      },
      { // 3
        input: '/** A */',
        output: 'A'
      },
      { // 4
        input: '/**   A */',
        output: 'A'
      },
      { // 5
        input: '/**\n' +
               'A */',
        output: 'A'
      },
      { // 6
        input: '/**\n' +
               ' A */',
        output: ' A'
      },
      { // 7
        input: '/**\n' +
               ' *A */',
        output: 'A'
      },
      { // 8
        input: '/**\n' +
               ' * A */',
        output: 'A'
      },
      { // 9
        input: '/**\n' +
               ' *   A*/',
        output: '  A'
      },
      { // 10
        input: '/**\n' +
               ' *   A\n' +
               ' */',
        output: '  A\n'
      },
      { // 11
        input: '/*****\n' +
               '*A\n' +
               '******/',
        output: 'A\n'
      },
      { // 12
        input: '/******\n' +
               ' ***A**\n' +
               ' ******/',
        output: '**A**\n'
      },
      { // 13
        input: '/** A\n' +
               ' * B\n' +
               'C */',
        output: 'A\nB\nC'
      },
      { // 14
        input: '/** A\n' +
               ' *  B\n' +
               ' *  C */',
        output: 'A\n B\n C'
      },
      { // 15
        input: '/**\n' +
               ' * A\n' +
               ' *   \t \n' +
               ' * B\n' +
               '    \n' +
               ' * C\n' +
               ' */',
        output: 'A\n\nB\n\nC\n'
      },
      { // 16
        input: '/**   *\\/   */',  // a properly escaped terminator
        output: '*\\/'
      }
    ];

    for (let i: number = 0; i < testCases.length; ++i) {
      it(`JSDoc test case ${i}`, () => {
        expect(TypeScriptHelpers.extractJSDocContent(testCases[i].input, console.log))
        .toBe(testCases[i].output);
      });
    }

  });

  describe('formatJSDocContent()', () => {

    const testCases: ITestCase[] = [
      { // 0
        input: '',
        output: ''
      },
      { // 1
        input: 'a',
        output: '/** a */'
      },
      { // 2
        input: '\na',
        output: '/**\n * \n * a\n */'
      },
      { // 3
        input: 'a\n',
        output: '/**\n * a\n */'
      },
      { // 4
        input: '  \na\n  ',
        output: '/**\n *   \n * a\n *   \n */'
      },
      { // 5
        input: 'this is\na test\n',
        output: '/**\n * this is\n * a test\n */'
      },
      { // 6
        input: 'single line comment',
        output: '/** single line comment */'
      },
      { // 7
        input: 'a */ b',
        output: '/** a *\\/ b */'
      }
    ];

    for (let i: number = 0; i < testCases.length; ++i) {
      it(`JSDoc test case ${i}`, () => {
        expect(TypeScriptHelpers.formatJSDocContent(testCases[i].input))
        .toBe(testCases[i].output);
      });
    }

  });
});
