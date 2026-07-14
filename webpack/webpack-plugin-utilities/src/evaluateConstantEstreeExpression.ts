// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Expression, PrivateIdentifier, SpreadElement } from 'estree';

/**
 * Statically evaluates an ESTree (acorn) expression node into its corresponding
 * runtime JavaScript value.
 *
 * @remarks
 * This is intended to be used inside webpack plugins and loaders that hook into
 * the parser (for example `parser.hooks.call`) and need to read the literal
 * arguments passed to a function call at build time, without actually executing
 * the user's code. A common use case is extracting a plain options object that
 * was passed to a custom `require()`-style expression.
 *
 * Only a small subset of expression types is supported, namely those needed to
 * express JSON-like constant values:
 *
 * - `Literal` (strings, numbers, booleans, `null`, etc.)
 * - `UnaryExpression` (the `-`, `+`, `!`, and `~` operators applied to a constant
 *   argument, e.g. the `-1` in `{ count: -1 }`)
 * - `TemplateLiteral` (only when it has no `${...}` substitutions)
 * - `ObjectExpression` (with non-computed identifier keys)
 * - `ArrayExpression` (including sparse holes, which evaluate to `null`)
 *
 * @example
 * ```ts
 * // Given source: requireFolder({ outputFolder: 'assets', sources: [] })
 * const options: IRequireFolderOptions = evaluateConstantEstreeExpression(callExpression.arguments[0]);
 * ```
 *
 * @remarks Limitations
 * Because the node is evaluated statically rather than executed, anything that
 * is not a compile-time constant is unsupported and will cause an `Error` to be
 * thrown. This includes:
 *
 * - Identifiers and variable references (e.g. `someVariable`)
 * - Computed property keys (e.g. `{ [key]: value }`)
 * - Spread elements in object expressions (e.g. `{ ...other }`)
 * - Function calls, template literals, and any other expression type not listed above
 *
 * @param node - The ESTree expression node to evaluate.
 * @returns The evaluated value, cast to the caller-specified type `TNode`. Note
 * that the cast is unchecked; the caller is responsible for validating that the
 * returned shape matches `TNode`.
 * @throws An `Error` if the node (or any nested node) uses an unsupported
 * expression type or syntax.
 * @beta
 */
export function evaluateConstantEstreeExpression<TNode>(node: Expression | SpreadElement): TNode {
  switch (node.type) {
    case 'Literal': {
      return node.value as TNode;
    }

    case 'UnaryExpression': {
      const argumentValue: unknown = evaluateConstantEstreeExpression(node.argument);
      switch (node.operator) {
        case '-': {
          return -(argumentValue as number) as TNode;
        }
        case '+': {
          return +(argumentValue as number) as TNode;
        }
        case '!': {
          return !argumentValue as TNode;
        }
        case '~': {
          return ~(argumentValue as number) as TNode;
        }
        default: {
          throw new Error(`Unsupported unary operator: "${node.operator}"`);
        }
      }
    }

    case 'TemplateLiteral': {
      if (node.expressions.length > 0) {
        throw new Error('Template literals with substitutions are not supported');
      }

      return node.quasis[0].value.cooked as TNode;
    }

    case 'ObjectExpression': {
      const result: Record<string, unknown> = {};

      for (const property of node.properties) {
        if (property.type === 'SpreadElement') {
          throw new Error('Spread elements are not supported in object expressions');
        }

        const keyNode: Expression | PrivateIdentifier = property.key;
        if (keyNode.type !== 'Identifier' || property.computed) {
          throw new Error('Property keys must be non-computed identifiers');
        }

        const key: string = keyNode.name;
        const value: unknown = evaluateConstantEstreeExpression(property.value as Expression);
        result[key] = value;
      }

      return result as TNode;
    }

    case 'ArrayExpression': {
      return node.elements.map((element) =>
        element === null ? null : evaluateConstantEstreeExpression(element)
      ) as TNode;
    }

    default: {
      throw new Error(`Unsupported node type: "${node.type}"`);
    }
  }
}
