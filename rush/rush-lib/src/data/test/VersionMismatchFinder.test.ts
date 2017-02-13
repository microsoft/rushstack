/// <reference types='mocha' />
import { assert } from 'chai';
import RushConfigurationProject from '../RushConfigurationProject';
import { VersionMismatchFinder } from '../VersionMismatchFinder';
describe('VersionMismatchFinder', () => {
  it('finds no mismatches if there are none', (done: MochaDone) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        }
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        }
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    console.log(mismatchFinder.getMismatches());
    assert.isNumber(mismatchFinder.numberOfMismatches);
    assert.equal(mismatchFinder.numberOfMismatches, 0);
    assert.equal(mismatchFinder.getMismatches().length, 0);
    done();
  });
  it('finds a mismatch in two packages', (done: MochaDone) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        }
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        }
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    assert.isNumber(mismatchFinder.numberOfMismatches);
    assert.equal(mismatchFinder.numberOfMismatches, 1);
    assert.equal(mismatchFinder.getMismatches().length, 1);
    assert.equal(mismatchFinder.getMismatches()[0], '@types/foo');
    assert.includeMembers(mismatchFinder.getVersionsOfMismatch('@types/foo'), ['2.0.0', '1.2.3']);
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0'), 'B');
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3'), 'A');
    done();
  });
  it('won\'t let you access mismatches that don\t exist', (done: MochaDone) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        }
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        }
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    assert.equal(mismatchFinder.getVersionsOfMismatch('@types/foobar'), undefined);
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/fobar', '2.0.0'), undefined);
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '9.9.9'), undefined);
    done();
  });
  it('finds two mismatches in two different pairs of projects', (done: MochaDone) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        }
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        }
      },
      {
        packageName: 'C',
        packageJson: {
          dependencies: {
            'mocha': '1.2.3',
            'karma': '0.0.1'
          }
        }
      },
      {
        packageName: 'D',
        packageJson: {
          dependencies: {
            'mocha': '2.0.0',
            'karma': '0.0.1'
          }
        }
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    assert.isNumber(mismatchFinder.numberOfMismatches);
    assert.equal(mismatchFinder.numberOfMismatches, 2);
    assert.equal(mismatchFinder.getMismatches().length, 2);
    assert.includeMembers(mismatchFinder.getMismatches(), ['@types/foo', 'mocha']);
    assert.includeMembers(mismatchFinder.getVersionsOfMismatch('@types/foo'), ['2.0.0', '1.2.3']);
    assert.includeMembers(mismatchFinder.getVersionsOfMismatch('mocha'), ['2.0.0', '1.2.3']);
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3'), 'A');
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0'), 'B');
    assert.equal(mismatchFinder.getConsumersOfMismatch('mocha', '1.2.3'), 'C');
    assert.equal(mismatchFinder.getConsumersOfMismatch('mocha', '2.0.0'), 'D');
    done();
  });
  it('finds three mismatches in three projects', (done: MochaDone) => {
      const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        }
      },
      {
        packageName: 'B',
        packageJson: {
          dependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        }
      },
      {
        packageName: 'C',
        packageJson: {
          dependencies: {
            '@types/foo': '9.9.9',
            'karma': '0.0.1'
          }
        }
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    assert.isNumber(mismatchFinder.numberOfMismatches);
    assert.equal(mismatchFinder.numberOfMismatches, 1);
    assert.equal(mismatchFinder.getMismatches().length, 1);
    assert.includeMembers(mismatchFinder.getMismatches(), ['@types/foo']);
    assert.includeMembers(mismatchFinder.getVersionsOfMismatch('@types/foo'), ['2.0.0', '1.2.3', '9.9.9']);
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3'), 'A');
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0'), 'B');
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '9.9.9'), 'C');
    done();
  });
  it('checks dev dependencies', (done: MochaDone) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        }
      },
      {
        packageName: 'B',
        packageJson: {
          devDependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        }
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    assert.isNumber(mismatchFinder.numberOfMismatches);
    assert.equal(mismatchFinder.numberOfMismatches, 1);
    assert.equal(mismatchFinder.getMismatches().length, 1);
    assert.equal(mismatchFinder.getMismatches()[0], '@types/foo');
    assert.includeMembers(mismatchFinder.getVersionsOfMismatch('@types/foo'), ['2.0.0', '1.2.3']);
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0'), 'B');
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3'), 'A');
    done();
  });
  it('checks peer dependencies', (done: MochaDone) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        }
      },
      {
        packageName: 'B',
        packageJson: {
          peerDependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        }
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    assert.isNumber(mismatchFinder.numberOfMismatches);
    assert.equal(mismatchFinder.numberOfMismatches, 1);
    assert.equal(mismatchFinder.getMismatches().length, 1);
    assert.equal(mismatchFinder.getMismatches()[0], '@types/foo');
    assert.includeMembers(mismatchFinder.getVersionsOfMismatch('@types/foo'), ['2.0.0', '1.2.3']);
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0'), 'B');
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3'), 'A');
    done();
  });
  it('checks optional dependencies', (done: MochaDone) => {
    const projects: RushConfigurationProject[] = [
      {
        packageName: 'A',
        packageJson: {
          dependencies: {
            '@types/foo': '1.2.3',
            'karma': '0.0.1'
          }
        }
      },
      {
        packageName: 'B',
        packageJson: {
          optionalDependencies: {
            '@types/foo': '2.0.0',
            'karma': '0.0.1'
          }
        }
      }
    ] as any as RushConfigurationProject[]; // tslint:disable-line:no-any
    const mismatchFinder: VersionMismatchFinder = new VersionMismatchFinder(projects);
    assert.isNumber(mismatchFinder.numberOfMismatches);
    assert.equal(mismatchFinder.numberOfMismatches, 1);
    assert.equal(mismatchFinder.getMismatches().length, 1);
    assert.equal(mismatchFinder.getMismatches()[0], '@types/foo');
    assert.includeMembers(mismatchFinder.getVersionsOfMismatch('@types/foo'), ['2.0.0', '1.2.3']);
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '2.0.0'), 'B');
    assert.equal(mismatchFinder.getConsumersOfMismatch('@types/foo', '1.2.3'), 'A');
    done();
  });
});