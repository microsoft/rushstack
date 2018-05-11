// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfigurationProject } from '../RushConfigurationProject';
import { VersionMismatchFinder } from '../VersionMismatchFinder';

describe('VersionMismatchFinder', () => {
  it('finds no mismatches if there are none', (done: jest.DoneCallback) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches().length).toEqual(0);
    done();
  });

  it('finds a mismatch in two packages', (done: jest.DoneCallback) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches().length).toEqual(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual(['B']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual(['A']);
    done();
  });

  it('ignores cyclic dependencies', (done: jest.DoneCallback) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>(['@types/foo'])
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches().length).toEqual(0);
    done();
  });

  it('won\'t let you access mismatches that don\t exist', (done: jest.DoneCallback) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    expect(mismatchFinder.getVersionsOfMismatch('@types/foobar')).toEqual(undefined);
    expect(mismatchFinder.getConsumersOfMismatch('@types/fobar', '2.0.0')).toEqual(undefined);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '9.9.9')).toEqual(undefined);
    done();
  });

  it('finds two mismatches in two different pairs of projects', (done: jest.DoneCallback) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'C',
        packageJson: {
          dependencies: {
            'mocha': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'D',
        packageJson: {
          dependencies: {
            'mocha': '2.0.0',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    expect(mismatchFinder.numberOfMismatches).toEqual(2);
    expect(mismatchFinder.getMismatches().length).toEqual(2);
    expect(mismatchFinder.getMismatches()).toMatchObject(['@types/foo', 'mocha']);
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getVersionsOfMismatch('mocha')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual(['A']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual(['B']);
    expect(mismatchFinder.getConsumersOfMismatch('mocha', '1.2.3')).toEqual(['C']);
    expect(mismatchFinder.getConsumersOfMismatch('mocha', '2.0.0')).toEqual(['D']);
    done();
  });

  it('finds three mismatches in three projects', (done: jest.DoneCallback) => {
      const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'C',
        packageJson: {
          dependencies: {
            '@types/foo': '9.9.9',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches().length).toEqual(1);
    expect(mismatchFinder.getMismatches()).toMatchObject(['@types/foo']);
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0', '9.9.9']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual(['A']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual(['B']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '9.9.9')).toEqual(['C']);
    done();
  });

  it('checks dev dependencies', (done: jest.DoneCallback) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'B',
        packageJson: {
          devDependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches().length).toEqual(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual(['B']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual(['A']);
    done();
  });

  it('does not check peer dependencies', (done: jest.DoneCallback) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'B',
        packageJson: {
          peerDependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    done();
  });

  it('checks optional dependencies', (done: jest.DoneCallback) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'B',
        packageJson: {
          optionalDependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    expect(mismatchFinder.numberOfMismatches).toEqual(1);
    expect(mismatchFinder.getMismatches().length).toEqual(1);
    expect(mismatchFinder.getMismatches()[0]).toEqual('@types/foo');
    expect(mismatchFinder.getVersionsOfMismatch('@types/foo')!.sort()).toEqual(['1.2.3', '2.0.0']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0')).toEqual(['B']);
    expect(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3')).toEqual(['A']);
    done();
  });

  it('allows alternative versions', (done: jest.DoneCallback) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        },
        cyclicDependencyProjects: new Set<string>()
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const alternatives: Map<string, ReadonlyArray<string>> = new Map<string, ReadonlyArray<string>>();
    alternatives.set('@types/foo', ['2.0.0']);
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects, alternatives);
    expect(mismatchFinder.numberOfMismatches).toEqual(0);
    expect(mismatchFinder.getMismatches().length).toEqual(0);
    done();
  });
});
