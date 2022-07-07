// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DependencySpecifier } from '../DependencySpecifier';

describe(DependencySpecifier.name, () => {
  it('parses correctly', () => {
    for (const specifier of [
      'workspace:@rushstack/heft@3.2.4',
      'workspace:foo@^3.2.1',
      'workspace:*',
      'npm:@rushstack/heft@3.2.4',
      'npm:foo@^3.2.1',
      'npm:bar@',
      '^1.2.3',
      '~24.42.1',
      '^0',
      '3',
      '*',
      ''
    ]) {
      expect(new DependencySpecifier('foo', specifier)).toMatchSnapshot(specifier);
    }
  });
});
