// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { RushConfigurationProject } from '../RushConfigurationProject';
import { VersionMismatchFinder } from '../../logic/versionMismatch/VersionMismatchFinder';
import { PackageJsonEditor } from '../PackageJsonEditor';
import { CommonVersionsConfiguration } from '../CommonVersionsConfiguration';
import { VersionMismatchFinderEntity } from '../../logic/versionMismatch/VersionMismatchFinderEntity';
import { VersionMismatchFinderProject } from '../../logic/versionMismatch/VersionMismatchFinderProject';
import { VersionMismatchFinderCommonVersions } from '../../logic/versionMismatch/VersionMismatchFinderCommonVersions';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('VersionMismatchFinder', () => {
  it('finds no mismatches if there are none', (done: jest.DoneCallback) => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches()).toHaveLength(0);
    done();
  });

  it('finds a mismatch in two packages', (done: jest.DoneCallback) => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches()).toHaveLength(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
    done();
  });

  it('ignores cyclic dependencies', (done: jest.DoneCallback) => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>(['@types/foo'])
    } as any) as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches()).toHaveLength(0);
    done();
  });

  it("won't let you access mismatches that don\t exist", (done: jest.DoneCallback) => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.getVersionsOfMismatch('@types/foobar')).toEqual(undefined);
    expect(mismatchFinder.getConsumersOfMismatch('@types/fobar', '2.0.0')).toEqual(undefined);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '9.9.9')).toEqual(undefined);
    done();
  });

  it('finds two mismatches in two different pairs of projects', (done: jest.DoneCallback) => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectC: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectD: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);

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
    done();
  });

  it('finds three mismatches in three projects', (done: jest.DoneCallback) => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectC: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB, projectC]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches()).toHaveLength(1);
    expect(mismatchFinder.getMismatches()).toMatchObject(['@types/foo']);
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0', '9.9.9']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '9.9.9')).toEqual([projectC]);
    done();
  });

  it('checks dev dependencies', (done: jest.DoneCallback) => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);

    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches()).toHaveLength(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
    done();
  });

  it('does not check peer dependencies', (done: jest.DoneCallback) => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    done();
  });

  it('checks optional dependencies', (done: jest.DoneCallback) => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches()).toHaveLength(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
    done();
  });

  it('allows alternative versions', (done: jest.DoneCallback) => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);

    const alternatives: Map<string, ReadonlyArray<string>> = new Map<string, ReadonlyArray<string>>();
    alternatives.set('@types/foo', ['2.0.0']);
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(
      [projectA, projectB],
      alternatives
    );
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches()).toHaveLength(0);
    done();
  });

  it('handles the common-versions.json file correctly', (done: jest.DoneCallback) => {
    const projectA: VersionMismatchFinderEntity = new VersionMismatchFinderProject(({
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
      cyclicDependencyProjects: new Set<string>()
    } as any) as RushConfigurationProject);
    const projectB: VersionMismatchFinderEntity = new VersionMismatchFinderCommonVersions(
      CommonVersionsConfiguration.loadFromFile(path.resolve(__dirname, 'jsonFiles', 'common-versions.json'))
    );

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches()).toHaveLength(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@scope/library-1');
    expect(mismatchFinder.getVersionsOfMismatch('@scope/library-1')!.sort()).toEqual(['1.2.3', '~3.2.1']);
    expect(mismatchFinder.getConsumersOfMismatch('@scope/library-1', '~3.2.1')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@scope/library-1', '1.2.3')).toEqual([projectA]);
    done();
  });
});
