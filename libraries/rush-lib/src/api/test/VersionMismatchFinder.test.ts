// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { RushConfigurationProject } from '../RushConfigurationProject.ts';
import { VersionMismatchFinder } from '../../logic/versionMismatch/VersionMismatchFinder.ts';
import { PackageJsonEditor } from '../PackageJsonEditor.ts';
import { CommonVersionsConfiguration } from '../CommonVersionsConfiguration.ts';
import type { VersionMismatchFinderEntity } from '../../logic/versionMismatch/VersionMismatchFinderEntity.ts';
import { VersionMismatchFinderProject } from '../../logic/versionMismatch/VersionMismatchFinderProject.ts';
import { VersionMismatchFinderCommonVersions } from '../../logic/versionMismatch/VersionMismatchFinderCommonVersions.ts';

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

  it('handles the common-versions.json file correctly', () => {
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
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderCommonVersions(
      CommonVersionsConfiguration.loadFromFile(`${__dirname}/jsonFiles/common-versions.json`)
    );

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches()).toHaveLength(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@scope/library-1');
    expect(mismatchFinder.getVersionsOfMismatch('@scope/library-1')!.sort()).toEqual(['1.2.3', '~3.2.1']);
    expect(mismatchFinder.getConsumersOfMismatch('@scope/library-1', '~3.2.1')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@scope/library-1', '1.2.3')).toEqual([projectA]);
  });
});
