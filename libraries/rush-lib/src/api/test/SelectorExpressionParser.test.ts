// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SelectorExpressionParser } from '../SelectorExpressionParser';

const KEYWORDS = ['to', 'from'];

describe(SelectorExpressionParser.name, () => {
  describe('parse', () => {
    it('parses one project name', () => {
      expect(SelectorExpressionParser.parse('@acme/dynamite', KEYWORDS)).toMatchInlineSnapshot(`
Object {
  "scope": "name",
  "value": "@acme/dynamite",
}
`);
    });

    it('parses a generic selector', () => {
      expect(SelectorExpressionParser.parse('animal:zebra', KEYWORDS)).toMatchInlineSnapshot(`
Object {
  "scope": "animal",
  "value": "zebra",
}
`);
    });

    it('parses an expression with parentheses and operators', () => {
      expect(SelectorExpressionParser.parse('(A or B or C) and tag:XYZ', KEYWORDS)).toMatchInlineSnapshot(`
Object {
  "args": Array [
    Object {
      "args": Array [
        Object {
          "args": Array [
            Object {
              "scope": "name",
              "value": "A",
            },
            Object {
              "scope": "name",
              "value": "B",
            },
          ],
          "op": "or",
        },
        Object {
          "scope": "name",
          "value": "C",
        },
      ],
      "op": "or",
    },
    Object {
      "scope": "tag",
      "value": "XYZ",
    },
  ],
  "op": "and",
}
`);
    });

    it('applies operator precedence correctly', () => {
      expect(SelectorExpressionParser.parse('A and not B or not C and D', KEYWORDS)).toMatchInlineSnapshot(`
Object {
  "args": Array [
    Object {
      "args": Array [
        Object {
          "scope": "name",
          "value": "A",
        },
        Object {
          "args": Array [
            Object {
              "scope": "name",
              "value": "B",
            },
          ],
          "op": "not",
        },
      ],
      "op": "and",
    },
    Object {
      "args": Array [
        Object {
          "args": Array [
            Object {
              "scope": "name",
              "value": "C",
            },
          ],
          "op": "not",
        },
        Object {
          "scope": "name",
          "value": "D",
        },
      ],
      "op": "and",
    },
  ],
  "op": "or",
}
`);
    });

    it('treats selector parameter keywords as unary operators', () => {
      expect(SelectorExpressionParser.parse('to (A or B) and not from git:origin/main', KEYWORDS))
        .toMatchInlineSnapshot(`
Object {
  "args": Array [
    Object {
      "arg": Object {
        "args": Array [
          Object {
            "scope": "name",
            "value": "A",
          },
          Object {
            "scope": "name",
            "value": "B",
          },
        ],
        "op": "or",
      },
      "filter": "to",
    },
    Object {
      "args": Array [
        Object {
          "arg": Object {
            "scope": "git",
            "value": "origin/main",
          },
          "filter": "from",
        },
      ],
      "op": "not",
    },
  ],
  "op": "and",
}
`);
    });

    it('raises error if string starts with binary operator', () => {
      expect(() => SelectorExpressionParser.parse('and foobar', KEYWORDS)).toThrowError(
        `Expected partial expression (unary operator, filter, or selector) but encountered 'and' instead (parsing expression 'and foobar').`
      );
    });

    it('raises error if binary operator missing final operand', () => {
      expect(() => SelectorExpressionParser.parse('foo or ', KEYWORDS)).toThrowError(
        `Expected partial expression (unary operator, filter, or selector) but encountered end of expression (parsing expression 'foo or ').`
      );
    });

    it('raises error on unmatched left parentheses', () => {
      expect(() => SelectorExpressionParser.parse('(foo or bar', KEYWORDS)).toThrowError(
        `Expected ')' somewhere in expression but encountered end of expression (parsing expression '(foo or bar').`
      );
    });

    it('raises error on unmatched right parentheses', () => {
      expect(() => SelectorExpressionParser.parse('(foo or bar))', KEYWORDS)).toThrowError(
        `Encountered unmatched ')' in selector expression (parsing expression '(foo or bar))').`
      );
    });

    it('raises error if filter is missing an argument', () => {
      expect(() => SelectorExpressionParser.parse('(tag:A and not)', KEYWORDS)).toThrowError(
        `Expected partial expression (unary operator, filter, or selector) but encountered ')' instead (parsing expression '(tag:A and not)').`
      );
    });
  });
});
