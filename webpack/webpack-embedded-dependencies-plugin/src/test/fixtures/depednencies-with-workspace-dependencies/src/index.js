import mod from 'fake-package-mit-license';
import { TreePattern, TreeNode } from '@rushstack/tree-pattern';

const pattern1 = new TreePattern({
  a: [
    1,
    2,
    TreePattern.tag('branch', {
      b: []
    })
  ]
});

console.log(pattern1, mod);
