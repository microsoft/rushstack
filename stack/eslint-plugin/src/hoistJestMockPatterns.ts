// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { matchTreeArg } from './matchTree';

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
export const jestCallExpression = {
  type: 'CallExpression',
  callee: {
    type: 'MemberExpression',
    object: {
      type: 'Identifier',
      name: 'jest'
    },
    property: {
      type: 'Identifier',
      name: matchTreeArg('methodName')
    }
  }
};
