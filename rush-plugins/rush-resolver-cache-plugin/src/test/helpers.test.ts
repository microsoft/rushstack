// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createBase32Hash, createShortSha256Hash } from '../pnpm/depPath/hash';
import { depPathToFilename as depPathToFilenameV8 } from '../pnpm/depPath/v8';
import { depPathToFilename as depPathToFilenameV9 } from '../pnpm/depPath/v9';
import { depPathToFilename as depPathToFilenameV10 } from '../pnpm/depPath/v10';
import {
  getDescriptionFileRootFromKey,
  extractNameAndVersionFromKey,
  resolveDependencyKey
} from '../helpers';
import { helpers as v8Helpers } from '../pnpm/v8';
import { helpers as v9Helpers } from '../pnpm/v9';
import { helpers as v10Helpers } from '../pnpm/v10';
import { getPnpmVersionHelpersAsync, type IPnpmVersionHelpers } from '../pnpm';
import { detectPnpmMajorVersion } from '../computeResolverCacheFromLockfileAsync';
import type { IResolverContext } from '../types';
import type { PnpmShrinkwrapFile } from '../externals';

describe(createBase32Hash.name, () => {
  it('hashes', () => {
    for (const input of ['a', 'abracadabra', '(eslint@8.57.0)(typescript@5.4.5)']) {
      expect(createBase32Hash(input)).toMatchSnapshot(input);
    }
  });
});

describe(createShortSha256Hash.name, () => {
  it('hashes', () => {
    for (const input of ['a', 'abracadabra', '(eslint@8.57.0)(typescript@5.4.5)']) {
      expect(createShortSha256Hash(input)).toMatchSnapshot(input);
    }
  });
});

describe('depPathToFilename', () => {
  it('formats v6 keys (leading /) with pnpm 8 hashing', () => {
    for (const input of [
      '/autoprefixer@9.8.8',
      '/autoprefixer@10.4.18(postcss@8.4.36)',
      '/react-transition-group@4.4.5(react-dom@17.0.2)(react@17.0.2)',
      '/@some/package@1.2.3(@azure/msal-browser@2.28.1)(@azure/msal-common@6.4.0)(@fluentui/merge-styles@8.6.2)(@fluentui/react@8.117.5)(@fluentui/theme@2.6.45)(@fluentui/utilities@8.15.2)(chart.js@2.9.4)(lodash@4.17.21)(moment@2.29.4)(prop-types@15.8.1)(react-dnd-html5-backend@14.1.0)(react-dnd@14.0.5)(react-dom@17.0.1)(react-intersection-observer@8.34.0)(react@17.0.1)',
      '/@storybook/core@6.5.15(@storybook/builder-webpack5@6.5.15)(@storybook/manager-webpack5@6.5.15)(eslint@8.57.0)(react-dom@17.0.1)(react@17.0.1)(typescript@5.3.3)(webpack@5.88.1)',
      '/@typescript-eslint/utils@6.19.1(eslint@7.7.0)(typescript@5.4.2)',
      'file:../../../rigs/local-node-rig',
      'file:../../../libraries/ts-command-line(@types/node@18.17.15)'
    ]) {
      expect(depPathToFilenameV8(input)).toMatchSnapshot(input);
    }
  });

  it('formats v9 keys (no leading /) with pnpm 10 hashing', () => {
    for (const input of [
      'autoprefixer@9.8.8',
      'autoprefixer@10.4.18(postcss@8.4.36)',
      '@some/package@1.2.3(@azure/msal-browser@2.28.1)(@azure/msal-common@6.4.0)',
      '@typescript-eslint/utils@6.19.1(eslint@7.7.0)(typescript@5.4.2)',
      '@fluentui/react-migration-v8-v9@9.9.7(@types/react-dom@17.0.17)(@types/react@17.0.45)(react-dom@17.0.1)(react@17.0.1)'
    ]) {
      expect(depPathToFilenameV10(input)).toMatchSnapshot(input);
    }
  });

  it('formats v9 keys (no leading /) with pnpm 9 hashing (same as v8)', () => {
    for (const input of [
      'autoprefixer@9.8.8',
      'autoprefixer@10.4.18(postcss@8.4.36)',
      '@some/package@1.2.3(@azure/msal-browser@2.28.1)(@azure/msal-common@6.4.0)',
      '@typescript-eslint/utils@6.19.1(eslint@7.7.0)(typescript@5.4.2)'
    ]) {
      // pnpm 9 uses the same dep-path hashing as pnpm 8 (MD5 base32)
      // but a different depPathToFilenameUnescaped (indexOf('@') vs lastIndexOf('/'))
      expect(depPathToFilenameV9(input)).toMatchSnapshot(input);
    }
  });
});

