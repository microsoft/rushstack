// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TreePattern } from '@rushstack/tree-pattern';

export interface IJestCallExpression {
  // Example: "mock" from "jest.mock('./thing')"
  methodName?: string;
}

// Matches a statement expression like this:
//   jest.mock('./thing')
//
// Tree:
//   {
//     type: 'CallExpression',
//     callee: {
//       type: 'MemberExpression',
//       object: {
//         type: 'Identifier',
//         name: 'jest'
//       },
//       property: {
//         type: 'Identifier',
//         name: 'mock'
//       }
//     },
//     arguments: [
//       {
//         type: 'Literal',
//         value: './thing'
//       }
//     ]
//   };
export const jestCallExpression: TreePattern = new TreePattern({
  type: 'CallExpression',
  callee: {
    type: 'MemberExpression',
    object: {
      type: 'Identifier',
      name: 'jest'
    },
    property: {
      type: 'Identifier',
      name: TreePattern.tag('methodName')
    }
  }
});

// Matches require() in a statement expression like this:
//   const x = require("package-name");
export const requireCallExpression: TreePattern = new TreePattern({
  type: 'CallExpression',
  callee: {
    type: 'Identifier',
    name: 'require'
  }
});

// Matches import in a statement expression like this:
//   const x = import("package-name");
export const importExpression: TreePattern = new TreePattern({
  type: 'ImportExpression',
  source: {
    type: 'Literal'
  }
});
