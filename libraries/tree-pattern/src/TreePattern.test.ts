// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TreePattern, type TreeNode } from './TreePattern.ts';

export interface IMyPattern {
  branch?: string;
}

const pattern1: TreePattern = new TreePattern({
  a: [
    1,
    2,
    TreePattern.tag('branch', {
      b: []
    })
  ]
});

const pattern2: TreePattern = new TreePattern({
  c: TreePattern.oneOf([
    123,
    {
      d: 1
    }
  ])
});

describe(TreePattern.name, () => {
  it('matches using a tag', () => {
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
    expect(pattern1.match(tree1, captures)).toBe(true);
    expect(captures.branch).toMatchObject({
      b: [],
      extra: 'hi'
    });
  });

  it('matches alternatives', () => {
    const tree2a: TreeNode = {
      c: 123
    };
    expect(pattern2.match(tree2a)).toBe(true);

    const tree2b: TreeNode = {
      c: { d: 1 }
    };
    expect(pattern2.match(tree2b)).toBe(true);

    const tree2c: TreeNode = {
      c: 321
    };
    expect(pattern2.match(tree2c)).toBe(false);
  });
});