describe(getDescriptionFileRootFromKey.name, () => {
  it('parses v6 keys (leading /)', () => {
    const lockfileRoot: string = '/$';
    for (const { key, name } of [
      { key: '/autoprefixer@9.8.8' },
      { key: '/autoprefixer@10.4.18(postcss@8.4.36)' },
      { key: '/react-transition-group@4.4.5(react-dom@17.0.2)(react@17.0.2)' },
      {
        key: '/@some/package@1.2.3(@azure/msal-browser@2.28.1)(@azure/msal-common@6.4.0)(@fluentui/merge-styles@8.6.2)(@fluentui/react@8.117.5)(@fluentui/theme@2.6.45)(@fluentui/utilities@8.15.2)(chart.js@2.9.4)(lodash@4.17.21)(moment@2.29.4)(prop-types@15.8.1)(react-dnd-html5-backend@14.1.0)(react-dnd@14.0.5)(react-dom@17.0.1)(react-intersection-observer@8.34.0)(react@17.0.1)'
      },
      {
        key: '/@storybook/core@6.5.15(@storybook/builder-webpack5@6.5.15)(@storybook/manager-webpack5@6.5.15)(eslint@8.57.0)(react-dom@17.0.1)(react@17.0.1)(typescript@5.3.3)(webpack@5.88.1)'
      },
      { key: '/@typescript-eslint/utils@6.19.1(eslint@7.7.0)(typescript@5.4.2)' },
      { key: 'file:../../../rigs/local-node-rig', name: 'local-node-rig' },
      {
        key: 'file:../../../libraries/ts-command-line(@types/node@18.17.15)',
        name: '@rushstack/ts-command-line'
      }
    ]) {
      expect(getDescriptionFileRootFromKey(lockfileRoot, key, depPathToFilenameV8, name)).toMatchSnapshot(
        `"${key}",${name || ''}`
      );
    }
  });

  it('parses v9 keys (no leading /)', () => {
    const lockfileRoot: string = '/$';
    for (const { key, name } of [
      { key: 'autoprefixer@9.8.8' },
      { key: 'autoprefixer@10.4.18(postcss@8.4.36)' },
      { key: 'react-transition-group@4.4.5(react-dom@17.0.2)(react@17.0.2)' },
      {
        key: '@some/package@1.2.3(@azure/msal-browser@2.28.1)(@azure/msal-common@6.4.0)'
      },
      { key: '@typescript-eslint/utils@6.19.1(eslint@7.7.0)(typescript@5.4.2)' },
      { key: 'file:../../../rigs/local-node-rig', name: 'local-node-rig' },
      {
        key: 'file:../../../libraries/ts-command-line(@types/node@18.17.15)',
        name: '@rushstack/ts-command-line'
      }
    ]) {
      expect(getDescriptionFileRootFromKey(lockfileRoot, key, depPathToFilenameV10, name)).toMatchSnapshot(
        `"${key}",${name || ''}`
      );
    }
  });
});

describe(extractNameAndVersionFromKey.name, () => {
  it('extracts name and version from v6 keys (leading /)', () => {
    expect(extractNameAndVersionFromKey('/autoprefixer@9.8.8')).toEqual({
      name: 'autoprefixer',
      version: '9.8.8'
    });
    expect(extractNameAndVersionFromKey('/autoprefixer@10.4.18(postcss@8.4.36)')).toEqual({
      name: 'autoprefixer',
      version: '10.4.18'
    });
    expect(extractNameAndVersionFromKey('/@some/package@1.2.3(@azure/msal-browser@2.28.1)')).toEqual({
      name: '@some/package',
      version: '1.2.3'
    });
    expect(
      extractNameAndVersionFromKey('/@typescript-eslint/utils@6.19.1(eslint@7.7.0)(typescript@5.4.2)')
    ).toEqual({
      name: '@typescript-eslint/utils',
      version: '6.19.1'
    });
  });

  it('extracts name and version from v9 keys (no leading /)', () => {
    expect(extractNameAndVersionFromKey('autoprefixer@9.8.8')).toEqual({
      name: 'autoprefixer',
      version: '9.8.8'
    });
    expect(extractNameAndVersionFromKey('autoprefixer@10.4.18(postcss@8.4.36)')).toEqual({
      name: 'autoprefixer',
      version: '10.4.18'
    });
    expect(extractNameAndVersionFromKey('@some/package@1.2.3(@azure/msal-browser@2.28.1)')).toEqual({
      name: '@some/package',
      version: '1.2.3'
    });
    expect(
      extractNameAndVersionFromKey('@typescript-eslint/utils@6.19.1(eslint@7.7.0)(typescript@5.4.2)')
    ).toEqual({
      name: '@typescript-eslint/utils',
      version: '6.19.1'
    });
  });

  it('returns undefined for file: keys', () => {
    expect(extractNameAndVersionFromKey('file:../../../rigs/local-node-rig')).toBeUndefined();
    expect(
      extractNameAndVersionFromKey('file:../../../libraries/ts-command-line(@types/node@18.17.15)')
    ).toBeUndefined();
  });
});

