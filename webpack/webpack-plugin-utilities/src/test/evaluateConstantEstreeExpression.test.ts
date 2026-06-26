// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  ArrayExpression,
  Expression,
  Identifier,
  ObjectExpression,
  Property,
  SimpleLiteral,
  SpreadElement,
  TemplateLiteral,
  UnaryExpression,
  UnaryOperator
} from 'estree';

import { evaluateConstantEstreeExpression } from '../evaluateConstantEstreeExpression';

// Minimal typed builders for the subset of ESTree nodes used by these tests.
// They intentionally only populate the fields that `evaluateConstantEstreeExpression` reads.

function literal(value: SimpleLiteral['value']): SimpleLiteral {
  return { type: 'Literal', value };
}

function identifier(name: string): Identifier {
  return { type: 'Identifier', name };
}

function unary(operator: UnaryOperator, argument: Expression): UnaryExpression {
  return { type: 'UnaryExpression', operator, prefix: true, argument };
}

function templateLiteral(cooked: string, expressions: Expression[] = []): TemplateLiteral {
  return {
    type: 'TemplateLiteral',
    expressions,
    quasis: [
      {
        type: 'TemplateElement',
        tail: true,
        value: { cooked, raw: cooked }
      }
    ]
  };
}

function array(elements: ArrayExpression['elements']): ArrayExpression {
  return { type: 'ArrayExpression', elements };
}

function property(key: Expression, value: Expression, options: { computed?: boolean } = {}): Property {
  return {
    type: 'Property',
    key,
    value,
    kind: 'init',
    method: false,
    shorthand: false,
    computed: options.computed ?? false
  };
}

function object(properties: Array<Property | SpreadElement>): ObjectExpression {
  return { type: 'ObjectExpression', properties };
}

describe(evaluateConstantEstreeExpression.name, () => {
  describe('Literal', () => {
    it('evaluates string literals', () => {
      expect(evaluateConstantEstreeExpression(literal('hello'))).toBe('hello');
    });

    it('evaluates number literals', () => {
      expect(evaluateConstantEstreeExpression(literal(42))).toBe(42);
    });

    it('evaluates boolean literals', () => {
      expect(evaluateConstantEstreeExpression(literal(true))).toBe(true);
      expect(evaluateConstantEstreeExpression(literal(false))).toBe(false);
    });

    it('evaluates null literals', () => {
      expect(evaluateConstantEstreeExpression(literal(null))).toBeNull();
    });
  });

  describe('UnaryExpression', () => {
    it('evaluates negated numbers', () => {
      expect(evaluateConstantEstreeExpression(unary('-', literal(1)))).toBe(-1);
    });

    it('evaluates the unary plus operator', () => {
      expect(evaluateConstantEstreeExpression(unary('+', literal(5)))).toBe(5);
    });

    it('evaluates the logical not operator', () => {
      expect(evaluateConstantEstreeExpression(unary('!', literal(false)))).toBe(true);
      expect(evaluateConstantEstreeExpression(unary('!', literal(0)))).toBe(true);
      expect(evaluateConstantEstreeExpression(unary('!', literal('')))).toBe(true);
    });

    it('evaluates the bitwise not operator', () => {
      expect(evaluateConstantEstreeExpression(unary('~', literal(0)))).toBe(-1);
    });

    it('throws for unsupported unary operators', () => {
      expect(() => evaluateConstantEstreeExpression(unary('typeof', literal('x')))).toThrow(
        'Unsupported unary operator: "typeof"'
      );
    });
  });

  describe('TemplateLiteral', () => {
    it('evaluates a template literal with no substitutions', () => {
      expect(evaluateConstantEstreeExpression(templateLiteral('hello'))).toBe('hello');
    });

    it('throws for template literals with substitutions', () => {
      const node: TemplateLiteral = templateLiteral('hello', [literal('world')]);
      expect(() => evaluateConstantEstreeExpression(node)).toThrow(
        'Template literals with substitutions are not supported'
      );
    });
  });

  describe('ArrayExpression', () => {
    it('evaluates an array of literals', () => {
      const node: ArrayExpression = array([literal(1), literal('two'), literal(true)]);
      expect(evaluateConstantEstreeExpression(node)).toEqual([1, 'two', true]);
    });

    it('evaluates an empty array', () => {
      expect(evaluateConstantEstreeExpression(array([]))).toEqual([]);
    });

    it('evaluates sparse holes as null', () => {
      const node: ArrayExpression = array([literal(1), null, literal(3)]);
      expect(evaluateConstantEstreeExpression(node)).toEqual([1, null, 3]);
    });

    it('evaluates nested arrays', () => {
      const node: ArrayExpression = array([array([literal(1)]), array([literal(2)])]);
      expect(evaluateConstantEstreeExpression(node)).toEqual([[1], [2]]);
    });
  });

  describe('ObjectExpression', () => {
    it('evaluates an object with identifier keys', () => {
      const node: ObjectExpression = object([
        property(identifier('outputFolder'), literal('assets')),
        property(identifier('count'), unary('-', literal(1)))
      ]);
      expect(evaluateConstantEstreeExpression(node)).toEqual({ outputFolder: 'assets', count: -1 });
    });

    it('evaluates an empty object', () => {
      expect(evaluateConstantEstreeExpression(object([]))).toEqual({});
    });

    it('evaluates nested objects and arrays', () => {
      const node: ObjectExpression = object([
        property(
          identifier('sources'),
          array([object([property(identifier('globsBase'), literal('./assets'))])])
        )
      ]);
      expect(evaluateConstantEstreeExpression(node)).toEqual({
        sources: [{ globsBase: './assets' }]
      });
    });

    it('throws for computed keys', () => {
      const node: ObjectExpression = object([
        property(identifier('key'), literal('value'), { computed: true })
      ]);
      expect(() => evaluateConstantEstreeExpression(node)).toThrow(
        'Property keys must be non-computed identifiers'
      );
    });

    it('throws for non-identifier keys', () => {
      const node: ObjectExpression = object([property(literal('key'), literal('value'))]);
      expect(() => evaluateConstantEstreeExpression(node)).toThrow(
        'Property keys must be non-computed identifiers'
      );
    });

    it('throws for spread elements', () => {
      const node: ObjectExpression = object([{ type: 'SpreadElement', argument: identifier('other') }]);
      expect(() => evaluateConstantEstreeExpression(node)).toThrow(
        'Spread elements are not supported in object expressions'
      );
    });
  });

  describe('unsupported nodes', () => {
    it('throws for identifiers', () => {
      expect(() => evaluateConstantEstreeExpression(identifier('someVariable'))).toThrow(
        'Unsupported node type: "Identifier"'
      );
    });

    it('throws for call expressions', () => {
      const node: Expression = {
        type: 'CallExpression',
        callee: identifier('fn'),
        arguments: [],
        optional: false
      };
      expect(() => evaluateConstantEstreeExpression(node)).toThrow('Unsupported node type: "CallExpression"');
    });
  });
});
