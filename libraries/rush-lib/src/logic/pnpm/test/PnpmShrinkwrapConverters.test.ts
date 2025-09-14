// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LockfileFileV9, PackageSnapshot, ProjectSnapshot } from '@pnpm/lockfile.types';
import { convertLockfileV9ToLockfileObject } from '../PnpmShrinkWrapFileConverters';
import { FileSystem } from '@rushstack/node-core-library';
import yamlModule from 'js-yaml';

describe(convertLockfileV9ToLockfileObject.name, () => {
  const lockfileContent: string = FileSystem.readFile(
    `${__dirname}/yamlFiles/pnpm-lock-v9/pnpm-lock-v9.yaml`
  );
  const lockfileJson: LockfileFileV9 = yamlModule.load(lockfileContent) as LockfileFileV9;
  const lockfile = convertLockfileV9ToLockfileObject(lockfileJson);

  it('merge packages and snapshots', () => {
    const packages = new Map<string, PackageSnapshot>(Object.entries(lockfile.packages || {}));
    const padLeftPackage = packages.get('pad-left@2.1.0');
    expect(padLeftPackage).toBeDefined();
    expect(padLeftPackage?.dependencies).toEqual({
      'repeat-string': '1.6.1'
    });
  });

  it("importers['.']", () => {
    const importers = new Map<string, ProjectSnapshot>(Object.entries(lockfile.importers || {}));

    const currentPackage = importers.get('.');
    expect(currentPackage).toBeDefined();

    expect(currentPackage?.dependencies).toEqual({
      jquery: '3.7.1',
      'pad-left': '2.1.0'
    });

    expect(currentPackage?.specifiers).toEqual({
      jquery: '^3.7.1',
      'pad-left': '^2.1.0'
    });
  });

  it('no nullish values', () => {
    const importers = new Map<string, ProjectSnapshot>(Object.entries(lockfile.importers || {}));

    const currentPackage = importers.get('.');
    const props = Object.keys(currentPackage || {});
    expect(props).toContain('dependencies');
    expect(props).toContain('specifiers');
    expect(props).not.toContain('optionalDependencies');
    expect(props).not.toContain('devDependencies');
  });
});