describe('buildDependencyKey', () => {
  it('pnpm 8 prefixes with /', () => {
    expect(v8Helpers.buildDependencyKey('autoprefixer', '9.8.8')).toBe('/autoprefixer@9.8.8');
    expect(v8Helpers.buildDependencyKey('@scope/pkg', '1.0.0')).toBe('/@scope/pkg@1.0.0');
  });

  it('pnpm 9 does not prefix with /', () => {
    expect(v9Helpers.buildDependencyKey('autoprefixer', '9.8.8')).toBe('autoprefixer@9.8.8');
    expect(v9Helpers.buildDependencyKey('@scope/pkg', '1.0.0')).toBe('@scope/pkg@1.0.0');
  });

  it('pnpm 10 does not prefix with /', () => {
    expect(v10Helpers.buildDependencyKey('autoprefixer', '9.8.8')).toBe('autoprefixer@9.8.8');
    expect(v10Helpers.buildDependencyKey('@scope/pkg', '1.0.0')).toBe('@scope/pkg@1.0.0');
  });
});

describe('getStoreIndexPath', () => {
  const makeContext: (name: string, version?: string) => IResolverContext = (name, version) => ({
    descriptionFileRoot: '/test',
    descriptionFileHash: undefined,
    name,
    version,
    deps: new Map(),
    isProject: false,
    ordinal: 0
  });

  it('pnpm 8 uses v3/files/ store layout', () => {
    const result: string = v8Helpers.getStoreIndexPath(
      '/store',
      makeContext('autoprefixer', '9.8.8'),
      'abcdef1234567890'
    );
    expect(result).toBe('/store/v3/files/ab/cdef1234567890-index.json');
  });

  it('pnpm 9 uses v3/files/ store layout (same as v8)', () => {
    const result: string = v9Helpers.getStoreIndexPath(
      '/store',
      makeContext('autoprefixer', '9.8.8'),
      'abcdef1234567890'
    );
    expect(result).toBe('/store/v3/files/ab/cdef1234567890-index.json');
  });

  it('pnpm 10 uses v10/index/ store layout with name@version suffix', () => {
    const result: string = v10Helpers.getStoreIndexPath(
      '/store',
      makeContext('autoprefixer', '9.8.8'),
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    );
    // hash is truncated to 64 chars, then split at 2 chars
    expect(result).toBe(
      '/store/v10/index/ab/cdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890-autoprefixer@9.8.8.json'
    );
  });

  it('pnpm 10 replaces / with + in scoped package names', () => {
    const result: string = v10Helpers.getStoreIndexPath(
      '/store',
      makeContext('@scope/pkg', '1.0.0'),
      'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899'
    );
    expect(result).toBe(
      '/store/v10/index/aa/bbccddeeff00112233445566778899aabbccddeeff00112233445566778899-@scope+pkg@1.0.0.json'
    );
  });
});

describe(detectPnpmMajorVersion.name, () => {
  function makeLockfileStub(majorVersion: number, packageKeys: string[] = []): PnpmShrinkwrapFile {
    return {
      shrinkwrapFileMajorVersion: majorVersion,
      packages: new Map(packageKeys.map((k) => [k, {} as never]))
    } as unknown as PnpmShrinkwrapFile;
  }

  it('returns configured version when provided', () => {
    // Configured version should take precedence over lockfile heuristics
    expect(detectPnpmMajorVersion(makeLockfileStub(9), 10)).toBe(10);
    expect(detectPnpmMajorVersion(makeLockfileStub(6), 8)).toBe(8);
    expect(detectPnpmMajorVersion(makeLockfileStub(9), 9)).toBe(9);
  });

  it('returns 9 for lockfile v9+', () => {
    expect(detectPnpmMajorVersion(makeLockfileStub(9))).toBe(9);
    expect(detectPnpmMajorVersion(makeLockfileStub(10))).toBe(9);
  });

  it('returns 8 for lockfile v6', () => {
    expect(detectPnpmMajorVersion(makeLockfileStub(6))).toBe(8);
    expect(detectPnpmMajorVersion(makeLockfileStub(5))).toBe(8);
  });

  it('falls back to key inspection when shrinkwrapFileMajorVersion is 0', () => {
    // v6 keys start with /
    expect(detectPnpmMajorVersion(makeLockfileStub(0, ['/foo@1.0.0']))).toBe(8);
    // v9 keys have no leading /
    expect(detectPnpmMajorVersion(makeLockfileStub(0, ['foo@1.0.0']))).toBe(9);
  });

  it('skips file: keys during fallback inspection', () => {
    expect(detectPnpmMajorVersion(makeLockfileStub(0, ['file:../local', '/foo@1.0.0']))).toBe(8);
    expect(detectPnpmMajorVersion(makeLockfileStub(0, ['file:../local', 'foo@1.0.0']))).toBe(9);
  });

  it('returns 8 when no packages exist', () => {
    expect(detectPnpmMajorVersion(makeLockfileStub(0, []))).toBe(8);
  });
});

