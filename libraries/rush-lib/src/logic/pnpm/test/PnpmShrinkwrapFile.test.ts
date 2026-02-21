// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type DependencySpecifier, DependencySpecifierType } from '../../DependencySpecifier.ts';
import {
  PnpmShrinkwrapFile,
  parsePnpm9DependencyKey,
  parsePnpmDependencyKey
} from '../PnpmShrinkwrapFile.ts';
import { RushConfiguration } from '../../../api/RushConfiguration.ts';
import type { RushConfigurationProject } from '../../../api/RushConfigurationProject.ts';
import type { Subspace } from '../../../api/Subspace.ts';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { PnpmOptionsConfiguration } from '../PnpmOptionsConfiguration.ts';
import { AlreadyReportedError } from '@rushstack/node-core-library';

const DEPENDENCY_NAME: string = 'dependency_name';
const SCOPED_DEPENDENCY_NAME: string = '@scope/dependency_name';
const VERSION: string = '1.4.0';
const PRERELEASE_VERSION: string = '1.4.0-prerelease.0';

describe(PnpmShrinkwrapFile.name, () => {
  describe(parsePnpmDependencyKey.name, () => {
    it('Does not support file:// specifiers', () => {
      const parsedSpecifier: DependencySpecifier | undefined = parsePnpmDependencyKey(
        DEPENDENCY_NAME,
        'file:///path/to/file'
      );
      expect(parsedSpecifier).toBeUndefined();
    });

    it('Supports a variety of non-aliased package specifiers', () => {
      function testSpecifiers(specifiers: string[], expectedName: string, expectedVersion: string): void {
        for (const specifier of specifiers) {
          const parsedSpecifier: DependencySpecifier | undefined = parsePnpmDependencyKey(
            expectedName,
            specifier
          );
          expect(parsedSpecifier).toBeDefined();
          expect(parsedSpecifier!.specifierType).toBe(DependencySpecifierType.Version);
          expect(parsedSpecifier!.packageName).toBe(expectedName);
          expect(parsedSpecifier!.versionSpecifier).toBe(expectedVersion);
        }
      }

      // non-scoped, non-prerelease
      testSpecifiers(
        [
          `path.pkgs.visualstudio.com/${DEPENDENCY_NAME}/${VERSION}`,
          `/${DEPENDENCY_NAME}/${VERSION}`,
          `/${DEPENDENCY_NAME}/${VERSION}/peer1@3.5.0+peer2@1.17.7`
        ],
        DEPENDENCY_NAME,
        VERSION
      );

      // scoped, non-prerelease
      testSpecifiers(
        [
          `path.pkgs.visualstudio.com/${SCOPED_DEPENDENCY_NAME}/${VERSION}`,
          `/${SCOPED_DEPENDENCY_NAME}/${VERSION}`,
          `/${SCOPED_DEPENDENCY_NAME}/${VERSION}/peer1@3.5.0+peer2@1.17.7`
        ],
        SCOPED_DEPENDENCY_NAME,
        VERSION
      );

      // non-scoped, prerelease
      testSpecifiers(
        [
          `path.pkgs.visualstudio.com/${DEPENDENCY_NAME}/${PRERELEASE_VERSION}`,
          `/${DEPENDENCY_NAME}/${PRERELEASE_VERSION}`,
          `/${DEPENDENCY_NAME}/${PRERELEASE_VERSION}/peer1@3.5.0+peer2@1.17.7`
        ],
        DEPENDENCY_NAME,
        PRERELEASE_VERSION
      );

      // scoped, prerelease
      testSpecifiers(
        [
          `path.pkgs.visualstudio.com/${SCOPED_DEPENDENCY_NAME}/${PRERELEASE_VERSION}`,
          `/${SCOPED_DEPENDENCY_NAME}/${PRERELEASE_VERSION}`,
          `/${SCOPED_DEPENDENCY_NAME}/${PRERELEASE_VERSION}/peer1@3.5.0+peer2@1.17.7`
        ],
        SCOPED_DEPENDENCY_NAME,
        PRERELEASE_VERSION
      );
    });

    it('Supports aliased package specifiers (v5)', () => {
      const parsedSpecifier: DependencySpecifier | undefined = parsePnpmDependencyKey(
        SCOPED_DEPENDENCY_NAME,
        `/${DEPENDENCY_NAME}/${VERSION}`
      );
      expect(parsedSpecifier).toBeDefined();
      expect(parsedSpecifier!.specifierType).toBe(DependencySpecifierType.Alias);
      expect(parsedSpecifier!.packageName).toBe(SCOPED_DEPENDENCY_NAME);
      expect(parsedSpecifier!.versionSpecifier).toMatchInlineSnapshot(`"npm:${DEPENDENCY_NAME}@${VERSION}"`);
    });

    it('Supports aliased package specifiers (v6)', () => {
      const parsedSpecifier: DependencySpecifier | undefined = parsePnpmDependencyKey(
        SCOPED_DEPENDENCY_NAME,
        `/${DEPENDENCY_NAME}@${VERSION}`
      );
      expect(parsedSpecifier).toBeDefined();
      expect(parsedSpecifier!.specifierType).toBe(DependencySpecifierType.Alias);
      expect(parsedSpecifier!.packageName).toBe(SCOPED_DEPENDENCY_NAME);
      expect(parsedSpecifier!.versionSpecifier).toMatchInlineSnapshot(`"npm:${DEPENDENCY_NAME}@${VERSION}"`);
    });

    it('Supports URL package specifiers', () => {
      const specifiers: string[] = [
        '@github.com/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'github.com/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'github.com.au/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'bitbucket.com/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'bitbucket.com+abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'git@bitbucket.com+abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2',
        'bitbucket.co.in/abc/def/188ed64efd5218beda276e02f2277bf3a6b745b2'
      ];

      for (const specifier of specifiers) {
        const parsedSpecifier: DependencySpecifier | undefined = parsePnpmDependencyKey(
          SCOPED_DEPENDENCY_NAME,
          specifier
        );
        expect(parsedSpecifier).toBeDefined();
        expect(parsedSpecifier!.specifierType).toBe(DependencySpecifierType.Directory);
        expect(parsedSpecifier!.packageName).toBe(SCOPED_DEPENDENCY_NAME);
        expect(parsedSpecifier!.versionSpecifier).toBe(specifier);
      }
    });
  });

  describe(parsePnpm9DependencyKey.name, () => {
    it('Does not support file:// specifiers', () => {
      expect(parsePnpm9DependencyKey(DEPENDENCY_NAME, 'file:///path/to/file')).toBeUndefined();
      expect(parsePnpm9DependencyKey(DEPENDENCY_NAME, 'pad-left@file:///path/to/file')).toBeUndefined();
      expect(parsePnpm9DependencyKey(DEPENDENCY_NAME, 'link:///path/to/file')).toBeUndefined();
    });

    it('Supports a variety of non-aliased package specifiers', () => {
      function testSpecifiers(specifiers: string[], expectedName: string, expectedVersion: string): void {
        for (const specifier of specifiers) {
          const parsedSpecifier: DependencySpecifier | undefined = parsePnpm9DependencyKey(
            expectedName,
            specifier
          );
          expect(parsedSpecifier).toBeDefined();
          expect(parsedSpecifier!.specifierType).toBe(DependencySpecifierType.Version);
          expect(parsedSpecifier!.packageName).toBe(expectedName);
          expect(parsedSpecifier!.versionSpecifier).toBe(expectedVersion);
        }
      }

      // non-scoped, non-prerelease
      testSpecifiers(
        [`${DEPENDENCY_NAME}@${VERSION}`, `${DEPENDENCY_NAME}@${VERSION}(peer@3.5.0+peer2@1.17.7)`],
        DEPENDENCY_NAME,
        VERSION
      );

      // scoped, non-prerelease
      testSpecifiers(
        [
          `${SCOPED_DEPENDENCY_NAME}@${VERSION}`,
          `${SCOPED_DEPENDENCY_NAME}@${VERSION}(peer@3.5.0+peer2@1.17.7)`
        ],
        SCOPED_DEPENDENCY_NAME,
        VERSION
      );

      // non-scoped, prerelease
      testSpecifiers(
        [
          `${DEPENDENCY_NAME}@${PRERELEASE_VERSION}`,
          `${DEPENDENCY_NAME}@${PRERELEASE_VERSION}(peer@3.5.0+peer2@1.17.7)`
        ],
        DEPENDENCY_NAME,
        PRERELEASE_VERSION
      );

      // scoped, prerelease
      testSpecifiers(
        [
          `${SCOPED_DEPENDENCY_NAME}@${PRERELEASE_VERSION}`,
          `${SCOPED_DEPENDENCY_NAME}@${PRERELEASE_VERSION}(peer@3.5.0+peer2@1.17.7)`
        ],
        SCOPED_DEPENDENCY_NAME,
        PRERELEASE_VERSION
      );
    });

    it('Supports aliased package specifiers (v9)', () => {
      const parsedSpecifier: DependencySpecifier | undefined = parsePnpm9DependencyKey(
        SCOPED_DEPENDENCY_NAME,
        `${DEPENDENCY_NAME}@${VERSION}`
      );
      expect(parsedSpecifier).toBeDefined();
      expect(parsedSpecifier!.specifierType).toBe(DependencySpecifierType.Alias);
      expect(parsedSpecifier!.packageName).toBe(SCOPED_DEPENDENCY_NAME);
      expect(parsedSpecifier!.versionSpecifier).toMatchInlineSnapshot(`"npm:${DEPENDENCY_NAME}@${VERSION}"`);
    });

    it('Supports URL package specifiers', () => {
      const specifiers: string[] = [
        'https://github.com/jonschlinkert/pad-left/tarball/2.1.0',
        'https://xxx.xxxx.org/pad-left/-/pad-left-2.1.0.tgz',
        'https://codeload.github.com/jonschlinkert/pad-left/tar.gz/7798d648225aa5d879660a37c408ab4675b65ac7',
        `${SCOPED_DEPENDENCY_NAME}@http://abc.com/jonschlinkert/pad-left/tarball/2.1.0`,
        `${SCOPED_DEPENDENCY_NAME}@https://xxx.xxxx.org/pad-left/-/pad-left-2.1.0.tgz`,
        `${SCOPED_DEPENDENCY_NAME}@https://codeload.github.com/jonschlinkert/pad-left/tar.gz/7798d648225aa5d879660a37c408ab4675b65ac7`
      ];

      for (const specifier of specifiers) {
        const parsedSpecifier: DependencySpecifier | undefined = parsePnpm9DependencyKey(
          SCOPED_DEPENDENCY_NAME,
          specifier
        );
        expect(parsedSpecifier).toBeDefined();
        expect(parsedSpecifier!.specifierType).toBe(DependencySpecifierType.Remote);
        expect(parsedSpecifier!.packageName).toBe(SCOPED_DEPENDENCY_NAME);
        expect(parsedSpecifier!.versionSpecifier).toBe(specifier.replace(`${SCOPED_DEPENDENCY_NAME}@`, ''));
      }
    });
  });

  describe('getIntegrityForImporter', () => {
    it('produces different hashes when sub-dependency resolutions change', () => {
      // This test verifies that changes to sub-dependency resolutions are detected.
      // The issue is that if package A depends on B, and B's resolution of C changes
      // (e.g., from C@1.3 to C@1.2), the integrity hash for A should change.
      // This is important for build orchestrators that rely on shrinkwrap-deps.json
      // to detect changes to resolution and invalidate caches appropriately.

      // Two shrinkwrap files with the same package but different sub-dependency resolutions
      const shrinkwrapContent1: string = `
lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .:
    dependencies:
      foo:
        specifier: ~1.0.0
        version: 1.0.0
packages:
  foo@1.0.0:
    resolution:
      integrity: sha512-abc123==
    dependencies:
      bar: 1.3.0
  bar@1.3.0:
    resolution:
      integrity: sha512-bar130==
snapshots:
  foo@1.0.0:
    dependencies:
      bar: 1.3.0
  bar@1.3.0: {}
`;

      const shrinkwrapContent2: string = `
lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .:
    dependencies:
      foo:
        specifier: ~1.0.0
        version: 1.0.0
packages:
  foo@1.0.0:
    resolution:
      integrity: sha512-abc123==
    dependencies:
      bar: 1.2.0
  bar@1.2.0:
    resolution:
      integrity: sha512-bar120==
snapshots:
  foo@1.0.0:
    dependencies:
      bar: 1.2.0
  bar@1.2.0: {}
`;

      const shrinkwrapFile1 = PnpmShrinkwrapFile.loadFromString(shrinkwrapContent1, {
        subspaceHasNoProjects: false
      });
      const shrinkwrapFile2 = PnpmShrinkwrapFile.loadFromString(shrinkwrapContent2, {
        subspaceHasNoProjects: false
      });

      // Clear cache to ensure fresh computation
      PnpmShrinkwrapFile.clearCache();

      const integrityMap1 = shrinkwrapFile1.getIntegrityForImporter('.');
      const integrityMap2 = shrinkwrapFile2.getIntegrityForImporter('.');

      // Both should have integrity maps
      expect(integrityMap1).toBeDefined();
      expect(integrityMap2).toBeDefined();

      // The integrity for 'foo@1.0.0' should be different because bar's resolution changed
      const fooIntegrity1 = integrityMap1!.get('foo@1.0.0');
      const fooIntegrity2 = integrityMap2!.get('foo@1.0.0');

      expect(fooIntegrity1).toBeDefined();
      expect(fooIntegrity2).toBeDefined();

      // This is the key assertion: the integrity hashes should be different
      // because the sub-dependency (bar) resolved to different versions
      expect(fooIntegrity1).not.toEqual(fooIntegrity2);
    });
  });

  describe('Check is workspace project modified', () => {
    describe('pnpm lockfile major version 5', () => {
      it('can detect not modified', async () => {
        const project = getMockRushProject();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v5/not-modified.yaml`,
          project.rushConfiguration.defaultSubspace
        );
        await expect(
          pnpmShrinkwrapFile.isWorkspaceProjectModifiedAsync(
            project,
            project.rushConfiguration.defaultSubspace,
            undefined
          )
        ).resolves.toBe(false);
      });

      it('can detect modified', async () => {
        const project = getMockRushProject();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v5/modified.yaml`,
          project.rushConfiguration.defaultSubspace
        );
        await expect(
          pnpmShrinkwrapFile.isWorkspaceProjectModifiedAsync(
            project,
            project.rushConfiguration.defaultSubspace,
            undefined
          )
        ).resolves.toBe(true);
      });

      it('can detect overrides', async () => {
        const project = getMockRushProject();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v5/overrides-not-modified.yaml`,
          project.rushConfiguration.defaultSubspace
        );
        await expect(
          pnpmShrinkwrapFile.isWorkspaceProjectModifiedAsync(
            project,
            project.rushConfiguration.defaultSubspace,
            undefined
          )
        ).resolves.toBe(false);
      });
    });

    describe('pnpm lockfile major version 6', () => {
      it('can detect not modified', async () => {
        const project = getMockRushProject();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v6/not-modified.yaml`,
          project.rushConfiguration.defaultSubspace
        );
        await expect(
          pnpmShrinkwrapFile.isWorkspaceProjectModifiedAsync(
            project,
            project.rushConfiguration.defaultSubspace,
            undefined
          )
        ).resolves.toBe(false);
      });

      it('can detect modified', async () => {
        const project = getMockRushProject();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v6/modified.yaml`,
          project.rushConfiguration.defaultSubspace
        );
        await expect(
          pnpmShrinkwrapFile.isWorkspaceProjectModifiedAsync(
            project,
            project.rushConfiguration.defaultSubspace,
            undefined
          )
        ).resolves.toBe(true);
      });

      it('can detect overrides', async () => {
        const project = getMockRushProject();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v6/overrides-not-modified.yaml`,
          project.rushConfiguration.defaultSubspace
        );
        await expect(
          pnpmShrinkwrapFile.isWorkspaceProjectModifiedAsync(
            project,
            project.rushConfiguration.defaultSubspace,
            undefined
          )
        ).resolves.toBe(false);
      });

      it('can handle the inconsistent version of a package declared in dependencies and devDependencies', async () => {
        const project = getMockRushProject2();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v6/inconsistent-dep-devDep.yaml`,
          project.rushConfiguration.defaultSubspace
        );
        await expect(
          pnpmShrinkwrapFile.isWorkspaceProjectModifiedAsync(
            project,
            project.rushConfiguration.defaultSubspace,
            undefined
          )
        ).resolves.toBe(false);
      });
    });

    describe('pnpm lockfile major version 9', () => {
      it('can detect not modified', async () => {
        const project = getMockRushProject();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v9/not-modified.yaml`,
          project.rushConfiguration.defaultSubspace
        );
        await expect(
          pnpmShrinkwrapFile.isWorkspaceProjectModifiedAsync(
            project,
            project.rushConfiguration.defaultSubspace,
            undefined
          )
        ).resolves.toBe(false);
      });

      it('can detect modified', async () => {
        const project = getMockRushProject();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v9/modified.yaml`,
          project.rushConfiguration.defaultSubspace
        );
        await expect(
          pnpmShrinkwrapFile.isWorkspaceProjectModifiedAsync(
            project,
            project.rushConfiguration.defaultSubspace,
            undefined
          )
        ).resolves.toBe(true);
      });

      it('can detect overrides', async () => {
        const project = getMockRushProject();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v9/overrides-not-modified.yaml`,
          project.rushConfiguration.defaultSubspace
        );
        await expect(
          pnpmShrinkwrapFile.isWorkspaceProjectModifiedAsync(
            project,
            project.rushConfiguration.defaultSubspace,
            undefined
          )
        ).resolves.toBe(false);
      });

      it('can handle the inconsistent version of a package declared in dependencies and devDependencies', async () => {
        const project = getMockRushProject2();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v9/inconsistent-dep-devDep.yaml`,
          project.rushConfiguration.defaultSubspace
        );
        await expect(
          pnpmShrinkwrapFile.isWorkspaceProjectModifiedAsync(
            project,
            project.rushConfiguration.defaultSubspace,
            undefined
          )
        ).resolves.toBe(false);
      });

      it('sha1 integrity can be handled when disallowInsecureSha1', async () => {
        const project = getMockRushProject();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v9/sha1-integrity.yaml`,
          project.rushConfiguration.defaultSubspace
        );

        const defaultSubspace = project.rushConfiguration.defaultSubspace;

        const mockPnpmOptions = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          `${__dirname}/jsonFiles/pnpm-config-disallow-sha1.json`,
          defaultSubspace.getSubspaceTempFolderPath()
        );

        jest.spyOn(defaultSubspace, 'getPnpmOptions').mockReturnValue(mockPnpmOptions);

        const spyTerminalWrite = jest.fn();
        const terminal = new Terminal({
          eolCharacter: '\n',
          supportsColor: false,
          write: spyTerminalWrite
        });

        expect(() =>
          pnpmShrinkwrapFile.validateShrinkwrapAfterUpdate(
            project.rushConfiguration,
            project.rushConfiguration.defaultSubspace,
            terminal
          )
        ).not.toThrow();
        expect(spyTerminalWrite).not.toHaveBeenCalled();
      });

      it('sha1 integrity can be handled when disallowInsecureSha1', async () => {
        const project = getMockRushProject();
        const pnpmShrinkwrapFile = getPnpmShrinkwrapFileFromFile(
          `${__dirname}/yamlFiles/pnpm-lock-v9/sha1-integrity-non-exempted-package.yaml`,
          project.rushConfiguration.defaultSubspace
        );

        const defaultSubspace = project.rushConfiguration.defaultSubspace;

        const mockPnpmOptions = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
          `${__dirname}/jsonFiles/pnpm-config-disallow-sha1.json`,
          defaultSubspace.getSubspaceTempFolderPath()
        );

        jest.spyOn(defaultSubspace, 'getPnpmOptions').mockReturnValue(mockPnpmOptions);

        const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
        const terminal = new Terminal(terminalProvider);

        expect(() =>
          pnpmShrinkwrapFile.validateShrinkwrapAfterUpdate(
            project.rushConfiguration,
            project.rushConfiguration.defaultSubspace,
            terminal
          )
        ).toThrowError(AlreadyReportedError);
        expect(terminalProvider.getAllOutputAsChunks({ asLines: true })).toMatchSnapshot();
      });
    });
  });
});

function getPnpmShrinkwrapFileFromFile(filepath: string, subspace: Subspace): PnpmShrinkwrapFile {
  const pnpmShrinkwrapFile = PnpmShrinkwrapFile.loadFromFile(filepath, {
    subspaceHasNoProjects: subspace.getProjects().length === 0
  });
  if (!pnpmShrinkwrapFile) {
    throw new Error(`Get PnpmShrinkwrapFileFromFile failed from ${filepath}`);
  }
  return pnpmShrinkwrapFile;
}

function getMockRushProject(): RushConfigurationProject {
  const rushFilename: string = `${__dirname}/repo/rush.json`;
  const rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
  const project = rushConfiguration.projectsByName.get('foo');
  if (!project) {
    throw new Error(`Can not get project "foo"`);
  }
  return project;
}

function getMockRushProject2(): RushConfigurationProject {
  const rushFilename: string = `${__dirname}/repo/rush2.json`;
  const rushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
  const project = rushConfiguration.projectsByName.get('bar');
  if (!project) {
    throw new Error(`Can not get project "bar"`);
  }
  return project;
}
