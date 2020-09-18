// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { MatchTree } from './matchTree';

export interface IPattern {
  branch?: string;
}

const pattern = {
  a: [
    1,
    2,
    MatchTree.matchTreeArg('branch', {
      b: []
    })
  ]
};

describe('matchTree', () => {
  test('matches using matchTreeArg', () => {
    const tree = {
      a: [
        1,
        2,
        {
          b: [],
          extra: 'hi'
        }
      ],
      b: 123
    };

    const captures: IPattern = {};
    expect(MatchTree.matchTree(tree, pattern, captures)).toBe(true);
    expect(captures.branch).toMatchObject({
      b: [],
      extra: 'hi'
    });
  });
});