describe(getPnpmVersionHelpersAsync.name, () => {
  it('returns helpers for pnpm 8, 9, 10', async () => {
    const h8: IPnpmVersionHelpers = await getPnpmVersionHelpersAsync(8);
    const h9: IPnpmVersionHelpers = await getPnpmVersionHelpersAsync(9);
    const h10: IPnpmVersionHelpers = await getPnpmVersionHelpersAsync(10);
    // v8 keys have leading /
    expect(h8.buildDependencyKey('foo', '1.0.0')).toBe('/foo@1.0.0');
    // v9/v10 keys have no leading /
    expect(h9.buildDependencyKey('foo', '1.0.0')).toBe('foo@1.0.0');
    expect(h10.buildDependencyKey('foo', '1.0.0')).toBe('foo@1.0.0');
  });

  it('throws for unsupported version', async () => {
    await expect(getPnpmVersionHelpersAsync(7 as never)).rejects.toThrow('Unsupported pnpm major version');
  });
});

describe(resolveDependencyKey.name, () => {
  const lockfileFolder: string = '/$root';

  const makeProjectContext: () => IResolverContext = () => ({
    descriptionFileRoot: '/$root/../../../projects/my-app',
    descriptionFileHash: undefined,
    name: 'my-app',
    isProject: true,
    deps: new Map(),
    ordinal: 0
  });

  const makePackageContext: () => IResolverContext = () => ({
    descriptionFileRoot: '/$root/node_modules/.pnpm/foo@1.0.0/node_modules/foo',
    descriptionFileHash: undefined,
    name: 'foo',
    isProject: false,
    deps: new Map(),
    ordinal: 0
  });

  it('resolves link: specifier for project context', () => {
    const result: string = resolveDependencyKey(
      lockfileFolder,
      'bar',
      'link:../bar',
      makeProjectContext(),
      v9Helpers
    );
    // path.posix.join resolves the relative segments
    expect(result).toBe('/projects/bar');
  });

  it('resolves link: specifier for non-project context', () => {
    const result: string = resolveDependencyKey(
      lockfileFolder,
      'bar',
      'link:../bar',
      makePackageContext(),
      v9Helpers
    );
    // path.posix.join resolves the relative path
    expect(result).toBe('/bar');
  });

  it('resolves file: specifier', () => {
    const result: string = resolveDependencyKey(
      lockfileFolder,
      'my-rig',
      'file:../../../rigs/local-node-rig',
      makeProjectContext(),
      v9Helpers
    );
    expect(result).toContain('node_modules/.pnpm/');
    expect(result).toContain('/node_modules/my-rig');
  });

  it('resolves specifier found in packageKeys (v6)', () => {
    const packageKeys: Set<string> = new Set(['/autoprefixer@9.8.8']);
    const result: string = resolveDependencyKey(
      lockfileFolder,
      'autoprefixer',
      '/autoprefixer@9.8.8',
      makeProjectContext(),
      v8Helpers,
      packageKeys
    );
    expect(result).toContain('/node_modules/.pnpm/');
    expect(result).toContain('/node_modules/autoprefixer');
  });

  it('resolves specifier found in packageKeys (v9)', () => {
    const packageKeys: Set<string> = new Set(['autoprefixer@9.8.8']);
    const result: string = resolveDependencyKey(
      lockfileFolder,
      'autoprefixer',
      'autoprefixer@9.8.8',
      makeProjectContext(),
      v9Helpers,
      packageKeys
    );
    expect(result).toContain('/node_modules/.pnpm/');
    expect(result).toContain('/node_modules/autoprefixer');
  });

  it('builds dependency key for plain version specifiers (v9)', () => {
    const result: string = resolveDependencyKey(
      lockfileFolder,
      'autoprefixer',
      '9.8.8',
      makeProjectContext(),
      v9Helpers
    );
    expect(result).toContain('/node_modules/.pnpm/');
    expect(result).toContain('/node_modules/autoprefixer');
  });

  it('builds dependency key for plain version specifiers (v8)', () => {
    const result: string = resolveDependencyKey(
      lockfileFolder,
      'autoprefixer',
      '9.8.8',
      makeProjectContext(),
      v8Helpers
    );
    expect(result).toContain('/node_modules/.pnpm/');
    expect(result).toContain('/node_modules/autoprefixer');
  });
});
