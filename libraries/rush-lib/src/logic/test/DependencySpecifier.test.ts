// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DependencySpecifier } from '../DependencySpecifier';

describe(DependencySpecifier.name, () => {
  it('correctly parses workspace protocol in package.json', () => {
    const specifier = new DependencySpecifier('dep', 'workspace:*');
    expect(specifier.versionSpecifier).toBe('*');
    expect(specifier.aliasTarget).toBeUndefined();

    const specifier2 = new DependencySpecifier('dep', 'workspace:^1.0.0');
    expect(specifier2.versionSpecifier).toBe('^1.0.0');
    expect(specifier2.aliasTarget).toBeUndefined();

    const specifier3 = new DependencySpecifier('dep', 'workspace:alias-target@*');
    expect(specifier3.versionSpecifier).toBe('alias-target@*');
    expect(specifier3.aliasTarget?.packageName).toBe('alias-target');
    expect(specifier3.aliasTarget?.versionSpecifier).toBe('*');
  });
});
