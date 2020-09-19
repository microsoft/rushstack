// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TreePattern, TreeNode } from './TreePattern';

export interface IMyPattern {
  branch?: string;
}

const pattern1: TreeNode = {
  a: [
    1,
    2,
    TreePattern.tag('branch', {
      b: []
    })
  ]
};

const pattern2: TreeNode = {
  c: TreePattern.oneOf([
    123,
    {
      d: 1
    }
  ])
};

describe('TreePattern', () => {
  test('matches using a tag', () => {
    const tree1: TreeNode = {
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

    const captures: IMyPattern = {};
    expect(TreePattern.match(tree1, pattern1, captures)).toBe(true);
    expect(captures.branch).toMatchObject({
      b: [],
      extra: 'hi'
    });
  });

  test('matches alternatives', () => {
    const tree2a: TreeNode = {
      c: 123
    };
    expect(TreePattern.match(tree2a, pattern2)).toBe(true);

    const tree2b: TreeNode = {
      c: { d: 1 }
    };
    expect(TreePattern.match(tree2b, pattern2)).toBe(true);

    const tree2c: TreeNode = {
      c: 321
    };
    expect(TreePattern.match(tree2c, pattern2)).toBe(false);
  });
});
