// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SelectorExpressionParser } from '../SelectorExpressionParser';

describe(SelectorExpressionParser.name, () => {
  describe('parse', () => {
    it('parses one project name', () => {
      expect(SelectorExpressionParser.parse('@acme/dynamite')).toEqual({
        selector: '@acme/dynamite'
      });
    });

    it('parses a generic selector', () => {
      expect(SelectorExpressionParser.parse('animal:zebra')).toEqual({
        selector: 'animal:zebra'
      });
    });

    it('parses an expression with parentheses and operators', () => {
      expect(SelectorExpressionParser.parse('(A or B or C) and tag:XYZ')).toEqual({
        op: 'and',
        args: [
          {
            op: 'or',
            args: [
              {
                op: 'or',
                args: [{ selector: 'A' }, { selector: 'B' }]
              },
              {
                selector: 'C'
              }
            ]
          },
          {
            selector: 'tag:XYZ'
          }
        ]
      });
    });

    it('applies operator precedence correctly', () => {
      expect(SelectorExpressionParser.parse('A and not B or not C and D')).toEqual({
        op: 'or',
        args: [
          {
            op: 'and',
            args: [
              {
                selector: 'A'
              },
              {
                op: 'not',
                args: [
                  {
                    selector: 'B'
                  }
                ]
              }
            ]
          },
          {
            op: 'and',
            args: [
              {
                op: 'not',
                args: [
                  {
                    selector: 'C'
                  }
                ]
              },
              {
                selector: 'D'
              }
            ]
          }
        ]
      });
    });

    it('treats selector parameter keywords as unary operators', () => {
      expect(SelectorExpressionParser.parse('to (A or B) and not from git:origin/main')).toEqual({
        op: 'and',
        args: [
          {
            op: 'to',
            args: [
              {
                op: 'or',
                args: [{ selector: 'A' }, { selector: 'B' }]
              }
            ]
          },
          {
            op: 'not',
            args: [
              {
                op: 'from',
                args: [
                  {
                    selector: 'git:origin/main'
                  }
                ]
              }
            ]
          }
        ]
      });
    });
  });
});
