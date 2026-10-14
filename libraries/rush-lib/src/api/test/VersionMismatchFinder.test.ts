// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { AnsiEscape } from '@rushstack/terminal';

import type { RushConfigurationProject } from '../RushConfigurationProject';
import { VersionMismatchFinder } from '../../logic/versionMismatch/VersionMismatchFinder';
import { DependencyType, PackageJsonEditor } from '../PackageJsonEditor';
import { CommonVersionsConfiguration } from '../CommonVersionsConfiguration';
import type { VersionMismatchFinderEntity } from '../../logic/versionMismatch/VersionMismatchFinderEntity';
import { VersionMismatchFinderProject } from '../../logic/versionMismatch/VersionMismatchFinderProject';
import { VersionMismatchFinderCommonVersions } from '../../logic/versionMismatch/VersionMismatchFinderCommonVersions';
import type { PnpmCatalogs } from '../../logic/pnpm/EffectivePnpmOptions';
import { RushConfiguration } from '../RushConfiguration';
import type { Subspace } from '../Subspace';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe(VersionMismatchFinder.name, () => {
  it('finds no mismatches if there are none', () => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'A',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'B',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches()).toHaveLength(0);
  });

  it('finds a mismatch in two packages', () => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'A',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'B',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '2.0.0',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches()).toHaveLength(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
  });

  it('ignores cyclic dependencies', () => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'A',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>(['@types/foo'])
    } as any as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'B',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '2.0.0',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches()).toHaveLength(0);
  });

  it("won't let you access mismatches that don\t exist", () => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'A',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'B',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '2.0.0',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.getVersionsOfMismatch('@types/foobar')).toEqual(undefined);
    expect(mismatchFinder.getConsumersOfMismatch('@types/fobar', '2.0.0')).toEqual(undefined);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '9.9.9')).toEqual(undefined);
  });

  it('finds two mismatches in two different pairs of projects', () => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'A',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'B',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '2.0.0',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectC: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'C',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            mocha: '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectD: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'D',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            mocha: '2.0.0',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([
      projectA,
      projectB,
      projectC,
      projectD
    ]);
    expect(mismatchFinder.numberOfMismatches).toEqual(2);
    expect(mismatchFinder.getMismatches()).toHaveLength(2);
    expect(mismatchFinder.getMismatches()).toMatchObject(['@types/foo', 'mocha']);
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getVersionsOfMismatch('mocha')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('mocha', '1.2.3')).toEqual([projectC]);
    expect(mismatchFinder.getConsumersOfMismatch('mocha', '2.0.0')).toEqual([projectD]);
  });

  it('finds three mismatches in three projects', () => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'A',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'B',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '2.0.0',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectC: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'C',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '9.9.9',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB, projectC]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches()).toHaveLength(1);
    expect(mismatchFinder.getMismatches()).toMatchObject(['@types/foo']);
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0', '9.9.9']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '9.9.9')).toEqual([projectC]);
  });

  it('checks dev dependencies', () => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'A',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'B',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          devDependencies: {
            '@types/foo': '2.0.0',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);

    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches()).toHaveLength(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
  });

  it('does not check peer dependencies', () => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'A',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'B',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          peerDependencies: {
            '@types/foo': '2.0.0',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
  });

  it('checks optional dependencies', () => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'A',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'B',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          optionalDependencies: {
            '@types/foo': '2.0.0',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches()).toHaveLength(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
  });

  it('allows alternative versions', () => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'A',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'B',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@types/foo': '2.0.0',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);

    const alternatives: Map<string, ReadonlyArray<string>> = new Map<string, ReadonlyArray<string>>();
    alternatives.set('@types/foo', ['2.0.0']);
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(
      [projectA, projectB],
      alternatives
    );
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches()).toHaveLength(0);
  });

  it('handles the common-versions.json file correctly', async () => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject({
      packageName: 'A',
      packageJsonEditor: PackageJsonEditor.fromObject(
        {
          dependencies: {
            '@scope/library-1': '1.2.3',
            karma: '0.0.1'
          }
        } as any,
        'foo.json'
      ),
      decoupledLocalDependencies: new Set<string>()
    } as any as RushConfigurationProject);
    const commonVersionsConfiguration: CommonVersionsConfiguration =
      await CommonVersionsConfiguration.loadFromFileAsync(`${__dirname}/jsonFiles/common-versions.json`);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderCommonVersions(
      commonVersionsConfiguration
    );

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches()).toHaveLength(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@scope/library-1');
    expect(mismatchFinder.getVersionsOfMismatch('@scope/library-1')!.sort()).toEqual(['1.2.3', '~3.2.1']);
    expect(mismatchFinder.getConsumersOfMismatch('@scope/library-1', '~3.2.1')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@scope/library-1', '1.2.3')).toEqual([projectA]);
  });

  describe('PNPM catalog references', () => {
    const CATALOGS: PnpmCatalogs = {
      default: {
        typescript: '~5.8.2'
      },
      react17: {
        react: '^17.0.2'
      }
    };

    function createProject(
      packageName: string,
      dependencies: Record<string, string>,
      pnpmCatalogs: PnpmCatalogs | undefined = CATALOGS
    ): VersionMismatchFinderProject {
      return new VersionMismatchFinderProject(
        {
          packageName,
          packageJsonEditor: PackageJsonEditor.fromObject({ dependencies } as any, 'foo.json'),
          decoupledLocalDependencies: new Set<string>()
        } as any as RushConfigurationProject,
        pnpmCatalogs
      );
    }

    it('finds no mismatch between a catalog reference and the same version', () => {
      const projectA: VersionMismatchFinderEntity = createProject('A', { typescript: 'catalog:' });
      const projectB: VersionMismatchFinderEntity = createProject('B', { typescript: '~5.8.2' });

      const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
      expect(mismatchFinder.numberOfMismatches).toEqual(0);
    });

    it('treats "catalog:" and "catalog:default" as the same reference', () => {
      const projectA: VersionMismatchFinderEntity = createProject('A', { typescript: 'catalog:' });
      const projectB: VersionMismatchFinderEntity = createProject('B', { typescript: 'catalog:default' });

      const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
      expect(mismatchFinder.numberOfMismatches).toEqual(0);
    });

    it('finds a mismatch between a catalog reference and a different version', () => {
      const projectA: VersionMismatchFinderEntity = createProject('A', { typescript: 'catalog:' });
      const projectB: VersionMismatchFinderEntity = createProject('B', { typescript: '~5.7.0' });

      const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
      expect(mismatchFinder.getMismatches()).toEqual(['typescript']);
      expect(mismatchFinder.getVersionsOfMismatch('typescript')).toEqual(['~5.8.2', '~5.7.0']);
      expect(mismatchFinder.getConsumersOfMismatch('typescript', '~5.8.2')).toEqual([projectA]);
      expect(mismatchFinder.getConsumersOfMismatch('typescript', '~5.7.0')).toEqual([projectB]);
      expect(mismatchFinder.tryGetCatalogVersionSpecifier('typescript', '~5.8.2', projectA)).toEqual(
        'catalog:'
      );
      expect(mismatchFinder.tryGetCatalogVersionSpecifier('typescript', '~5.7.0', projectB)).toBeUndefined();
    });

    it('compares a catalog reference with the preferred versions', async () => {
      const commonVersionsConfiguration: CommonVersionsConfiguration =
        await CommonVersionsConfiguration.loadFromFileAsync(`${__dirname}/jsonFiles/common-versions.json`);
      const commonVersions: VersionMismatchFinderEntity = new VersionMismatchFinderCommonVersions(
        commonVersionsConfiguration
      );
      const projectA: VersionMismatchFinderEntity = createProject('A', { typescript: 'catalog:' });

      commonVersionsConfiguration.preferredVersions.set('typescript', '~5.8.2');
      expect(new VersionMismatchFinder([commonVersions, projectA]).numberOfMismatches).toEqual(0);

      commonVersionsConfiguration.preferredVersions.set('typescript', '~5.7.0');
      const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([commonVersions, projectA]);
      expect(mismatchFinder.getMismatches()).toEqual(['typescript']);
      expect(mismatchFinder.getConsumersOfMismatch('typescript', '~5.7.0')).toEqual([commonVersions]);
      expect(mismatchFinder.getConsumersOfMismatch('typescript', '~5.8.2')).toEqual([projectA]);
    });

    it('resolves named catalogs and allows alternative versions of the resolved version', () => {
      const projectA: VersionMismatchFinderEntity = createProject('A', { react: 'catalog:react17' });
      const projectB: VersionMismatchFinderEntity = createProject('B', { react: '^18.2.0' });

      const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
      expect(mismatchFinder.getVersionsOfMismatch('react')).toEqual(['^17.0.2', '^18.2.0']);

      for (const allowedAlternativeVersion of ['^17.0.2', 'catalog:react17']) {
        const alternatives: Map<string, ReadonlyArray<string>> = new Map([
          ['react', [allowedAlternativeVersion]]
        ]);
        expect(new VersionMismatchFinder([projectA, projectB], alternatives).numberOfMismatches).toEqual(0);
      }
    });

    it("resolves each project's catalog references with that project's catalogs", () => {
      const projectA: VersionMismatchFinderEntity = createProject('A', { typescript: 'catalog:' });
      const projectB: VersionMismatchFinderEntity = createProject(
        'B',
        { typescript: 'catalog:' },
        { default: { typescript: '~5.7.0' } }
      );

      const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
      expect(mismatchFinder.getVersionsOfMismatch('typescript')).toEqual(['~5.8.2', '~5.7.0']);
      expect(mismatchFinder.getConsumersOfMismatch('typescript', '~5.7.0')).toEqual([projectB]);
    });

    it('reports a catalog reference that does not resolve as its own version', () => {
      const projectA: VersionMismatchFinderEntity = createProject('A', { typescript: 'catalog:' });
      const projectB: VersionMismatchFinderEntity = createProject('B', { typescript: 'catalog:missing' });
      const projectC: VersionMismatchFinderEntity = createProject('C', { lodash: 'catalog:' });
      const projectD: VersionMismatchFinderEntity = createProject('D', { lodash: 'catalog:default' });
      const projectE: VersionMismatchFinderEntity = createProject('E', { lodash: '^4.17.21' }, undefined);
      const projectF: VersionMismatchFinderEntity = createProject('F', { lodash: 'catalog:' }, undefined);

      const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([
        projectA,
        projectB,
        projectC,
        projectD,
        projectE,
        projectF
      ]);
      expect(mismatchFinder.getMismatches()).toEqual(['typescript', 'lodash']);
      expect(mismatchFinder.getVersionsOfMismatch('typescript')).toEqual(['~5.8.2', 'catalog:missing']);
      expect(mismatchFinder.getConsumersOfMismatch('typescript', 'catalog:missing')).toEqual([projectB]);
      expect(mismatchFinder.getVersionsOfMismatch('lodash')).toEqual(['catalog:', '^4.17.21']);
      expect(mismatchFinder.getConsumersOfMismatch('lodash', 'catalog:')).toEqual([
        projectC,
        projectD,
        projectF
      ]);
      expect(mismatchFinder.tryGetCatalogVersionSpecifier('lodash', 'catalog:', projectD)).toEqual(
        'catalog:default'
      );
    });

    describe('reporting', () => {
      function createMismatchFinder(): VersionMismatchFinder {
        return new VersionMismatchFinder([
          createProject('A', { typescript: 'catalog:', lodash: 'catalog:' }),
          createProject('B', { typescript: 'catalog:default' }),
          createProject('C', { typescript: '~5.7.0', lodash: '^4.17.21' }),
          createProject('D', { typescript: '~5.8.2', lodash: 'catalog:default' })
        ]);
      }

      function captureConsoleLog(callback: () => void): string[] {
        const lines: string[] = [];
        const consoleLogSpy: jest.SpyInstance = jest
          .spyOn(console, 'log')
          .mockImplementation((message: string = '') => {
            lines.push(AnsiEscape.removeCodes(message));
          });
        try {
          callback();
        } finally {
          consoleLogSpy.mockRestore();
        }

        return lines;
      }

      it('annotates versions that come from a catalog', () => {
        const lines: string[] = captureConsoleLog(() => createMismatchFinder().print());
        expect(lines).toEqual([
          'lodash',
          '  catalog: (unresolved PNPM catalog reference)',
          '   - A',
          '   - D (catalog:default)',
          '  ^4.17.21',
          '   - C',
          '',
          'typescript',
          '  ~5.8.2 (catalog:)',
          '   - A (catalog:)',
          '   - B (catalog:default)',
          '   - D',
          '  ~5.7.0',
          '   - C',
          ''
        ]);
      });

      it('reports the resolved version and the catalog references as JSON', () => {
        const lines: string[] = captureConsoleLog(() => createMismatchFinder().printAsJson());
        expect(JSON.parse(lines.join('\n'))).toEqual({
          mismatchedVersions: [
            {
              dependencyName: 'lodash',
              versions: [
                {
                  version: 'catalog:',
                  projects: ['A', 'D'],
                  catalogReferences: [
                    { project: 'A', versionSpecifier: 'catalog:' },
                    { project: 'D', versionSpecifier: 'catalog:default' }
                  ]
                },
                { version: '^4.17.21', projects: ['C'] }
              ]
            },
            {
              dependencyName: 'typescript',
              versions: [
                {
                  version: '~5.8.2',
                  projects: ['A', 'B', 'D'],
                  catalogReferences: [
                    { project: 'A', versionSpecifier: 'catalog:' },
                    { project: 'B', versionSpecifier: 'catalog:default' }
                  ]
                },
                { version: '~5.7.0', projects: ['C'] }
              ]
            }
          ]
        });
      });
    });

    describe(VersionMismatchFinder.getMismatches.name, () => {
      function loadRushConfiguration(repoName: string): RushConfiguration {
        return RushConfiguration.loadFromConfigurationFile(
          path.resolve(__dirname, '../../logic/test', repoName, 'rush.json')
        );
      }

      it('resolves catalog references with the catalogs of the subspace', () => {
        const rushConfiguration: RushConfiguration = loadRushConfiguration('repoWithCatalogs');
        expect(VersionMismatchFinder.getMismatches(rushConfiguration).numberOfMismatches).toEqual(0);

        rushConfiguration
          .getProjectByName('c')!
          .packageJsonEditor.addOrUpdateDependency('semver', '^7.0.0', DependencyType.Regular);
        rushConfiguration
          .getProjectByName('c')!
          .packageJsonEditor.addOrUpdateDependency('typescript', '~5.3.0', DependencyType.Dev);

        const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(rushConfiguration);
        expect(mismatchFinder.getMismatches()).toEqual(['semver']);
        expect(
          mismatchFinder.getConsumersOfMismatch('semver', '^7.5.4')!.map(({ friendlyName }) => friendlyName)
        ).toEqual(['a', 'd']);
      });

      it.each<[string, string, string, number]>([
        ['default', 'react', '^18.0.0', 0],
        ['other-subspace', 'foo', '~2.0.0', 0],
        ['own-config-subspace', 'react', '^17.0.0', 0],
        ['own-config-subspace', 'react', '^18.0.0', 1]
      ])(
        'in subspace %s, compares %s with the preferred version %s',
        (subspaceName: string, packageName: string, preferredVersion: string, expectedMismatches: number) => {
          const rushConfiguration: RushConfiguration = loadRushConfiguration(
            'repoWithSubspacesCommonCatalogs'
          );
          const subspace: Subspace = rushConfiguration.getSubspace(subspaceName);
          subspace.getCommonVersions().preferredVersions.set(packageName, preferredVersion);

          const mismatchFinder: VersionMismatchFinder = VersionMismatchFinder.getMismatches(
            rushConfiguration,
            { subspace, variant: undefined }
          );
          expect(mismatchFinder.numberOfMismatches).toEqual(expectedMismatches);
          if (expectedMismatches > 0) {
            // own-config-subspace uses its own catalogs instead of the common catalogs
            expect(mismatchFinder.getVersionsOfMismatch(packageName)).toEqual([preferredVersion, '^17.0.0']);
          }
        }
      );
    });
  });
});
