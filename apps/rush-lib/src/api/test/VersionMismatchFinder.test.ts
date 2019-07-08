// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  IVersionMismatchFinderProject,
  VersionMismatchFinder,
  VersionMismatchFinderEntityKind
} from '../VersionMismatchFinder';
import { PackageJsonEditor } from '../PackageJsonEditor';

// tslint:disable:no-any
describe('VersionMismatchFinder', () => {
  it('finds no mismatches if there are none', (done: jest.DoneCallback) => {
    const projects: IVersionMismatchFinderProject[] = [
      {
        kind: VersionMismatchFinderEntityKind.project,
        packageName: 'A',
        friendlyName: 'A',
        editor: PackageJsonEditor.fromObject({
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        } as any, 'foo.json'),
        cyclicDependencyProjects: new Set<string>()
      },
      {
        kind: VersionMismatchFinderEntityKind.project,
        packageName: 'B',
        friendlyName: 'B',
        editor: PackageJsonEditor.fromObject({
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        } as any, 'foo.json'),
        cyclicDependencyProjects: new Set<string>()
      }
    ];
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches().length).toEqual(0);
    done();
  });

  it('finds a mismatch in two packages', (done: jest.DoneCallback) => {
    const projectA: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'A',
      friendlyName: 'A',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '1.2.3',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const projectB: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'B',
      friendlyName: 'B',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '2.0.0',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches().length).toEqual(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
    done();
  });

  it('ignores cyclic dependencies', (done: jest.DoneCallback) => {
    const projectA: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'A',
      friendlyName: 'A',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '1.2.3',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>(['@types/foo'])
    };
    const projectB: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'B',
      friendlyName: 'B',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '2.0.0',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches().length).toEqual(0);
    done();
  });

  it('won\'t let you access mismatches that don\t exist', (done: jest.DoneCallback) => {
    const projectA: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'A',
      friendlyName: 'A',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '1.2.3',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const projectB: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'B',
      friendlyName: 'B',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '2.0.0',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.getVersionsOfMismatch('@types/foobar')).toEqual(undefined);
    expect(mismatchFinder.getConsumersOfMismatch('@types/fobar', '2.0.0')).toEqual(undefined);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '9.9.9')).toEqual(undefined);
    done();
  });

  it('finds two mismatches in two different pairs of projects', (done: jest.DoneCallback) => {
    const projectA: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'A',
      friendlyName: 'A',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '1.2.3',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const projectB: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'B',
      friendlyName: 'B',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '2.0.0',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const projectC: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'C',
      friendlyName: 'C',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          'mocha': '1.2.3',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const projectD: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'D',
      friendlyName: 'D',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          'mocha': '2.0.0',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB, projectC, projectD]);
    expect(mismatchFinder.numberOfMismatches).toEqual(2);
    expect(mismatchFinder.getMismatches().length).toEqual(2);
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
    const projectA: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'A',
      friendlyName: 'A',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '1.2.3',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const projectB: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'B',
      friendlyName: 'B',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '2.0.0',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const projectC: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'C',
      friendlyName: 'C',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '9.9.9',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB, projectC]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches().length).toEqual(1);
    expect(mismatchFinder.getMismatches()).toMatchObject(['@types/foo']);
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0', '9.9.9']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '9.9.9')).toEqual([projectC]);
    done();
  });

  it('checks dev dependencies', (done: jest.DoneCallback) => {
    const projectA: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'A',
      friendlyName: 'A',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '1.2.3',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const projectB: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'B',
      friendlyName: 'B',
      editor: PackageJsonEditor.fromObject({
        devDependencies: {
          '@types/foo': '2.0.0',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches().length).toEqual(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
    done();
  });

  it('does not check peer dependencies', (done: jest.DoneCallback) => {
    const projectA: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'A',
      friendlyName: 'A',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '1.2.3',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const projectB: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'B',
      friendlyName: 'B',
      editor: PackageJsonEditor.fromObject({
        peerDependencies: {
          '@types/foo': '2.0.0',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    done();
  });

  it('checks optional dependencies', (done: jest.DoneCallback) => {
    const projectA: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'A',
      friendlyName: 'A',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '1.2.3',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const projectB: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'B',
      friendlyName: 'B',
      editor: PackageJsonEditor.fromObject({
        optionalDependencies: {
          '@types/foo': '2.0.0',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };

    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB]);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches().length).toEqual(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual([projectB]);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual([projectA]);
    done();
  });

  it('allows alternative versions', (done: jest.DoneCallback) => {
    const projectA: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'A',
      friendlyName: 'A',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '1.2.3',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };
    const projectB: IVersionMismatchFinderProject = {
      kind: VersionMismatchFinderEntityKind.project,
      packageName: 'B',
      friendlyName: 'B',
      editor: PackageJsonEditor.fromObject({
        dependencies: {
          '@types/foo': '2.0.0',
          'karma': '0.0.1'
        }
      } as any, 'foo.json'),
      cyclicDependencyProjects: new Set<string>()
    };

    const alternatives: Map<string, ReadonlyArray<string>> = new Map<string, ReadonlyArray<string>>();
    alternatives.set('@types/foo', ['2.0.0']);
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder([projectA, projectB], alternatives);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches().length).toEqual(0);
    done();
  });
});
