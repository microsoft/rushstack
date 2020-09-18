// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MatchTree, TreeNode } from '@rushstack/match-tree';

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
export const jestCallExpression: TreeNode = {
  type: 'CallExpression',
  callee: {
    type: 'MemberExpression',
    object: {
      type: 'Identifier',
      name: 'jest'
    },
    property: {
      type: 'Identifier',
      name: MatchTree.tag('methodName')
    }
  }
};

// Matches require() in a statement expression like this:
//   const x = require("package-name");
export const requireCallExpression: TreeNode = {
  type: 'CallExpression',
  callee: {
    type: 'Identifier',
    name: 'require'
  }
};

// Matches import in a statement expression like this:
//   const x = import("package-name");
export const importExpression: TreeNode = {
  type: 'ImportExpression',
  source: {
    type: 'Literal'
  }
};
