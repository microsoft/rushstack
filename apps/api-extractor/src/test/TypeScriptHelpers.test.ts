// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import TypeScriptHelpers from '../TypeScriptHelpers';

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

  describe('extractCommentContent()', () => {

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
      }
    ];

    for (let i: number = 0; i < testCases.length; ++i) {
      it(`JSDoc test case ${i}`, () => {
        expect(TypeScriptHelpers.extractJSDocContent(testCases[i].input, console.log))
        .toBe(testCases[i].output);
      });
    }

  });

});
