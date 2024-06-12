// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { DependencySpecifier } from '../DependencySpecifier';

describe(DependencySpecifier.name, () => {
  it('parses a simple version', () => {
    const specifier = new DependencySpecifier('dep', '1.2.3');
    expect(specifier).toMatchInlineSnapshot(`
DependencySpecifier {
  "aliasTarget": undefined,
  "packageName": "dep",
  "specifierType": "Version",
  "versionSpecifier": "1.2.3",
}
`);
  });

  it('parses a range version', () => {
    const specifier = new DependencySpecifier('dep', '^1.2.3');
    expect(specifier).toMatchInlineSnapshot(`
DependencySpecifier {
  "aliasTarget": undefined,
  "packageName": "dep",
  "specifierType": "Range",
  "versionSpecifier": "^1.2.3",
}
`);
  });

  it('parses an alias version', () => {
    const specifier = new DependencySpecifier('dep', 'npm:alias-target@1.2.3');
    expect(specifier).toMatchInlineSnapshot(`
DependencySpecifier {
  "aliasTarget": DependencySpecifier {
    "aliasTarget": undefined,
    "packageName": "alias-target",
    "specifierType": "Version",
    "versionSpecifier": "1.2.3",
  },
  "packageName": "dep",
  "specifierType": "Alias",
  "versionSpecifier": "npm:alias-target@1.2.3",
}
`);
  });

  it('parses a git version', () => {
    const specifier = new DependencySpecifier('dep', 'git+https://github.com/user/foo');
    expect(specifier).toMatchInlineSnapshot(`
DependencySpecifier {
  "aliasTarget": undefined,
  "packageName": "dep",
  "specifierType": "Git",
  "versionSpecifier": "git+https://github.com/user/foo",
}
`);
  });

  it('parses a file version', () => {
    const specifier = new DependencySpecifier('dep', 'file:foo.tar.gz');
    expect(specifier).toMatchInlineSnapshot(`
DependencySpecifier {
  "aliasTarget": undefined,
  "packageName": "dep",
  "specifierType": "File",
  "versionSpecifier": "file:foo.tar.gz",
}
`);
  });

  it('parses a directory version', () => {
    const specifier = new DependencySpecifier('dep', 'file:../foo/bar/');
    expect(specifier).toMatchInlineSnapshot(`
DependencySpecifier {
  "aliasTarget": undefined,
  "packageName": "dep",
  "specifierType": "Directory",
  "versionSpecifier": "file:../foo/bar/",
}
`);
  });

  it('parses a remote version', () => {
    const specifier = new DependencySpecifier('dep', 'https://example.com/foo.tgz');
    expect(specifier).toMatchInlineSnapshot(`
DependencySpecifier {
  "aliasTarget": undefined,
  "packageName": "dep",
  "specifierType": "Remote",
  "versionSpecifier": "https://example.com/foo.tgz",
}
`);
  });

  describe('Workspace protocol', () => {
    it('correctly parses a "workspace:*" version', () => {
      const specifier = new DependencySpecifier('dep', 'workspace:*');
      expect(specifier).toMatchInlineSnapshot(`
DependencySpecifier {
  "aliasTarget": undefined,
  "packageName": "dep",
  "specifierType": "Workspace",
  "versionSpecifier": "*",
}
`);
    });

    it('correctly parses a "workspace:^1.0.0" version', () => {
      const specifier = new DependencySpecifier('dep', 'workspace:^1.0.0');
      expect(specifier).toMatchInlineSnapshot(`
DependencySpecifier {
  "aliasTarget": undefined,
  "packageName": "dep",
  "specifierType": "Workspace",
  "versionSpecifier": "^1.0.0",
}
`);
    });

    it('correctly parses a "workspace:alias@1.2.3" version', () => {
      const specifier = new DependencySpecifier('dep', 'workspace:alias-target@*');
      expect(specifier).toMatchInlineSnapshot(`
DependencySpecifier {
  "aliasTarget": DependencySpecifier {
    "aliasTarget": undefined,
    "packageName": "alias-target",
    "specifierType": "Range",
    "versionSpecifier": "*",
  },
  "packageName": "dep",
  "specifierType": "Workspace",
  "versionSpecifier": "alias-target@*",
}
`);
    });
  });
});
